/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const test = require('node:test');
const ts = require('typescript');
const { load, root } = require('./module-loader.cjs');
const app = path.join(root, 'app');
function pages(directory = app) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? pages(file) : entry.name === 'page.tsx' ? [file] : [];
  });
}
function publicPath(file) {
  const parts = path.relative(app, path.dirname(file)).split(path.sep).filter(part => part && !/^\(.*\)$/.test(part));
  return '/' + parts.join('/');
}
function loadingAncestors(file) {
  const boundaries = [];
  for (let directory = path.dirname(file); ; directory = path.dirname(directory)) {
    for (const ext of ['js', 'jsx', 'ts', 'tsx']) {
      const loading = path.join(directory, 'loading.' + ext);
      if (fs.existsSync(loading)) boundaries.push(path.relative(app, loading).replaceAll(path.sep, '/'));
    }
    if (directory === app) return boundaries;
    assert(directory.startsWith(app + path.sep));
  }
}

test('route grouping preserves every public page URL without duplicate matches', () => {
  const paths = pages().map(publicPath).sort();
  assert.deepEqual(paths, ['/', '/admin', '/contacts', '/login', '/politika', '/services', '/services/[slug]', '/soglasie', '/soglasie-administratora'].sort());
  assert.equal(new Set(paths).size, paths.length);
  assert(fs.existsSync(path.join(app, 'layout.tsx')));
});

test('detail existence lookup has no ancestor or leaf automatic loading boundary', () => {
  const detail = pages().find(file => publicPath(file) === '/services/[slug]');
  assert(detail);
  assert.deepEqual(loadingAncestors(detail), []);
  assert.equal(path.relative(app, detail).replaceAll(path.sep, '/'), 'services/[slug]/page.tsx');
});

test('all non-service pages retain the shared fallback in their route group', () => {
  for (const file of pages().filter(file => !publicPath(file).startsWith('/services'))) {
    assert.deepEqual(loadingAncestors(file), ['(with-loading)/loading.tsx'], publicPath(file));
  }
  const catalog = pages().find(file => publicPath(file) === '/services');
  assert.deepEqual(loadingAncestors(catalog), [], 'Catalog fallback must be local, not an ancestor of detail routes');
});

test('moved pages retain resolvable relative dependencies, including lawyer-approved JSON', () => {
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  for (const file of pages().filter(file => file.includes(path.sep + '(with-loading)' + path.sep))) {
    const imports = ts.preProcessFile(fs.readFileSync(file, 'utf8'), true, true).importedFiles;
    for (const imported of imports.filter(item => item.fileName.startsWith('.'))) {
      const resolved = ts.resolveModuleName(imported.fileName, file, options, ts.sys).resolvedModule;
      assert(resolved, path.relative(root, file) + ': missing relative dependency ' + imported.fileName);
    }
  }
});

test('catalog streams its own async data under local Suspense with the retained catalog skeleton', () => {
  const catalog = load('app/services/page.tsx').default();
  assert.equal(catalog.type, React.Suspense);
  assert.equal(catalog.props.fallback.type, load('app/services/catalog-loading.tsx').default);
  assert.equal(catalog.props.children.type.constructor.name, 'AsyncFunction');
});
