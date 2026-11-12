import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {onRequest} from '../functions/api/[[path]].js';
import {base64url,hmac} from '../functions/_lib/common.js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const path of [
  'db/schema.sql','db/002_email_security.sql','db/003_telegram_stars.sql',
  'db/004_subscription_grants.sql','db/005_stars_plans_90_180_365.sql',
  'db/006_telegram_device_codes.sql','db/007_telegram_language_preferences.sql',
  'db/008_telegram_bot_security.sql'
 ])db.exec(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 function stmt(sql,args=[]){return{
  bind(...next){return stmt(sql,next)},
  async first(){return db.prepare(sql).get(...args)||null},
  async all(){return {results:db.prepare(sql).all(...args)}},
  async run(){const x=db.prepare(sql).run(...args);return {meta:{changes:x.changes}}}
 }}
 const DB={prepare(sql){return stmt(sql)},async batch(items){
  db.exec('BEGIN');try{const r=[];for(const item of items)r.push(await item.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e}
 }};
 const env={DB,SESSION_SECRET:'a-long-enough-session-secret-for-security-tests',TELEGRAM_BOT_TOKEN:'mock_bot_token'};
 db.prepare("UPDATE plans SET stars_enabled=1 WHERE id='quarter'").run();
 const priorFetch=globalThis.fetch,apiCalls=[];
 let rejectNextMessage=false;
 globalThis.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://api.telegram.org/bot'))return priorFetch(url,options);
  const method=String(url).split('/').at(-1),args=JSON.parse(options.body||'{}');
  apiCalls.push({method,args});
  if(method==='sendMessage'&&rejectNextMessage){
   rejectNextMessage=false;
   return Response.json({ok:false,error_code:429,description:'test transient failure'},{status:429});
  }
  return Response.json({ok:true,result:true});
 };
 async function secret(){return base64url(await hmac(env.SESSION_SECRET,'aim8:telegram:webhook:v1'))}
 async function webhook(update,overrideSecret){
  const req=new Request('https://8aim.site/api/telegram/webhook',{method:'POST',headers:{
   'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':overrideSecret??await secret()
  },body:JSON.stringify(update)});
  return onRequest({request:req,env,params:{path:['telegram','webhook']}});
 }
 async function status(path){
  const req=new Request('https://8aim.site/api'+path);
  return onRequest({request:req,env,params:{path:path.slice(1).split('/')}});
 }
 return {db,env,apiCalls,webhook,status,secret,failNextMessage(){rejectNextMessage=true},restore(){globalThis.fetch=priorFetch;db.close()}};
}
const priv=id=>({chat:{id,type:'private'},from:{id,first_name:'Tester',language_code:'ar'},text:'/start'});
const callback=(id,callbackId,data)=>({id:callbackId,from:{id,language_code:'ar'},message:{chat:{id,type:'private'}},data});

test('webhook fails closed on wrong signature and accepts a separately configured secret',async()=>{
 const x=fixture();try{
  x.env.TELEGRAM_WEBHOOK_SECRET='an_independent_secret_only_for_the_telegram_webhook';
  const update={update_id:1001,message:priv(72111)};
  assert.equal((await x.webhook(update)).status,401);
  assert.equal((await x.webhook(update,'incorrect')).status,401);
  assert.equal(x.apiCalls.length,0);
  assert.equal((await x.webhook(update,x.env.TELEGRAM_WEBHOOK_SECRET)).status,200);
  assert.equal(x.apiCalls.filter(c=>c.method==='sendMessage').length,1);
  assert.equal((await x.webhook(update,x.env.TELEGRAM_WEBHOOK_SECRET)).status,200);
  assert.equal(x.apiCalls.filter(c=>c.method==='sendMessage').length,1,'replayed update never sends twice');
  assert.equal(x.db.prepare('SELECT status FROM telegram_webhook_updates WHERE update_id=?').get(1001).status,'done');
 }finally{x.restore()}
});
test('transient webhook failure releases lease so Telegram retry can succeed',async()=>{
 const x=fixture();try{
  const update={update_id:1002,message:priv(72112)};
  x.failNextMessage();
  const failed=await x.webhook(update);
  assert.equal(failed.status,500);
  const row=x.db.prepare('SELECT status,lease_until FROM telegram_webhook_updates WHERE update_id=?').get(1002);
  assert.equal(row.status,'processing');assert.equal(row.lease_until,0);
  assert.equal((await x.webhook(update)).status,200);
  assert.equal(x.db.prepare('SELECT status FROM telegram_webhook_updates WHERE update_id=?').get(1002).status,'done');
  assert.equal(x.apiCalls.filter(c=>c.method==='sendMessage').length,2);
 }finally{x.restore()}
});
test('invoice throttles work on the server and audit only pseudonymous account IDs',async()=>{
 const x=fixture();try{
  const id=72113;
  assert.equal((await x.webhook({update_id:1100,message:priv(id)})).status,200);
  assert.equal((await x.webhook({update_id:1101,callback_query:callback(id,'language-1','lang:en')})).status,200);
  for(let n=0;n<7;n++)
   assert.equal((await x.webhook({update_id:1200+n,callback_query:callback(id,'buy-'+n,'buy:quarter')})).status,200);
  const invoices=x.apiCalls.filter(c=>c.method==='sendInvoice');
  assert.equal(invoices.length,5,'no more than five invoices in fifteen minutes');
  const row=x.db.prepare("SELECT category,actor_digest FROM telegram_security_events WHERE category='spam_invoice'").get();
  assert.ok(row);
  assert.ok(!row.actor_digest.includes(String(id)),'audit stores a keyed pseudonym, never the raw Telegram user ID');
  assert.equal((await x.status('/admin/telegram/security/status')).status,401,'anonymous users cannot read security reports');
 }finally{x.restore()}
});
test('payment pre-checkout mismatches are rejected without issuing activation',async()=>{
 const x=fixture();try{
  const id=72114;
  const update={update_id:1300,pre_checkout_query:{
   id:'pre-invalid',from:{id},invoice_payload:'ts_nonexistent',currency:'XTR',total_amount:150
  }};
  assert.equal((await x.webhook(update)).status,200);
  const answer=x.apiCalls.find(c=>c.method==='answerPreCheckoutQuery');
  assert.equal(answer?.args?.ok,false);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM telegram_security_events WHERE category='precheckout_mismatch'").get().n,1);
  assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM telegram_device_codes').get().n,0);
 }finally{x.restore()}
});
