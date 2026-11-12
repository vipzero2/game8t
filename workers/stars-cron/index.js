// Cloudflare Worker: tiny, scheduled-only caller of AIM8's existing refund
// reconciliation. No D1 or Telegram bot token is copied into this Worker.
// The Pages endpoint does the actual scanning under its existing D1 lease.
const ENDPOINT='https://8aim.site/api/telegram/reconcile/cron';
const ROUTE='/api/telegram/reconcile/cron';
const PREFIX='aim8:stars:cron:v1';
function b64(bytes){
 let s='';for(const b of bytes)s+=String.fromCharCode(b);
 return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
export async function runStarsCron(env,fetcher=fetch){
 const secret=env?.STARS_CRON_SECRET;
 if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(secret))
  throw Error('STARS_CRON_SECRET missing or invalid in Worker');
 const stamp=String(Math.floor(Date.now()/1000));
 const nonce=b64(crypto.getRandomValues(new Uint8Array(16)));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const message=PREFIX+'\n'+stamp+'\n'+nonce+'\nPOST\n'+ROUTE;
 const signature=b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message))));
 const response=await fetcher(ENDPOINT,{
  method:'POST',
  headers:{
   'content-type':'application/json',
   'accept':'application/json',
   'X-AIM8-Cron-Time':stamp,
   'X-AIM8-Cron-Nonce':nonce,
   'X-AIM8-Cron-Signature':signature
  },
  body:'{}',
  redirect:'manual', // Never follow a login redirect with signed Cron headers.
  signal:AbortSignal.timeout(150000)
 });
 const contentType=(response.headers.get('content-type')||'').toLowerCase();
 if(response.status>=300&&response.status<400){
  const location=response.headers.get('location')||'';
  let destination='unknown';
  try{destination=new URL(location,ENDPOINT).hostname}catch{}
  throw Error('AIM8 Stars Cron redirect HTTP '+response.status+' to '+destination);
 }
 if(!response.ok)throw Error('AIM8 Stars Cron endpoint returned HTTP '+response.status);
 if(!contentType.includes('application/json')){
  const mitigated=response.headers.get('cf-mitigated')||'none';
  let source='unknown';
  try{source=new URL(response.url).hostname}catch{}
  throw Error('AIM8 Stars Cron unexpected HTTP '+response.status+' type '+
   (contentType.slice(0,80)||'missing')+' source '+source+' cf-mitigated '+mitigated);
 }
 let result;
 try{result=await response.json()}catch{throw Error('AIM8 Stars Cron response is not valid JSON')}
 if(result?.ok!==true)throw Error('AIM8 Stars reconciliation reported failure');
 console.log('Stars Cron completed',{scanned:result.scanned||0,revoked:result.revoked||0,
  truncated:!!result.truncated,skipped:!!result.skipped});
 return result;
}
export default {
 fetch(){return new Response('Not Found',{status:404})},
 async scheduled(_event,env,ctx){
  ctx.waitUntil(runStarsCron(env));
 }
};
