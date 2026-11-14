// Passwordless identity verification for the standalone crypto checkout.
// A typed Telegram ID is never accepted as proof of ownership.
import {body, fail, json, now, randomToken, rateLimit, sha256} from './common.js';
import {telegram} from './telegram.js';
import {ensureTelegramAccount} from './telegram-license.js';

const TOKEN=/^[A-Za-z0-9_-]{32}$/;
const LIFE=600;
function tokenFrom(data){
 const token=String(data.token||'').trim();
 if(!TOKEN.test(token))fail('VERIFICATION_TOKEN','رمز التحقق غير صحيح',400);
 return token;
}

export async function startCryptoIdentity(ctx){
 if(ctx.env.NOWPAYMENTS_ENABLED!=='true')fail('CRYPTO_DISABLED','شراء العملات الرقمية غير مفعّل',503);
 const ip=ctx.request.headers.get('CF-Connecting-IP')||'local';
 await rateLimit(ctx.env,'nowpayments:start:'+ip,8,900);
 const bot=await telegram(ctx.env,'getMe',{});
 const name=String(bot?.username||'');
 if(!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name))
  fail('BOT_NOT_READY','البوت غير جاهز',503);
 const token=randomToken(24),created=now();
 await ctx.env.DB.prepare('INSERT INTO nowpayments_verifications(token_hash,created_at,expires_at) VALUES(?,?,?)')
  .bind(await sha256(token),created,created+LIFE).run();
 return json({ok:true,token,expiresIn:LIFE,botUrl:'https://t.me/'+name+'?start=npv_'+token});
}

export async function identityStatus(ctx){
 const data=await body(ctx.request),hash=await sha256(tokenFrom(data));
 const row=await ctx.env.DB.prepare(
  'SELECT telegram_user_id,verified_at,expires_at,used_at FROM nowpayments_verifications WHERE token_hash=?'
 ).bind(hash).first();
 if(!row||row.expires_at<=now())return json({ok:true,verified:false,expired:true});
 return json({ok:true,verified:row.verified_at!=null,telegramId:row.verified_at?row.telegram_user_id:null,used:row.used_at!=null});
}

export async function verifiedChallenge(env,token){
 const hash=await sha256(tokenFrom({token}));
 const row=await env.DB.prepare(
  'SELECT * FROM nowpayments_verifications WHERE token_hash=? AND expires_at>? AND verified_at IS NOT NULL AND used_at IS NULL'
 ).bind(hash,now()).first();
 if(!row)fail('IDENTITY_REQUIRED','أكمل التحقق من Telegram ID أولاً أو ابدأ طلباً جديداً',403);
 return row;
}

export async function completeCryptoIdentity(env,token,from,chat){
 if(!TOKEN.test(String(token||'')))return false;
 const tgId=String(from?.id||''),chatId=String(chat||'');
 if(!/^[1-9][0-9]{0,15}$/.test(tgId)||tgId!==chatId)return false;
 const hash=await sha256(token);
 const row=await env.DB.prepare(
  'SELECT token_hash FROM nowpayments_verifications WHERE token_hash=? AND expires_at>? AND verified_at IS NULL AND used_at IS NULL'
 ).bind(hash,now()).first();
 if(!row)return false;
 const account=await ensureTelegramAccount(env,tgId,chatId,from);
 const result=await env.DB.prepare(
  'UPDATE nowpayments_verifications SET telegram_user_id=?,user_id=?,chat_id=?,verified_at=? WHERE token_hash=? AND expires_at>? AND verified_at IS NULL AND used_at IS NULL'
 ).bind(tgId,account.user_id,chatId,now(),hash,now()).run();
 return result.meta?.changes===1;
}
