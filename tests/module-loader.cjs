/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const native = createRequire(path.join(root, 'package.json'));
const ts = native('typescript');
const cache = new Map();
const state = { cookies: new Map(), headers: new Headers() };
const cookieStore = {
  get: name => state.cookies.get(name),
  set: (name, value, options) => state.cookies.set(name, { value, options }),
};
function load(file) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  if (absolute.endsWith('.mjs')) return native(absolute);
  if (absolute.endsWith('.json')) return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const fixtureModule = { exports: {} };
  cache.set(absolute, fixtureModule);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: absolute,
  }).outputText;
  function localRequire(name) {
    if (name === 'server-only') return {};
    if (name === 'next/cache') return { revalidatePath() {} };
    if (name === 'next/headers') return { cookies: async () => cookieStore, headers: async () => state.headers };
    if (name === 'react') return { ...native('react'), cache: fn => fn };
    if (name.startsWith('@/')) {
      const base = name.slice(2);
      const suffix = ['', '.ts', '.tsx', '.json'].find(ext => fs.existsSync(path.join(root, base + ext)) && fs.statSync(path.join(root, base + ext)).isFile());
      if (suffix === undefined) throw Error('Unresolved alias ' + name);
      return load(base + suffix);
    }
    return native(name);
  }
  vm.runInThisContext('(function(require,module,exports,__filename,__dirname){' + code + '\n})', { filename: absolute })(localRequire, fixtureModule, fixtureModule.exports, absolute, path.dirname(absolute));
  return fixtureModule.exports;
}
module.exports = { load, state, native, root };
