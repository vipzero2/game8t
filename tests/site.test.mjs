import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {onRequest} from '../functions/api/[[path]].js';
import {hmac,base64url,hashPassword,randomToken} from '../functions/_lib/common.js';
import {PasswordHasher} from '../auth-hasher/src/index.js';
const db0=new DatabaseSync(':memory:');db0.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));db0.exec(readFileSync(new URL('../db/002_email_security.sql',import.meta.url),'utf8'));db0.exec(readFileSync(new URL('../db/003_telegram_stars.sql',import.meta.url),'utf8'));db0.exec(readFileSync(new URL('../db/004_subscription_grants.sql',import.meta.url),'utf8'));db0.exec(readFileSync(new URL('../db/005_stars_plans_90_180_365.sql',import.meta.url),'utf8'));
function statement(sql,args=[]){return {bind(...parameters){return statement(sql,parameters)},async first(){return db0.prepare(sql).get(...args)||null},async all(){return {results:db0.prepare(sql).all(...args)}},async run(){const r=db0.prepare(sql).run(...args);return {meta:{changes:r.changes}}}}}
const DB={prepare(sql){return statement(sql)},async batch(items){db0.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());db0.exec('COMMIT');return result}catch(e){db0.exec('ROLLBACK');throw e}}};
let latestEmailCode='';
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.resend.com/emails'){const email=JSON.parse(options.body);latestEmailCode=email.text.match(/\b\d{6}\b/)?.[0]||'';return Response.json({id:'test-mail-id'})}return realFetch(url,options)};
const env={DB,RESEND_API_KEY:'re_test_example',EMAIL_FROM:'AIM8 <security@8aim.site>',SESSION_SECRET:'this-is-a-long-random-example-secret-32-characters',PASSWORD_PEPPER:'separate-password-pepper-secret-of-at-least-32-characters',DIRECT_HASH_IN_TEST:true,PAYMENTS_ENABLED:'false',OXAPAY_SANDBOX:'true',OXAPAY_MERCHANT_KEY:''};
const send=async(method,path,payload={},cookie='',headers={})=>{const req=new Request('https://8aim.site/api'+path,{method,headers:{...(method!=='GET'?{'content-type':'application/json',origin:'https://8aim.site'}:{}),...(cookie?{cookie}:{}),...headers},...(method!=='GET'?{body:JSON.stringify(payload)}:{})});const ans=await onRequest({request:req,env,params:{path:path.slice(1).split('/')}});let data;try{data=await ans.json()}catch{data=await ans.text()}if(path==='/auth/register' && ans.status===200 && data.ok){const verifyReq=new Request('https://8aim.site/api/auth/signup/verify',{method:'POST',headers:{'content-type':'application/json',origin:'https://8aim.site'},body:JSON.stringify({email:payload.email,code:latestEmailCode})});const verified=await onRequest({request:verifyReq,env,params:{path:['auth','signup','verify']}});return {ans:verified,data:await verified.json()};}return {ans,data}};
let cookie='';let id='';let firstKey;
test('schema seeds disabled and zero-priced plans',async()=>{const r=await send('GET','/config');assert.equal(r.ans.status,200);assert.equal(r.data.plans.length,3);assert.equal(r.data.paymentsEnabled,false);assert.equal(r.data.plans[0].enabled,false);assert.equal(r.data.plans[0].starsEnabled,false);assert.equal(r.data.plans[0].starsPrice,150);assert.deepEqual(r.data.plans.map(p=>[p.id,p.days,p.starsPrice,p.starsEnabled]),[['quarter',90,150,false],['half',180,250,false],['year',365,450,false]])});
test('register, session, login and authentication are functional',async()=>{const r=await send('POST','/auth/register',{name:'Tester',email:'tester@gmail.com',password:'correct horse battery staple'});assert.equal(r.ans.status,201);cookie=r.ans.headers.get('set-cookie').split(';')[0];id=r.data.user.id;const me=await send('GET','/auth/me',{},cookie);assert.equal(me.data.user.email,'tester@gmail.com');const wrong=await send('POST','/auth/login',{email:'tester@gmail.com',password:'wrongpassword123'});assert.equal(wrong.ans.status,401);const ok=await send('POST','/auth/login',{email:'tester@gmail.com',password:'correct horse battery staple'});assert.equal(ok.ans.status,200)});
test('no public access to admin and no invoice with payments off',async()=>{const a=await send('GET','/admin/overview',{},cookie);assert.equal(a.ans.status,403);const r=await send('POST','/orders',{planId:'month'},cookie);assert.equal(r.ans.status,503)});
test('admin can activate user subscription; first device stays, second denied',async()=>{db0.prepare("UPDATE users SET role='admin' WHERE id=?").run(id);const adminCookie=cookie;const other=await send('POST','/auth/register',{name:'Customer',email:'customer@gmail.com',password:'another strong password example'});const userId=other.data.user.id;const ad=await send('GET','/admin/overview',{},adminCookie);assert.equal(ad.ans.status,200);const grant=await send('POST','/admin/grant',{userId,days:30,reason:'Subscription testing'},adminCookie);assert.equal(grant.ans.status,200);const phone=await send('POST','/device/login',{email:'customer@gmail.com',password:'another strong password example'});assert.equal(phone.ans.status,200);const token=phone.data.activationToken;
const challenge=await send('POST','/device/challenge',{email:'customer@gmail.com'});assert.equal(challenge.ans.status,200);
firstKey=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const publicKey=base64url(new Uint8Array(await crypto.subtle.exportKey('spki',firstKey.publicKey)));const message=`AIM8:activate:${challenge.data.challengeId}:${challenge.data.nonce}`;const signature=base64url(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},firstKey.privateKey,new TextEncoder().encode(message))));const bound=await send('POST','/device/activate',{challengeId:challenge.data.challengeId,publicKey,signature},'',{authorization:'Bearer '+token});assert.equal(bound.ans.status,200);const replay=await send('POST','/device/activate',{challengeId:challenge.data.challengeId,publicKey,signature},'',{authorization:'Bearer '+token});assert.equal(replay.ans.status,409);
const newKey=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const c2=await send('POST','/device/challenge',{email:'customer@gmail.com'});const k2=base64url(new Uint8Array(await crypto.subtle.exportKey('spki',newKey.publicKey)));const s2=base64url(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},newKey.privateKey,new TextEncoder().encode(`AIM8:activate:${c2.data.challengeId}:${c2.data.nonce}`))));const denied=await send('POST','/device/activate',{challengeId:c2.data.challengeId,publicKey:k2,signature:s2},'',{authorization:'Bearer '+token});assert.equal(denied.ans.status,409);assert.equal(denied.data.error,'DEVICE_ALREADY_BOUND');
const c3=await send('POST','/device/challenge',{email:'customer@gmail.com'});const s3=base64url(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},firstKey.privateKey,new TextEncoder().encode(`AIM8:verify:${c3.data.challengeId}:${c3.data.nonce}`))));const valid=await send('POST','/device/verify',{email:'customer@gmail.com',challengeId:c3.data.challengeId,signature:s3});assert.equal(valid.ans.status,200);assert.equal(valid.data.deviceAccepted,true);assert.equal(valid.data.subscriptionActive,true);
});
test('payment webhook never credits without correct signature and paid confirmation, credits exactly once',async()=>{
const user=await send('POST','/auth/login',{email:'customer@gmail.com',password:'another strong password example'});const custCookie=user.ans.headers.get('set-cookie').split(';')[0];env.PAYMENTS_ENABLED='true';env.OXAPAY_MERCHANT_KEY='test-only-merchant-key';db0.prepare("UPDATE plans SET enabled=1,price_cents=500 WHERE id='month'").run();const oldFetch=globalThis.fetch;let orderId='';globalThis.fetch=async (url,options)=>{if(String(url).endsWith('/invoice')){orderId=JSON.parse(options.body).order_id;return Response.json({data:{track_id:'OXA-123',payment_url:'https://pay.oxapay.com/TEST-ONLY'}})}if(String(url).endsWith('/OXA-123'))return Response.json({data:{track_id:'OXA-123',order_id:orderId,status:'Paid',currency:'USD',amount:5}});throw new Error('unexpected request')};try{const r=await send('POST','/orders',{planId:'month'},custCookie);assert.equal(r.ans.status,200);assert.ok(r.data.paymentUrl.startsWith('https://pay.oxapay.com/'));const before=db0.prepare('SELECT subscription_until FROM users WHERE email=?').get('customer@gmail.com').subscription_until;
const payload=JSON.stringify({type:'invoice',status:'Paid',order_id:orderId,track_id:'OXA-123'});const wrongReq=new Request('https://8aim.site/api/payments/webhook',{method:'POST',headers:{HMAC:'0'.repeat(128),'content-type':'application/json'},body:payload});const ctx={request:wrongReq,env,params:{path:['payments','webhook']}};assert.equal((await onRequest(ctx)).status,401);
const sig=Array.from(await hmac('test-only-merchant-key',payload,'SHA-512')).map(n=>n.toString(16).padStart(2,'0')).join('');const fire=async()=>onRequest({request:new Request('https://8aim.site/api/payments/webhook',{method:'POST',headers:{HMAC:sig,'content-type':'application/json'},body:payload}),env,params:{path:['payments','webhook']}});assert.equal((await fire()).status,200);const after=db0.prepare('SELECT subscription_until FROM users WHERE email=?').get('customer@gmail.com').subscription_until;assert.equal(after-before,30*86400);assert.equal((await fire()).status,200);assert.equal(db0.prepare('SELECT subscription_until FROM users WHERE email=?').get('customer@gmail.com').subscription_until,after);
}finally{globalThis.fetch=oldFetch;env.PAYMENTS_ENABLED='false'}});

test('user can open support ticket; admin replies privately',async()=>{const cust=await send('POST','/auth/login',{email:'customer@gmail.com',password:'another strong password example'});const customerCookie=cust.ans.headers.get('set-cookie').split(';')[0];const submitted=await send('POST','/support/ticket',{subject:'Please change device',message:'My Android smartphone is damaged and I need support.'},customerCookie);assert.equal(submitted.ans.status,201);const all=await send('GET','/admin/tickets',{},cookie);assert.equal(all.ans.status,200);assert.ok(all.data.tickets.some(x=>x.id===submitted.data.ticketId));const replied=await send('POST','/admin/reply-ticket',{ticketId:submitted.data.ticketId,reply:'We will verify ownership first.'},cookie);assert.equal(replied.ans.status,200);const mine=await send('GET','/support/mine',{},customerCookie);assert.equal(mine.ans.status,200);assert.equal(mine.data.tickets[0].status,'answered');});
test('cross-site admin mutations are rejected',async()=>{const reply=await send('POST','/admin/grant',{userId:'x',days:30,reason:'normal request'},cookie,{'origin':'https://attacker.example','sec-fetch-site':'cross-site'});assert.equal(reply.ans.status,403)});

test('production PBKDF2 iteration limit and secret pepper are enforced',async()=>{
  const salt=randomToken(16);
  const a=await hashPassword('test-password-here',salt,100000,env.PASSWORD_PEPPER);
  const b=await hashPassword('test-password-here',salt,100000,'a-different-separate-long-password-pepper!');
  assert.notEqual(a,b);
  await assert.rejects(()=>hashPassword('test-password-here',salt,160000,env.PASSWORD_PEPPER),e=>e.code==='PASSWORD_HASH_CONFIG');
  await assert.rejects(()=>hashPassword('test-password-here',salt,100000,''),e=>e.code==='CONFIG_MISSING');
});

test('server side errors do not consume account registration quota',async()=>{
  const r=await send('POST','/auth/register',{name:'Tester2',email:'tmp@gmail.com',password:'strong-second-password-example'});
  assert.equal(r.ans.status,201);
  const before=db0.prepare('SELECT count FROM rate_limits').all();
  const original=env.DIRECT_HASH_IN_TEST;
  env.DIRECT_HASH_IN_TEST=false;
  try{
    const e=await send('POST','/auth/register',{name:'Tester3',email:'tmp3@gmail.com',password:'strong-third-password-example'});
    assert.equal(e.ans.status,503);
    assert.equal(e.data.error,'HASHER_NOT_CONFIGURED');
  }finally{env.DIRECT_HASH_IN_TEST=original}
  assert.deepEqual(db0.prepare('SELECT count FROM rate_limits').all(),before);
});

test('Durable Object hashes match local hardened algorithm and reject invalid inputs',async()=>{
  const service=new PasswordHasher({}, {PASSWORD_PEPPER:env.PASSWORD_PEPPER});
  const password='a safe test password';
  const salt=randomToken(16);
  const result=await service.fetch(new Request('https://aim8-hasher.internal/hash',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password,salt,iterations:100000})}));
  assert.equal(result.status,200);
  const payload=await result.json();
  const expected=await hashPassword(password,salt,100000,env.PASSWORD_PEPPER);
  assert.equal(payload.hash,expected);
  const bad=await service.fetch(new Request('https://aim8-hasher.internal/hash',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password,salt:'not-salt',iterations:100000})}));
  assert.equal(bad.status,400);
  const noSecret=await new PasswordHasher({},{}).fetch(new Request('https://aim8-hasher.internal/hash',{method:'POST',body:JSON.stringify({password,salt,iterations:100000})}));
  assert.equal(noSecret.status,503);
});

test('only Gmail signups are accepted',async()=>{
 const r=await send('POST','/auth/register',{name:'Account',email:'account@example.com',password:'long-password-test'});
 assert.equal(r.ans.status,400);assert.equal(r.data.error,'GMAIL_ONLY');
});

test('verified Gmail account can reset password and invalidate prior web sessions',async()=>{
 const before=await send('GET','/auth/me',{},cookie);
 assert.equal(before.ans.status,200);
 assert.equal(before.data.user.emailVerified,true); // new accounts verify Gmail during signup
 const asked=await send('POST','/auth/password/request',{email:'tester@gmail.com'});
 assert.equal(asked.ans.status,200);
 const reset=await send('POST','/auth/password/reset',{email:'tester@gmail.com',code:latestEmailCode,newPassword:'new-password-strong-2026'});
 assert.equal(reset.ans.status,200);
 const revoked=await send('GET','/auth/me',{},cookie);
 assert.equal(revoked.ans.status,401);
 const old=await send('POST','/auth/login',{email:'tester@gmail.com',password:'correct horse battery staple'});
 assert.equal(old.ans.status,401);
 const fresh=await send('POST','/auth/login',{email:'tester@gmail.com',password:'new-password-strong-2026'});
 assert.equal(fresh.ans.status,200);
});

test('Gmail verified owner may release device without changing subscription',async()=>{
 const login=await send('POST','/auth/login',{email:'customer@gmail.com',password:'another strong password example'});
 assert.equal(login.ans.status,200);
 const c=login.ans.headers.get('set-cookie').split(';')[0];
 const first=await send('POST','/auth/email/request',{},c);
 assert.equal(first.ans.status,200);
 const verified=await send('POST','/auth/email/verify',{code:latestEmailCode},c);
 assert.equal(verified.ans.status,200);
 const before=await send('GET','/auth/me',{},c);
 assert.equal(before.data.user.deviceBound,true);
 const until=before.data.user.subscriptionUntil;
 const ask=await send('POST','/device/change/request',{},c);
 assert.equal(ask.ans.status,200);
 const changed=await send('POST','/device/change/confirm',{code:latestEmailCode},c);
 assert.equal(changed.ans.status,200);
 const after=await send('GET','/auth/me',{},c);
 assert.equal(after.data.user.deviceBound,false);
 assert.equal(after.data.user.subscriptionUntil,until);
 const cannotVerifyOld=await send('POST','/device/verify',{email:'customer@gmail.com',challengeId:'anything',signature:'not-real'});
 assert.equal(cannotVerifyOld.ans.status,403);
});


test('Telegram Stars requires a linked account, credits one redemption, and revokes only refunded payment',async()=>{
  const logged=await send('POST','/auth/login',{email:'customer@gmail.com',password:'another strong password example'});
  assert.equal(logged.ans.status,200);
  const userCookie=logged.ans.headers.get('set-cookie').split(';')[0];
  const target=db0.prepare("SELECT id,subscription_until FROM users WHERE email='customer@gmail.com'").get();
  const before=target.subscription_until;
  env.TELEGRAM_BOT_TOKEN='test-only-token';
  db0.prepare("UPDATE plans SET stars_enabled=1 WHERE id='quarter'").run();
  const calls=[];
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async (url,options)=>{
    if(String(url).startsWith('https://api.telegram.org/bot')){
      const method=String(url).split('/').pop(),data=JSON.parse(options.body||'{}');
      calls.push({method,data});
      if(method==='getMe')return Response.json({ok:true,result:{username:'AIM8_test_bot'}});
      return Response.json({ok:true,result:true});
    }
    return oldFetch(url,options);
  };
  try {
    const begin=await send('POST','/telegram/link',{},userCookie);
    assert.equal(begin.ans.status,200);
    const token=new URL(begin.data.url).searchParams.get('start');
    const secret=base64url(await hmac(env.SESSION_SECRET,'aim8:telegram:webhook:v1'));
    const event=async(update)=>{
      const req=new Request('https://8aim.site/api/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify(update)});
      return onRequest({request:req,env,params:{path:['telegram','webhook']}});
    };
    const rejected=await onRequest({request:new Request('https://8aim.site/api/telegram/webhook',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env,params:{path:['telegram','webhook']}});
    assert.equal(rejected.status,401);
    assert.equal((await event({message:{chat:{id:7001,type:'private'},from:{id:7001,language_code:'ar'},text:'/start '+token}})).status,200);
    // No invoice may be sent until the buyer selects their plan INSIDE Telegram.
    assert.equal(calls.some(x=>x.method==='sendInvoice'),false);
    const linkedPicker=calls.find(x=>x.method==='sendMessage'&&x.data.reply_markup?.inline_keyboard);
    assert.ok(linkedPicker,'A plan picker should appear inside the bot');
    assert.deepEqual(linkedPicker.data.reply_markup.inline_keyboard.map(x=>x[0].callback_data),['buy:quarter']);
    const dbLink=db0.prepare('SELECT plan_id,used_at FROM telegram_links WHERE user_id=? ORDER BY created_at DESC LIMIT 1').get(target.id);
    assert.equal(dbLink.plan_id,'quarter'); // legacy schema placeholder only
    assert.ok(dbLink.used_at);
    assert.equal((await event({callback_query:{id:'linked-plan-choice',from:{id:7001,language_code:'ar'},message:{chat:{id:7001,type:'private'}},data:'buy:quarter'}})).status,200);
    const invoice=calls.find(x=>x.method==='sendInvoice');
    assert.ok(invoice,'Invoice should only be sent after selecting an option');
    assert.equal(invoice.data.currency,'XTR');assert.equal(invoice.data.prices[0].amount,150);
    const oid=invoice.data.payload;
    assert.equal((await event({pre_checkout_query:{id:'pre-1',from:{id:7001,language_code:'ar'},invoice_payload:oid,currency:'XTR',total_amount:150}})).status,200);
    assert.equal(calls.find(x=>x.method==='answerPreCheckoutQuery').data.ok,true);
    const payment={invoice_payload:oid,currency:'XTR',total_amount:150,telegram_payment_charge_id:'charge-7001-test'};
    assert.equal((await event({message:{chat:{id:7001,type:'private'},from:{id:7001,language_code:'ar'},successful_payment:payment}})).status,200);
    assert.equal((await event({message:{chat:{id:7001,type:'private'},from:{id:7001,language_code:'ar'},successful_payment:payment}})).status,200);
    const paidMessages=calls.filter(x=>x.method==='sendMessage' && x.data.text.includes('كود AIM8'));
    assert.ok(paidMessages.length>=1);
    const code=paidMessages[0].data.text.match(/A8-[A-Za-z0-9_-]{28}/)[0];
    const credited=await send('POST','/telegram/redeem',{code},userCookie);
    assert.equal(credited.ans.status,200);
    assert.equal(db0.prepare('SELECT subscription_until FROM users WHERE id=?').get(target.id).subscription_until,before+90*86400);assert.equal(db0.prepare("SELECT COUNT(*) c FROM subscription_grants WHERE user_id=? AND source='oxapay'").get(target.id).c,1);
    const reused=await send('POST','/telegram/redeem',{code},userCookie);
    assert.equal(reused.ans.status,400);
    const refund={...payment};
    assert.equal((await event({message:{chat:{id:7001,type:'private'},from:{id:7001,language_code:'ar'},refunded_payment:refund}})).status,200);
    assert.equal(db0.prepare('SELECT subscription_until FROM users WHERE id=?').get(target.id).subscription_until,before);
    assert.equal((await event({message:{chat:{id:7001,type:'private'},from:{id:7001,language_code:'ar'},refunded_payment:refund}})).status,200);
    assert.equal(db0.prepare('SELECT subscription_until FROM users WHERE id=?').get(target.id).subscription_until,before);
    assert.equal(db0.prepare('SELECT status FROM telegram_orders WHERE id=?').get(oid).status,'refunded');
    // English Telegram users should receive English replies without selecting a language.
    assert.equal((await event({message:{chat:{id:9009,type:'private'},from:{id:9009,language_code:'en-US'},text:'/start'}})).status,200);
    assert.match(calls.filter(x=>x.method==='sendMessage').at(-1).data.text,/Welcome to AIM8/);
    const invoiceCount=calls.filter(x=>x.method==='sendInvoice').length;
    await event({callback_query:{id:'locale-en-invoice',from:{id:7001,language_code:'en'},message:{chat:{id:7001,type:'private'}},data:'buy:quarter'}});
    assert.equal(calls.filter(x=>x.method==='sendInvoice').length,invoiceCount+1);
    assert.match(calls.filter(x=>x.method==='sendInvoice').at(-1).data.title,/3 Months/);
    assert.match(calls.filter(x=>x.method==='sendInvoice').at(-1).data.description,/subscription for 90 days/);

    // The linked bot must offer only the newly approved durations.
    db0.prepare("UPDATE plans SET stars_enabled=1 WHERE id IN ('half','year')").run();
    await event({message:{chat:{id:7001,type:'private'},from:{id:7001,language_code:'ar'},text:'/start'}});
    const keyboard=calls.filter(x=>x.method==='sendMessage'&&x.data.reply_markup?.inline_keyboard).at(-1).data.reply_markup.inline_keyboard;
    assert.deepEqual(keyboard.map(x=>x[0].callback_data),['buy:quarter','buy:half','buy:year']);
    for(const [plan,amount] of [['half',250],['year',450]]){
      const beforeInvoices=calls.filter(x=>x.method==='sendInvoice').length;
      assert.equal((await event({callback_query:{id:'buy-test-'+plan,from:{id:7001,language_code:'ar'},message:{chat:{id:7001,type:'private'}},data:'buy:'+plan}})).status,200);
      const invoices=calls.filter(x=>x.method==='sendInvoice');
      assert.equal(invoices.length,beforeInvoices+1);
      assert.equal(invoices.at(-1).data.prices[0].amount,amount);
    }
    const prior=calls.filter(x=>x.method==='sendInvoice').length;
    await event({callback_query:{id:'buy-test-legacy',from:{id:7001,language_code:'ar'},message:{chat:{id:7001,type:'private'}},data:'buy:week'}});
    assert.equal(calls.filter(x=>x.method==='sendInvoice').length,prior);

  }finally{globalThis.fetch=oldFetch;delete env.TELEGRAM_BOT_TOKEN}
});
