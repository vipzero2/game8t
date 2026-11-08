// Internal-only password hash service; no public HTTP interface.
const enc=new TextEncoder();
const encode=(bytes)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decode(value){
  if(typeof value!=='string'||!/^[-_A-Za-z0-9]{22}$/.test(value))throw Error('invalid salt');
  const raw=value.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(raw+'=='),c=>c.charCodeAt(0));
}
export class PasswordHasher{
  constructor(state,env){this.env=env;}
  async fetch(req){
    if(req.method!=='POST'||new URL(req.url).pathname!=='/hash')return new Response('Not found',{status:404});
    if(!this.env.PASSWORD_PEPPER||this.env.PASSWORD_PEPPER.length<32)return new Response('Hasher secret missing',{status:503});
    let d;
    try{if(Number(req.headers.get('content-length')||0)>2048)return new Response('Too large',{status:413});d=await req.json()}
    catch{return new Response('Bad JSON',{status:400})}
    const password=d?.password;
    if(typeof password!=='string'||password.length>256||d.iterations!==100000)return new Response('Invalid request',{status:400});
    let salt;try{salt=decode(d.salt)}catch{return new Response('Invalid salt',{status:400})}
    try{
      const hmacKey=await crypto.subtle.importKey('raw',enc.encode(this.env.PASSWORD_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const keyed=await crypto.subtle.sign('HMAC',hmacKey,enc.encode('AIM8:password:v1:'+password));
      const pbkdfKey=await crypto.subtle.importKey('raw',keyed,'PBKDF2',false,['deriveBits']);
      const derived=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},pbkdfKey,256);
      return Response.json({hash:encode(new Uint8Array(derived))},{headers:{'cache-control':'no-store'}});
    }catch(err){console.error('Hasher error:',err?.message||err);return new Response('Hashing failed',{status:500})}
  }
}
export default {fetch(){return new Response('Not found',{status:404})}};
