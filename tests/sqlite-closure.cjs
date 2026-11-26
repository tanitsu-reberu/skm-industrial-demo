/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (!process.env.SKM_SQLITE_FIXTURE) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'skm-sqlite-closure-'));
  const result=require('node:child_process').spawnSync(process.execPath,[__filename],{env:{...process.env,SKM_SQLITE_FIXTURE:temp},stdio:'inherit'});
  fs.rmSync(temp,{recursive:true,force:true});process.exit(result.status??1);
}
const temp = process.env.SKM_SQLITE_FIXTURE;
delete process.env.POSTGRES_URL;
delete process.env.ADMIN_GEO_PROXY_TOKEN;
process.env.TURSO_DATABASE_URL = 'file:'+path.join(temp,'test.sqlite');
process.env.ADMIN_EMAIL='admin@example.test';process.env.AUTH_SECRET='sqlite-fixture-secret';
process.env.NEXT_PUBLIC_CONTACT_REQUESTS_ENABLED='1';
const {load,state}=require('./module-loader.cjs');
process.env.ADMIN_TOTP_SECRETS=JSON.stringify({'admin@example.test':'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'});
const form=values=>{const data=new FormData();for(const [key,value] of Object.entries(values))data.set(key,value);return data;};
(async()=>{
  try {
    const db=load('lib/db.ts'),auth=load('lib/auth.ts'),actions=load('lib/actions.ts');
    const legacy=require('@libsql/client').createClient({url:process.env.TURSO_DATABASE_URL});
    await legacy.executeMultiple(`CREATE TABLE admin_security_events(id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,event TEXT NOT NULL,outcome TEXT NOT NULL,target TEXT,ip_hash TEXT,agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO admin_security_events(event,outcome,target) VALUES('fixture.old','success','123');`);
    legacy.close();
    await db.ensureDb();
    const old=await db.dbGet("SELECT event_type,target_id FROM admin_security_events WHERE id=1");
    assert.equal(old.event_type,'fixture.old');assert.equal(old.target_id,'123');
    const totp=load('lib/totp.ts');const code=totp.authenticatorCode(JSON.parse(process.env.ADMIN_TOTP_SECRETS)['admin@example.test'],Math.floor(Date.now()/30000));
    assert.equal((await actions.verifyAuthenticatorAction(form({code,privacyConsent:'on'}))).ok,true);
    const admin=await db.upsertUserByEmail('admin@example.test');
    assert.equal((await actions.setupAdminPanelPasswordAction(form({password:'SQLite-Password-2026!',confirm:'SQLite-Password-2026!'}))).ok,true);
    assert.equal((await actions.verifyAdminPanelPasswordAction(form({password:'wrong'}))).ok,false);
    assert.equal((await actions.verifyAdminPanelPasswordAction(form({password:'SQLite-Password-2026!'}))).ok,true);
    assert.equal((await auth.getCurrentUser()).id,admin.id);assert.equal(await auth.hasAdminPanelAccess(admin.id),true);
    await auth.refreshSessionCookie(admin);assert.equal(await auth.hasAdminPanelAccess(admin.id),true);
    const input=new FormData();for(const [key,value] of Object.entries({phone:'+79990000000',name:'123',comment:'fixture',email:'',privacyConsent:'on',consentVersion:load('lib/privacy-policy.ts').contactConsentVersion}))input.set(key,value);
    assert.equal((await actions.createContactRequestAction(input)).ok,true);assert.equal((await actions.createContactRequestAction(input)).ok,false);
    assert.equal((await actions.getAdminSnapshot()).total,1);
    const contact=(await actions.getAdminSnapshot()).contactRequests[0];
    assert.equal((await actions.updateContactRequestStatusAction(form({requestId:String(contact.id),status:'processed'}))).ok,true);
    const security=load('lib/admin-security.ts');assert((await security.getAdminSecuritySnapshot()).events.length>=5);
    assert.equal((await actions.deleteContactRequestAction(form({requestId:String(contact.id)}))).ok,true);
    await db.dbExec(`CREATE TRIGGER audit_failure BEFORE INSERT ON admin_security_events BEGIN SELECT RAISE(FAIL,'fixture audit unavailable'); END;`);
    const replay=new Map(state.cookies);await actions.logoutAction();assert.equal(await auth.getCurrentUser(),null);
    state.cookies=replay;assert.equal(await auth.getCurrentUser(),null);assert.equal(await auth.hasAdminPanelAccess(admin.id),false);
    await auth.createSession(admin);await auth.createAdminPanelSession(admin.id);
    const current=new Map(state.cookies);await security.revokeAdminSessionAction(form({sessionHash:await auth.currentSessionHash()}));
    state.cookies=current;assert.equal(await auth.getCurrentUser(),null);
    await auth.createSession(admin);await auth.createAdminPanelSession(admin.id);await actions.revokeAdminPanelAccessAction();
    assert.equal((await auth.getCurrentUser()).id,admin.id);assert.equal(await auth.hasAdminPanelAccess(admin.id),false);
    console.log('PASS SQLite schema/session/refresh/contact/dedup/pagination fallback');
  } finally { globalThis.skmLibsql?.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
