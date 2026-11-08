export class ApiError extends Error {
  constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
export const now=()=>Math.floor(Date.now()/1000);
export const uid=()=>crypto.randomUUID();
export const enc=new TextEncoder();
export const fail=(code,message,status=400)=>{throw new ApiError(status,code,message)};
export function json(data,status=200,headers={}) {return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}})}
export function base64url(bytes){let s='';for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function unbase64url(s){if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s)||s.length>10000)fail('INVALID_ENCODING','صيغة غير صحيحة');const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));}
export function randomToken(n=32){return base64url(crypto.getRandomValues(new Uint8Array(n)))}
export async function sha256(s){const buf=await crypto.subtle.digest('SHA-256',enc.encode(s));return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')}
export async function hmac(key,message,hash='SHA-256'){const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(message)))}
export function constantTime(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
export async function body(request){if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail('CONTENT_TYPE','يجب إرسال JSON',415);if(Number(request.headers.get('content-length')||0)>16384)fail('TOO_LARGE','الطلب كبير',413);const raw=await request.text();if(raw.length>16384)fail('TOO_LARGE','الطلب كبير',413);try {const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_JSON','بيانات غير صحيحة');return value}catch {fail('INVALID_JSON','بيانات غير صحيحة')}}
export function method(request,allowed){if(!allowed.includes(request.method))fail('METHOD','طريقة الطلب غير مدعومة',405)}
export function siteOrigin(request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)fail('ORIGIN_DENIED','طلب من مصدر غير مسموح',403);const site=request.headers.get('sec-fetch-site');if(site==='cross-site')fail('ORIGIN_DENIED','طلب من مصدر غير مسموح',403);}
export function assertDb(env){if(!env.DB)fail('DATABASE_NOT_READY','قاعدة البيانات غير مربوطة بعد',503)}
export async function rateLimit(env,rawKey,max=8,windowSec=900){if(!env.SESSION_SECRET)fail('CONFIG_MISSING','إعداد السيرفر غير مكتمل',503);const key=base64url(await hmac(env.SESSION_SECRET,'rate:'+rawKey));const t=now();await env.DB.prepare(`INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at <= ? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at <= ? THEN ? ELSE reset_at END`).bind(key,t+windowSec,t,t,t+windowSec).run();const r=await env.DB.prepare('SELECT count FROM rate_limits WHERE key=?').bind(key).first();if((r?.count||0)>max)fail('RATE_LIMIT','محاولات كثيرة، حاول بعد فترة',429)}
export function safeUser(row){return {id:row.id,name:row.name,email:row.email,role:row.role,blocked:!!row.blocked,deviceBound:!!row.device_public_key,deviceBoundAt:row.device_bound_at,subscriptionUntil:row.subscription_until,subscriptionStartedAt:row.subscription_started_at,subscriptionActive:!row.blocked&&row.subscription_until>now(),createdAt:row.created_at}}
// Cloudflare Workers production rejects PBKDF2 iteration counts above 100,000.
// A separate server-side pepper adds protection if only the D1 database leaks.
// PASSWORD_PEPPER must be a long, stable Cloudflare secret; do not rotate casually.
export async function hashPassword(password,salt,iterations=100000,pepper){
  if(!pepper || pepper.length<32)fail('CONFIG_MISSING','مفتاح حماية كلمات المرور غير مضبوط على السيرفر',503);
  if(!Number.isInteger(iterations)||iterations!==100000)fail('PASSWORD_HASH_CONFIG','إعداد تجزئة كلمة المرور غير مدعوم',503);
  const keyed=await hmac(pepper,'AIM8:password:v1:'+password);
  const key=await crypto.subtle.importKey('raw',keyed,'PBKDF2',false,['deriveBits']);
  const b=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unbase64url(salt),iterations},key,256);
  return base64url(new Uint8Array(b));
}
export const cookieName='__Host-aim8_session';
export function getCookie(req){const re=new RegExp('(?:^|;\\s*)'+cookieName+'=([^;]+)');return req.headers.get('cookie')?.match(re)?.[1]||''}
export const cookie=(token,maxAge)=>`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export async function setSession(env,userId){const token=randomToken();await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)').bind(await sha256(token),userId,now(),now()+30*86400).run();return cookie(token,30*86400)}
export async function signedToken(env,userId){if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)fail('CONFIG_MISSING','مفتاح السيرفر غير مضبوط',503);const payload=base64url(enc.encode(JSON.stringify({uid:userId,exp:now()+300,nonce:randomToken(8)})));const sig=base64url(await hmac(env.SESSION_SECRET,payload));return payload+'.'+sig}
export async function verifySignedToken(env,token){if(!token||token.length>4096)fail('UNAUTHORIZED','جلسة التطبيق غير صالحة',401);const p=token.split('.');if(p.length!==2)fail('UNAUTHORIZED','جلسة التطبيق غير صالحة',401);const expected=await hmac(env.SESSION_SECRET,p[0]);if(!constantTime(expected,unbase64url(p[1])))fail('UNAUTHORIZED','جلسة التطبيق غير صالحة',401);let obj;try{obj=JSON.parse(new TextDecoder().decode(unbase64url(p[0])))}catch{fail('UNAUTHORIZED','جلسة التطبيق غير صالحة',401)}if(!obj.uid||obj.exp<now())fail('TOKEN_EXPIRED','جلسة التطبيق انتهت',401);return obj.uid}
export async function currentUser(ctx){const token=getCookie(ctx.request);if(!token)fail('UNAUTHORIZED','يرجى تسجيل الدخول',401);const record=await ctx.env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha256(token),now()).first();if(!record)fail('UNAUTHORIZED','انتهت الجلسة، سجل دخول من جديد',401);if(record.blocked)fail('ACCOUNT_BLOCKED','الحساب موقوف',403);return record;}
export async function requireAdmin(ctx){const u=await currentUser(ctx);if(u.role!=='admin')fail('FORBIDDEN','ليس لديك صلاحية',403);return u;}
export async function checkPassword(row,password,pepper){const hashed=await hashPassword(password,row.password_salt,row.password_iterations,pepper);return constantTime(unbase64url(hashed),unbase64url(row.password_hash));}


// Cloudflare Pages on Workers Free has a 10 ms CPU budget. Offload strong
// PBKDF2 hashing to a separately deployed SQLite-backed Durable Object.
export function assertHasherReady(env){
  if(env.DIRECT_HASH_IN_TEST===true){
    if(!env.PASSWORD_PEPPER||env.PASSWORD_PEPPER.length<32)fail('CONFIG_MISSING','مفتاح حماية الاختبار غير مضبوط',503);
    return;
  }
  if(!env.AUTH_HASHER)fail('HASHER_NOT_CONFIGURED','خدمة تشفير الحسابات غير مربوطة؛ أضف AUTH_HASHER إلى Pages',503);
}
export async function hashPasswordForUser(env,password,salt,iterations=100000){
  assertHasherReady(env);
  if(!Number.isInteger(iterations)||iterations!==100000)fail('PASSWORD_HASH_CONFIG','إعداد التشفير غير مدعوم',503);
  if(env.DIRECT_HASH_IN_TEST===true)return hashPassword(password,salt,iterations,env.PASSWORD_PEPPER);
  const objectId=env.AUTH_HASHER.idFromName('password-hashing-v1');
  let response;
  try{
    response=await env.AUTH_HASHER.get(objectId).fetch('https://aim8-hasher.internal/hash',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({password,salt,iterations})
    });
  }catch(err){console.error('Password hasher binding failed:',err?.message||err);fail('HASHER_UNAVAILABLE','خدمة تشفير كلمات المرور غير متاحة حاليًا',503)}
  if(!response.ok){
    const code=response.status===503?'HASHER_NOT_CONFIGURED':'HASHER_UNAVAILABLE';
    console.error('Password hasher refused operation:',response.status);
    fail(code,'تعذر التحقق من كلمة المرور؛ راجع إعدادات AUTH_HASHER وPASSWORD_PEPPER',503)
  }
  let data;
  try{data=await response.json()}catch{fail('HASHER_UNAVAILABLE','استجابة خدمة التشفير غير صحيحة',503)}
  if(!data||typeof data.hash!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.hash))fail('HASHER_UNAVAILABLE','استجابة خدمة التشفير غير صحيحة',503);
  return data.hash;
}
export async function checkPasswordForUser(env,row,password){
  const hashed=await hashPasswordForUser(env,password,row.password_salt,row.password_iterations);
  return constantTime(unbase64url(hashed),unbase64url(row.password_hash));
}
// Forgive login/signup rate counter for unexpected server-side failures.
export async function refundRateLimitOnServerFailure(env,rawKey,error){
  if(error instanceof ApiError&&error.status<500)return;
  try{
    const key=base64url(await hmac(env.SESSION_SECRET,'rate:'+rawKey));
    await env.DB.prepare('UPDATE rate_limits SET count=MAX(0,count-1) WHERE key=?').bind(key).run();
  }catch(ex){console.error('Could not refund failed auth attempt:',ex?.message||ex)}
}
