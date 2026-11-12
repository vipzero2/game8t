// Verify Cloudflare Cron invocations without granting public API callers or
// browser JavaScript access to the Stars reconciliation operation.
// Independent secret from SESSION_SECRET and TELEGRAM_WEBHOOK_SECRET.
import {base64url,constantTime,enc,hmac,now} from './common.js';

export const CRON_ROUTE='/api/telegram/reconcile/cron';
export const CRON_KEY_PREFIX='aim8:stars:cron:v1';
const NONCE_PREFIX='stars:cron:nonce:';
function validKey(value){
 return typeof value==='string'&&/^[A-Za-z0-9_-]{43,128}$/.test(value);
}
export async function authorizedStarsCron(request,env){
 if(request.method!=='POST'||new URL(request.url).pathname!==CRON_ROUTE)return false;
 if(!validKey(env.STARS_CRON_SECRET))return false;
 const stamp=request.headers.get('X-AIM8-Cron-Time')||'';
 const nonce=request.headers.get('X-AIM8-Cron-Nonce')||'';
 const signature=request.headers.get('X-AIM8-Cron-Signature')||'';
 if(!/^\d{10}$/.test(stamp)||!/^[A-Za-z0-9_-]{22}$/.test(nonce)||!/^[A-Za-z0-9_-]{43}$/.test(signature))
  return false;
 const t=now();
 if(Math.abs(t-Number(stamp))>120)return false;
 const message=CRON_KEY_PREFIX+'\n'+stamp+'\n'+nonce+'\nPOST\n'+CRON_ROUTE;
 const signed=base64url(await hmac(env.STARS_CRON_SECRET,message));
 if(!constantTime(enc.encode(signature),enc.encode(signed)))return false;
 // Reject replay, even with the correct signature. Keyed nonce is never
 // stored as plaintext; D1 unique insertion is atomic across instances.
 const key=NONCE_PREFIX+base64url(await hmac(env.STARS_CRON_SECRET,'nonce:'+nonce));
 const inserted=await env.DB.prepare('INSERT OR IGNORE INTO rate_limits(key,count,reset_at) VALUES(?,1,?)')
   .bind(key,t+300).run();
 if(inserted.meta?.changes!==1)return false;
 // Opportunistic compaction, at most once every 15 minutes.
 if(Math.floor(t/300)%3===0)await env.DB.prepare("DELETE FROM rate_limits WHERE key LIKE 'stars:cron:nonce:%' AND reset_at<?").bind(t).run();
 return true;
}
