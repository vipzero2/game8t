import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {reconcileStars,monitorStatus} from '../functions/_lib/stars-monitor.js';
import {authorizedScheduledRun} from '../functions/_lib/scheduler-identity.js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const p of ['db/schema.sql','db/002_email_security.sql','db/003_telegram_stars.sql','db/004_subscription_grants.sql','db/005_stars_plans_90_180_365.sql'])
  db.exec(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
 function stmt(sql,args=[]){
  return {bind(...a){return stmt(sql,a)},
   async all(){return {results:db.prepare(sql).all(...args)}},
   async first(){return db.prepare(sql).get(...args)||null},
   async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}}
  };
 }
 const DB={prepare(sql){return stmt(sql)},async batch(items){
  db.exec('BEGIN');
  try{const results=[];for(const item of items)results.push(await item.run());db.exec('COMMIT');return results;}
  catch(e){db.exec('ROLLBACK');throw e}
 }};
 for(const [id,userid,charge,price] of [['o1','7001','charge-7001',150],['o2','7002','charge-7002',250]]){
  db.prepare("INSERT INTO users(id,name,email,password_hash,password_salt,password_iterations,subscription_until,created_at) VALUES(?,?,?,?,?,?,?,?)")
   .run(userid,'Tester','user'+userid+'@gmail.com','hash','salt',100000,price*86400,1700000000);
  db.prepare("INSERT INTO telegram_accounts(telegram_user_id,user_id,chat_id,linked_at) VALUES(?,?,?,?)")
   .run(userid,userid,userid,1700000000);
  const plan=price===150?'quarter':'half';
  db.prepare("INSERT INTO telegram_orders(id,user_id,telegram_user_id,chat_id,plan_id,duration_days,stars_amount,status,created_at,paid_at,telegram_charge_id,redeemed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
   .run(id,userid,userid,userid,plan,price===150?90:180,price,'redeemed',1700000000,1700000001,charge,1700000002);
  db.prepare("INSERT INTO subscription_baselines(user_id,baseline_until,created_at) VALUES(?,?,?)").run(userid,0,1700000000);
  db.prepare("INSERT INTO subscription_grants(id,user_id,source,source_id,granted_at,duration_seconds) VALUES(?,?,'telegram',?,?,?)")
   .run('grant-'+id,userid,id,1700000002,price*86400);
 }
 return {db,env:{DB,TELEGRAM_BOT_TOKEN:'test-token'}};
}
function fakeTelegram(transactions,balance=400){
 const original=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(url,options)=>{
  const method=String(url).split('/').at(-1);
  calls.push(method);
  if(method==='getStarTransactions'){
   const args=JSON.parse(options.body);
   return Response.json({ok:true,result:{transactions:transactions.slice(args.offset,args.offset+args.limit)}});
  }
  if(method==='getMyStarBalance')return Response.json({ok:true,result:{amount:balance}});
  if(method==='sendMessage')return Response.json({ok:true,result:true});
  throw Error('unexpected Telegram API '+method);
 };
 return {calls,restore(){globalThis.fetch=original}};
}
test('confirmed negative charge-ID movement revokes only its own subscription immediately and idempotently',async()=>{
 const {db,env}=fixture();
 const tg=fakeTelegram([
  {id:'charge-7001',amount:-150,date:1700000100,receiver:{type:'user',user:{id:7001},invoice_payload:'o1'}},
  {id:'unknown-charge',amount:-20,date:1700000100,receiver:{type:'other'}}
 ]);
 try{
  const r=await reconcileStars(env);
  assert.equal(r.revoked,1);assert.equal(r.unmatched,1);assert.equal(r.scanned,2);
  assert.equal(db.prepare("SELECT status FROM telegram_orders WHERE id='o1'").get().status,'refunded');
  assert.equal(db.prepare("SELECT subscription_until FROM users WHERE id='7001'").get().subscription_until,0);
  assert.equal(db.prepare("SELECT subscription_until FROM users WHERE id='7002'").get().subscription_until,250*86400);
  assert.equal(db.prepare("SELECT revoked_at IS NOT NULL AS revoked FROM subscription_grants WHERE source_id='o1'").get().revoked,1);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM telegram_refund_inbox WHERE telegram_charge_id='charge-7001'").get().c,1);
  assert.equal((await reconcileStars(env)).revoked,0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM rate_limits WHERE key LIKE 'stars:monitor:alert:%'").get().c,1);
  assert.equal(tg.calls.filter(m=>m==='getStarTransactions').length,2);
 }finally{tg.restore();db.close()}
});
test('mismatched refund amount and wrong Telegram buyer must NEVER revoke a subscription',async()=>{
 const {db,env}=fixture();
 const tg=fakeTelegram([
  {id:'charge-7001',amount:-149,receiver:{type:'user',user:{id:7001}}},
  {id:'charge-7002',amount:-250,receiver:{type:'user',user:{id:123456}}}
 ]);
 try{
  const r=await reconcileStars(env);
  assert.equal(r.revoked,0);assert.equal(r.alerts,2);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM telegram_orders WHERE status='refunded'").get().c,0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM rate_limits WHERE key LIKE 'stars:monitor:alert:%'").get().c,2);
 }finally{tg.restore();db.close()}
});
test('Stars balance decrease alone never cancels a buyer',async()=>{
 const {db,env}=fixture();
 const tg=fakeTelegram([],50);
 try{
  await reconcileStars(env);
  tg.restore();
  const next=fakeTelegram([],20);
  try{
   const r=await reconcileStars(env);
   assert.equal(r.drop,30);assert.equal(r.revoked,0);
   assert.equal(db.prepare("SELECT count FROM rate_limits WHERE key='stars:monitor:balanceDrop'").get().count,30);
  }finally{next.restore()}
 }finally{tg.restore();db.close()}
});
test('scheduler denies unsigned calls and checks signed GitHub OIDC claims',async()=>{
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk=publicKey.export({format:'jwk'});
 const original=globalThis.fetch;
 const t=Math.floor(Date.now()/1000);
 const claims={iss:'https://token.actions.githubusercontent.com',
  aud:'https://8aim.site/api/telegram/reconcile',
  repository:'vipzero2/game8t',repository_id:'1450433976',
  ref:'refs/heads/main',
  workflow_ref:'vipzero2/game8t/.github/workflows/stars-reconcile.yml@refs/heads/main',
  event_name:'schedule',iat:t,nbf:t-10,exp:t+300};
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const sign=payload=>{
  const msg=b64({alg:'RS256',typ:'JWT',kid:'example-key'})+'.'+b64(payload);
  const signature=createSign('RSA-SHA256').update(msg).end().sign(privateKey).toString('base64url');
  return msg+'.'+signature;
 };
 const request=jwt=>new Request('https://8aim.site/api/telegram/reconcile',{
  method:'POST',headers:{authorization:'Bearer '+jwt}});
 globalThis.fetch=async url=>{
  assert.equal(String(url),'https://token.actions.githubusercontent.com/.well-known/jwks');
  return Response.json({keys:[{...jwk,kid:'example-key',use:'sig',alg:'RS256'}]});
 };
 try{
  assert.equal(await authorizedScheduledRun(request(sign(claims))),true);
  for(const change of [{repository_id:'9'},{ref:'refs/heads/other'},{aud:'https://example.net'},{event_name:'pull_request'},{exp:t-1}]){
   assert.equal(await authorizedScheduledRun(request(sign({...claims,...change}))),false);
  }
  assert.equal(await authorizedScheduledRun(request('invalid')),false);
 }finally{globalThis.fetch=original}
});
