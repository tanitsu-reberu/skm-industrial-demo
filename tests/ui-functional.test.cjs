/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const { NextRequest } = require('next/server');

const root = path.resolve(__dirname, '..');

// Execute maintained TSX, stubbing only page dependencies; never connect to a database.
function load(file, mocks) {
  const filename = path.join(root, file);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const fixtureModule = { exports: {} };
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    assert(!name.startsWith('@/'), 'Unmocked application dependency: ' + name);
    return require(name);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename })(
    localRequire, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}

const components = {
  '@/components/page-transition': { PageTransition: 'fixture-transition' },
  '@/components/ui/button': { Button: 'fixture-button' },
  '@/components/ui/badge': { Badge: 'fixture-badge' },
  '@/components/contact-dialog': { ContactDialog: 'fixture-contact' },
  '@/components/admin-dashboard': { AdminDashboard: 'fixture-dashboard' },
  '@/components/admin-panel-gate': { AdminPanelGate: 'fixture-panel-gate' },
  '@/components/admin-security': { AdminSecurity: 'fixture-security' },
  '@/components/admin-services-manager': { AdminServicesManager: 'fixture-services' },
};

function nodes(tree, ancestors = []) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, ancestors));
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  return [{ element: tree, ancestors }, ...nodes(tree.props.children, [...ancestors, tree])];
}

function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree?.props ? text(tree.props.children) : '';
}

function adminFixture(user, hasAccess) {
  const calls = [];
  const state = { user, hasAccess };
  const actions = {
    getAdminPanelAccessState: async () => {
      calls.push('panel-access');
      return { hasAccess: state.hasAccess, hasPassword: true };
    },
    getAdminSnapshot: async () => { calls.push('snapshot'); return { contactRequests: [] }; },
    logoutAction: async () => { calls.push('logout'); state.user = null; state.hasAccess = false; },
  };
  const page = load('app/admin/page.tsx', {
    ...components,
    '@/lib/actions': actions,
    '@/lib/auth': { getCurrentUser: async () => state.user },
    '@/lib/services-db': { getAllServicesForAdmin: async () => { calls.push('services'); return []; } },
  });
  return { actions, calls, render: () => page.default({ searchParams: Promise.resolve({}) }) };
}

test('contacts allows request-time nonce rendering rather than forcing empty headers', () => {
  const page = load('app/contacts/page.tsx', { ...components, '@/lib/site-config': { siteConfig: { bankDetails: {} } } });
  assert.equal(page.dynamic, 'force-dynamic');
  assert.equal(page.revalidate, undefined);
});

test('all maintained page/layout segment overrides preserve the root request-time nonce', () => {
  const overrides = new Map();
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { inspect(file); continue; }
      if (!/^(?:page|layout)\.tsx$/.test(entry.name)) continue;
      const parsed = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const values = {};
      for (const statement of parsed.statements) {
        if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
          const name = declaration.name.text;
          if (!['dynamic', 'revalidate', 'fetchCache'].includes(name)) continue;
          const value = declaration.initializer;
          values[name] = ts.isStringLiteral(value) ? value.text : value.getText(parsed);
        }
      }
      assert(!['force-static', 'error'].includes(values.dynamic), file + ': forces empty request headers');
      assert(!['force-cache', 'only-cache'].includes(values.fetchCache), file + ': forces a static cache');
      overrides.set(path.relative(root, file).replaceAll(path.sep, '/'), values);
    }
  }
  inspect(path.join(root, 'app'));
  assert.equal(overrides.get('app/layout.tsx').dynamic, 'force-dynamic');
  for (const file of ['app/page.tsx', 'app/services/page.tsx', 'app/services/[slug]/page.tsx',
    'app/politika/page.tsx', 'app/soglasie/page.tsx', 'app/soglasie-administratora/page.tsx']) {
    assert(overrides.has(file), 'Missing segment coverage: ' + file);
  }
});

test('contacts receives a fresh nonce matching request/response CSP without relaxing script/style policy', async () => {
  const { proxy } = load('proxy.ts', { '@/lib/admin-network': { allowsAdminNetwork: () => false } });
  const nonces = [];
  for (let index = 0; index < 2; index++) {
    const response = await proxy(new NextRequest('https://ui-fixture.invalid/contacts', {
      headers: { 'x-nonce': 'forged-nonce', 'Content-Security-Policy': "script-src 'unsafe-inline'" },
    }));
    const policy = response.headers.get('Content-Security-Policy');
    const nonce = policy.match(/'nonce-([^']+)'/)[1];
    nonces.push(nonce);
    assert.notEqual(nonce, 'forged-nonce');
    assert.equal(response.headers.get('x-middleware-request-x-nonce'), nonce);
    assert.equal(response.headers.get('x-middleware-request-content-security-policy'), policy);
    const directives = new Map(policy.split(';').map(part => part.trim().split(/\s+/)).map(([key, ...values]) => [key, values]));
    assert.deepEqual(directives.get('script-src'), ["'self'", "'nonce-" + nonce + "'", "'strict-dynamic'"]);
    assert.deepEqual(directives.get('style-src'), ["'self'", "'nonce-" + nonce + "'"]);
    assert.match(response.headers.get('Cache-Control'), /private, no-store, no-transform/);
  }
  assert.notEqual(nonces[0], nonces[1]);
});

test('anonymous and nonadmin pages expose neither logout nor private data', async () => {
  for (const user of [null, { id: 2, role: 'user', email: 'user@example.test' }]) {
    const fixture = adminFixture(user, true);
    const tree = await fixture.render();
    assert.match(text(tree), /Доступ запрещён/);
    assert(!nodes(tree).some(({ element }) => element.type === 'form'));
    assert.deepEqual(fixture.calls, []);
  }
});

test('primary-only administrator still requires the existing secondary password gate', async () => {
  const fixture = adminFixture({ id: 1, role: 'admin', email: 'admin@example.test' }, false);
  const tree = await fixture.render();
  assert(nodes(tree).some(({ element }) => element.type === 'fixture-panel-gate' && element.props.hasPassword));
  assert(!nodes(tree).some(({ element }) => element.type === 'form'));
  assert.deepEqual(fixture.calls, ['panel-access']);
});

test('authorized admin renders an explicit logout submit form at every viewport using the existing action', async () => {
  const fixture = adminFixture({ id: 1, role: 'admin', email: 'admin@example.test' }, true);
  const tree = await fixture.render();
  const forms = nodes(tree).filter(({ element }) => element.type === 'form');
  assert.equal(forms.length, 1);
  const { element: form, ancestors } = forms[0];
  assert.equal(form.props.action, fixture.actions.logoutAction);
  const button = nodes(form).find(({ element }) => element.type === 'fixture-button').element;
  assert.equal(button.props.type, 'submit');
  assert.match(text(button), /Выйти/);
  assert(ancestors.some(node => node.type === 'div' && /Администратор: admin@example\.test/.test(text(node))));
  for (const element of [...ancestors, form, button]) {
    assert(!/(?:^|\s)(?:[\w-]+:)*hidden(?:\s|$)/.test(element.props.className ?? ''), 'Logout is hidden at some viewport');
  }
  assert.deepEqual(fixture.calls, ['panel-access', 'snapshot', 'services']);
  await form.props.action();
  assert.equal(fixture.calls.at(-1), 'logout');
  const afterLogout = await fixture.render();
  assert.match(text(afterLogout), /Доступ запрещён/);
  assert(!nodes(afterLogout).some(({ element }) => element.type === 'fixture-dashboard'));
});
