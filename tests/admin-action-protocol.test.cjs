/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { NextRequest } = require('next/server');
const { load, state } = require('./module-loader.cjs');
const token = 's'.repeat(43);
const trusted = { 'x-skm-geo-token': token, 'x-skm-country': 'RU', 'x-skm-client-ip': '192.0.2.20' };
process.env.ADMIN_GEO_PROXY_TOKEN = token;
process.env.AUTH_SECRET = 'synthetic-protocol-test-secret-'.repeat(2);

function form(values) { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; }

async function guardWorker() {
  delete process.env.POSTGRES_URL;
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(process.env.SKM_ACTION_TEST_DIRECTORY, 'guard.sqlite').replaceAll('\\', '/');
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.NEXT_PUBLIC_CONTACT_REQUESTS_ENABLED = '1';
  process.env.ADMIN_TOTP_SECRETS = JSON.stringify({ 'admin@example.test': 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' });
  state.headers = new Headers(trusted);
  const db = load('lib/db.ts'), auth = load('lib/auth.ts'), actions = load('lib/actions.ts');
  const services = load('lib/service-actions.ts'), security = load('lib/admin-security.ts');
  const proxy = load('proxy.ts').proxy;
  try {
    await db.ensureDb();
    const code = load('lib/totp.ts').authenticatorCode('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', Math.floor(Date.now() / 30000));
    assert.equal((await actions.verifyAuthenticatorAction(form({ code, privacyConsent: 'on' }))).ok, true);
    const admin = await auth.getCurrentUser(); assert(admin);
    assert.equal(await auth.hasAdminPanelAccess(admin.id), false, 'Primary login alone does not grant panel access');
    const primary = new Map(state.cookies);
    assert.equal((await actions.setupAdminPanelPasswordAction(form({ password: 'Synthetic-password-2026!', confirm: 'Synthetic-password-2026!' }))).ok, true);
    assert.equal(await auth.hasAdminPanelAccess(admin.id), true);
    let full = new Map(state.cookies);
    const secondary = new Map([['skm_admin_panel', full.get('skm_admin_panel')]]);
    const seed = await db.dbGet('SELECT id FROM services ORDER BY id LIMIT 1');
    const contact = await db.dbRun('INSERT INTO contact_requests (phone,comment) VALUES (?,?)', ['+79990000000', 'Synthetic status fixture']);
    const removable = await db.dbRun('INSERT INTO contact_requests (phone,comment) VALUES (?,?)', ['+79990000001', 'Synthetic delete fixture']);
    const targetHash = 'b'.repeat(64);
    await db.dbRun('INSERT INTO admin_sessions (token_hash,user_id,purpose,expires_at) VALUES (?,?,?,?)', [targetHash, admin.id, 'authenticator-session', new Date(Date.now() + 3600000).toISOString()]);
    const category = load('lib/services.ts').serviceCategories[1];
    const serviceForm = values => form({ title: 'Synthetic guarded service', slug: 'guarded-action-service', category,
      shortDescription: 'Synthetic guarded service description', description: 'Synthetic guarded service complete description', price: '5', isActive: 'true', ...values });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64');
    const upload = new FormData(); upload.append('files', new File([png], 'fixture.png', { type: 'image/png' }));
    const writes = [
      ['service create', () => services.adminSaveServiceAction(serviceForm({}))],
      ['service update', () => services.adminSaveServiceAction(serviceForm({ id: String(seed.id), slug: 'guarded-existing-service' }))],
      ['service delete', () => services.adminDeleteServiceAction(form({ id: String(seed.id) }))],
      ['image upload', () => services.adminUploadServiceImagesAction(upload)],
      ['contact status', () => actions.updateContactRequestStatusAction(form({ requestId: String(contact.lastInsertRowid), status: 'processed' }))],
      ['contact delete', () => actions.deleteContactRequestAction(form({ requestId: String(removable.lastInsertRowid) }))],
      ['session revoke', () => security.revokeAdminSessionAction(form({ sessionHash: targetHash }))],
    ];
    async function business() {
      return JSON.stringify([
        await db.dbAll('SELECT id,slug,title,is_active FROM services ORDER BY id'),
        await db.dbAll('SELECT id,phone,comment,status FROM contact_requests ORDER BY id'),
        await db.dbAll('SELECT id,byte_size,owner_id FROM service_uploads ORDER BY id'),
        await db.dbAll('SELECT token_hash,revoked_at FROM admin_sessions ORDER BY token_hash'),
      ]);
    }
    const denied = [
      ['no session', new Map(), new Headers(trusted)],
      ['primary only', primary, new Headers(trusted)],
      ['secondary only', secondary, new Headers(trusted)],
      ['foreign country', full, new Headers({ ...trusted, 'x-skm-country': 'US' })],
      ['untrusted ingress', full, new Headers({ ...trusted, 'x-skm-geo-token': 'wrong' })],
    ];
    let deniedChecks = 0;
    for (const [name, cookies, headers] of denied) {
      state.cookies = new Map(cookies); state.headers = headers;
      const before = await business();
      for (const [action, run] of writes) {
        const result = await run();
        if (action === 'session revoke') assert.equal(result, undefined);
        else assert.deepEqual(result, { ok: false, message: 'Недостаточно прав' }, name + ': ' + action);
        assert.equal(await business(), before, name + ': unauthorized ' + action + ' must not change data/sessions');
        deniedChecks++;
      }
      assert.equal(await security.getAdminSecuritySnapshot(), null);
      assert.equal((await actions.getAdminSnapshot()).contactRequests.length, 0);
      if (name !== 'primary only') {
        assert.equal((await actions.setupAdminPanelPasswordAction(form({ password: 'Synthetic-password-2026!', confirm: 'Synthetic-password-2026!' }))).ok, false);
        assert.equal((await actions.verifyAdminPanelPasswordAction(form({ password: 'Synthetic-password-2026!' }))).ok, false);
        assert.equal((await actions.revokeAdminPanelAccessAction()).ok, false);
        assert.deepEqual(await actions.getAdminPanelAccessState(), { isAdmin: false, hasPassword: false, hasAccess: false });
        assert.equal(await business(), before, name + ': factor/setup/session-close entry points must remain denied');
      }
    }
    // An ordinary no-cookie POST is forwarded, then the actual action guard produces a controlled result.
    state.cookies = new Map(); state.headers = new Headers(trusted);
    const forwarded = await proxy(new NextRequest('https://fixture.invalid/admin', { method: 'POST', headers: { ...trusted, origin: 'https://fixture.invalid' } }));
    assert.equal(forwarded.headers.get('x-middleware-next'), '1'); assert.equal(forwarded.headers.get('location'), null);
    assert.equal((await services.adminSaveServiceAction(serviceForm({}))).ok, false);
    assert.equal((await actions.setupAdminPanelPasswordAction(form({ password: 'x', confirm: 'x' }))).ok, false);
    assert.equal((await actions.verifyAdminPanelPasswordAction(form({ password: 'Synthetic-password-2026!' }))).ok, false);
    assert.equal((await actions.revokeAdminPanelAccessAction()).ok, false);
    const noSessionBefore = await business(); await actions.logoutAction(); assert.equal(await business(), noSessionBefore);
    // Wrong secondary password still fails and correct verification still establishes the second factor.
    state.cookies = new Map(primary); state.headers = new Headers(trusted);
    assert.equal((await actions.verifyAdminPanelPasswordAction(form({ password: 'incorrect' }))).ok, false);
    assert.equal(await auth.hasAdminPanelAccess(admin.id), false);
    assert.equal((await actions.verifyAdminPanelPasswordAction(form({ password: 'Synthetic-password-2026!' }))).ok, true);
    assert.equal((await db.dbGet('SELECT attempts FROM admin_totp_state WHERE email=?', ['panel:' + admin.id])).attempts, 2,
      'Wrong/correct password attempts still use the existing bounded rate accounting');
    full = new Map(state.cookies);
    const saved = await writes[0][1](); assert.equal(saved.ok, true, saved.message);
    assert.equal((await writes[1][1]()).ok, true);
    assert.equal((await writes[3][1]()).ok, true);
    assert.equal((await writes[4][1]()).ok, true);
    assert.equal((await writes[5][1]()).ok, true);
    await writes[6][1](); assert((await db.dbGet('SELECT revoked_at FROM admin_sessions WHERE token_hash=?', [targetHash])).revoked_at);
    assert.equal((await writes[2][1]()).ok, true);
    assert.equal((await services.adminDeleteServiceAction(form({ id: String(saved.serviceId) }))).ok, true);
    // Capability-reducing own-session close/logout keep their existing intentional policy.
    assert.equal((await actions.revokeAdminPanelAccessAction()).ok, true);
    assert.equal(await auth.hasAdminPanelAccess(admin.id), false);
    state.cookies = new Map(full);
    await actions.logoutAction();
    assert.equal(await auth.getCurrentUser(), null);
    assert.equal(await auth.hasAdminPanelAccess(admin.id), false);
    const afterLogout = await business();
    assert.equal((await services.adminSaveServiceAction(serviceForm({}))).ok, false);
    assert.equal(await business(), afterLogout);
    console.log(JSON.stringify({ deniedBusinessWrites: deniedChecks, fullAuthenticatedWrites: 7,
      actualTotpLogin: true, actualSecondaryVerification: true, normalLogout: true, staleSaveDeniedWithoutDataWrite: true }));
  } finally { globalThis.skmLibsql?.close(); }
}

if (process.argv.includes('--guard-worker')) {
  guardWorker().catch(error => { console.error(error.stack); process.exitCode = 1; });
} else {
  const proxy = load('proxy.ts').proxy;
  test('anonymous GET/HEAD admin navigation retains the login redirect', async () => {
    for (const method of ['GET', 'HEAD']) for (const pathname of ['/admin', '/admin?tab=services', '/admin/settings']) {
      const result = await proxy(new NextRequest('https://fixture.invalid' + pathname, { method, headers: trusted }));
      assert.equal(result.status, 307); assert.equal(result.headers.get('location'), 'https://fixture.invalid/login');
    }
  });
  test('trusted anonymous POST reaches native action handling with fresh nonce and unchanged Origin', async () => {
    for (const cookie of ['', 'skm_session=malformed', 'skm_session=expired.invalid']) {
      const result = await proxy(new NextRequest('https://fixture.invalid/admin', { method: 'POST',
        headers: { ...trusted, cookie, origin: 'https://fixture.invalid', 'x-nonce': 'untrusted' } }));
      assert.equal(result.headers.get('x-middleware-next'), '1'); assert.equal(result.headers.get('location'), null);
      assert.equal(result.headers.get('x-action-redirect'), null, 'No fabricated Server Action protocol');
      assert.equal(result.headers.get('x-middleware-request-origin'), 'https://fixture.invalid');
      const nonce = result.headers.get('Content-Security-Policy').match(/'nonce-([^']+)'/)[1];
      assert.notEqual(nonce, 'untrusted'); assert.equal(result.headers.get('x-middleware-request-x-nonce'), nonce);
      assert.match(result.headers.get('Cache-Control'), /private, no-store, no-transform/);
    }
  });
  test('geo/ingress restriction still rejects every protected method before forwarding', async () => {
    for (const method of ['GET', 'HEAD', 'POST']) for (const headers of [{}, { ...trusted, 'x-skm-country': 'US' }, { ...trusted, 'x-skm-geo-token': 'wrong' }]) {
      const result = await proxy(new NextRequest('https://fixture.invalid/admin', { method, headers }));
      assert.equal(result.status, 403); assert.equal(result.headers.get('x-middleware-next'), null);
    }
  });
  test('real isolated auth/action guards deny every privileged write, preserve data, and allow normal full authentication', () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'skm-action-guards-'));
    try {
      const result = execFileSync(process.execPath, [__filename, '--guard-worker'], { encoding: 'utf8', windowsHide: true,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SKM_ACTION_TEST_DIRECTORY: temporary } });
      const proof = JSON.parse(result.trim()); assert.equal(proof.deniedBusinessWrites, 35);
      assert.equal(proof.fullAuthenticatedWrites, 7); assert.equal(proof.staleSaveDeniedWithoutDataWrite, true);
      console.log('GUARD_EVIDENCE ' + JSON.stringify(proof));
    } finally {
      assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
      assert(path.basename(temporary).startsWith('skm-action-guards-'));
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
}
