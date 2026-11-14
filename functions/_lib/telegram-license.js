// Passwordless Telegram-owned AIM8 license.
// Telegram proves account ownership through the bot's private, authenticated
// webhook. Android proves device possession by signing a server nonce with a
// Keystore-backed P-256 key. A Telegram ID typed by a client is never auth.
import {body,fail,now,randomToken,sha256,uid,rateLimit,json,unbase64url,enc} from './common.js';
import {entitlementEndSql} from './grants.js';
import {tryActivateFriendCode,ensureFriendCodeSchema} from './friend-codes.js';

const codePattern=/^A8-[A-Za-z0-9_-]{28}$/;
const telegramIdPattern=/^[1-9][0-9]{0,15}$/;
const CODE_LIFETIME=86400, CHALLENGE_LIFETIME=120;
const licenseTable=`CREATE TABLE IF NOT EXISTS telegram_device_codes(
 telegram_user_id TEXT PRIMARY KEY REFERENCES telegram_accounts(telegram_user_id),
 user_id TEXT NOT NULL REFERENCES users(id),
 code_hash TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 used_at INTEGER,
 used_nonce TEXT
)`;
// Create on demand, as well as shipping db/006 for operators running Wrangler.
// This lets the existing Pages project switch without requiring a separate
// manual D1 migration before first authenticated Telegram webhook.
export async function ensureLicenseSchema(env){await env.DB.prepare(licenseTable).run();}
function validateId(id){const s=String(id||'');if(!telegramIdPattern.test(s)||!Number.isSafeInteger(Number(s)))fail('TELEGRAM_ID','هوية تيليجرام غير صالحة',400);return s;}
function shadowId(telegramId){return 'telegram:'+telegramId;}
export async function ensureTelegramAccount(env,tg,chat,from){
 const telegramId=validateId(tg),chatId=String(chat||'');
 if(chatId!==telegramId)fail('TELEGRAM_CHAT','يجب استخدام محادثة تيليجرام الخاصة',403);
 await ensureLicenseSchema(env);
 const id=shadowId(telegramId),display=String(from?.first_name||'Telegram user').replace(/[\\r\\n]/g,' ').slice(0,55)||'Telegram user';
 await env.DB.prepare('INSERT OR IGNORE INTO users(id,name,email,password_hash,password_salt,password_iterations,created_at) VALUES(?,?,?,?,?,?,?)')
   .bind(id,display,'tg-'+telegramId+'@accounts.8aim.invalid',randomToken(32),randomToken(16),100000,now()).run();
 await env.DB.prepare('INSERT OR IGNORE INTO telegram_accounts(telegram_user_id,user_id,chat_id,linked_at) VALUES(?,?,?,?)')
   .bind(telegramId,id,chatId,now()).run();
 const account=await env.DB.prepare('SELECT a.*,u.blocked,u.subscription_until FROM telegram_accounts a JOIN users u ON a.user_id=u.id WHERE a.telegram_user_id=?').bind(telegramId).first();
 if(!account||account.chat_id!==chatId)fail('ACCOUNT_CONFLICT','حساب تيليجرام مربوط بمحادثة أخرى',409);
 if(account.blocked)fail('ACCOUNT_BLOCKED','هذا الاشتراك موقوف',403);
 return account;
}
export async function issuePaidCode(env,tg,userId,code){
 const telegramId=validateId(tg);
 if(!codePattern.test(code))throw Error('Invalid generated activation code');
 await ensureLicenseSchema(env);
 const t=now(),hash=await sha256(code);
 await env.DB.prepare(`INSERT INTO telegram_device_codes(telegram_user_id,user_id,code_hash,created_at,expires_at,used_at,used_nonce)
 VALUES(?,?,?,?,?,NULL,NULL)
 ON CONFLICT(telegram_user_id) DO UPDATE SET user_id=excluded.user_id,code_hash=excluded.code_hash,
 created_at=excluded.created_at,expires_at=excluded.expires_at,used_at=NULL,used_nonce=NULL`)
   .bind(telegramId,userId,hash,t,t+CODE_LIFETIME).run();
 return code;
}
export async function recoverCode(env,tg,chat){
 const telegramId=validateId(tg),chatId=String(chat||'');
 await ensureLicenseSchema(env);
 const account=await env.DB.prepare('SELECT a.user_id,a.chat_id,u.blocked,u.subscription_until FROM telegram_accounts a JOIN users u ON u.id=a.user_id WHERE a.telegram_user_id=?').bind(telegramId).first();
 if(!account||account.chat_id!==chatId||account.blocked)fail('NO_TELEGRAM_ACCOUNT','الحساب غير موجود أو موقوف',403);
 const canRecover=account.subscription_until>now()||
  await env.DB.prepare("SELECT id FROM telegram_orders WHERE user_id=? AND status='paid' LIMIT 1").bind(account.user_id).first()||
  await env.DB.prepare("SELECT id FROM nowpayments_orders WHERE user_id=? AND status='paid' LIMIT 1").bind(account.user_id).first();
 if(!canRecover)fail('NO_ACTIVE_LICENSE','ما عندك اشتراك مدفوع صالح للاسترجاع',409);
 await rateLimit(env,'telegram:recover:'+telegramId,5,86400);
 const code='A8-'+randomToken(21),hash=await sha256(code),t=now();
 await env.DB.batch([
  env.DB.prepare('UPDATE users SET device_generation=device_generation+1,device_public_key=NULL,device_bound_at=NULL WHERE id=? AND blocked=0').bind(account.user_id),
  env.DB.prepare("UPDATE telegram_orders SET code_hash=NULL,code_expires_at=? WHERE user_id=? AND status='paid'").bind(t,account.user_id),
  env.DB.prepare(`INSERT INTO telegram_device_codes(telegram_user_id,user_id,code_hash,created_at,expires_at,used_at,used_nonce)
  VALUES(?,?,?,?,?,NULL,NULL)
  ON CONFLICT(telegram_user_id) DO UPDATE SET user_id=excluded.user_id,code_hash=excluded.code_hash,
  created_at=excluded.created_at,expires_at=excluded.expires_at,used_at=NULL,used_nonce=NULL`)
   .bind(telegramId,account.user_id,hash,t,t+CODE_LIFETIME)
 ]);
 return {code,expiresAt:t+CODE_LIFETIME,subscriptionUntil:account.subscription_until};
}
async function verifyProof(key,signature,text){
 try{
  const pub=unbase64url(key),sig=unbase64url(signature);
  if(pub.length<60||pub.length>140||sig.length!==64)return false;
  const imported=await crypto.subtle.importKey('spki',pub,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},imported,sig,enc.encode(text));
 }catch{return false}
}
export async function challenge(ctx){
 const d=await body(ctx.request);
 let telegramId=null;
 // Before redemption the app knows only the one-time code. Resolve its
 // owner server-side by its SHA-256 hash; never trust a client-typed Telegram ID.
 if(typeof d.code==='string'){
   const code=String(d.code).trim();
   if(!codePattern.test(code))fail('INVALID_CODE','صيغة كود التفعيل غير صحيحة',400);
   await ensureLicenseSchema(ctx.env);
   const hash=await sha256(code),t=now();
   const paid=await ctx.env.DB.prepare(
     'SELECT telegram_user_id FROM telegram_device_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>?'
   ).bind(hash,t).first();
   if(paid)telegramId=paid.telegram_user_id;
   else {
     await ensureFriendCodeSchema(ctx.env);
     const gifted=await ctx.env.DB.prepare(
       'SELECT telegram_user_id FROM friend_activation_codes WHERE code_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?'
     ).bind(hash,t).first();
     if(gifted)telegramId=gifted.telegram_user_id;
   }
 }else telegramId=validateId(d.telegramId);
 const ip=ctx.request.headers.get('CF-Connecting-IP')||'local';
 await rateLimit(ctx.env,'telegram-device-challenge:'+ip,30,900);
 const account=telegramId?await ctx.env.DB.prepare('SELECT user_id FROM telegram_accounts WHERE telegram_user_id=?')
   .bind(telegramId).first():null;
 const challengeId=uid(),nonce=randomToken(32);
 // Uniform response to prevent enumeration of accounts/codes.
 if(account)await ctx.env.DB.prepare('INSERT INTO device_challenges(id,user_id,nonce,expires_at) VALUES(?,?,?,?)')
   .bind(challengeId,account.user_id,nonce,now()+CHALLENGE_LIFETIME).run();
 return json({ok:true,challengeId,nonce,expiresIn:CHALLENGE_LIFETIME,algorithm:'ECDSA_P256_SHA256_P1363'});
}
async function loadChallenge(env,userId,challengeId){
 return env.DB.prepare('SELECT nonce FROM device_challenges WHERE id=? AND user_id=? AND expires_at>?')
  .bind(challengeId,userId,now()).first();
}
export async function activate(ctx){
 const d=await body(ctx.request),code=String(d.code||'').trim(),key=String(d.publicKey||''),
  challengeId=String(d.challengeId||''),signature=String(d.signature||'');
 if(!codePattern.test(code)||!/^[-_A-Za-z0-9]{70,220}$/.test(key))
  fail('INVALID_CODE','الكود أو مفتاح الجهاز غير صالح',400);
 await ensureLicenseSchema(ctx.env);
 const hash=await sha256(code);
 const codeRow=await ctx.env.DB.prepare('SELECT * FROM telegram_device_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>?')
  .bind(hash,now()).first();
 if(!codeRow){
  const gifted=await tryActivateFriendCode(ctx,hash,key,challengeId,signature,loadChallenge,verifyProof);
  if(gifted)return gifted;
  fail('CODE_EXPIRED','الكود منتهي أو مستخدم؛ اطلب كوداً جديداً',409);
 }
 const user=await ctx.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(codeRow.user_id).first();
 if(!user||user.blocked)fail('ACCOUNT_BLOCKED','الاشتراك موقوف',403);
 if(user.device_public_key&&user.device_public_key!==key)
  fail('DEVICE_ALREADY_BOUND','حسابك مرتبط بجهاز آخر؛ استرجع التفعيل من البوت',409);
 const cr=await loadChallenge(ctx.env,user.id,challengeId);
 if(!cr)fail('CHALLENGE_EXPIRED','انتهت صلاحية تحدي الجهاز',409);
 if(!await verifyProof(key,signature,`AIM8:telegram:activate:${challengeId}:${cr.nonce}`))
  fail('BAD_SIGNATURE','توقيع الجهاز غير صحيح',401);
 const pending=await ctx.env.DB.prepare("SELECT id FROM telegram_orders WHERE user_id=? AND status='paid' LIMIT 1").bind(user.id).first();
 const pendingCrypto=await ctx.env.DB.prepare("SELECT id FROM nowpayments_orders WHERE user_id=? AND status='paid' LIMIT 1").bind(user.id).first();
 if(user.subscription_until<=now()&&!pending&&!pendingCrypto)fail('SUBSCRIPTION_REQUIRED','ما عندك اشتراك فعّال',403);
 const t=now(),nonce=uid();
 const rows=await ctx.env.DB.batch([
  ctx.env.DB.prepare("UPDATE telegram_device_codes SET used_at=?,used_nonce=? WHERE code_hash=? AND user_id=? AND used_at IS NULL AND expires_at>?")
   .bind(t,nonce,hash,user.id,t),
  ctx.env.DB.prepare("INSERT OR IGNORE INTO subscription_baselines(user_id,baseline_until,baseline_started_at,created_at) SELECT id,subscription_until,subscription_started_at,? FROM users WHERE id=? AND EXISTS(SELECT 1 FROM telegram_device_codes WHERE code_hash=? AND used_nonce=?)")
   .bind(t,user.id,hash,nonce),
  ctx.env.DB.prepare("INSERT OR IGNORE INTO subscription_grants(id,user_id,source,source_id,granted_at,duration_seconds) SELECT 'tgd:'||id,user_id,'telegram',id,?,duration_days*86400 FROM telegram_orders WHERE user_id=? AND status='paid' AND EXISTS(SELECT 1 FROM telegram_device_codes WHERE code_hash=? AND used_nonce=?)")
   .bind(t,user.id,hash,nonce),
  ctx.env.DB.prepare("UPDATE telegram_orders SET status='redeemed',redeemed_at=? WHERE user_id=? AND status='paid' AND EXISTS(SELECT 1 FROM telegram_device_codes WHERE code_hash=? AND used_nonce=?)")
   .bind(t,user.id,hash,nonce),
  ctx.env.DB.prepare("INSERT OR IGNORE INTO subscription_grants(id,user_id,source,source_id,granted_at,duration_seconds) SELECT 'np:'||id,user_id,'nowpayments',id,?,duration_days*86400 FROM nowpayments_orders WHERE user_id=? AND status='paid' AND EXISTS(SELECT 1 FROM telegram_device_codes WHERE code_hash=? AND used_nonce=?)")
   .bind(t,user.id,hash,nonce),
  ctx.env.DB.prepare("UPDATE nowpayments_orders SET status='redeemed',redeemed_at=? WHERE user_id=? AND status='paid' AND EXISTS(SELECT 1 FROM telegram_device_codes WHERE code_hash=? AND used_nonce=?)")
   .bind(t,user.id,hash,nonce),
  ctx.env.DB.prepare("UPDATE users SET device_public_key=?,device_bound_at=?,subscription_started_at=COALESCE(subscription_started_at,?),subscription_until="+entitlementEndSql+
   " WHERE id=? AND blocked=0 AND (device_public_key IS NULL OR device_public_key=?) AND EXISTS(SELECT 1 FROM telegram_device_codes WHERE code_hash=? AND used_nonce=?)")
   .bind(key,t,t,user.id,key,hash,nonce),
  ctx.env.DB.prepare("DELETE FROM device_challenges WHERE id=? AND user_id=? AND expires_at>? AND EXISTS(SELECT 1 FROM telegram_device_codes WHERE code_hash=? AND used_nonce=?)")
   .bind(challengeId,user.id,t,hash,nonce)
 ]);
 if(rows[0]?.meta?.changes!==1||rows[6]?.meta?.changes!==1||rows[7]?.meta?.changes!==1)
  fail('ACTIVATION_FAILED','تعذر تفعيل الكود أو الجهاز؛ اطلب كوداً جديداً من البوت',409);
 const updated=await ctx.env.DB.prepare('SELECT subscription_until FROM users WHERE id=?').bind(user.id).first();
 return json({ok:true,telegramId:codeRow.telegram_user_id,deviceAccepted:true,subscriptionUntil:updated.subscription_until,serverTime:now(),nextCheckSeconds:300});
}
export async function verify(ctx){
 const d=await body(ctx.request),telegramId=validateId(d.telegramId),challengeId=String(d.challengeId||''),signature=String(d.signature||'');
 const account=await ctx.env.DB.prepare("SELECT u.* FROM telegram_accounts a JOIN users u ON u.id=a.user_id WHERE a.telegram_user_id=?").bind(telegramId).first();
 if(!account||account.blocked||!account.device_public_key)fail('DEVICE_NOT_ACTIVE','هذا الجهاز غير مفعّل',403);
 if(account.subscription_until<=now())fail('SUBSCRIPTION_REQUIRED','الاشتراك منتهي أو مسترجع',403);
 const cr=await loadChallenge(ctx.env,account.id,challengeId);
 if(!cr)fail('CHALLENGE_EXPIRED','تحدي الجهاز منتهي',409);
 if(!await verifyProof(account.device_public_key,signature,`AIM8:telegram:verify:${challengeId}:${cr.nonce}`))
  fail('DEVICE_REJECTED','الجهاز غير مسجّل على هذا الاشتراك',403);
 const consumed=await ctx.env.DB.prepare('DELETE FROM device_challenges WHERE id=? AND user_id=? AND expires_at>?').bind(challengeId,account.id,now()).run();
 if(consumed.meta?.changes!==1)fail('CHALLENGE_USED','تحدي الجهاز مستخدم',409);
 return json({ok:true,deviceAccepted:true,subscriptionUntil:account.subscription_until,serverTime:now(),nextCheckSeconds:300});
}
