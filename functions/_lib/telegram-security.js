// Telegram webhook replay protection, abuse throttles, and privacy-safe audit.
// No customer activation code, bot token, invoice payload, or raw Telegram ID
// is ever written to the security event log.
import {ApiError,base64url,fail,hmac,json,now,rateLimit,requireAdmin,uid} from './common.js';

const updatesSchema=`CREATE TABLE IF NOT EXISTS telegram_webhook_updates(
 update_id INTEGER PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('processing','done')),
 lease_token TEXT NOT NULL,
 lease_until INTEGER NOT NULL,
 received_at INTEGER NOT NULL,
 completed_at INTEGER
)`;
const eventsSchema=`CREATE TABLE IF NOT EXISTS telegram_security_events(
 id TEXT PRIMARY KEY,
 category TEXT NOT NULL,
 actor_digest TEXT NOT NULL,
 created_at INTEGER NOT NULL
)`;
const EVENT_TYPES=new Set([
 'webhook_auth','webhook_payload','spam_message','spam_callback',
 'spam_invoice','payment_mismatch','precheckout_mismatch','recovery_spam'
]);
export async function ensureSecuritySchema(env){
 await env.DB.prepare(updatesSchema).run();
 await env.DB.prepare(eventsSchema).run();
}
export async function beginWebhookUpdate(env,updateId){
 if(updateId==null)return null; // Backward compatibility for older test fixtures.
 if(!Number.isSafeInteger(updateId)||updateId<0)fail('INVALID_TELEGRAM_UPDATE','تحديث تيليجرام غير صالح',400);
 await ensureSecuritySchema(env);
 const t=now(),token=uid();
 const result=await env.DB.prepare(`INSERT INTO telegram_webhook_updates(update_id,status,lease_token,lease_until,received_at)
 VALUES(?,'processing',?,?,?)
 ON CONFLICT(update_id) DO UPDATE SET
 status='processing',lease_token=excluded.lease_token,lease_until=excluded.lease_until
 WHERE telegram_webhook_updates.status!='done' AND telegram_webhook_updates.lease_until<?`)
 .bind(updateId,token,t+120,t,t).run();
 if(result.meta?.changes!==1){
  const current=await env.DB.prepare('SELECT status FROM telegram_webhook_updates WHERE update_id=?').bind(updateId).first();
  // Telegram may retry concurrently. A done receipt gets HTTP 200; a still
  // processing update gets HTTP 503 so Telegram will retry if this worker dies.
  return {duplicate:true,inProgress:current?.status!=='done'};
 }
 // Compact old, completed entries gradually; never prune unfinished payments.
 if(updateId%256===0)await env.DB.prepare("DELETE FROM telegram_webhook_updates WHERE status='done' AND completed_at<?").bind(t-30*86400).run();
 return {duplicate:false,updateId,token};
}
export async function completeWebhookUpdate(env,lease){
 if(!lease||lease.duplicate)return;
 await env.DB.prepare("UPDATE telegram_webhook_updates SET status='done',lease_until=0,completed_at=? WHERE update_id=? AND lease_token=? AND status='processing'")
 .bind(now(),lease.updateId,lease.token).run();
}
export async function failWebhookUpdate(env,lease){
 if(!lease||lease.duplicate)return;
 await env.DB.prepare("UPDATE telegram_webhook_updates SET lease_until=0 WHERE update_id=? AND lease_token=? AND status='processing'")
 .bind(lease.updateId,lease.token).run();
}
async function alertOwner(env,category){
 const recipient=String(env.TELEGRAM_SECURITY_ALERT_CHAT_ID||'');
 if(!/^[1-9][0-9]{0,15}$/.test(recipient)||!env.TELEGRAM_BOT_TOKEN)return;
 const t=now(),key='telegram:security:alert:'+category;
 const granted=await env.DB.prepare(`INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?)
 ON CONFLICT(key) DO UPDATE SET count=1,reset_at=excluded.reset_at
 WHERE rate_limits.reset_at<?`).bind(key,t+900,t).run();
 if(granted.meta?.changes!==1)return;
 try{
  await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({chat_id:recipient,text:'🛡️ AIM8 security: '+category+'. Suspicious activity blocked. Review the admin security report.'}),
   signal:AbortSignal.timeout(4000)
  });
 }catch{console.error('Telegram security alert delivery unavailable');}
}
export async function securityEvent(env,category,actor='unknown'){
 if(!EVENT_TYPES.has(category))throw Error('Invalid security event category');
 await ensureSecuritySchema(env);
 const digest=base64url(await hmac(env.SESSION_SECRET,'aim8:telegram:audit:v1:'+String(actor))).slice(0,32);
 const t=now();
 await env.DB.prepare('INSERT INTO telegram_security_events(id,category,actor_digest,created_at) VALUES(?,?,?,?)')
   .bind(uid(),category,digest,t).run();
 // Keep audit retention bounded. The rare event also cleans up old records.
 await env.DB.prepare('DELETE FROM telegram_security_events WHERE created_at<?').bind(t-90*86400).run();
 const burst=await env.DB.prepare('SELECT COUNT(*) AS total FROM telegram_security_events WHERE category=? AND actor_digest=? AND created_at>=?')
   .bind(category,digest,t-900).first();
 if((burst?.total||0)>=5)await alertOwner(env,category);
}
export async function enforceBotLimit(env,actor,kind,max,windowSec){
 try{await rateLimit(env,'telegram:bot:'+kind+':'+actor,max,windowSec)}
 catch(e){
  if(e instanceof ApiError&&e.code==='RATE_LIMIT'){
   await securityEvent(env,'spam_'+kind,actor);
  }
  throw e;
 }
}
export async function securityStatus(ctx){
 await requireAdmin(ctx);
 await ensureSecuritySchema(ctx.env);
 const cutoff=now()-86400;
 const events=(await ctx.env.DB.prepare(
  'SELECT category,COUNT(*) AS total FROM telegram_security_events WHERE created_at>=? GROUP BY category ORDER BY total DESC'
 ).bind(cutoff).all()).results;
 const updates=(await ctx.env.DB.prepare(
  'SELECT status,COUNT(*) AS total FROM telegram_webhook_updates WHERE received_at>=? GROUP BY status'
 ).bind(cutoff).all()).results;
 return json({ok:true,windowHours:24,events,updates,
  independentWebhookSecret:!!ctx.env.TELEGRAM_WEBHOOK_SECRET,
  alertRecipientConfigured:!!ctx.env.TELEGRAM_SECURITY_ALERT_CHAT_ID});
}
