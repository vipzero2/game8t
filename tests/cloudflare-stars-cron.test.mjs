import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequest} from '../functions/api/[[path]].js';
import {runStarsCron} from '../workers/stars-cron/index.js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const path of ['db/schema.sql','db/002_email_security.sql',
  'db/003_telegram_stars.sql','db/004_subscription_grants.sql',
  'db/005_stars_plans_90_180_365.sql','db/006_telegram_device_codes.sql'])
  db.exec(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 function stmt(sql,args=[]){return{
  bind(...values){return stmt(sql,values)},
  async first(){return db.prepare(sql).get(...args)||null},
  async all(){return {results:db.prepare(sql).all(...args)}},
  async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}}}
 }}
 const DB={prepare(sql){return stmt(sql)},async batch(items){
  db.exec('BEGIN');try{
   const results=[];for(const x of items)results.push(await x.run());
   db.exec('COMMIT');return results;
  }catch(e){db.exec('ROLLBACK');throw e}
 }};
 const env={DB,STARS_CRON_SECRET:'AIM8_Cloudflare_Cron_Test_secret_with_64_urlsafe_chars_______________',
  TELEGRAM_BOT_TOKEN:'mock-tg-token'};
 const originalFetch=globalThis.fetch,telegramMethods=[];
 globalThis.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://api.telegram.org/bot'))return originalFetch(url,options);
  const method=String(url).split('/').at(-1);telegramMethods.push(method);
  if(method==='getStarTransactions')return Response.json({ok:true,result:{transactions:[]}});
  if(method==='getMyStarBalance')return Response.json({ok:true,result:{amount:12}});
  return Response.json({ok:true,result:true});
 };
 async function api(url,init){
  const request=new Request(url,init);
  const response=await onRequest({request,env,params:{path:['telegram','reconcile','cron']}});
  return response;
 }
 async function admin(){
  const req=new Request('https://8aim.site/api/admin/telegram/reconcile/status');
  return onRequest({request:req,env,params:{path:['admin','telegram','reconcile','status']}});
 }
 return {db,env,api,admin,telegramMethods,restore(){globalThis.fetch=originalFetch;db.close()}};
}

test('Cloudflare Cron calls the real Stars scanner on Pages with signed HMAC and stores separate health',async()=>{
 const x=fixture();try{
  let sent;
  const result=await runStarsCron(x.env,async(url,opts)=>{
   sent={url,opts};return x.api(url,opts);
  });
  assert.equal(result.ok,true);
  assert.equal(result.source,'cloudflare-cron');
  assert.equal(result.balance,12);
  assert.equal(result.scanned,0);
  assert.match(sent.url,/^https:\/\/8aim\.site\/api\/telegram\/reconcile\/cron$/);
  assert.match(sent.opts.headers['X-AIM8-Cron-Signature'],/^[A-Za-z0-9_-]{43}$/);
  assert.equal(x.telegramMethods.filter(x=>x==='getStarTransactions').length,1);
  const last=x.db.prepare("SELECT reset_at FROM rate_limits WHERE key='stars:cron:lastSuccess'").get();
  assert.ok(last?.reset_at);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS total FROM rate_limits WHERE key LIKE 'stars:cron:nonce:%'").get().total,1);
  const repeated=await x.api(sent.url,sent.opts);
  assert.equal(repeated.status,401,'signed request cannot be replayed');
  assert.equal(x.telegramMethods.filter(x=>x==='getStarTransactions').length,1);
 }finally{x.restore()}
});

test('Cron HMAC rejects missing, wrong and expired credentials; missing secret never runs scan',async()=>{
 const x=fixture();try{
  const url='https://8aim.site/api/telegram/reconcile/cron';
  assert.equal((await x.api(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
  assert.equal(x.telegramMethods.length,0);
  const invalidSecret={...x.env,STARS_CRON_SECRET:'B'.repeat(43)};
  await assert.rejects(()=>runStarsCron(invalidSecret,(u,i)=>x.api(u,i)),/HTTP 401/);
  assert.equal(x.telegramMethods.length,0);
  await assert.rejects(()=>runStarsCron({STARS_CRON_SECRET:'short'},(u,i)=>x.api(u,i)),/missing or invalid/);
  assert.equal(x.telegramMethods.length,0);
 }finally{x.restore()}
});

test('scheduled-only Worker does not expose an HTTP entrypoint',async()=>{
 const handler=(await import('../workers/stars-cron/index.js')).default;
 const response=await handler.fetch(new Request('https://worker.invalid/'));
 assert.equal(response.status,404);
 let promise;
 const x=fixture();try{
  await handler.scheduled({cron:'2-59/5 * * * *'},x.env,{
   waitUntil(p){promise=p}
  });
  assert.ok(promise,'scheduled handler must keep the scan alive with waitUntil');
  // Direct global fetch in this test is the Telegram API mock, not Pages, so
  // only assert the promise is registered. Swallow its expected mock failure.
  await promise.catch(()=>{});
 }finally{x.restore()}
});
