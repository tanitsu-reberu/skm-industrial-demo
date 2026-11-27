/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

// Run against the parent's final synthetic Next server, never a production origin.
// Example (inside the isolated app): SKM_SERVICE_HTTP_BASE_URL=http://127.0.0.1:4271 node --test tests/service-route-status.test.cjs
const configured = process.env.SKM_SERVICE_HTTP_BASE_URL;
const deletedSlugs = ['ui-lab-service-07b0dad5', 'ui-lab-service-07b0dad5-edited'];
const agents = [
  ['browser', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'],
  ['raw', 'curl/8.10.1'],
];

test('UI-03: real HTTP statuses for live, deleted and missing service routes', {
  skip: !configured && 'Requires an explicit isolated app origin; source inspection cannot prove HTTP 404',
}, async t => {
  const base = new URL(configured);
  assert.equal(base.protocol, 'http:');
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Run inside the isolated candidate app using its loopback listener');
  assert.equal(base.username + base.password + base.search + base.hash, '', 'Origin must not contain credentials/query data');
  assert.equal(base.pathname, '/');
  async function get(path, agent) {
    const response = await fetch(new URL(path, base), {
      redirect: 'manual', cache: 'no-store',
      headers: { accept: 'text/html', 'user-agent': agent }, signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1].replace(/<[^>]*>/g, '').trim();
    const noindex = /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(body);
    console.log('HTTP_EVIDENCE ' + JSON.stringify({ path, userAgent: agent, status: response.status, heading, noindex,
      bytes: Buffer.byteLength(body), sha256: crypto.createHash('sha256').update(body).digest('hex') }));
    return { response, body, heading, noindex };
  }
  const catalog = await get('/services', agents[0][1]);
  assert.equal(catalog.response.status, 200, 'Catalog must be healthy before checking missing routes');
  const livePath = /href="(\/services\/[^"/?#]+)"/.exec(catalog.body)?.[1];
  assert(livePath, 'At least one active public service must be present in the synthetic fixture');
  await t.test('a live service still returns HTTP 200 with its actual heading', async () => {
    const live = await get(livePath, agents[0][1]);
    assert.equal(live.response.status, 200);
    assert(live.heading && live.heading !== 'Страница не найдена');
    assert.equal(live.noindex, false);
  });
  const missing = 'ui-status-missing-' + crypto.randomUUID();
  for (const [name, agent] of agents) {
    for (const path of ['/' + missing, '/services/' + missing, ...deletedSlugs.map(slug => '/services/' + slug)]) {
      await t.test(name + ': ' + path + ' is an actual HTTP 404, not a streamed 200', async () => {
        const result = await get(path, agent);
        assert.equal(result.response.status, 404, 'The HTTP response itself must be 404 before any hydration');
        // The streamed error payload may not contain a raw h1; Hooke checks the hydrated UI separately.
        if (result.heading !== undefined) assert.equal(result.heading, 'Страница не найдена');
        assert.equal(result.noindex, true);
        assert(!result.body.includes('<h1>UI Lab Service 07b0dad5</h1>'));
      });
    }
  }
});
