// NOWPayments: independent fiat-priced crypto invoices and IPN fulfillment.
// No Stars state or external OxaPay payment record is modified here.
import {ApiError, body, constantTime, enc, fail, hmac, json, now, rateLimit, sha256, uid, base64url} from './common.js';
import {verifiedChallenge} from './nowpayments-identity.js';
import {issuePaidCode} from './telegram-license.js';
import {telegram} from './telegram.js';
import {getBotLanguage,codeKeyboard} from './telegram-bot-ui.js';
import {entitlementEndSql} from './grants.js';

export const CRYPTO_PLANS=Object.freeze({
 quarter:{days:90,cents:400,label:'3 Months'},
 half:{days:180,cents:600,label:'6 Months'},
 year:{days:365,cents:1000,label:'1 Year'}
});
const API='https://api.nowpayments.io/v1';
function ready(env,newSales=false){
 // Pausing new checkouts must not abandon already-issued and paid invoices.
 if((newSales&&env.NOWPAYMENTS_ENABLED!=='true')||!env.NOWPAYMENTS_API_KEY||!env.NOWPAYMENTS_IPN_SECRET||!env.SESSION_SECRET)
  fail('NOWPAYMENTS_DISABLED','بوابة NOWPayments غير جاهزة',503);
}
function officialInvoiceUrl(value){
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&['nowpayments.io','www.nowpayments.io'].includes(u.hostname);
 }catch{return false;}
}
async function upstream(env,path,options={}){
 let response,data;
 try{
  response=await fetch(API+path,{
   ...options,headers:{'x-api-key':env.NOWPAYMENTS_API_KEY,'content-type':'application/json'},
   signal:AbortSignal.timeout(2200)
  });
  data=await response.json();
 }catch{fail('PAYMENT_PROVIDER_UNAVAILABLE','تعذر التواصل مع NOWPayments',503);}
 if(!response.ok||!data||typeof data!=='object')
  fail('PAYMENT_PROVIDER_REJECTED','تعذر التحقق من الطلب عند مزود الدفع',503);
 return data;
}

export async function createCryptoInvoice(ctx){
 ready(ctx.env,true);
 const d=await body(ctx.request),planId=String(d.planId||'');
 const plan=CRYPTO_PLANS[planId];
 if(!Object.prototype.hasOwnProperty.call(CRYPTO_PLANS,planId))
  fail('PLAN_NOT_FOUND','هذه الباقة غير متوفرة',400);
 const verification=await verifiedChallenge(ctx.env,d.token);
 const ip=ctx.request.headers.get('CF-Connecting-IP')||'local';
 await rateLimit(ctx.env,'nowpayments:checkout:'+verification.telegram_user_id,6,1800);
 await rateLimit(ctx.env,'nowpayments:checkout-ip:'+ip,20,900);
 const planInDb=await ctx.env.DB.prepare('SELECT days FROM plans WHERE id=?').bind(planId).first();
 if(!planInDb||planInDb.days!==plan.days)
  fail('PLAN_MISMATCH','مدة الباقة لا تطابق إعدادات قاعدة البيانات',503);
 const existing=await ctx.env.DB.prepare(
  'SELECT id,invoice_url FROM nowpayments_orders WHERE verification_hash=?'
 ).bind(verification.token_hash).first();
 if(existing?.invoice_url){
  return json({ok:true,orderId:existing.id,paymentUrl:existing.invoice_url,reused:true});
 }
 const id=existing?.id||'np_'+uid();
 if(!existing){
  try{
   const row=await ctx.env.DB.prepare(
    'INSERT INTO nowpayments_orders(id,verification_hash,user_id,telegram_user_id,chat_id,plan_id,duration_days,amount_cents,created_at) SELECT ?,token_hash,user_id,telegram_user_id,chat_id,?,?,?,? FROM nowpayments_verifications WHERE token_hash=? AND verified_at IS NOT NULL AND used_at IS NULL AND expires_at>?'
   ).bind(id,planId,plan.days,plan.cents,now(),verification.token_hash,now()).run();
   if(row.meta?.changes!==1)fail('IDENTITY_REQUIRED','التحقق غير متاح أو مستخدم',409);
   await ctx.env.DB.prepare('UPDATE nowpayments_verifications SET used_at=? WHERE token_hash=? AND used_at IS NULL')
    .bind(now(),verification.token_hash).run();
  }catch(e){
   if(/UNIQUE constraint|SQLITE_CONSTRAINT/i.test(String(e?.message||'')))
    fail('CHECKOUT_BUSY','الطلب قيد الإنشاء؛ أعد المحاولة',409);
   throw e;
  }
 }
 const origin=new URL(ctx.request.url).origin;
 const req={
  price_amount:String(plan.cents/100),
  price_currency:'usd',
  order_id:id,
  order_description:'AIM8 - '+plan.label+' ('+plan.days+' Days)',
  ipn_callback_url:origin+'/api/nowpayments/webhook',
  success_url:origin+'/crypto.html?return=1',
  cancel_url:origin+'/crypto.html?cancel=1',
  is_fixed_rate:false,
  is_fee_paid_by_user:false
 };
 const invoice=await upstream(ctx.env,'/invoice',{method:'POST',body:JSON.stringify(req)});
 if(!officialInvoiceUrl(invoice.invoice_url)||!(/^[0-9]+$/.test(String(invoice.id||''))))
  fail('INVALID_PROVIDER_URL','رابط الفاتورة غير صالح',502);
 const saved=await ctx.env.DB.prepare(
  "UPDATE nowpayments_orders SET invoice_id=?,invoice_url=? WHERE id=? AND invoice_id IS NULL AND status='pending'"
 ).bind(String(invoice.id),invoice.invoice_url,id).run();
 if(saved.meta?.changes!==1)
  fail('CHECKOUT_CONFLICT','لا يمكن استخدام هذه الفاتورة الآن',409);
 return json({ok:true,orderId:id,paymentUrl:invoice.invoice_url,amountUsd:plan.cents/100,telegramId:verification.telegram_user_id});
}

export async function cryptoInvoiceStatus(ctx){
 const d=await body(ctx.request);
 const check=await verifiedChallengeForStatus(ctx.env,d.token);
 const row=await ctx.env.DB.prepare(
  'SELECT id,plan_id,amount_cents,status,invoice_url,created_at,paid_at FROM nowpayments_orders WHERE verification_hash=?'
 ).bind(check.token_hash).first();
 return json({ok:true,verified:!!check.verified_at,telegramId:check.telegram_user_id,
  order:row?{id:row.id,planId:row.plan_id,amountUsd:row.amount_cents/100,
    status:row.status,invoiceUrl:row.invoice_url,createdAt:row.created_at,paidAt:row.paid_at}:null});
}
async function verifiedChallengeForStatus(env,token){
 const s=String(token||'');
 if(!/^[A-Za-z0-9_-]{32}$/.test(s))fail('VERIFICATION_TOKEN','رمز غير صالح',400);
 const row=await env.DB.prepare(
  'SELECT token_hash,telegram_user_id,verified_at FROM nowpayments_verifications WHERE token_hash=? AND verified_at IS NOT NULL'
 ).bind(await sha256(s)).first();
 if(!row)fail('IDENTITY_REQUIRED','تحقق من الهوية أولاً',403);
 return row;
}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value!==null&&typeof value==='object')
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
async function validSignature(env,bodyObject,sig){
 if(!/^[a-f0-9]{128}$/i.test(sig||''))return false;
 const expected=Array.from(await hmac(String(env.NOWPAYMENTS_IPN_SECRET).trim(),
   JSON.stringify(canonical(bodyObject)),'SHA-512')).map(b=>b.toString(16).padStart(2,'0')).join('');
 return constantTime(enc.encode(expected),enc.encode(sig.toLowerCase()));
}
async function confirmWithProvider(env,ipn,order){
 const id=String(ipn.payment_id||'');
 if(!/^[0-9]{1,30}$/.test(id))fail('BAD_PAYMENT_ID','معرف العملية غير صالح',400);
 const state=await upstream(env,'/payment/'+id);
 if(String(state.payment_id)!==id||String(state.order_id)!==order.id||
    String(state.price_currency||'').toUpperCase()!=='USD'||
    Math.round(Number(state.price_amount)*100)!==order.amount_cents||
    (state.invoice_id!=null&&String(state.invoice_id)!==String(order.invoice_id)))
  fail('PAYMENT_MISMATCH','الفاتورة لا تطابق العملية المؤكدة',409);
 if(String(state.payment_status)!==String(ipn.payment_status))
  fail('PAYMENT_STATUS_STALE','حالة الدفع غير متطابقة؛ ستتم إعادة المحاولة',503);
 return {state,id};
}
async function codeFor(env,order){
 const bytes=await hmac(env.SESSION_SECRET,'aim8:nowpayments:code:v1:'+order.id+':'+order.payment_id);
 return 'A8-'+base64url(bytes).slice(0,28);
}
async function deliver(env,order){
 if(order.status!=='paid'||order.delivered_at||!order.payment_id||order.code_expires_at<=now())
  return;
 const code=await codeFor(env,order),hash=await sha256(code);
 if(hash!==order.code_hash)fail('CODE_INTEGRITY','تعذر التحقق من الكود',503);
 let current=await env.DB.prepare(
  'SELECT code_hash,used_at,expires_at,created_at FROM telegram_device_codes WHERE telegram_user_id=?'
 ).bind(order.telegram_user_id).first();
 // Replace only an older code. Never overwrite a newer payment or
 // /recover code if this IPN was delayed and arrived out of order.
 if(!current||(current.code_hash!==hash&&current.created_at<order.paid_at)){
  await issuePaidCode(env,order.telegram_user_id,order.user_id,code);
  current=await env.DB.prepare(
   'SELECT code_hash,used_at,expires_at,created_at FROM telegram_device_codes WHERE telegram_user_id=?'
  ).bind(order.telegram_user_id).first();
 }
 if(current?.code_hash!==hash){
  // A later purchase or /recover superseded this code; never restore it.
  return;
 }
 if(current.used_at!=null||current.expires_at<=now())return;
 const lang=await getBotLanguage(env,order.telegram_user_id)||'ar';
 const msg=lang==='ar'
  ?'✅ تم تأكيد دفع NOWPayments.\nباقة '+order.duration_days+' يوم.\n\nكود التفعيل:\n'+code+'\n\nصالح 24 ساعة من تأكيد الدفع، ويستخدم مرة واحدة. لا تشاركه.'
  :'✅ NOWPayments payment confirmed.\nPlan: '+order.duration_days+' days.\n\nActivation code:\n'+code+'\n\nValid for 24 hours after payment confirmation, single use. Keep it private.';
 await telegram(env,'sendMessage',{chat_id:order.chat_id,text:msg,reply_markup:codeKeyboard(lang,code)});
 await env.DB.prepare(
  "UPDATE nowpayments_orders SET delivered_at=? WHERE id=? AND status='paid' AND delivered_at IS NULL AND code_hash=?"
 ).bind(now(),order.id,hash).run();
}
async function finishPayment(env,order,paymentId){
 if(!['pending','paid','redeemed'].includes(order.status))return;
 if(order.status==='pending'){
  const paidAt=now();
  const c=await hmac(env.SESSION_SECRET,'aim8:nowpayments:code:v1:'+order.id+':'+paymentId);
  const code='A8-'+base64url(c).slice(0,28),hash=await sha256(code);
  await env.DB.prepare(
   "UPDATE nowpayments_orders SET status='paid',payment_id=?,paid_at=?,code_hash=?,code_expires_at=? WHERE id=? AND status='pending' AND invoice_id IS NOT NULL"
  ).bind(paymentId,paidAt,hash,paidAt+86400,order.id).run();
 }
 const latest=await env.DB.prepare('SELECT * FROM nowpayments_orders WHERE id=?').bind(order.id).first();
 if(latest?.payment_id!==paymentId)fail('PAYMENT_CONFLICT','الدفع مرتبط بمعاملة أخرى',409);
 await deliver(env,latest);
}
async function refundPayment(env,order,paymentId){
 if(order.payment_id!==paymentId||!['paid','redeemed'].includes(order.status))return;
 const t=now();
 await env.DB.batch([
  env.DB.prepare(
   "UPDATE nowpayments_orders SET status='refunded',refunded_at=? WHERE id=? AND payment_id=? AND status IN ('paid','redeemed')"
  ).bind(t,order.id,paymentId),
  env.DB.prepare(
   "UPDATE subscription_grants SET revoked_at=? WHERE source='nowpayments' AND source_id=? AND revoked_at IS NULL"
  ).bind(t,order.id),
  env.DB.prepare(
   'UPDATE users SET subscription_until='+entitlementEndSql+' WHERE id=? AND EXISTS(SELECT 1 FROM nowpayments_orders WHERE id=? AND status=\'refunded\' AND redeemed_at IS NOT NULL)'
  ).bind(order.user_id,order.id),
  env.DB.prepare(
   'UPDATE telegram_device_codes SET used_at=?,expires_at=? WHERE telegram_user_id=? AND code_hash=? AND used_at IS NULL'
  ).bind(t,t,order.telegram_user_id,order.code_hash||'')
 ]);
}
export async function nowpaymentsWebhook(ctx){
 ready(ctx.env);
 if(!ctx.request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
  return new Response('invalid type',{status:415});
 if(Number(ctx.request.headers.get('content-length')||0)>65536)
  return new Response('too large',{status:413});
 const raw=await ctx.request.text();
 if(raw.length>65536)return new Response('too large',{status:413});
 let data;
 try{data=JSON.parse(raw)}catch{return new Response('invalid json',{status:400});}
 if(!data||Array.isArray(data)||typeof data!=='object')
  return new Response('invalid payload',{status:400});
 if(!await validSignature(ctx.env,data,ctx.request.headers.get('x-nowpayments-sig')||''))
  return new Response('invalid signature',{status:401});
 const status=String(data.payment_status||'');
 if(!['finished','refunded'].includes(status))return new Response('ok',{status:200});
 const orderId=String(data.order_id||'');
 if(!/^np_[0-9a-f-]{36}$/.test(orderId))return new Response('unknown order',{status:404});
 const order=await ctx.env.DB.prepare('SELECT * FROM nowpayments_orders WHERE id=?').bind(orderId).first();
 if(!order||!order.invoice_id)return new Response('retry',{status:503});
 const {id}=await confirmWithProvider(ctx.env,data,order);
 if(status==='finished')await finishPayment(ctx.env,order,id);
 else await refundPayment(ctx.env,order,id);
 return new Response('ok',{status:200});
}
