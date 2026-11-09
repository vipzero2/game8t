import {body,now,uid,randomToken,fail,json,currentUser,rateLimit,hmac,base64url,constantTime,enc,hashPasswordForUser,assertHasherReady,setSession} from './common.js';

// Gmail addresses only. This checks the domain; email ownership is proven by an OTP.
export function normalizeGmail(input){
 const email=String(input||'').trim().toLowerCase();
 if(email.length>254||!/^[a-z0-9][a-z0-9.+_-]*@gmail\.com$/.test(email))fail('GMAIL_ONLY','يجب استخدام بريد ينتهي بـ gmail.com',400);
 return email;
}
export function validateNewPassword(password){
 if(typeof password!=='string'||password.length<10||password.length>256)fail('WEAK_PASSWORD','اختر كلمة مرور لا تقل عن 10 أحرف',400);
 return password;
}
function assertMailer(env){
 if(!env.RESEND_API_KEY||!env.EMAIL_FROM||!/^([^<>\r\n]+<)?[a-z0-9._+-]+@aim8\.site>?$/i.test(env.EMAIL_FROM))fail('EMAIL_NOT_CONFIGURED','خدمة إرسال البريد غير مفعّلة بعد',503);
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)fail('CONFIG_MISSING','مفتاح أمان السيرفر غير مضبوط',503);
}
function makeSixDigits(){const buf=new Uint32Array(1);crypto.getRandomValues(buf);return String(buf[0]%1000000).padStart(6,'0');}
async function hashCode(env,email,purpose,code){
 return base64url(await hmac(env.SESSION_SECRET,'otp:v1:'+purpose+':'+email+':'+code));
}
async function mailCode(env,to,purpose,code){
 assertMailer(env);
 const subjects={signup:'تأكيد إنشاء حساب AIM8',verify_email:'تأكيد بريد حساب AIM8',password_reset:'استعادة كلمة مرور AIM8',device_change:'تأكيد تغيير جهاز AIM8'};
 const lines={signup:'لإكمال إنشاء حسابك',verify_email:'لتأكيد بريد حسابك',password_reset:'لتغيير كلمة مرور حسابك',device_change:'لفك ربط جهازك الحالي وربط جهاز جديد'};
 const text='AIM8\n\nرمز التحقق '+lines[purpose]+' هو: '+code+'\n\nالرمز صالح لمدة 10 دقائق ويُستخدم مرة واحدة فقط.\nإذا لم تطلب هذا الإجراء، تجاهل الرسالة. لا تشارك الرمز مع أي شخص.';
 let response;
 try{
  response=await fetch('https://api.resend.com/emails',{method:'POST',
   headers:{'authorization':'Bearer '+env.RESEND_API_KEY,'content-type':'application/json'},
   body:JSON.stringify({from:env.EMAIL_FROM,to:[to],subject:subjects[purpose],text}),
   signal:AbortSignal.timeout(12000)});
 }catch(err){console.error('AIM8 mail provider request failed',err?.message||err);fail('EMAIL_SEND_FAILED','تعذر إرسال رسالة التحقق حاليًا',503)}
 if(!response.ok){console.error('AIM8 email provider status',response.status);fail('EMAIL_SEND_FAILED','تعذر إرسال رسالة التحقق؛ راجع إعدادات البريد',503)}
}
async function issueCode(ctx,email,purpose){
 const env=ctx.env;
 assertMailer(env);
 const ip=ctx.request.headers.get('CF-Connecting-IP')||'local';
 await rateLimit(env,'email-ip:'+ip,15,3600);
 await rateLimit(env,'email-address:'+email+':'+purpose,4,3600);
 const old=await env.DB.prepare('SELECT cooldown_until FROM email_security_codes WHERE email=? AND purpose=?').bind(email,purpose).first();
 if(old?.cooldown_until>now())fail('EMAIL_COOLDOWN','انتظر دقيقة قبل طلب رمز آخر',429);
 const code=makeSixDigits();
 await mailCode(env,email,purpose,code);
 await env.DB.prepare(`INSERT INTO email_security_codes(email,purpose,code_hash,attempts,expires_at,cooldown_until,consumed_at)
 VALUES(?,?,?,0,?,?,NULL)
 ON CONFLICT(email,purpose) DO UPDATE SET code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at,cooldown_until=excluded.cooldown_until,consumed_at=NULL`)
 .bind(email,purpose,await hashCode(env,email,purpose,code),now()+600,now()+60).run();
 return json({ok:true,expiresIn:600,message:'إذا كان البريد مؤهلًا، أرسلنا رمزًا من 6 أرقام'});
}
async function consumeCode(env,email,purpose,code){
 if(!/^\d{6}$/.test(String(code||'')))fail('INVALID_CODE','أدخل رمز التحقق المكوّن من 6 أرقام',400);
 const row=await env.DB.prepare(`UPDATE email_security_codes SET attempts=attempts+1 WHERE email=? AND purpose=?
 AND consumed_at IS NULL AND expires_at>? AND attempts<5 RETURNING code_hash`).bind(email,purpose,now()).first();
 if(!row)fail('CODE_EXPIRED','الرمز غير صالح أو انتهى؛ اطلب رمزًا جديدًا',400);
 const provided=enc.encode(await hashCode(env,email,purpose,String(code))), expected=enc.encode(row.code_hash);
 if(!constantTime(provided,expected))fail('INVALID_CODE','رمز التحقق غير صحيح',400);
 const used=await env.DB.prepare(`UPDATE email_security_codes SET consumed_at=? WHERE email=? AND purpose=? AND
 consumed_at IS NULL AND expires_at>? AND attempts<=5 AND code_hash=?`).bind(now(),email,purpose,now(),row.code_hash).run();
 if(used.meta.changes!==1)fail('CODE_USED','الرمز مستخدم مسبقًا',409);
}
export async function startSignup(ctx){
 const d=await body(ctx.request);
 const email=normalizeGmail(d.email);
 const name=String(d.name||'').trim().slice(0,60);
 const password=validateNewPassword(d.password);
 if(name.length<2)fail('VALIDATION','اسم العرض قصير جدًا',400);
 assertMailer(ctx.env);assertHasherReady(ctx.env);
 const existing=await ctx.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
 if(existing)fail('EMAIL_EXISTS','هذا البريد مسجل مسبقًا',409);
 const ip=ctx.request.headers.get('CF-Connecting-IP')||'local';
 await rateLimit(ctx.env,'signup:'+ip,5,3600);
 const salt=randomToken(16),hash=await hashPasswordForUser(ctx.env,password,salt,100000);
 const t=now();
 await ctx.env.DB.prepare(`INSERT INTO pending_signups(email,name,password_hash,password_salt,password_iterations,created_at,expires_at)
 VALUES(?,?,?,?,?,?,?)
 ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,password_salt=excluded.password_salt,
 password_iterations=excluded.password_iterations,created_at=excluded.created_at,expires_at=excluded.expires_at`)
 .bind(email,name,hash,salt,100000,t,t+600).run();
 return issueCode(ctx,email,'signup');
}
export async function verifySignup(ctx){
 const d=await body(ctx.request),email=normalizeGmail(d.email);
 const pending=await ctx.env.DB.prepare('SELECT * FROM pending_signups WHERE email=? AND expires_at>?').bind(email,now()).first();
 if(!pending)fail('SIGNUP_EXPIRED','انتهت مهلة التسجيل؛ أعد إنشاء الحساب',400);
 await consumeCode(ctx.env,email,'signup',d.code);
 const id=uid();
 try{
  await ctx.env.DB.prepare(`INSERT INTO users(id,name,email,password_hash,password_salt,password_iterations,email_verified,created_at)
 VALUES(?,?,?,?,?,?,1,?)`).bind(id,pending.name,email,pending.password_hash,pending.password_salt,pending.password_iterations,now()).run();
 }catch(err){if(String(err).includes('UNIQUE'))fail('EMAIL_EXISTS','البريد مسجل بالفعل',409);throw err}
 await ctx.env.DB.prepare('DELETE FROM pending_signups WHERE email=?').bind(email).run();
 return json({ok:true,user:{id,name:pending.name,email,role:'user',emailVerified:true}},201,{'set-cookie':await setSession(ctx.env,id)});
}
export async function requestVerifyEmail(ctx){
 const user=await currentUser(ctx);
 if(user.email_verified)return json({ok:true,alreadyVerified:true});
 return issueCode(ctx,normalizeGmail(user.email),'verify_email');
}
export async function confirmVerifyEmail(ctx){
 const user=await currentUser(ctx),d=await body(ctx.request);
 if(user.email_verified)return json({ok:true,alreadyVerified:true});
 await consumeCode(ctx.env,normalizeGmail(user.email),'verify_email',d.code);
 await ctx.env.DB.prepare('UPDATE users SET email_verified=1 WHERE id=?').bind(user.id).run();
 return json({ok:true,emailVerified:true});
}
export async function requestPasswordReset(ctx){
 const d=await body(ctx.request),email=normalizeGmail(d.email);
 const ip=ctx.request.headers.get('CF-Connecting-IP')||'local';
 await rateLimit(ctx.env,'reset-ip:'+ip,10,3600);
 assertMailer(ctx.env);
 const user=await ctx.env.DB.prepare('SELECT id,blocked,email_verified FROM users WHERE email=?').bind(email).first();
 if(user&&!user.blocked&&user.email_verified)await issueCode(ctx,email,'password_reset');
 return json({ok:true,message:'إذا كان البريد مسجلًا ومؤكدًا، ستصلك رسالة رمز التحقق'});
}
export async function confirmPasswordReset(ctx){
 const d=await body(ctx.request),email=normalizeGmail(d.email),password=validateNewPassword(d.newPassword);
 assertHasherReady(ctx.env);
 const user=await ctx.env.DB.prepare('SELECT id FROM users WHERE email=? AND email_verified=1 AND blocked=0').bind(email).first();
 if(!user)fail('INVALID_CODE','رمز التحقق غير صالح',400);
 await consumeCode(ctx.env,email,'password_reset',d.code);
 const salt=randomToken(16),hash=await hashPasswordForUser(ctx.env,password,salt,100000);
 await ctx.env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=100000 WHERE id=?').bind(hash,salt,user.id).run();
 await ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();
 await ctx.env.DB.prepare('INSERT INTO account_events(id,user_id,event_type,created_at) VALUES(?,?,?,?)').bind(uid(),user.id,'password_reset',now()).run();
 return json({ok:true,message:'تغيّرت كلمة المرور؛ سجّل الدخول من جديد'});
}
export async function requestDeviceChange(ctx){
 const user=await currentUser(ctx);
 if(!user.email_verified)fail('EMAIL_UNVERIFIED','أكد بريد Gmail أولًا من صفحة حسابك',403);
 if(!user.device_public_key)fail('NO_DEVICE','ماكو جهاز مرتبط حتى تغيّره',400);
 return issueCode(ctx,normalizeGmail(user.email),'device_change');
}
export async function confirmDeviceChange(ctx){
 const user=await currentUser(ctx),d=await body(ctx.request);
 if(!user.email_verified)fail('EMAIL_UNVERIFIED','أكد بريد Gmail أولًا',403);
 if(!user.device_public_key)fail('NO_DEVICE','ماكو جهاز مرتبط',400);
 await consumeCode(ctx.env,normalizeGmail(user.email),'device_change',d.code);
 const res=await ctx.env.DB.prepare(`UPDATE users SET device_public_key=NULL,device_bound_at=NULL,device_generation=device_generation+1
 WHERE id=? AND device_public_key IS NOT NULL`).bind(user.id).run();
 if(res.meta.changes!==1)fail('NO_DEVICE','الجهاز غير مرتبط',409);
 await ctx.env.DB.prepare('DELETE FROM device_challenges WHERE user_id=?').bind(user.id).run();
 await ctx.env.DB.prepare('INSERT INTO account_events(id,user_id,event_type,created_at) VALUES(?,?,?,?)').bind(uid(),user.id,'device_changed',now()).run();
 return json({ok:true,deviceBound:false,message:'تم فك ربط الجهاز القديم؛ سجّل من الجهاز الجديد'});
}
