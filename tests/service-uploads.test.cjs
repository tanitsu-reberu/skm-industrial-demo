/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const pg = require('pg');
const sharp = require('sharp');
const { load, state, root } = require('./module-loader.cjs');
const mode = process.argv[2];
const probe = process.argv[3] === '--probe';
const container = 'skm-uploads-07b0dad5-pg';
const database = 'uploads_07b0dad5';
const owner = 'uploads_07b0dad5_owner';
const report = [];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const form = values => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, String(value)); return data; };
async function main() {
  assert(['sqlite', 'postgres'].includes(mode), 'Usage: node tests/service-uploads.test.cjs sqlite|postgres');
  const temp = process.env.SKM_UPLOAD_TEST_DIRECTORY;
  process.chdir(temp);
  delete process.env.TURSO_AUTH_TOKEN;
  if (mode === 'sqlite') {
    delete process.env.POSTGRES_URL;
    process.env.TURSO_DATABASE_URL = 'file:' + path.join(temp, 'images.sqlite').replaceAll('\\', '/');
  } else if (!probe) {
    const admin = new pg.Client({ host: '127.0.0.1', port: 55437, user: 'postgres', database: 'postgres' });
    await admin.connect();
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [owner])).rowCount) await admin.query(`CREATE ROLE ${owner} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`);
    if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${database} OWNER ${owner}`);
    await admin.end();
    process.env.POSTGRES_URL = `postgresql://${owner}@127.0.0.1:55437/${database}?sslmode=disable`;
    delete process.env.TURSO_DATABASE_URL;
  }
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.AUTH_SECRET ||= crypto.randomBytes(32).toString('base64url');
  process.env.ADMIN_GEO_PROXY_TOKEN ||= crypto.randomBytes(32).toString('base64url');
  state.headers = new Headers({ 'x-skm-geo-token': process.env.ADMIN_GEO_PROXY_TOKEN, 'x-skm-country': 'RU', 'x-skm-client-ip': '192.0.2.20' });
  const db = load('lib/db.ts');
  const uploads = load('lib/uploads.ts');
  const route = load('app/api/uploads/services/[file]/route.ts');
  const get = name => route.GET(new Request('http://fixture.test/api/uploads/services/' + name), { params: Promise.resolve({ file: name }) });
  try {
    await db.ensureDb();
    if (probe) {
      const expected = JSON.parse(fs.readFileSync(path.join(temp, 'expected.json'), 'utf8'));
      for (const row of expected) {
        const response = await get(row.name);
        assert.equal(response.status, 200);
        assert.equal(sha(Buffer.from(await response.arrayBuffer())), row.sha256);
      }
      console.log('PASS fresh-process database reads without upload filesystem (' + expected.length + ' SHA256 matches)');
      return;
    }
    const check = async (name, run) => { await run(); report.push(name); console.log('PASS ' + name); };
    const count = async () => (await db.dbGet('SELECT COUNT(*) AS n FROM service_uploads')).n;
    const total = async () => (await db.dbGet('SELECT COALESCE(SUM(byte_size),0) AS n FROM service_uploads')).n;
    const admin = await db.upsertUserByEmail('admin@example.test');
    const auth = load('lib/auth.ts');
    const actions = load('lib/service-actions.ts');
    await auth.createSession(admin);
    await auth.createAdminPanelSession(admin.id);
    const images = [];
    for (const [format, mime] of [['jpeg','image/jpeg'], ['png','image/png'], ['webp','image/webp'], ['avif','image/avif']]) {
      images.push({ bytes: await sharp({ create: { width: 3, height: 3, channels: 3, background: { r: 91, g: 20, b: 182 } } }).toFormat(format).toBuffer(), mime });
    }
    const file = (image, name = '../../untrusted<script>.png') => new File([image.bytes], name, { type: image.mime });
    const uploadForm = files => { const data = new FormData(); for (const entry of files) data.append('files', entry); return data; };
    const saveForm = (values = {}) => form({ title: 'Synthetic image service', category: load('lib/services.ts').serviceCategories[1], shortDescription: 'Synthetic service short description', description: 'Synthetic service detailed description for tests', price: 50, isActive: true, ...values });
    let urls;
    await check('authentication and secondary panel gate', async () => {
      const cookies = new Map(state.cookies); state.cookies.clear();
      assert.equal((await actions.adminUploadServiceImagesAction(uploadForm([file(images[0])]))).ok, false);
      assert.equal(await count(), 0);
      state.cookies = cookies;
      const panel = state.cookies.get('skm_admin_panel'); state.cookies.delete('skm_admin_panel');
      assert.equal((await actions.adminUploadServiceImagesAction(uploadForm([file(images[0])]))).ok, false);
      state.cookies.set('skm_admin_panel', panel);
    });
    await check('all four real image formats binary roundtrip and public headers', async () => {
      const result = await actions.adminUploadServiceImagesAction(uploadForm(images.map(image => file(image))));
      assert.equal(result.ok, true, result.message); urls = result.urls;
      assert.equal(await count(), 4);
      for (let i = 0; i < urls.length; i++) {
        const name = urls[i].split('/').at(-1);
        assert.match(name, /^\d+-[a-f0-9]{32}\.(jpg|png|webp|avif)$/);
        const response = await get(name);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), images[i].mime);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.match(response.headers.get('cache-control'), /public.*immutable/);
        assert.equal(Number(response.headers.get('content-length')), images[i].bytes.length);
        assert.equal(sha(Buffer.from(await response.arrayBuffer())), sha(images[i].bytes));
      }
      assert.equal(fs.existsSync(uploads.getUploadsDir()), false, 'database uploads never write filesystem');
    });
    await check('whole batch validation: MIME spoof, magic, empty, count, size, mixed entries', async () => {
      const before = await count();
      const bad = [
        [file(images[0]), new File(['<svg/>'], 'bad.png', { type: 'image/png' })],
        [new File([images[0].bytes], 'bad.png', { type: 'image/png' })],
        [new File([], 'empty.png', { type: 'image/png' })],
        [new File(['x'], 'x.svg', { type: 'image/svg+xml' })],
        [new File([Buffer.alloc(uploads.MAX_UPLOAD_BYTES + 1)], 'large.png', { type: 'image/png' })],
        Array.from({ length: 9 }, () => file(images[0])),
        [file(images[0]), 'not a file'],
        [],
        Array.from({ length: 4 }, () => new File([Buffer.alloc(7 * 1024 * 1024)], 'batch.png', { type: 'image/png' })),
      ];
      for (const entries of bad) { const result = await actions.adminUploadServiceImagesAction(uploadForm(entries)); assert.equal(result.ok, false); assert.equal(await count(), before); }
    });
    await check('database failure on second blob rolls back the entire valid batch', async () => {
      const before = await count();
      if (mode === 'postgres') {
        await db.dbExec(`CREATE FUNCTION reject_second_upload() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.mime='image/png' THEN RAISE EXCEPTION 'synthetic insert failure'; END IF; RETURN NEW; END $$;
          CREATE TRIGGER reject_second_upload BEFORE INSERT ON service_uploads FOR EACH ROW EXECUTE FUNCTION reject_second_upload()`);
      } else await db.dbExec(`CREATE TRIGGER reject_second_upload BEFORE INSERT ON service_uploads WHEN NEW.mime='image/png'
        BEGIN SELECT RAISE(ABORT, 'synthetic insert failure'); END;`);
      try {
        const result = await actions.adminUploadServiceImagesAction(uploadForm([file(images[0]), file(images[1])]));
        assert.equal(result.ok, false); assert.equal(await count(), before);
      } finally {
        await db.dbExec(mode === 'postgres' ? 'DROP TRIGGER reject_second_upload ON service_uploads; DROP FUNCTION reject_second_upload()' : 'DROP TRIGGER reject_second_upload');
      }
    });
    let first, second;
    await check('service save attaches, shared main/gallery refs survive deletion, missing refs rejected', async () => {
      first = await actions.adminSaveServiceAction(saveForm({ slug: 'image-one', image: urls[0], gallery: JSON.stringify(urls.slice(1)) }));
      assert.equal(first.ok, true, first.message);
      second = await actions.adminSaveServiceAction(saveForm({ slug: 'image-two', image: urls[0], gallery: JSON.stringify([urls[1]]) }));
      assert.equal(second.ok, true, second.message);
      assert((await db.dbGet('SELECT attached_at FROM service_uploads WHERE id=?', [urls[0].split('/').at(-1)])).attached_at);
      assert.equal((await actions.adminDeleteServiceAction(form({ id: first.serviceId }))).ok, true);
      assert.equal(await count(), 2);
      assert.equal((await get(urls[0].split('/').at(-1))).status, 200);
      assert.equal((await actions.adminSaveServiceAction(saveForm({ image: urls[2] }))).ok, false);
      assert.equal((await actions.adminSaveServiceAction(saveForm({ id: second.serviceId, slug: 'image-two', image: urls[0], gallery: '[]' }))).ok, true);
      assert.equal(await count(), 1);
      assert.equal((await actions.adminDeleteServiceAction(form({ id: second.serviceId }))).ok, true);
      assert.equal(await count(), 0);
    });
    await check('foreign pending refs, expiry, abandoned drafts and rollback cannot delete live shared data', async () => {
      const other = await db.dbRun("INSERT INTO users (email,role) VALUES (?,?)", ['other@example.test','user']);
      const pending = await uploads.storeServiceImages([file(images[0])], other.lastInsertRowid);
      assert.equal((await actions.adminSaveServiceAction(saveForm({ image: pending[0] }))).ok, false);
      assert.equal(await count(), 1);
      await db.dbRun('UPDATE service_uploads SET created_at=?', [Date.now() - uploads.PENDING_UPLOAD_TTL_MS - 1]);
      await uploads.withServiceUploads(async () => {});
      assert.equal(await count(), 0);
      await assert.rejects(uploads.withServiceUploads(async tx => {
        await db.dbTxRun(tx, 'INSERT INTO service_uploads (id,mime,data,byte_size,owner_id,created_at) VALUES (?,?,?,?,?,?)', ['rollback.jpg','image/jpeg',images[0].bytes,images[0].bytes.length,admin.id,Date.now()]);
        throw Error('rollback fixture');
      }), /rollback fixture/);
      assert.equal(await count(), 0);
    });
    await check('legacy filesystem fallback is read-only; traversal and executable files rejected', async () => {
      fs.mkdirSync(uploads.getUploadsDir(), { recursive: true });
      fs.writeFileSync(path.join(uploads.getUploadsDir(), 'legacy.jpg'), images[0].bytes);
      fs.writeFileSync(path.join(uploads.getUploadsDir(), 'fake.png'), '<script>bad</script>');
      const saved = await actions.adminSaveServiceAction(saveForm({ image: '/api/uploads/services/legacy.jpg', slug: 'legacy' })); assert.equal(saved.ok, true, saved.message);
      assert.equal((await get('legacy.jpg')).status, 200);
      for (const name of ['../legacy.jpg', '..%2flegacy.jpg', 'legacy.jpg/other', '.hidden.png', 'fake.png', 'shell.js']) assert.equal((await get(name)).status, 404);
      assert.equal((await actions.adminDeleteServiceAction(form({ id: saved.serviceId }))).ok, true);
      assert(fs.existsSync(path.join(uploads.getUploadsDir(), 'legacy.jpg')));
      fs.rmSync(path.join(temp, 'data'), { recursive: true });
    });
    await check('8-file and exact 8 MiB/24 MiB boundaries; concurrent global 48 MiB cap', async () => {
      const eight = await uploads.storeServiceImages(Array.from({ length: 8 }, () => file(images[0])), admin.id);
      assert.equal(eight.length, 8);
      await db.dbRun('DELETE FROM service_uploads');
      const bytes = crypto.randomBytes(uploads.MAX_UPLOAD_BYTES); images[0].bytes.copy(bytes);
      const large = { bytes, mime: 'image/jpeg' };
      await uploads.storeServiceImages(Array.from({ length: 3 }, () => file(large)), admin.id);
      assert.equal(await total(), 24 * 1024 * 1024);
      const concurrent = await Promise.allSettled(Array.from({ length: 4 }, () => uploads.storeServiceImages([file(large), file(large)], admin.id)));
      assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
      for (const result of concurrent.filter(result => result.status === 'rejected')) assert.match(result.reason.message, /48 МБ/);
      assert.equal(await total(), 40 * 1024 * 1024);
      await uploads.storeServiceImages([file(large)], admin.id);
      assert.equal(await total(), uploads.MAX_TOTAL_UPLOAD_BYTES);
      const result = await actions.adminUploadServiceImagesAction(uploadForm([file(images[0])]));
      assert.equal(result.ok, false); assert.match(result.message, /48 МБ/);
      assert.equal(await total(), uploads.MAX_TOTAL_UPLOAD_BYTES);
      if (mode === 'postgres') {
        execFileSync('docker', ['exec', container, 'pg_dump', '-U', owner, '-d', database, '-Fp', '--file=/tmp/upload-quota.sql']);
        const size = Number(execFileSync('docker', ['exec', container, 'stat', '-c', '%s', '/tmp/upload-quota.sql'], { encoding: 'utf8' }).trim());
        assert(size < 128 * 1024 * 1024, '48 MiB images plus full synthetic site fit 128 MiB SQL dump cap');
        execFileSync('docker', ['exec', container, 'rm', '/tmp/upload-quota.sql']);
        console.log('EVIDENCE full-quota plain pg_dump bytes=' + size);
      }
      await db.dbRun('DELETE FROM service_uploads');
    });
    await check('tiny-image record overhead cap, and repeat SQLite schema initialization', async () => {
      const statements = Array.from({ length: uploads.MAX_STORED_UPLOADS }, (_, i) => ({
        sql: 'INSERT INTO service_uploads (id,mime,data,byte_size,owner_id,created_at) VALUES (?,?,?,?,?,?)',
        args: ['tiny-' + i + '.jpg', 'image/jpeg', images[0].bytes, images[0].bytes.length, admin.id, Date.now()],
      }));
      await db.dbBatch(statements);
      await assert.rejects(uploads.storeServiceImages([file(images[0])], admin.id), /1024/);
      assert.equal(await count(), uploads.MAX_STORED_UPLOADS);
      await db.dbRun('DELETE FROM service_uploads');
      if (mode === 'sqlite') { globalThis.skmDbReady = undefined; await db.ensureDb(); assert.equal(await count(), 0); }
    });
    urls = await uploads.storeServiceImages(images.map(image => file(image)), admin.id);
    const expected = urls.map((url, i) => ({ name: url.split('/').at(-1), sha256: sha(images[i].bytes) }));
    const saved = await actions.adminSaveServiceAction(saveForm({ slug: 'durable', image: urls[0], gallery: JSON.stringify(urls.slice(1)) }));
    assert.equal(saved.ok, true, saved.message);
    fs.writeFileSync(path.join(temp, 'expected.json'), JSON.stringify(expected));
    const childEnv = { ...process.env, SKM_UPLOAD_TEST_DIRECTORY: temp };
    await check('process restart and complete upload-directory loss retain all image SHAs', async () => {
      execFileSync(process.execPath, [__filename, mode, '--probe'], { env: childEnv, stdio: ['ignore','pipe','pipe'] });
    });
    if (mode === 'postgres') {
      const client = new pg.Client({ connectionString: process.env.POSTGRES_URL }); await client.connect();
      try {
        await check('PostgreSQL 18 restricted owner, ledger/checksums, repeat/concurrent migrations', async () => {
          assert.match((await client.query('SHOW server_version')).rows[0].server_version, /^18\./);
          assert.equal((await client.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper, false);
          const migration = require('../scripts/db-migrations.mjs');
          const other = new pg.Client({ connectionString: process.env.POSTGRES_URL }); await other.connect();
          try { await Promise.all([migration.applyMigrations(client), migration.applyMigrations(other)]); } finally { await other.end(); }
          const inv = await migration.migrationInventory();
          assert.equal((await client.query('SELECT count(*) AS n FROM schema_migrations')).rows[0].n, String(inv.length));
          await client.query("UPDATE schema_migrations SET checksum='tampered' WHERE version='003-service-uploads.sql'");
          await assert.rejects(migration.applyMigrations(client), /checksum/);
          await client.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2', [inv.find(row => row.version.startsWith('003')).checksum, '003-service-uploads.sql']);
          const owners = await client.query("SELECT tableowner FROM pg_tables WHERE tablename IN ('service_uploads','service_upload_lock')");
          assert(owners.rows.every(row => row.tableowner === owner));
        });
        await check('real pg_dump/pg_restore into a separate database preserves image SHA256', async () => {
          const dump = execFileSync('docker', ['exec', container, 'pg_dump', '-U', owner, '-d', database, '-Fc'], { maxBuffer: 128 * 1024 * 1024 });
          const restored = database + '_restored';
          execFileSync('docker', ['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', restored]);
          execFileSync('docker', ['exec', container, 'createdb', '-U', 'postgres', '-O', owner, restored]);
          execFileSync('docker', ['exec', '-i', container, 'pg_restore', '-U', owner, '-d', restored, '--exit-on-error'], { input: dump });
          const result = execFileSync(process.execPath, [__filename, mode, '--probe'], { env: { ...childEnv, POSTGRES_URL: process.env.POSTGRES_URL.replace('/' + database + '?', '/' + restored + '?') }, encoding: 'utf8' });
          assert.match(result, /4 SHA256 matches/);
          console.log('EVIDENCE ' + JSON.stringify({ postgresVersion: (await client.query('SHOW server_version')).rows[0].server_version, dumpSha256: sha(dump), dumpBytes: dump.length, images: expected }));
        });
      } finally { await client.end(); }
      await check('real PostgreSQL container restart retains database images without upload files', async () => {
        await globalThis.skmPostgresPool.end(); delete globalThis.skmPostgresPool;
        execFileSync('docker', ['restart', container], { stdio: ['ignore','pipe','pipe'] });
        let ready = false;
        for (let i = 0; i < 50; i++) {
          try { execFileSync('docker', ['exec', container, 'pg_isready', '-U', owner, '-d', database], { stdio: 'pipe' }); ready = true; break; }
          catch { await new Promise(resolve => setTimeout(resolve, 100)); }
        }
        assert(ready);
        execFileSync(process.execPath, [__filename, mode, '--probe'], { env: childEnv, stdio: ['ignore','pipe','pipe'] });
      });
    }
    console.log('PASS ' + report.length + ' upload scenarios on ' + mode);
  } finally {
    await globalThis.skmPostgresPool?.end();
    globalThis.skmLibsql?.close();
    process.chdir(root);
  }
}
async function run() {
  if (probe || process.argv.includes('--worker')) return main();
  // Native SQLite transactions release their OS handles at process exit on Windows.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skm-upload-tests-'));
  try {
    execFileSync(process.execPath, [__filename, mode, '--worker'], {
      env: { ...process.env, SKM_UPLOAD_TEST_DIRECTORY: temp }, stdio: 'inherit',
    });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error.stack?.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]') ?? 'Upload tests failed'); process.exitCode = 1; });
