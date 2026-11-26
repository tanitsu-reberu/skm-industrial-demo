/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pg = require('pg');
const { load, state } = require('./module-loader.cjs');
const container = 'skm-audit-pg-20261125';
const database = 'closure_570e5006';
const owner = 'closure_570e5006_owner';
const records = [];
const form = values => { const data = new FormData(); for (const [key,value] of Object.entries(values)) data.set(key,value); return data; };
const check = async (name, run) => { await run(); records.push(name); console.log('PASS '+name); };
function legacyCookie(payload, purpose = 'authenticator-session') {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body+'.'+crypto.createHmac('sha256',process.env.AUTH_SECRET).update(purpose+':'+body).digest('base64url');
}
function psql(sql) {
  return execFileSync('docker', ['exec','-i',container,'psql','-X','-U','skm_audit','-d',database,'-v','ON_ERROR_STOP=1','-qAt'], { input: sql, encoding:'utf8', stdio:['pipe','pipe','pipe'] });
}
async function main() {
  // Fixed isolated Docker target; credentials are captured internally and never printed.
  const inspect = JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
  const secret = inspect.Config.Env.find(value => value.startsWith('POSTGRES_PASSWORD='))?.slice(18);
  assert(secret, 'Lab PostgreSQL credential missing');
  const root = new pg.Client({host:'127.0.0.1',port:55432,user:'skm_audit',password:secret,database:'skm_audit'});
  await root.connect();
  const password = crypto.randomBytes(24).toString('base64url');
  if (!(await root.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[owner])).rowCount) await root.query(`CREATE ROLE ${owner} LOGIN`);
  await root.query(`ALTER ROLE ${owner} PASSWORD '${password}'`);
  if (!(await root.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount) await root.query(`CREATE DATABASE ${database} OWNER ${owner}`);
  await root.end();
  process.env.POSTGRES_URL = `postgresql://${owner}:${password}@127.0.0.1:55432/${database}?sslmode=disable`;
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.AUTH_SECRET = crypto.randomBytes(32).toString('base64url');
  process.env.ADMIN_GEO_PROXY_TOKEN = crypto.randomBytes(32).toString('base64url');
  process.env.NEXT_PUBLIC_CONTACT_REQUESTS_ENABLED = '1';
  process.env.ADMIN_TOTP_SECRETS = JSON.stringify({'admin@example.test':'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'});
  state.headers = new Headers({'x-skm-geo-token':process.env.ADMIN_GEO_PROXY_TOKEN,'x-skm-country':'RU','x-skm-client-ip':'192.0.2.20','user-agent':'Mozilla/5.0 (Windows) Chrome/123 credential-marker'});
  const client = new pg.Client({connectionString:process.env.POSTGRES_URL}); await client.connect();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'skm-closure-tests-'));
  try {
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name,database);
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await client.query(`CREATE TABLE admin_privacy_consents (id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL,
      consent_version TEXT NOT NULL, received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(email,consent_version));
      INSERT INTO admin_privacy_consents(email,consent_version,received_at) VALUES('admin@example.test','fixture','2026-11-22 14:27:59.060164')`);
    const db = load('lib/db.ts'), auth = load('lib/auth.ts'), actions = load('lib/actions.ts');
    const migration = require('../scripts/db-migrations.mjs');
    await check('UTC provenance required; failed migration rolls back',async()=>{
      await assert.rejects(db.ensureDb(),/UTC|timezone/);
      assert.equal((await client.query("SELECT to_regclass('public.admin_sessions') AS name")).rows[0].name,null);
    });
    process.env.SKM_CONSENT_SOURCE_UTC_VERIFIED='1';
    await db.ensureDb();
    await check('consent UTC conversion and checksummed concurrent migration',async()=>{
      const row=(await client.query("SELECT received_at FROM admin_privacy_consents")).rows[0];
      assert.equal(row.received_at.toISOString(),'2026-11-22T14:27:59.060Z');
      const other=new pg.Client({connectionString:process.env.POSTGRES_URL});await other.connect();
      await Promise.all([migration.applyMigrations(client),migration.applyMigrations(other)]);await other.end();
      await client.query("UPDATE schema_migrations SET checksum='tampered' WHERE version LIKE '001%'");
      await assert.rejects(migration.applyMigrations(client),/checksum/);
      const inventory=await migration.migrationInventory();
      await client.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2',[inventory[0].checksum,inventory[0].version]);
      const generated=execFileSync('python',['scripts/database-admin.py','migrate','--emit-sql','--source-utc-verified','--expected-database',database],{encoding:'utf8'});
      psql(generated);
      assert.equal((await client.query('SELECT COUNT(*) AS total FROM schema_migrations')).rows[0].total,'2');
    });
    const admin=await db.upsertUserByEmail('admin@example.test');
    const exp=Math.floor(Date.now()/1000)+3600;
    const primary=legacyCookie({userId:admin.id,email:admin.email,role:'admin',exp});
    const panel=legacyCookie({userId:admin.id,exp},'admin-panel-totp');
    state.cookies.set('skm_session',{value:primary});state.cookies.set('skm_admin_panel',{value:panel});
    await check('legacy cookies adopt without rotation; concurrent reads; hashed material only',async()=>{
      const users=await Promise.all(Array.from({length:12},()=>auth.getCurrentUser())); assert(users.every(user=>user.id===admin.id));
      assert.equal(await auth.hasAdminPanelAccess(admin.id),true);
      assert.equal(state.cookies.get('skm_session').value,primary);
      const sessions=await db.dbAll('SELECT * FROM admin_sessions');assert.equal(sessions.length,2);
      assert(!JSON.stringify(sessions).includes(primary));assert(!JSON.stringify(sessions).includes(panel));
    });
    await check('individual revoke blocks replay and child access; other session survives',async()=>{
      const old=new Map(state.cookies);await auth.createSession(admin);await auth.createAdminPanelSession(admin.id);
      const current=new Map(state.cookies);
      const security=load('lib/admin-security.ts');
      await security.revokeAdminSessionAction(form({sessionHash:auth.sessionTokenHash(primary)}));
      state.cookies=new Map(old);
      assert.equal(await auth.getCurrentUser(),null);assert.equal(await auth.hasAdminPanelAccess(admin.id),false);
      await Promise.all(Array.from({length:10},()=>auth.getCurrentUser()));
      assert((await db.dbGet('SELECT revoked_at FROM admin_sessions WHERE token_hash=?',[auth.sessionTokenHash(primary)])).revoked_at);
      state.cookies=current;assert.equal((await auth.getCurrentUser()).id,admin.id);assert.equal(await auth.hasAdminPanelAccess(admin.id),true);
    });
    await check('expired/exact-expiry/malformed cookies never register; server logout blocks replay',async()=>{
      const current=new Map(state.cookies);
      for(const value of [legacyCookie({userId:admin.id,email:admin.email,exp:Math.floor(Date.now()/1000)}),primary+'.extra',legacyCookie({exp})]) {
        state.cookies.set('skm_session',{value});assert.equal(await auth.getCurrentUser(),null);
        assert.equal(await db.dbGet('SELECT token_hash FROM admin_sessions WHERE token_hash=?',[auth.sessionTokenHash(value)]),undefined);
      }
      state.cookies=current;const raw=state.cookies.get('skm_session').value;await actions.logoutAction();
      state.cookies.set('skm_session',{value:raw});assert.equal(await auth.getCurrentUser(),null);
      await auth.createSession(admin);await auth.createAdminPanelSession(admin.id);
    });
    await check('legacy/new primary refresh preserves secondary expiry and blocks old/revoked replay',async()=>{
      for(const legacy of [true,false]) {
        if(legacy) {
          state.cookies.set('skm_session',{value:legacyCookie({userId:admin.id,email:admin.email,role:'admin',exp:exp+10})});
          state.cookies.set('skm_admin_panel',{value:legacyCookie({userId:admin.id,exp:exp+10},'admin-panel-totp')});
        } else { await auth.createSession(admin);await auth.createAdminPanelSession(admin.id); }
        const old=new Map(state.cookies);
        const oldExpiry=JSON.parse(Buffer.from(old.get('skm_admin_panel').value.split('.')[0],'base64url')).exp;
        await auth.refreshSessionCookie(admin);
        assert.equal(await auth.hasAdminPanelAccess(admin.id),true);
        const current=new Map(state.cookies);
        assert.equal(JSON.parse(Buffer.from(current.get('skm_admin_panel').value.split('.')[0],'base64url')).exp,oldExpiry);
        state.cookies=old;await auth.refreshSessionCookie(admin);assert.equal(await auth.getCurrentUser(),null);
        state.cookies=current;assert.equal((await auth.getCurrentUser()).id,admin.id);
      }
    });
    await check('legacy scrypt rehash, bounded malformed hashes and KDF concurrency',async()=>{
      const passwords=load('lib/password.ts'); const salt=crypto.randomBytes(16);
      const stored='scrypt:'+salt.toString('base64url')+':'+crypto.scryptSync('Fixture-Password-2026!',salt,64,{N:16384,r:8,p:1}).toString('base64url');
      await db.setAdminPanelPassword(admin.id,stored);
      assert.equal((await actions.verifyAdminPanelPasswordAction(form({password:'wrong'}))).ok,false);
      const start=performance.now(); assert.equal((await actions.verifyAdminPanelPasswordAction(form({password:'Fixture-Password-2026!'}))).ok,true);
      const hash=await db.getAdminPanelPasswordHash(admin.id);assert(hash.startsWith('scrypt-v2:'));
      const hashMs=Math.round(performance.now()-start);console.log('MEASURE legacy verify + v2 rehash '+hashMs+'ms');
      for(const malformed of ['scrypt:x:x','scrypt-v2:'+ 'x'.repeat(100000),'scrypt-v2:AAAAAAAAAAAAAAAAAAAAAA:AA',hash+':extra']) assert.equal(await passwords.verifyPassword('Fixture-Password-2026!',malformed),false);
      const outcomes=await Promise.all(Array.from({length:6},()=>passwords.verifyPassword('Fixture-Password-2026!',hash)));
      assert.equal(outcomes.filter(Boolean).length,2);
      assert.equal((await auth.getCurrentUser()).id,admin.id);
    });
    await check('TOTP both outcomes audited; replay denied, secrets redacted',async()=>{
      const totp=load('lib/totp.ts');const code=totp.authenticatorCode(JSON.parse(process.env.ADMIN_TOTP_SECRETS)[admin.email],Math.floor(Date.now()/30000));
      assert.equal((await actions.verifyAuthenticatorAction(form({code,privacyConsent:'on'}))).ok,true);
      assert.equal((await actions.verifyAuthenticatorAction(form({code,privacyConsent:'on'}))).ok,false);
      const events=await db.dbAll('SELECT * FROM admin_security_events');assert(events.some(row=>row.event_type==='auth.totp'&&row.outcome==='success'));
      const serialized=JSON.stringify(events);for(const secret of [code,'Fixture-Password-2026!','credential-marker',process.env.AUTH_SECRET])assert(!serialized.includes(secret));
      await auth.createAdminPanelSession(admin.id);
    });
    await check('anonymous failure/throttle audit writes bounded per minute',async()=>{
      const events=load('lib/security-events.ts');
      await Promise.all(Array.from({length:80},()=>events.recordSecurityEvent('auth.totp','denied')));
      await Promise.all(Array.from({length:80},()=>events.recordSecurityEvent('auth.totp','failure')));
      assert((await db.dbGet("SELECT COUNT(*) AS n FROM admin_security_events WHERE event_type='auth.totp' AND outcome='denied'")).n<=1);
      assert((await db.dbGet("SELECT COUNT(*) AS n FROM admin_security_events WHERE event_type='auth.totp' AND outcome='failure'")).n<=10);
    });
    await check('contact persists once under concurrent duplicates, honest receipt and trusted diagnostics',async()=>{
      const input={name:'123',phone:'+79990000000',email:'fixture@example.test',comment:'Fixture needle',privacyConsent:'on',consentVersion:load('lib/privacy-policy.ts').contactConsentVersion};
      const result=await Promise.all(Array.from({length:8},()=>actions.createContactRequestAction(form(input))));assert.equal(result.filter(row=>row.ok).length,1);
      assert.match(result.find(row=>row.ok).message,/принята/);
      const row=await db.dbGet('SELECT * FROM contact_requests');assert.equal(row.name,'123');assert.equal(row.mail_status,'pending');assert.equal(row.mail_attempts,0);
      assert.match(row.diagnostic_ip_hash,/^[a-f0-9]{64}$/);assert.equal(row.diagnostic_agent,'Chrome/Windows');
      const saved=state.headers;state.headers=new Headers({'x-forwarded-for':'192.0.2.99','x-skm-client-ip':'192.0.2.99','user-agent':'secret'});
      assert.deepEqual(await load('lib/security-events.ts').requestDiagnostics(),{ipHash:null,agent:null});state.headers=saved;
    });
    await check('bounded search/status pagination incl wildcard and status transition',async()=>{
      await client.query(`INSERT INTO contact_requests(name,phone,comment,status) SELECT 'Fixture '||n,'+79990000001','pagination needle',CASE WHEN n<=60 THEN 'new' ELSE 'processed' END FROM generate_series(1,70) AS n`);
      const first=await actions.getAdminSnapshot({query:'needle'});const second=await actions.getAdminSnapshot({query:'needle',page:2});
      assert.equal(first.contactRequests.length,25);assert.equal(second.contactRequests.length,25);assert.equal(first.total,61);assert.equal(first.counts.processed,10);
      assert(!first.contactRequests.some(row=>second.contactRequests.some(other=>row.id===other.id)));
      assert.equal((await actions.getAdminSnapshot({query:'%'})).total,0);
      const id=first.contactRequests[0].id;assert.equal((await actions.updateContactRequestStatusAction(form({requestId:String(id),status:'in_progress'}))).ok,true);
      assert.equal((await actions.getAdminSnapshot({status:'in_progress'})).total,1);
    });
    await check('all admin text fields reject File values without persisting changes',async()=>{
      const services=load('lib/service-actions.ts'); const file=new File(['100'],'bad.txt');
      assert.equal((await services.adminSaveServiceAction(form({title:file}))).ok,false);
      assert.equal((await services.adminDeleteServiceAction(form({id:file}))).ok,false);
      assert.equal((await actions.updateContactRequestStatusAction(form({requestId:file,status:'processed'}))).ok,false);
      assert.equal((await actions.verifyAdminPanelPasswordAction(form({password:file}))).ok,false);
    });
    await check('security APIs require both factors and paginate logs',async()=>{
      const security=load('lib/admin-security.ts');
      for(let n=0;n<60;n++) await load('lib/security-events.ts').recordSecurityEvent('service.update','success',admin.id,n+1);
      const first=await security.getAdminSecuritySnapshot();assert.equal(first.events.length,50);assert(first.next);
      const next=await security.getAdminSecuritySnapshot(String(first.next));assert(next.events.every(row=>row.id<first.next));
      const panel=state.cookies.get('skm_admin_panel');state.cookies.delete('skm_admin_panel');
      assert.equal(await security.getAdminSecuritySnapshot(),null);
      const hash=await auth.currentSessionHash();await security.revokeAdminSessionAction(form({sessionHash:hash}));
      assert.equal((await auth.getCurrentUser()).id,admin.id);state.cookies.set('skm_admin_panel',panel);
    });
    await check('retention dry-run/bounds retain business and unexpired revocation',async()=>{
      const retention=require('../scripts/data-retention.mjs');
      await client.query(`CREATE TABLE orders(id BIGINT PRIMARY KEY); INSERT INTO orders VALUES(1);
        INSERT INTO otp_codes(email,code_hash,expires_at) VALUES('old@example.test','not-a-secret',CURRENT_TIMESTAMP-INTERVAL '2 days');
        INSERT INTO admin_sessions(token_hash,user_id,purpose,expires_at,revoked_at) VALUES('${'a'.repeat(64)}',${admin.id},'authenticator-session',CURRENT_TIMESTAMP+INTERVAL '1 day',CURRENT_TIMESTAMP);
        UPDATE contact_requests SET diagnostic_at=CURRENT_TIMESTAMP-INTERVAL '31 days' WHERE diagnostic_at IS NOT NULL;`);
      const dry=await retention.cleanEphemeral(client,{expectedDatabase:database});assert.equal(dry.otp_codes,1);assert.equal((await db.dbGet('SELECT COUNT(*) AS n FROM otp_codes')).n,1);
      const applied=await retention.cleanEphemeral(client,{apply:true,batchSize:1,expectedDatabase:database});assert.equal(applied.otp_codes,1);assert.equal((await db.dbGet('SELECT COUNT(*) AS n FROM orders')).n,1);
      assert((await db.dbGet('SELECT revoked_at FROM admin_sessions WHERE token_hash=?',['a'.repeat(64)])).revoked_at);
      psql(execFileSync('python',['scripts/database-admin.py','retention','--emit-sql','--apply','--expected-database',database],{encoding:'utf8'}));
      assert.equal((await db.dbGet('SELECT COUNT(*) AS n FROM contact_requests WHERE diagnostic_ip_hash IS NOT NULL')).n,0);
    });
    await check('mailer and maintenance narrow grants execute real SQL; unrelated data denied',async()=>{
      const rewrite=source=>source.replaceAll('skm_site_mail','closure_570e5006_mail').replaceAll('skm_site_maintenance','closure_570e5006_maintenance').replaceAll('DATABASE skm_site','DATABASE closure_570e5006');
      psql(rewrite(fs.readFileSync('deploy/skm-site-mail-grants.sql','utf8')));
      psql(rewrite(fs.readFileSync('deploy/skm-site-maintenance-grants.sql','utf8')));
      const claim=execFileSync('python',['-c',"import ast,pathlib; t=ast.parse(pathlib.Path('scripts/contact-mailer.py').read_text(encoding='utf-8')); print(next(ast.literal_eval(n.value) for n in t.body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='CLAIM' for x in n.targets)))"],{encoding:'utf8'}).replace("SET mail_next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'","SET mail_next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes', mail_attempts = mail_attempts + 1, mail_status = 'sending'");
      const claimed=psql('SET ROLE closure_570e5006_mail;'+claim).trim();assert(claimed.includes('id'));
      assert.equal((await db.dbGet('SELECT SUM(mail_attempts) AS total FROM contact_requests')).total,1);
      assert.throws(()=>psql('SET ROLE closure_570e5006_mail;SELECT admin_panel_password FROM users;'));
      const sql=execFileSync('python',['scripts/database-admin.py','retention','--emit-sql','--apply','--expected-database',database],{encoding:'utf8'});
      psql('SET ROLE closure_570e5006_maintenance;'+sql);
      assert.throws(()=>psql('SET ROLE closure_570e5006_maintenance;SELECT phone FROM contact_requests;'));
      assert.throws(()=>psql('SET ROLE closure_570e5006_maintenance;UPDATE users SET role=role;'));
    });
    await check('startup and maintenance install timeouts before contended locks, rollback and recover',async()=>{
      process.env.SKM_DB_LOCK_TIMEOUT_MS='120';
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(57065006)');
      globalThis.skmDbReady=undefined;
      const started=performance.now();await assert.rejects(db.ensureDb(),/lock timeout/);
      assert(performance.now()-started<2000);await client.query('ROLLBACK');await db.ensureDb();
      const held=new pg.Client({connectionString:process.env.POSTGRES_URL});await held.connect();
      try {
        await held.query('BEGIN');await held.query('SELECT pg_advisory_xact_lock(57065007)');
        await assert.rejects(require('../scripts/data-retention.mjs').cleanEphemeral(client,{apply:true,expectedDatabase:database}),/lock timeout/);
        assert.equal((await client.query('SELECT 1 AS n')).rows[0].n,1);
        await held.query('ROLLBACK');
      } finally { await held.end();delete process.env.SKM_DB_LOCK_TIMEOUT_MS; }
    });
    await check('default automatic drain exceeds 1800/hour steady state and reports bounded backlog',async()=>{
      const retention=require('../scripts/data-retention.mjs');
      const inject=async n=>client.query(`INSERT INTO contact_requests(phone,comment,diagnostic_ip_hash,diagnostic_at)
        SELECT '+79990000000','retention capacity fixture','fixture',CURRENT_TIMESTAMP-INTERVAL '31 days' FROM generate_series(1,$1)`,[n]);
      for(let hour=0;hour<3;hour++) {
        await inject(1800);
        const result=await retention.runRetention(client,{apply:true,expectedDatabase:database});
        assert.equal(result.counts.contact_diagnostics,1800);assert.equal(result.backlogPossible,false);assert(result.batches<=4);
      }
      await inject(9000);const first=await retention.runRetention(client,{apply:true,expectedDatabase:database});
      assert.equal(first.counts.contact_diagnostics,4000);assert.equal(first.backlogPossible,true);assert.equal(first.batches,4);
      const second=await retention.runRetention(client,{apply:true,expectedDatabase:database});assert.equal(second.counts.contact_diagnostics,4000);
      const third=await retention.runRetention(client,{apply:true,expectedDatabase:database});assert.equal(third.counts.contact_diagnostics,1000);assert.equal(third.backlogPossible,false);
      await inject(1800);
      const emitter="import importlib.util,subprocess,json; s=importlib.util.spec_from_file_location('dbadmin','scripts/database-admin.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.query=lambda sql:subprocess.run(['docker','exec','-i','skm-audit-pg-20261125','psql','-X','-U','skm_audit','-d','closure_570e5006','-qAt','-v','ON_ERROR_STOP=1'],input=sql,encoding='utf-8',stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=True).stdout; print(json.dumps(m.run_retention('closure_570e5006',True)))";
      const python=JSON.parse(execFileSync('python',['-c',emitter],{encoding:'utf8'}));
      assert.equal(python.counts.contact_diagnostics,1800);assert.equal(python.backlogPossible,false);assert.equal(python.batches,2);
      assert.match(fs.readFileSync('deploy/skm-site-retention.timer','utf8'),/OnCalendar=\*-\*-\* \*:0\/5:00/);
    });
    await check('retire validates actual archive/provenance/target, refuses nonempty and preserves active tables',async()=>{
      const retention=require('../scripts/data-retention.mjs');
      const backup=path.join(temp,'fixture.dump');const bytes=execFileSync('docker',['exec',container,'pg_dump','-U','skm_audit','-Fc',database]);fs.writeFileSync(backup,bytes,{mode:0o600});
      const checksum=crypto.createHash('sha256').update(bytes).digest('hex');
      const manifest=path.join(temp,'proof.json');
      const proof={formatVersion:1,kind:'full-database',database,checksum,
        restoreVerification:{status:'passed',database:'closure_fixture_restored',countsVerified:true,verifiedAt:new Date().toISOString()}};
      fs.writeFileSync(manifest,JSON.stringify(proof),{mode:0o600});
      const options={backup,checksum,manifest,expectedDatabase:database,restoreCommand:['docker','exec','-i',container,'pg_restore']};
      await assert.rejects(retention.retireEmptyLegacy(client,{...options,checksum:'0'.repeat(64)}),/provenance|checksum/i);
      const fake=path.join(temp,'fake.dump');fs.writeFileSync(fake,'PGDMPnot-an-archive',{mode:0o600});
      const fakeHash=crypto.createHash('sha256').update(fs.readFileSync(fake)).digest('hex');
      const fakeManifest=path.join(temp,'fake.json');fs.writeFileSync(fakeManifest,JSON.stringify({...proof,checksum:fakeHash}),{mode:0o600});
      await assert.rejects(retention.retireEmptyLegacy(client,{...options,backup:fake,checksum:fakeHash,manifest:fakeManifest}),/archive/);
      const wrongUrl=new URL(process.env.POSTGRES_URL);wrongUrl.pathname='/skm_audit';
      const wrong=new pg.Client({connectionString:wrongUrl.toString()});await wrong.connect();
      try {
        await assert.rejects(retention.retireEmptyLegacy(wrong,options),/expected database/);
        await assert.rejects(retention.cleanEphemeral(wrong,{apply:true,expectedDatabase:database}),/expected database/);
      } finally { await wrong.end(); }
      await assert.rejects(retention.retireEmptyLegacy(client,options),/Nonempty/);
      assert.equal((await db.dbGet('SELECT COUNT(*) AS n FROM orders')).n,1);
      const emitter="import importlib.util,sys; s=importlib.util.spec_from_file_location('dbadmin','scripts/database-admin.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.retire_sql(*sys.argv[1:5],restore_command=('docker','exec','-i','skm-audit-pg-20261125','pg_restore')))";
      const generated=execFileSync('python',['-c',emitter,backup,checksum,manifest,database],{encoding:'utf8'});
      assert.throws(()=>execFileSync('docker',['exec','-i',container,'psql','-X','-U','skm_audit','-d','skm_audit','-v','ON_ERROR_STOP=1','-qAt'],{input:generated,stdio:['pipe','pipe','pipe']}));
      assert.throws(()=>psql(generated));
      await client.query('DELETE FROM orders; CREATE TABLE chat_events(id BIGINT REFERENCES orders(id));');
      const retired=await retention.retireEmptyLegacy(client,options);assert(retired.includes('orders'));assert(retired.includes('chat_events'));
      await client.query('CREATE TABLE invoices(id BIGINT PRIMARY KEY)');psql(generated);
      assert.equal((await client.query("SELECT to_regclass('public.invoices') AS name")).rows[0].name,null);
      assert((await db.dbGet('SELECT COUNT(*) AS n FROM contact_requests')).n>0);assert((await db.dbGet('SELECT COUNT(*) AS n FROM users')).n>0);
    });
    console.log(`PASS ${records.length} PostgreSQL closure scenarios (non-superuser schema owner)`);
  } finally {
    await client.end(); await globalThis.skmPostgresPool?.end();
    // Only the fresh test-owned directory is removed.
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error.message?.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]')??'Closure test failed');process.exitCode=1;});
