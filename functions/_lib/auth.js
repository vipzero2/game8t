import {ApiError,body,now,uid,randomToken,hashPasswordForUser,checkPasswordForUser,assertHasherReady,refundRateLimitOnServerFailure,rateLimit,fail,json,setSession,cookie,currentUser,getCookie,sha256,safeUser,signedToken} from './common.js';
function validateLogin(data){const email=String(data.email||'').trim().toLowerCase();const pwd=String(data.password||'');if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||pwd.length>256)fail('VALIDATION','تحقق من البريد وكلمة المرور');return {email,pwd};}
async function authenticate(ctx,data){
  const {email,pwd}=validateLogin(data);
  assertHasherReady(ctx.env);
  const ip=ctx.request.headers.get('CF-Connecting-IP')||'local';
  const limitKey=`login:${ip}:${email}`;
  await rateLimit(ctx.env,limitKey,8,900);
  try{
    const user=await ctx.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if(!user||!(await checkPasswordForUser(ctx.env,user,pwd)))fail('LOGIN_FAILED','البريد أو كلمة المرور غير صحيحين',401);
    if(user.blocked)fail('ACCOUNT_BLOCKED','الحساب موقوف',403);
    return user;
  }catch(e){await refundRateLimitOnServerFailure(ctx.env,limitKey,e);throw e}
}
export async function register(ctx){
  const d=await body(ctx.request);
  const name=String(d.name||'').trim().slice(0,60);
  const {email,pwd}=validateLogin(d);
  if(name.length<2||pwd.length<10)fail('VALIDATION','الاسم حرفان على الأقل وكلمة المرور 10 أحرف على الأقل');
  assertHasherReady(ctx.env);
  const ip=ctx.request.headers.get('CF-Connecting-IP')||'local';
  const limitKey=`register:${ip}`;
  await rateLimit(ctx.env,limitKey,5,3600);
  try{
    const existing=await ctx.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
    if(existing)fail('EMAIL_EXISTS','هذا البريد مسجل مسبقًا',409);
    const salt=randomToken(16),hash=await hashPasswordForUser(ctx.env,pwd,salt,100000),id=uid();
    try{
      await ctx.env.DB.prepare('INSERT INTO users(id,name,email,password_hash,password_salt,password_iterations,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,name,email,hash,salt,100000,now()).run();
    }catch(e){if(String(e).includes('UNIQUE'))fail('EMAIL_EXISTS','هذا البريد مسجل مسبقًا',409);throw e}
    return json({ok:true,user:{id,name,email,role:'user',subscriptionActive:false,deviceBound:false}},201,{'set-cookie':await setSession(ctx.env,id)});
  }catch(e){await refundRateLimitOnServerFailure(ctx.env,limitKey,e);throw e}
}
export async function login(ctx){const u=await authenticate(ctx,await body(ctx.request));return json({ok:true,user:safeUser(u)},200,{'set-cookie':await setSession(ctx.env,u.id)});}
export async function mobileLogin(ctx){const u=await authenticate(ctx,await body(ctx.request));if(u.subscription_until<=now())fail('SUBSCRIPTION_REQUIRED','الاشتراك غير نشط',403);return json({ok:true,activationToken:await signedToken(ctx.env,u.id),expiresIn:300,deviceBound:!!u.device_public_key});}
export async function me(ctx){const u=await currentUser(ctx);const orders=(await ctx.env.DB.prepare('SELECT id,plan_id,amount_cents,status,created_at,paid_at,payment_url FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(u.id).all()).results;return json({ok:true,user:safeUser(u),orders});}
export async function logout(ctx){const tok=getCookie(ctx.request);if(tok)await ctx.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(tok)).run();return json({ok:true},200,{'set-cookie':cookie('',0)});}
