/* eslint-disable @typescript-eslint/no-require-imports */
// Run after npm run build. Local raw HTTP only; no browser, SSH or production data.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('maintained production HTML pages use a fresh matching nonce on every inline script/style', { timeout: 90000 }, async () => {
  assert(fs.existsSync(path.join(root, '.next', 'BUILD_ID')), 'Run npm run build first');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.next', 'prerender-manifest.json'), 'utf8'));
  const htmlRoutes = ['/', '/contacts', '/services', '/services/[slug]', '/politika', '/soglasie',
    '/soglasie-administratora', '/login', '/admin', '/_not-found'];
  for (const route of htmlRoutes) {
    assert(!Object.hasOwn(manifest.routes, route), route + ' must not be prerendered with an empty/stale nonce');
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skm-nonce-test-'));
  // Only OS runtime variables are inherited; all database/auth settings are synthetic.
  const env = {};
  for (const key of ['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP',
    'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'LANG']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    TURSO_DATABASE_URL: 'file:' + path.join(tempRoot, 'synthetic.sqlite'),
    ADMIN_EMAIL: 'admin@example.test', AUTH_SECRET: crypto.randomBytes(32).toString('base64url'),
    ADMIN_GEO_PROXY_TOKEN: crypto.randomBytes(32).toString('base64url'),
    ADMIN_TOTP_SECRETS: '{}', SKM_CONSENT_SOURCE_UTC_VERIFIED: '1' });
  const child = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
    'start', '--hostname', '127.0.0.1', '--port', '0'], {
    cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const exited = once(child, 'exit');
  try {
    const base = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Local Next startup timed out')), 30000);
      const finish = (error, value) => {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.off('error', onError);
        child.off('exit', onExit);
        if (error) reject(error); else resolve(value);
      };
      const onData = data => {
        output = (output + data.toString()).slice(-8192);
        const address = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
        if (address && /Ready in/.test(output)) finish(null, address);
      };
      const onError = () => finish(new Error('Local Next failed to start'));
      const onExit = () => finish(new Error('Local Next exited before readiness'));
      child.stdout.on('data', onData);
      child.on('error', onError);
      child.on('exit', onExit);
      // Consume diagnostics without exposing environment or response contents.
      child.stderr.resume();
    });
    async function check(route, status = 200) {
      const nonces = [];
      let html;
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(15000),
          headers: { 'x-nonce': 'untrusted-client-nonce',
            'x-skm-country': 'RU', 'x-skm-geo-token': env.ADMIN_GEO_PROXY_TOKEN } });
        assert.equal(response.status, status, route);
        assert.match(response.headers.get('content-type'), /text\/html/);
        assert.match(response.headers.get('cache-control'), /private.*no-store/);
        const policy = response.headers.get('content-security-policy');
        assert(policy, route + ': missing CSP');
        const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
        assert(nonce && nonce !== 'untrusted-client-nonce', route + ': missing server nonce');
        nonces.push(nonce);
        for (const directive of ['script-src', 'style-src']) {
          const value = policy.split(';').map(part => part.trim()).find(part => part.startsWith(directive + ' '));
          assert(value?.includes("'nonce-" + nonce + "'"), route + ': missing ' + directive + ' nonce');
          assert(!value.includes("'unsafe-inline'"), route + ': relaxed ' + directive);
        }
        html = await response.text();
        let styles = 0, scripts = 0, structuredData = 0;
        for (const match of html.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
          const [, tag, attrs] = match;
          if (/\bsrc\s*=/i.test(attrs)) continue;
          assert.equal(attrs.match(/\bnonce="([^"]+)"/i)?.[1], nonce,
            route + ': ' + tag + ' has an absent or mismatching nonce');
          if (tag.toLowerCase() === 'style') styles++;
          else scripts++;
          if (/type="application\/ld\+json"/.test(attrs)) structuredData++;
        }
        assert(styles > 0 && scripts > 0 && structuredData > 0, route + ': missing layout inline tags');
      }
      assert.notEqual(nonces[0], nonces[1], route + ': nonce reused between requests');
      return html;
    }
    for (const route of ['/', '/contacts', '/services', '/politika', '/soglasie',
      '/soglasie-administratora', '/login']) await check(route);
    const services = await check('/services');
    const servicePath = services.match(/href="(\/services\/[^"?#]+)"/)?.[1];
    assert(servicePath, 'Synthetic service catalog has no detail link');
    await check(servicePath);
    const missing = await check('/nonce-fixture-not-found', 404);
    assert.match(missing, /Страница не найдена/);
    assert.match(missing, /<a\b[^>]*href="\/"[^>]*>На главную<\/a>/);
    // An anonymous request still cannot reach admin data after these public GETs.
    const admin = await fetch(base + '/admin', { redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { 'x-skm-country': 'RU', 'x-skm-geo-token': env.ADMIN_GEO_PROXY_TOKEN } });
    assert.equal(admin.status, 307);
    assert.equal(new URL(admin.headers.get('location'), base).pathname, '/login');
  } finally {
    if (child.exitCode === null) child.kill();
    await Promise.race([exited, new Promise(resolve => {
      const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); resolve(); }, 5000);
      timer.unref();
    })]);
    const resolved = path.resolve(tempRoot);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert(path.basename(resolved).startsWith('skm-nonce-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
