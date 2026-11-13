import {body,fail,now,uid,randomToken,sha256,rateLimit,json,requireAdmin} from './common.js';

const REVIEW_CODE=/^A8R-[A-Za-z0-9_-]{32}$/;
const SESSION_TOKEN=/^[A-Za-z0-9_-]{43}$/;
const ACTIVE_WINDOW=360;
const ALERT_THRESHOLD=30;
const LEASE_SECONDS=300;

async function ensureSchema(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS review_licenses(id TEXT PRIMARY KEY,code_hash TEXT NOT NULL UNIQUE,label TEXT NOT NULL,created_at INTEGER NOT NULL,created_by TEXT NOT NULL,revoked_at INTEGER)").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS review_sessions(token_hash TEXT PRIMARY KEY,license_id TEXT NOT NULL REFERENCES review_licenses(id),first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL)").run();
 await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_review_sessions_active ON review_sessions(license_id,last_seen)").run();
 await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_review_one_active ON review_licenses((1)) WHERE revoked_at IS NULL").run();
}
async function countActive(env,id,t){
 const row=await env.DB.prepare("SELECT COUNT(*) AS total FROM review_sessions WHERE license_id=? AND last_seen>=?").bind(id,t-ACTIVE_WINDOW).first();
 return Number(row?.total||0);
}
async function alertRecipient(env){
 const explicit=String(env.TELEGRAM_SECURITY_ALERT_CHAT_ID||'');
 if(/^[1-9][0-9]{0,15}$/.test(explicit))return explicit;
 const row=await env.DB.prepare("SELECT telegram_chat_id FROM telegram_alert_settings WHERE name='security_owner'").first().catch(()=>null);
 const value=String(row?.telegram_chat_id||'');
 return /^[1-9][0-9]{0,15}$/.test(value)?value:null;
}
async function notifyIfOver(env,id,count,t){
 if(count<=ALERT_THRESHOLD)return;
 const chat=await alertRecipient(env);
 if(!chat||!env.TELEGRAM_BOT_TOKEN)return;
 const key='review:over-limit:'+id;
 const locked=await env.DB.prepare("INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,reset_at=excluded.reset_at WHERE rate_limits.reset_at<?")
   .bind(key,t+900,t).run();
 if(locked.meta?.changes!==1)return;
 try {
  const response=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({chat_id:chat,text:'🚨 AIM8 — مراجعة Google\nتجاوز عدد الجلسات النشطة 30.\nالجلسات النشطة الآن: '+count+'\nالزيادة: '+(count-30)+'\nالكود ما زال نشطاً، ولم يُوقف أي مراجع. افحص لوحة الإدارة.'}),
   signal:AbortSignal.timeout(5000)
  });
  if(!response.ok)console.error('Review activity alert was not delivered',response.status);
 }catch(error){console.error('Review activity alert unavailable',error?.message);}
}
function lease(data){
 const t=now();
 return json({ok:true,deviceAccepted:true,licenseType:'review',serverTime:t,
  subscriptionUntil:t+LEASE_SECONDS,nextCheckSeconds:LEASE_SECONDS,...data});
}
async function activeLicenses(env){
 const rows=(await env.DB.prepare("SELECT id,label,created_at,revoked_at FROM review_licenses ORDER BY created_at DESC LIMIT 30").all()).results;
 const t=now();
 const withCount=[];
 for(const row of rows)withCount.push({...row,activeSessions:row.revoked_at==null?await countActive(env,row.id,t):0});
 return withCount;
}
export async function adminStatus(ctx){
 await requireAdmin(ctx);await ensureSchema(ctx.env);
 const licenses=await activeLicenses(ctx.env);
 return json({ok:true,threshold:ALERT_THRESHOLD,activeWindowSeconds:ACTIVE_WINDOW,
  licenses,alertConfigured:!!await alertRecipient(ctx.env)});
}
export async function adminIssue(ctx){
 const admin=await requireAdmin(ctx),d=await body(ctx.request);
 await ensureSchema(ctx.env);
 await rateLimit(ctx.env,'review:issue:'+admin.id,8,3600);
 const existing=await ctx.env.DB.prepare('SELECT id FROM review_licenses WHERE revoked_at IS NULL LIMIT 1').first();
 if(existing)fail('ACTIVE_REVIEW_LICENSE','يوجد كود مراجعة نشط. ألغِه قبل إصدار بديل.',409);
 const code='A8R-'+randomToken(24),id=uid(),t=now();
 const label=String(d.label||'Google Play review').trim().slice(0,80)||'Google Play review';
 await ctx.env.DB.batch([
  ctx.env.DB.prepare('INSERT INTO review_licenses(id,code_hash,label,created_at,created_by) VALUES(?,?,?,?,?)')
   .bind(id,await sha256(code),label,t,admin.id),
  ctx.env.DB.prepare('INSERT INTO audit_log(id,admin_id,target_id,action,info,created_at) VALUES(?,?,?,?,?,?)')
   .bind(uid(),admin.id,null,'review_code_issue',id,t)
 ]);
 return json({ok:true,id,code,label,threshold:ALERT_THRESHOLD});
}
export async function adminRevoke(ctx){
 const admin=await requireAdmin(ctx),d=await body(ctx.request);
 const id=String(d.id||'');
 if(!/^[0-9a-f-]{36}$/.test(id))fail('INVALID_ID','معرّف الكود غير صحيح',400);
 await ensureSchema(ctx.env);
 const t=now();
 const updated=await ctx.env.DB.prepare('UPDATE review_licenses SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(t,id).run();
 if(updated.meta?.changes!==1)fail('NOT_ACTIVE','الكود ملغى أو غير موجود',409);
 await ctx.env.DB.prepare('INSERT INTO audit_log(id,admin_id,target_id,action,info,created_at) VALUES(?,?,?,?,?,?)')
  .bind(uid(),admin.id,null,'review_code_revoke',id,t).run();
 return json({ok:true,revoked:true});
}
export async function activate(ctx){
 const d=await body(ctx.request),code=String(d.code||'').trim();
 if(!REVIEW_CODE.test(code))fail('INVALID_CODE','كود المراجعة غير صحيح',400);
 const ip=ctx.request.headers.get('CF-Connecting-IP')||'local';
 await rateLimit(ctx.env,'review:activate:'+ip,240,3600);
 await ensureSchema(ctx.env);
 const row=await ctx.env.DB.prepare('SELECT id FROM review_licenses WHERE code_hash=? AND revoked_at IS NULL').bind(await sha256(code)).first();
 if(!row)fail('CODE_REVOKED','كود المراجعة غير صالح أو تم إلغاؤه',403);
 const t=now(),token=randomToken(32),hashed=await sha256(token);
 await ctx.env.DB.prepare('INSERT INTO review_sessions(token_hash,license_id,first_seen,last_seen) VALUES(?,?,?,?)').bind(hashed,row.id,t,t).run();
 const prior=String(d.previousSessionToken||'');
 if(SESSION_TOKEN.test(prior))await ctx.env.DB.prepare('DELETE FROM review_sessions WHERE token_hash=? AND license_id=?')
   .bind(await sha256(prior),row.id).run();
 // Sessions that stopped calling the API disappear from the active count.
 // Retain only recent history; there is no permanent device registration.
 await ctx.env.DB.prepare('DELETE FROM review_sessions WHERE last_seen<?').bind(t-7*86400).run();
 const count=await countActive(ctx.env,row.id,t);
 await notifyIfOver(ctx.env,row.id,count,t);
 return lease({sessionToken:token,activeSessions:count,alertThreshold:ALERT_THRESHOLD});
}
export async function verify(ctx){
 const d=await body(ctx.request),token=String(d.sessionToken||'');
 if(!SESSION_TOKEN.test(token))fail('INVALID_REVIEW_SESSION','جلسة المراجعة غير صالحة',401);
 await ensureSchema(ctx.env);
 const t=now(),hash=await sha256(token);
 const updated=await ctx.env.DB.prepare("UPDATE review_sessions SET last_seen=? WHERE token_hash=? AND EXISTS(SELECT 1 FROM review_licenses WHERE id=review_sessions.license_id AND revoked_at IS NULL)").bind(t,hash).run();
 if(updated.meta?.changes!==1)fail('REVIEW_REVOKED','ترخيص المراجعة غير صالح أو تم إلغاؤه',403);
 const row=await ctx.env.DB.prepare('SELECT license_id FROM review_sessions WHERE token_hash=?').bind(hash).first();
 if(!row)fail('REVIEW_SESSION_MISSING','جلسة المراجعة غير موجودة',403);
 const count=await countActive(ctx.env,row.license_id,t);
 await notifyIfOver(ctx.env,row.license_id,count,t);
 return lease({activeSessions:count});
}
