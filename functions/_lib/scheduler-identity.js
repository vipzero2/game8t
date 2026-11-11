// Authenticate the scheduled GitHub Action with GitHub's short-lived OIDC
// identity token: no long-lived GitHub or Cloudflare secret shared in workflow.
// All claims and the RSA signature MUST verify before touching the bot token.
import {unbase64url} from './common.js';

const ISSUER='https://token.actions.githubusercontent.com';
const AUDIENCE='https://8aim.site/api/telegram/reconcile';
const WORKFLOW='vipzero2/game8t/.github/workflows/stars-reconcile.yml@refs/heads/main';
const REPOSITORY_ID='1450433976';
const JWKS='https://token.actions.githubusercontent.com/.well-known/jwks';

export async function authorizedScheduledRun(request){
 const auth=request.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._-]{100,12000}$/.test(auth))return false;
 const parts=auth.slice(7).split('.');
 if(parts.length!==3||parts.some(p=>p.length>11000))return false;
 try{
  const header=JSON.parse(new TextDecoder().decode(unbase64url(parts[0])));
  const claims=JSON.parse(new TextDecoder().decode(unbase64url(parts[1])));
  const t=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string')return false;
  if(claims.iss!==ISSUER||claims.aud!==AUDIENCE||
     String(claims.repository_id)!==REPOSITORY_ID||
     claims.repository!=='vipzero2/game8t'||
     claims.ref!=='refs/heads/main'||
     claims.workflow_ref!==WORKFLOW||
     !['schedule','workflow_dispatch'].includes(claims.event_name)||
     typeof claims.exp!=='number'||claims.exp<=t||
     typeof claims.iat!=='number'||claims.iat>t+60||claims.iat<t-3600||
     (claims.nbf!=null&&(typeof claims.nbf!=='number'||claims.nbf>t+60)))return false;
  const response=await fetch(JWKS,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)return false;
  const keys=(await response.json()).keys;
  const key=Array.isArray(keys)&&keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig'));
  if(!key)return false;
  const publicKey=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,unbase64url(parts[2]),
    new TextEncoder().encode(parts[0]+'.'+parts[1]));
 }catch(e){console.error('Invalid GitHub scheduler identity:',String(e?.message||e));return false;}
}
