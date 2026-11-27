/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const radix = require('@radix-ui/react-dialog');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const { load, root } = require('./module-loader.cjs');

// Inspect the maintained component, retaining real Radix identities and class merging.
// DOM interaction and pixel/layout checks belong to the coordinated final browser pass.
const filename = process.env.SKM_DIALOG_TEST_SOURCE ?? path.join(root, 'components/ui/dialog.tsx');
const fixtureModule = { exports: {} };
const effects = [];
const mocks = {
  react: { ...React, useLayoutEffect: effect => effects.push(effect) },
  '@/lib/utils': load('lib/utils.ts'),
};
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  fileName: filename,
}).outputText;
vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename })(
  name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), fixtureModule, fixtureModule.exports);
const dialog = fixtureModule.exports;
const sentinel = React.createElement('input', { name: 'fixture-field' });
function render(props = {}) {
  const portal = dialog.DialogContent({ children: sentinel, ...props });
  assert.equal(portal.type, radix.Portal);
  const children = React.Children.toArray(portal.props.children);
  return { portal, overlay: children.find(child => child.type === radix.Overlay), panel: children.find(child => child.type === radix.Content) };
}
function tokens(element) { return new Set(element.props.className.split(/\s+/)); }
function adminEditorClasses() {
  const source = ts.createSourceFile('admin-services-manager.tsx', fs.readFileSync(path.join(root, 'components/admin-services-manager.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let value;
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'DialogContent') {
      const attr = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.text === 'className');
      if (!value && attr?.initializer && ts.isStringLiteral(attr.initializer)) value = attr.initializer.text;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert(value, 'Maintained service-editor dialog className must be found');
  return value;
}

test('UI-02: Radix content is the visible panel; backdrop is its sibling, outside the dismissable layer', () => {
  const { overlay, panel } = render();
  assert(overlay);
  assert(panel);
  assert.equal(panel.props.asChild, undefined);
  const panelChildren = React.Children.toArray(panel.props.children);
  assert(panelChildren.some(child => child.type === sentinel.type && child.props.name === sentinel.props.name));
  assert(!panelChildren.includes(overlay));
  assert(!panelChildren.some(child => child.type === 'div'), 'No viewport-size wrapper inside the Radix content');
  assert(tokens(overlay).has('inset-0'));
  assert(!tokens(panel).has('inset-0'), 'The actual dialog must not fill the viewport');
  assert(!tokens(panel).has('pointer-events-none'));
});

test('outside/Escape/focus handlers and aria labels pass unchanged to the real Radix content', () => {
  const handlers = Object.fromEntries(['onPointerDownOutside', 'onInteractOutside', 'onEscapeKeyDown', 'onOpenAutoFocus', 'onCloseAutoFocus'].map(name => [name, () => {}]));
  const { panel } = render({ ...handlers, 'aria-labelledby': 'fixture-title', 'aria-describedby': 'fixture-description', id: 'fixture-panel' });
  for (const [name, handler] of Object.entries(handlers)) assert.equal(panel.props[name], handler);
  assert.equal(panel.props['aria-labelledby'], 'fixture-title');
  assert.equal(panel.props['aria-describedby'], 'fixture-description');
  assert.equal(panel.props.id, 'fixture-panel');
  assert.equal(dialog.Dialog, radix.Root);
  assert.equal(dialog.DialogTrigger, radix.Trigger);
  const close = React.Children.toArray(panel.props.children).find(child => child.type === radix.Close);
  assert(close, 'Native Radix Close retains dismissal and trigger-focus restoration');
  assert(React.Children.toArray(close.props.children).some(child => child.type === 'span' && child.props.className === 'sr-only' && child.props.children === 'Закрыть'));
  assert.equal(dialog.DialogTitle.render({ children: 'Fixture title' }, null).type, radix.Title);
  assert.equal(dialog.DialogDescription.render({ children: 'Fixture description' }, null).type, radix.Description);
});

test('asChild renders one real Radix panel with its caller content and appended close button', () => {
  const article = React.createElement('article', { 'data-fixture-panel': 'custom', className: 'custom-panel' },
    React.createElement(radix.Title, null, 'Custom panel'),
    React.createElement(radix.Description, null, 'Custom description'),
    React.createElement('p', null, 'Caller body'));
  const { panel } = render({ asChild: true, children: article });
  const html = renderToStaticMarkup(React.createElement(radix.Root, { open: true }, panel));
  assert.match(html, /^<article\b/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /data-fixture-panel="custom"/);
  assert.match(html, /custom-panel/);
  assert.match(html, /Caller body/);
  assert.match(html, /Закрыть/);
  assert.equal((html.match(/<article\b/g) ?? []).length, 1);
  assert(!html.includes('inset-0'), 'Custom child must keep the visible panel boundary');
});

test('service-editor overrides keep flexible body scrolling and responsive width on the actual panel', () => {
  const { panel } = render({ className: adminEditorClasses() });
  const classes = tokens(panel);
  for (const name of ['flex', 'flex-col', 'max-h-[94svh]', 'overflow-hidden', 'p-0', 'sm:p-0', 'sm:w-[calc(100vw-3rem)]', 'sm:max-w-6xl']) assert(classes.has(name), name);
  assert(!classes.has('overflow-y-auto'));
  assert(!classes.has('max-h-[90svh]'));
  assert(!classes.has('sm:max-w-xl'));
  assert(React.Children.toArray(panel.props.children).some(child => child.type === sentinel.type && child.props.name === sentinel.props.name));
});

test('Tailwind emits bounded bottom-sheet and intrinsic-height desktop centering without transform offsets', async () => {
  const normal = render().panel;
  const admin = render({ className: adminEditorClasses() }).panel;
  const config = load('tailwind.config.ts').default;
  const result = await postcss([tailwind({ ...config, content: [{ raw: normal.props.className + ' ' + admin.props.className, extension: 'html' }] })]).process('@tailwind utilities;', { from: undefined });
  function declarations(selector, media) {
    let found;
    result.root.walkRules(selector, rule => {
      if (!media || rule.parent.type === 'atrule' && rule.parent.params === media) {
        found = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
      }
    });
    assert(found, selector + ' is compiled');
    return found;
  }
  assert.equal(declarations('.fixed').position, 'fixed');
  assert.equal(declarations('.bottom-0').bottom, '0px');
  assert.equal(declarations('.mx-auto')['margin-left'], 'auto');
  assert.equal(declarations('.sm\\:inset-y-0', '(min-width: 640px)').top, '0px');
  assert.equal(declarations('.sm\\:my-auto', '(min-width: 640px)')['margin-top'], 'auto');
  assert.equal(declarations('.sm\\:h-fit', '(min-width: 640px)').height, 'fit-content');
  assert.equal(declarations('.overflow-y-auto')['overflow-y'], 'auto');
  assert.equal(declarations('.overflow-hidden').overflow, 'hidden');
  assert(!normal.props.className.includes('translate-'), 'Centering must not conflict with slide/zoom transforms');
  assert(normal.props.className.includes('data-[state=closed]:animate-out'));
  assert(normal.props.className.includes('data-[state=open]:animate-in'));
  assert(!normal.props.className.includes('group-data-'), 'Animations use the actual Radix state');
});
