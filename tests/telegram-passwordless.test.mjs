import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {onRequest} from '../functions/api/[[path]].js';
import {base64url,hmac} from '../functions/_lib/common.js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['db/schema.sql','db/002_email_security.sql','db/003_telegram_stars.sql','db/004_subscription_grants.sql','db/005_stars_plans_90_180_365.sql','db/006_telegram_device_codes.sql'])
  db.exec(readFileSync(new URL('../'+f,import.meta.url),'utf8'));
 function stmt(sql,args=[]){return {bind(...args2){return stmt(sql,args2)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}}}}
 const DB={prepare(sql){return stmt(sql)},async batch(items){db.exec('BEGIN');try{const rows=[];for(const item of items)rows.push(await item.run());db.exec('COMMIT');return rows}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB,SESSION_SECRET:'long-enough-secret-for-telegram-passwordless-tests',TELEGRAM_BOT_TOKEN:'fake-token'};
 db.prepare("UPDATE plans SET stars_enabled=1 WHERE id='quarter'").run();
 const originalFetch=globalThis.fetch,calls=[];
 globalThis.fetch=async (url,options)=>{
  if(!String(url).startsWith('https://api.telegram.org/bot'))return originalFetch(url,options);
  const method=String(url).split('/').at(-1),data=JSON.parse(options.body||'{}');
  calls.push({method,data});
  return Response.json({ok:true,result:true});
 };
 async function api(path,data){
  const request=new Request('https://8aim.site/api'+path,{method:'POST',headers:{'content-type':'application/json',origin:'https://8aim.site'},body:JSON.stringify(data)});
  const result=await onRequest({request,env,params:{path:path.slice(1).split('/')}});
  return {status:result.status,data:await result.json()};
 }
 async function bot(update){
  const secret=base64url(await hmac(env.SESSION_SECRET,'aim8:telegram:webhook:v1'));
  const request=new Request('https://8aim.site/api/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify(update)});
  return onRequest({request,env,params:{path:['telegram','webhook']}});
 }
 function phone(){
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const publicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64url');
  function sign(message){return createSign('SHA256').update(message).end().sign({key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}
  return {publicKey,sign};
 }
 return {db,calls,bot,api,phone,restore(){globalThis.fetch=originalFetch;db.close()}};
}

test('Telegram account, paid code, one device, free phone transfer and revoked old code',async()=>{
 const x=fixture();
 try{
  const tgId=7001234;
  assert.equal((await x.bot({message:{chat:{id:tgId,type:'private'},from:{id:tgId,language_code:'ar',first_name:'Customer'},text:'/start'}})).status,200);
  assert.equal(x.db.prepare('SELECT user_id FROM telegram_accounts WHERE telegram_user_id=?').get(String(tgId)).user_id,'telegram:'+tgId);
  const langScreen=x.calls.filter(c=>c.method==='sendMessage').at(-1).data;
  assert.equal(langScreen.reply_markup.inline_keyboard.flat().length,12);
  assert.equal(langScreen.reply_markup.inline_keyboard[0][0].text,'🇸🇦 العربية');
  assert.equal((await x.bot({callback_query:{id:'first-lang-ar',from:{id:tgId,language_code:'en'},message:{chat:{id:tgId,type:'private'}},data:'lang:ar'}})).status,200);
  const picker=x.calls.filter(c=>c.method==='sendMessage').at(-1).data.reply_markup.inline_keyboard;
  assert.equal(picker[0][0].callback_data,'buy:quarter');
  assert.equal(picker.at(-1)[0].callback_data,'recover:ask');
  assert.equal((await x.bot({callback_query:{id:'buy-1',from:{id:tgId},message:{chat:{id:tgId,type:'private'}},data:'buy:quarter'}})).status,200);
  const orderId=x.calls.find(c=>c.method==='sendInvoice').data.payload;
  assert.equal((await x.bot({message:{chat:{id:tgId,type:'private'},from:{id:tgId,language_code:'ar'},successful_payment:{invoice_payload:orderId,currency:'XTR',total_amount:150,telegram_payment_charge_id:'paid-charge-test'}}})).status,200);
  const paidMsg=x.calls.filter(c=>c.method==='sendMessage').at(-1).data;
  const paidText=paidMsg.text,code=paidText.match(/A8-[A-Za-z0-9_-]{28}/)?.[0];
  assert.ok(code,'paid code delivered');
  assert.equal(paidMsg.reply_markup.inline_keyboard[0][0].copy_text.text,code);
  assert.match(paidText,/لا تشاركه/);
  const a=x.phone();
  const challenge=await x.api('/telegram/device/challenge',{telegramId:String(tgId)});
  assert.equal(challenge.status,200);
  const signature=a.sign('AIM8:telegram:activate:'+challenge.data.challengeId+':'+challenge.data.nonce);
  const activated=await x.api('/telegram/device/activate',{code,publicKey:a.publicKey,challengeId:challenge.data.challengeId,signature});
  assert.equal(activated.status,200,JSON.stringify(activated.data));
  assert.equal(activated.data.deviceAccepted,true);
  const expiry=activated.data.subscriptionUntil;
  assert.ok(expiry>Math.floor(Date.now()/1000)+89*86400);
  assert.equal(x.db.prepare('SELECT status FROM telegram_orders WHERE id=?').get(orderId).status,'redeemed');
  const replay=await x.api('/telegram/device/activate',{code,publicKey:a.publicKey,challengeId:challenge.data.challengeId,signature});
  assert.notEqual(replay.status,200);
  const verifyCh=await x.api('/telegram/device/challenge',{telegramId:String(tgId)});
  const valid=await x.api('/telegram/device/verify',{telegramId:String(tgId),challengeId:verifyCh.data.challengeId,signature:a.sign('AIM8:telegram:verify:'+verifyCh.data.challengeId+':'+verifyCh.data.nonce)});
  assert.equal(valid.status,200,JSON.stringify(valid.data));
  const attacker=x.phone(),attCh=await x.api('/telegram/device/challenge',{telegramId:String(tgId)});
  const reject=await x.api('/telegram/device/verify',{telegramId:String(tgId),challengeId:attCh.data.challengeId,signature:attacker.sign('AIM8:telegram:verify:'+attCh.data.challengeId+':'+attCh.data.nonce)});
  assert.equal(reject.status,403);
  assert.equal((await x.bot({message:{chat:{id:tgId,type:'private'},from:{id:tgId},text:'/recover'}})).status,200);
  assert.equal((await x.bot({callback_query:{id:'recover-1',from:{id:tgId},message:{chat:{id:tgId,type:'private'}},data:'recover:confirm'}})).status,200);
  const recoveryMsg=x.calls.filter(c=>c.method==='sendMessage').at(-1).data;
  const recoveredText=recoveryMsg.text,recoveredCode=recoveredText.match(/A8-[A-Za-z0-9_-]{28}/)?.[0];
  assert.ok(recoveredCode);assert.notEqual(recoveredCode,code);
  assert.equal(recoveryMsg.reply_markup.inline_keyboard[0][0].copy_text.text,recoveredCode);
  assert.equal(x.db.prepare('SELECT device_public_key FROM users WHERE id=?').get('telegram:'+tgId).device_public_key,null);
  assert.equal(x.db.prepare('SELECT subscription_until FROM users WHERE id=?').get('telegram:'+tgId).subscription_until,expiry);
  const oldCheck=await x.api('/telegram/device/challenge',{telegramId:String(tgId)});
  const oldDevice=await x.api('/telegram/device/verify',{telegramId:String(tgId),challengeId:oldCheck.data.challengeId,signature:a.sign('AIM8:telegram:verify:'+oldCheck.data.challengeId+':'+oldCheck.data.nonce)});
  assert.equal(oldDevice.status,403);
  const b=x.phone(),bch=await x.api('/telegram/device/challenge',{telegramId:String(tgId)});
  const transferred=await x.api('/telegram/device/activate',{code:recoveredCode,publicKey:b.publicKey,challengeId:bch.data.challengeId,signature:b.sign('AIM8:telegram:activate:'+bch.data.challengeId+':'+bch.data.nonce)});
  assert.equal(transferred.status,200,JSON.stringify(transferred.data));
  assert.equal(transferred.data.subscriptionUntil,expiry,'never add another 90 days');
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM subscription_grants WHERE source_id=?').get(orderId).n,1);
  const third=x.phone(),tch=await x.api('/telegram/device/challenge',{telegramId:String(tgId)});
  const duplicate=await x.api('/telegram/device/activate',{code:recoveredCode,publicKey:third.publicKey,challengeId:tch.data.challengeId,signature:third.sign('AIM8:telegram:activate:'+tch.data.challengeId+':'+tch.data.nonce)});
  assert.notEqual(duplicate.status,200);
 }finally{x.restore()}
});

test('Free recovery cannot be claimed without any paid entitlement or forged Telegram identity',async()=>{
 const x=fixture();try{
  await x.bot({message:{chat:{id:8001234,type:'private'},from:{id:8001234,language_code:'ar'},text:'/start'}});
  await x.bot({callback_query:{id:'no-purchase-lang',from:{id:8001234,language_code:'ar'},message:{chat:{id:8001234,type:'private'}},data:'lang:ar'}});
  assert.equal((await x.bot({callback_query:{id:'recover-no-purchase',from:{id:8001234,language_code:'ar'},message:{chat:{id:8001234,type:'private'}},data:'recover:confirm'}})).status,200);
  assert.match(x.calls.filter(c=>c.method==='sendMessage').at(-1).data.text,/ما عندك اشتراك/);
  const fake=await x.api('/telegram/device/challenge',{telegramId:'8001234'});
  assert.equal(fake.status,200);
  const p=x.phone(),attempt=await x.api('/telegram/device/activate',{code:'A8-'+'a'.repeat(28),publicKey:p.publicKey,challengeId:fake.data.challengeId,signature:p.sign('AIM8:telegram:activate:'+fake.data.challengeId+':'+fake.data.nonce)});
  assert.notEqual(attempt.status,200);
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM telegram_device_codes').get().n,0);
 }finally{x.restore()}
});
