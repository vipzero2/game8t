import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,generateKeyPairSync,createSign} from 'node:crypto';
import {onRequest} from '../functions/api/[[path]].js';
import {base64url,hmac} from '../functions/_lib/common.js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['db/schema.sql','db/002_email_security.sql','db/003_telegram_stars.sql',
  'db/004_subscription_grants.sql','db/005_stars_plans_90_180_365.sql',
  'db/006_telegram_device_codes.sql','db/007_telegram_language_preferences.sql',
  'db/008_telegram_bot_security.sql','db/009_telegram_alert_pairing.sql',
  'db/010_friend_activation_codes.sql','db/011_nowpayments_crypto.sql'])
  db.exec(readFileSync(new URL('../'+f,import.meta.url),'utf8'));
 function stmt(sql,args=[]){return {bind(...next){return stmt(sql,next)},
  async first(){return db.prepare(sql).get(...args)||null},
  async all(){return {results:db.prepare(sql).all(...args)}},
  async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}}};}
 const DB={prepare(sql){return stmt(sql)},
  async batch(items){db.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());db.exec('COMMIT');return out}
   catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={
  DB,SESSION_SECRET:'test-secret-with-at-least-32-characters-long',
  TELEGRAM_BOT_TOKEN:'test-telegram-token',
  NOWPAYMENTS_ENABLED:'true',NOWPAYMENTS_API_KEY:'test-api-key',
  NOWPAYMENTS_IPN_SECRET:'test-ipn-secret'
 };
 const orig=globalThis.fetch,calls=[],providerState={
  payment_id:990001,order_id:null,invoice_id:123456,
  price_amount:4,price_currency:'usd',payment_status:'finished'
 };
 globalThis.fetch=async (url,options)=>{
  const u=String(url);
  if(u.startsWith('https://api.telegram.org/bot')){
   const method=u.split('/').at(-1),data=JSON.parse(options.body||'{}');
   calls.push({method,data});
   return Response.json({ok:true,result:method==='getMe'?{username:'Aim8TestBot'}:true});
  }
  if(u==='https://api.nowpayments.io/v1/invoice'){
   const d=JSON.parse(options.body||'{}');calls.push({method:'invoice',data:d});
   providerState.order_id=d.order_id;providerState.price_amount=Number(d.price_amount);
   return Response.json({id:123456,invoice_url:'https://nowpayments.io/payment/?iid=123456'});
  }
  if(u==='https://api.nowpayments.io/v1/payment/990001'){
   calls.push({method:'verify-payment'});
   return Response.json(providerState);
  }
  throw Error('Unexpected upstream request: '+u);
 };
 async function api(path,data,headers={}){
  const request=new Request('https://8aim.site/api'+path,{method:'POST',
   headers:{'content-type':'application/json',...headers},
   body:JSON.stringify(data)});
  const response=await onRequest({request,env,params:{path:path.slice(1).split('/')}});
  return {status:response.status,data:await response.json()};
 }
 async function bot(id,text){
  const secret=base64url(await hmac(env.SESSION_SECRET,'aim8:telegram:webhook:v1'));
  const request=new Request('https://8aim.site/api/telegram/webhook',{
   method:'POST',headers:{'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},
   body:JSON.stringify({update_id:Math.floor(Math.random()*1e9),
    message:{chat:{id,type:'private'},from:{id,language_code:'ar',first_name:'Buyer'},text}})
  });
  return onRequest({request,env,params:{path:['telegram','webhook']}});
 }
 async function ipn(body,signature){
  const sig=signature??createHmac('sha512',env.NOWPAYMENTS_IPN_SECRET)
    .update(JSON.stringify(Object.fromEntries(Object.keys(body).sort().map(k=>[k,body[k]]))))
    .digest('hex');
  const request=new Request('https://8aim.site/api/nowpayments/webhook',{method:'POST',
   headers:{'content-type':'application/json','x-nowpayments-sig':sig},body:JSON.stringify(body)});
  return onRequest({request,env,params:{path:['nowpayments','webhook']}});
 }
 function phone(){
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const publicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64url');
  function sign(message){return createSign('SHA256').update(message).end().sign({key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');}
  return {publicKey,sign};
 }
 return {db,env,calls,providerState,api,bot,ipn,phone,restore(){globalThis.fetch=orig;db.close();}};
}

test('Standalone NOWPayments checkout verifies private Telegram ID, pays, delivers exactly one grant on Android',async()=>{
 const x=fixture();
 try{
  const started=await x.api('/nowpayments/identity/start',{});
  assert.equal(started.status,200,JSON.stringify(started.data));
  assert.match(started.data.botUrl,/^https:\/\/t.me\/Aim8TestBot\?start=npv_/);
  const token=started.data.token,tg=713456789;
  const before=await x.api('/nowpayments/invoice',{token,planId:'quarter'});
  assert.equal(before.status,403,'cannot create invoice before Telegram proof');
  const bot=await x.bot(tg,'/start npv_'+token);
  assert.equal(bot.status,200,await bot.text());
  const verified=await x.api('/nowpayments/identity/status',{token});
  assert.equal(verified.data.verified,true);
  assert.equal(verified.data.telegramId,String(tg));
  const created=await x.api('/nowpayments/invoice',{token,planId:'quarter'});
  assert.equal(created.status,200,JSON.stringify(created.data));
  assert.equal(created.data.amountUsd,4);
  const issued=x.calls.find(a=>a.method==='invoice').data;
  assert.equal(issued.price_amount,'4');
  assert.equal(issued.is_fixed_rate,false);
  assert.equal(issued.is_fee_paid_by_user,false);
  assert.equal(issued.pay_currency,undefined,'all cryptocurrencies allowed');
  assert.equal(issued.ipn_callback_url,'https://8aim.site/api/nowpayments/webhook');
  const wrongPrice=await x.api('/nowpayments/invoice',{token,planId:'year',price:0});
  assert.notEqual(wrongPrice.status,200,'cannot alter the authenticated order');
  const ipn={payment_id:990001,payment_status:'finished',order_id:created.data.orderId,
   price_amount:4,price_currency:'usd',invoice_id:123456};
  const forged=await x.ipn(ipn,'0'.repeat(128));
  assert.equal(forged.status,401);
  assert.equal(x.db.prepare('SELECT status FROM nowpayments_orders').get().status,'pending');
  const paid=await x.ipn(ipn);
  assert.equal(paid.status,200,await paid.text());
  assert.equal(x.db.prepare('SELECT status FROM nowpayments_orders').get().status,'paid');
  const notification=x.calls.filter(a=>a.method==='sendMessage').at(-1).data;
  const code=notification.text.match(/A8-[A-Za-z0-9_-]{28}/)?.[0];
  assert.ok(code,'activation code delivered privately');
  assert.equal(notification.chat_id,String(tg));
  const countBefore=x.calls.filter(a=>a.method==='sendMessage').length;
  assert.equal((await x.ipn(ipn)).status,200);
  assert.equal(x.calls.filter(a=>a.method==='sendMessage').length,countBefore,
   'duplicated NOWPayments callback must not repeat delivery');
  const device=x.phone();
  const challenge=await x.api('/telegram/device/challenge',{code});
  const activated=await x.api('/telegram/device/activate',{code,publicKey:device.publicKey,
   challengeId:challenge.data.challengeId,signature:device.sign(
    'AIM8:telegram:activate:'+challenge.data.challengeId+':'+challenge.data.nonce)});
  assert.equal(activated.status,200,JSON.stringify(activated.data));
  assert.equal(x.db.prepare('SELECT status FROM nowpayments_orders').get().status,'redeemed');
  assert.equal(x.db.prepare("SELECT COUNT(*) n FROM subscription_grants WHERE source='nowpayments'").get().n,1);
  assert.ok(activated.data.subscriptionUntil>Math.floor(Date.now()/1000)+89*86400);
  const replay=await x.api('/telegram/device/activate',{code,publicKey:device.publicKey,
   challengeId:challenge.data.challengeId,signature:device.sign('bogus')});
  assert.notEqual(replay.status,200);
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM subscription_grants').get().n,1);
 }finally{x.restore();}
});

test('IPN fails closed on forged amount and does not grant access on pending status',async()=>{
 const x=fixture();
 try{
  const first=await x.api('/nowpayments/identity/start',{});
  const token=first.data.token,tg=8123456;
  assert.equal((await x.bot(tg,'/start npv_'+token)).status,200);
  const created=await x.api('/nowpayments/invoice',{token,planId:'quarter'});
  const fake={payment_id:990001,payment_status:'confirmed',order_id:created.data.orderId,
   price_amount:4,price_currency:'usd',invoice_id:123456};
  assert.equal((await x.ipn(fake)).status,200,'confirmed is not the final finished state');
  assert.equal(x.db.prepare('SELECT status FROM nowpayments_orders').get().status,'pending');
  x.providerState.price_amount=1;
  const bad={...fake,payment_status:'finished'};
  assert.equal((await x.ipn(bad)).status,409,'provider lookup amount mismatch');
  assert.equal(x.db.prepare('SELECT status FROM nowpayments_orders').get().status,'pending');
 }finally{x.restore();}
});
