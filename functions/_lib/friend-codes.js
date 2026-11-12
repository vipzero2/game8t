// Owner-issued, Telegram-ID-bound one-use gift codes. No Stars payment or
// order is forged. Time is granted only after successful Android device proof.
import {body,fail,json,now,randomToken,requireAdmin,sha256,uid} from './common.js';
import {entitlementEndSql} from './grants.js';

const VALID_ID=/^[1-9][0-9]{0,15}$/;
const PLAN_IDS=new Set(['quarter','half','year']);
const LIFETIME=86400;
const CREATE=`CREATE TABLE IF NOT EXISTS friend_activation_codes(
 id TEXT PRIMARY KEY,
 telegram_user_id TEXT NOT NULL,
 plan_id TEXT NOT NULL,
 duration_days INTEGER NOT NULL CHECK(duration_days BETWEEN 1 AND 3660),
 code_hash TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 redeemed_at INTEGER,
 redeem_nonce TEXT UNIQUE,
 revoked_at INTEGER
)`;
export async function ensureFriendCodeSchema(env){
 await env.DB.prepare(CREATE).run();
 await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS
  idx_friend_code_pending_id ON friend_activation_codes(telegram_user_id)
  WHERE redeemed_at IS NULL AND revoked_at IS NULL`).run();
}
function validTelegramId(value){
 const id=String(value??'').trim();
 if(!VALID_ID.test(id)||!Number.isSafeInteger(Number(id)))
  fail('TELEGRAM_ID','أدخل Telegram ID رقمي صحيح',400);
 return id;
}
function state(row,t=now()){
 return row.revoked_at?'cancelled':row.redeemed_at?'redeemed':row.expires_at<=t?'expired':'ready';
}
export async function adminListFriendCodes(ctx){
 await requireAdmin(ctx);
 await ensureFriendCodeSchema(ctx.env);
 const rows=(await ctx.env.DB.prepare(`SELECT id,telegram_user_id,plan_id,duration_days,
  created_at,expires_at,redeemed_at,revoked_at
  FROM friend_activation_codes ORDER BY created_at DESC,id DESC LIMIT 60`).all()).results;
 return json({ok:true,codes:rows.map(r=>({...r,status:state(r)}))});
}
export async function adminIssueFriendCode(ctx){
 const admin=await requireAdmin(ctx),data=await body(ctx.request);
 const telegramId=validTelegramId(data.telegramId);
 const planId=String(data.planId||'');
 if(!PLAN_IDS.has(planId))fail('INVALID_PLAN','اختر باقة 3 أشهر أو 6 أشهر أو سنة',400);
 await ensureFriendCodeSchema(ctx.env);
 const plan=await ctx.env.DB.prepare('SELECT id,name,days FROM plans WHERE id=?').bind(planId).first();
 if(!plan||!Number.isSafeInteger(plan.days)||plan.days<1||plan.days>3660)
  fail('INVALID_PLAN','الباقة غير متوفرة',404);
 const t=now();
 // Clear only expired unclaimed invitations, never used grants.
 await ctx.env.DB.prepare(`UPDATE friend_activation_codes SET revoked_at=?
  WHERE telegram_user_id=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at<=?`)
  .bind(t,telegramId,t).run();
 const existing=await ctx.env.DB.prepare(`SELECT id FROM friend_activation_codes
  WHERE telegram_user_id=? AND redeemed_at IS NULL AND revoked_at IS NULL LIMIT 1`)
  .bind(telegramId).first();
 if(existing)fail('PENDING_CODE','هذا الـID لديه كود لم يُستخدم بعد؛ ألغِه أولاً إذا تريد توليد غيره',409);
 const linked=await ctx.env.DB.prepare(`SELECT u.blocked FROM telegram_accounts a
  JOIN users u ON u.id=a.user_id WHERE a.telegram_user_id=?`).bind(telegramId).first();
 if(linked?.blocked)fail('ACCOUNT_BLOCKED','هذا الحساب محظور',403);
 const id='fg_'+uid(),code='A8-'+randomToken(21),hash=await sha256(code);
 try{
  const result=await ctx.env.DB.batch([
   ctx.env.DB.prepare(`INSERT INTO friend_activation_codes
    (id,telegram_user_id,plan_id,duration_days,code_hash,created_by,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(id,telegramId,plan.id,plan.days,hash,admin.id,t,t+LIFETIME),
   ctx.env.DB.prepare(`INSERT INTO audit_log(id,admin_id,target_id,action,info,created_at)
    VALUES(?,?,?,?,?,?)`).bind(uid(),admin.id,linked?'telegram:'+telegramId:null,
    'friend_code_issue',telegramId+':'+plan.id+':'+id,t)
  ]);
  if(result[0]?.meta?.changes!==1)fail('CODE_FAILED','تعذر إصدار الكود',500);
 }catch(e){
  if(/UNIQUE constraint|SQLITE_CONSTRAINT/i.test(String(e?.message||'')))
   fail('PENDING_CODE','هذا الـID لديه كود مفتوح مسبقاً',409);
  throw e;
 }
 return json({ok:true,id,telegramId,planId:plan.id,durationDays:plan.days,
  code,expiresAt:t+LIFETIME,telegramConnected:!!linked});
}
export async function adminCancelFriendCode(ctx){
 const admin=await requireAdmin(ctx),data=await body(ctx.request);
 const id=String(data.id||'').trim();
 if(!/^fg_[0-9a-f-]{36}$/.test(id))fail('INVALID_CODE','رقم السجل غير صحيح',400);
 await ensureFriendCodeSchema(ctx.env);
 const t=now();
 const result=await ctx.env.DB.prepare(`UPDATE friend_activation_codes SET revoked_at=?
  WHERE id=? AND redeemed_at IS NULL AND revoked_at IS NULL`).bind(t,id).run();
 if(result.meta?.changes!==1)fail('CANNOT_CANCEL','الكود غير موجود أو مُستخدم أو ملغى',409);
 await ctx.env.DB.prepare(`INSERT INTO audit_log(id,admin_id,target_id,action,info,created_at)
  VALUES(?,?,?,?,?,?)`).bind(uid(),admin.id,null,'friend_code_cancel',id,t).run();
 return json({ok:true});
}
export async function tryActivateFriendCode(ctx,hash,key,challengeId,signature,
  loadChallenge,verifyProof){
 await ensureFriendCodeSchema(ctx.env);
 const t=now();
 const gift=await ctx.env.DB.prepare(`SELECT * FROM friend_activation_codes
  WHERE code_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?`)
  .bind(hash,t).first();
 if(!gift)return null;
 // A typed Telegram ID is not proof. Account ownership must first be established
 // by a real private /start webhook from Telegram for this very ID.
 const user=await ctx.env.DB.prepare(`SELECT u.* FROM telegram_accounts a
  JOIN users u ON u.id=a.user_id WHERE a.telegram_user_id=? AND a.chat_id=a.telegram_user_id`)
  .bind(gift.telegram_user_id).first();
 if(!user)fail('TELEGRAM_START_REQUIRED','صاحب الـID لازم يفتح بوت AIM8 ويرسل /start أولاً',409);
 if(user.blocked)fail('ACCOUNT_BLOCKED','الحساب محظور',403);
 if(user.device_public_key&&user.device_public_key!==key)
  fail('DEVICE_ALREADY_BOUND','هذا الحساب مرتبط بجهاز آخر',409);
 const challenge=await loadChallenge(ctx.env,user.id,challengeId);
 if(!challenge)fail('CHALLENGE_EXPIRED','تحدي الجهاز غير صالح أو منتهي',409);
 if(!await verifyProof(key,signature,`AIM8:telegram:activate:${challengeId}:${challenge.nonce}`))
  fail('BAD_SIGNATURE','توقيع الجهاز غير صحيح',401);
 const nonce=uid(),redeemedAt=now();
 const rows=await ctx.env.DB.batch([
  ctx.env.DB.prepare(`UPDATE friend_activation_codes SET redeemed_at=?,redeem_nonce=?
    WHERE id=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?`)
    .bind(redeemedAt,nonce,gift.id,redeemedAt),
  ctx.env.DB.prepare(`INSERT OR IGNORE INTO subscription_baselines
    (user_id,baseline_until,baseline_started_at,created_at)
    SELECT id,subscription_until,subscription_started_at,? FROM users WHERE id=?
    AND EXISTS(SELECT 1 FROM friend_activation_codes WHERE id=? AND redeem_nonce=?)`)
    .bind(redeemedAt,user.id,gift.id,nonce),
  ctx.env.DB.prepare(`INSERT OR IGNORE INTO subscription_grants
    (id,user_id,source,source_id,granted_at,duration_seconds)
    SELECT ?,?,'manual','friend:'||id,?,duration_days*86400
    FROM friend_activation_codes WHERE id=? AND redeem_nonce=?`)
    .bind(uid(),user.id,redeemedAt,gift.id,nonce),
  ctx.env.DB.prepare(`UPDATE users SET device_public_key=?,device_bound_at=?,
    subscription_started_at=CASE WHEN subscription_until<? THEN ?
      ELSE COALESCE(subscription_started_at,?) END,
    subscription_until=`+entitlementEndSql+`
    WHERE id=? AND blocked=0 AND (device_public_key IS NULL OR device_public_key=?)
    AND EXISTS(SELECT 1 FROM friend_activation_codes WHERE id=? AND redeem_nonce=?)`)
    .bind(key,redeemedAt,redeemedAt,redeemedAt,redeemedAt,user.id,key,gift.id,nonce),
  ctx.env.DB.prepare(`DELETE FROM device_challenges WHERE id=? AND user_id=? AND expires_at>?
    AND EXISTS(SELECT 1 FROM friend_activation_codes WHERE id=? AND redeem_nonce=?)`)
    .bind(challengeId,user.id,redeemedAt,gift.id,nonce)
 ]);
 if(rows[0]?.meta?.changes!==1||rows[2]?.meta?.changes!==1||
    rows[3]?.meta?.changes!==1||rows[4]?.meta?.changes!==1)
  fail('ACTIVATION_FAILED','تعذر تفعيل الكود؛ تأكد من الجهاز وحالة الاشتراك',409);
 const current=await ctx.env.DB.prepare('SELECT subscription_until FROM users WHERE id=?')
  .bind(user.id).first();
 return json({ok:true,telegramId:gift.telegram_user_id,deviceAccepted:true,
  subscriptionUntil:current.subscription_until,serverTime:now(),nextCheckSeconds:300,
  gift:true,planId:gift.plan_id,days:gift.duration_days});
}
