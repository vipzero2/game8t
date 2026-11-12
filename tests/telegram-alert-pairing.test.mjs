import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequest} from '../functions/api/[[path]].js';
import {hmac,base64url,sha256,setSession,now} from '../functions/_lib/common.js';
import {securityEvent} from '../functions/_lib/telegram-security.js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const p of ['db/schema.sql','db/002_email_security.sql','db/003_telegram_stars.sql',
  'db/004_subscription_grants.sql','db/005_stars_plans_90_180_365.sql',
  'db/006_telegram_device_codes.sql','db/007_telegram_language_preferences.sql',
  'db/008_telegram_bot_security.sql','db/009_telegram_alert_pairing.sql'])
  db.exec(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
 function prepared(sql,args=[]){return {
  bind(...x){return prepared(sql,x)},
  async first(){return db.prepare(sql).get(...args)||null},
  async all(){return {results:db.prepare(sql).all(...args)}},
  async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}}}
 }}
 const DB={prepare(sql){return prepared(sql)},async batch(items){
  db.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());db.exec('COMMIT');return results}
  catch(e){db.exec('ROLLBACK');throw e}
 }};
 const env={DB,TELEGRAM_BOT_TOKEN:'fake-secret-bot-token',SESSION_SECRET:'a-really-long-test-secret-only-for-aim8-security'};
 const fetchOriginal=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://api.telegram.org/bot'))return fetchOriginal(url,options);
  const method=String(url).split('/').at(-1),args=JSON.parse(options.body||'{}');
  calls.push({method,args});
  return Response.json({ok:true,result:method==='getMe'?{username:'AIM8TestingBot'}:true});
 };
 db.prepare("INSERT INTO users(id,name,email,password_hash,password_salt,password_iterations,role,created_at) VALUES('admin','Owner','owner@example.org','x','y',100000,'admin',?)").run(now());
 let adminCookie;
 async function login(){adminCookie=(await setSession(env,'admin')).split(';')[0]}
 async function post(path,data={},signed=true){
  const headers={'content-type':'application/json','origin':'https://8aim.site'};
  if(signed&&adminCookie)headers.cookie=adminCookie;
  const request=new Request('https://8aim.site/api'+path,{method:'POST',headers,body:JSON.stringify(data)});
  const res=await onRequest({request,env,params:{path:path.slice(1).split('/')}});
  return {status:res.status,data:await res.json()};
 }
 async function status(){
  const headers={};if(adminCookie)headers.cookie=adminCookie;
  const request=new Request('https://8aim.site/api/admin/telegram/security/status',{headers});
  const res=await onRequest({request,env,params:{path:['admin','telegram','security','status']}});
  return {status:res.status,data:await res.json()};
 }
 async function bot(telegramId,token,updateId){
  const req=new Request('https://8aim.site/api/telegram/webhook',{method:'POST',headers:{
   'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':base64url(await hmac(env.SESSION_SECRET,'aim8:telegram:webhook:v1'))
  },body:JSON.stringify({update_id:updateId,message:{
   chat:{id:telegramId,type:'private'},from:{id:telegramId,first_name:'Owner'},
   text:'/start '+token
  }})});
  return onRequest({request:req,env,params:{path:['telegram','webhook']}});
 }
 return {env,db,calls,login,post,status,bot,cleanup(){globalThis.fetch=fetchOriginal;db.close()}};
}

test('only signed-in admin may generate a short-lived Telegram owner pairing URL',async()=>{
 const x=fixture();try{
  const unauth=await x.post('/admin/telegram/security/alert-link',{},false);
  assert.equal(unauth.status,401);
  await x.login();
  const response=await x.post('/admin/telegram/security/alert-link');
  assert.equal(response.status,200,JSON.stringify(response.data));
  assert.match(response.data.url,/^https:\/\/t\.me\/AIM8TestingBot\?start=alert_[A-Za-z0-9_-]{32}$/);
  assert.ok(response.data.expiresAt>now());
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM telegram_alert_pairing').get().n,1);
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM telegram_alert_settings').get().n,0);
 }finally{x.cleanup()}
});

test('one-time Telegram private chat pairing enables alerts without copying Telegram IDs',async()=>{
 const x=fixture();try{
  await x.login();
  const link=(await x.post('/admin/telegram/security/alert-link')).data.url;
  const payload=new URL(link).searchParams.get('start'),owner=79235001;
  assert.equal((await x.bot(owner,payload,900)).status,200);
  const row=x.db.prepare("SELECT telegram_chat_id,paired_by FROM telegram_alert_settings WHERE name='security_owner'").get();
  assert.equal(row.telegram_chat_id,String(owner));assert.equal(row.paired_by,'admin');
  const status=await x.status();
  assert.equal(status.status,200);assert.equal(status.data.alertRecipientConfigured,true);
  assert.equal(status.data.alertRecipientSource,'admin_pairing');
  assert.equal((await x.bot(79235002,payload,901)).status,200);
  assert.equal(x.db.prepare("SELECT telegram_chat_id FROM telegram_alert_settings WHERE name='security_owner'").get().telegram_chat_id,String(owner),'replay cannot transfer alert ownership');
  const actor='suspicious-actor-for-test';
  const digest=base64url(await hmac(x.env.SESSION_SECRET,'aim8:telegram:audit:v1:'+actor)).slice(0,32);
  for(let k=0;k<4;k++)x.db.prepare("INSERT INTO telegram_security_events(id,category,actor_digest,created_at) VALUES(?,?,?,?)")
   .run('dummy-'+k,'spam_invoice',digest,now()-120-k);
  await securityEvent(x.env,'spam_invoice',actor);
  const alert=x.calls.find(c=>c.method==='sendMessage'&&c.args.text.includes('AIM8 security'));
  assert.ok(alert,'repeated bot abuse should send an owner alert');
  assert.equal(alert.args.chat_id,String(owner));
  assert.equal(alert.args.text.includes(actor),false,'alert text never contains actor or customer IDs');
  const unlink=await x.post('/admin/telegram/security/alert-unlink');
  assert.equal(unlink.status,200);
  const after=await x.status();
  assert.equal(after.data.alertRecipientConfigured,false);
 }finally{x.cleanup()}
});

test('expired or overwritten alert pairing links cannot take ownership',async()=>{
 const x=fixture();try{
  await x.login();
  const link1=(await x.post('/admin/telegram/security/alert-link')).data.url;
  const token1=new URL(link1).searchParams.get('start');
  const link2=(await x.post('/admin/telegram/security/alert-link')).data.url;
  const token2=new URL(link2).searchParams.get('start');
  assert.equal((await x.bot(79235010,token1,920)).status,200);
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM telegram_alert_settings').get().n,0);
  x.db.prepare("UPDATE telegram_alert_pairing SET expires_at=?").run(now()-1);
  assert.equal((await x.bot(79235010,token2,921)).status,200);
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM telegram_alert_settings').get().n,0);
 }finally{x.cleanup()}
});
