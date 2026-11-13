import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';
import {onRequest} from '../functions/api/[[path]].js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,password_iterations INTEGER NOT NULL,role TEXT NOT NULL,blocked INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL)");
 db.exec("CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)");
 db.exec("CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL)");
 db.exec("CREATE TABLE audit_log(id TEXT PRIMARY KEY,admin_id TEXT NOT NULL,target_id TEXT,action TEXT NOT NULL,info TEXT NOT NULL,created_at INTEGER NOT NULL)");
 function stmt(sql,args=[]){return{bind(...next){return stmt(sql,next)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:result.changes}}}}}
 const DB={prepare(sql){return stmt(sql)},async batch(items){db.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e}}};
 const now=Math.floor(Date.now()/1000),session=randomBytes(32).toString('base64url');
 db.prepare("INSERT INTO users(id,name,email,password_hash,password_salt,password_iterations,role,created_at) VALUES(?,?,?,?,?,?,?,?)").run('test-admin','Owner','owner@gmail.com','hash','salt',100000,'admin',now);
 db.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)").run(createHash('sha256').update(session).digest('hex'),'test-admin',now,now+86400);
 const alerts=[],realFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('https://api.telegram.org/bot')){
   alerts.push(JSON.parse(options.body));return Response.json({ok:true,result:true});
  }
  return realFetch(url,options);
 };
 const env={DB,SESSION_SECRET:'a-long-secret-for-google-review-test-01234567890',TELEGRAM_BOT_TOKEN:'testing_only',TELEGRAM_SECURITY_ALERT_CHAT_ID:'123456789'};
 async function call(path,method='POST',payload={},admin=false){
  const response=await onRequest({
   request:new Request('https://8aim.site/api'+path,{
    method,
    headers:{'content-type':'application/json',...(method==='GET'?{}:{origin:'https://8aim.site'}),...(admin?{cookie:'__Host-aim8_session='+session}:{})},
    ...(method==='GET'?{}:{body:JSON.stringify(payload)})
   }),
   env,params:{path:path.slice(1).split('/')}
  });
  return {status:response.status,data:await response.json()};
 }
 return {db,alerts,call,close(){globalThis.fetch=realFetch;db.close()}};
}
test('Google review license is reusable and alerts only above 30 simultaneous sessions',async()=>{
 const x=fixture();
 try{
  let r=await x.call('/admin/review/issue','POST',{});
  assert.equal(r.status,401);
  r=await x.call('/admin/review/issue','POST',{label:'Google Review'},true);
  assert.equal(r.status,200,JSON.stringify(r.data));
  const {code,id}=r.data;
  assert.match(code,/^A8R-[A-Za-z0-9_-]{32}$/);
  assert.equal((await x.call('/admin/review/issue','POST',{},true)).status,409);
  const seen=[];
  for(let i=0;i<30;i++){
   const one=await x.call('/telegram/device/review/activate','POST',{code});
   assert.equal(one.status,200,JSON.stringify(one.data));
   seen.push(one.data.sessionToken);
   assert.equal(one.data.activeSessions,i+1);
  }
  assert.equal(x.alerts.length,0);
  const extra=await x.call('/telegram/device/review/activate','POST',{code});
  assert.equal(extra.status,200);
  assert.equal(extra.data.activeSessions,31);
  assert.equal(x.alerts.length,1);
  assert.match(x.alerts[0].text,/31/);
  const again=await x.call('/telegram/device/review/verify','POST',{sessionToken:seen[0]});
  assert.equal(again.status,200);
  assert.equal(x.alerts.length,1,'cooldown prevents repeated notifications');
  const before=await x.call('/admin/review/status','GET',{},true);
  assert.equal(before.data.licenses[0].activeSessions,31);
  assert.equal(before.data.threshold,30);
  const repeat=await x.call('/telegram/device/review/activate','POST',{code,previousSessionToken:seen[0]});
  assert.equal(repeat.status,200);
  assert.equal(repeat.data.activeSessions,31,'reusing one device does not double count');
  assert.equal(x.db.prepare('SELECT code_hash FROM review_licenses WHERE id=?').get(id).code_hash,
   createHash('sha256').update(code).digest('hex'));
  const revoke=await x.call('/admin/review/revoke','POST',{id},true);
  assert.equal(revoke.status,200);
  assert.equal((await x.call('/telegram/device/review/verify','POST',{sessionToken:repeat.data.sessionToken})).status,403);
  assert.equal((await x.call('/telegram/device/review/activate','POST',{code})).status,403);
  const after=await x.call('/admin/review/status','GET',{},true);
  assert.equal(after.data.licenses[0].activeSessions,0);
  assert.equal((await x.call('/admin/review/issue','POST',{},true)).status,200);
 }finally{x.close()}
});
