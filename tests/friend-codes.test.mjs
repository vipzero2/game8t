import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createSign,generateKeyPairSync,randomBytes,createHash} from 'node:crypto';
import {onRequest} from '../functions/api/[[path]].js';
import {ensureTelegramAccount} from '../functions/_lib/telegram-license.js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const path of ['db/schema.sql','db/002_email_security.sql','db/003_telegram_stars.sql',
    'db/004_subscription_grants.sql','db/005_stars_plans_90_180_365.sql','db/006_telegram_device_codes.sql'])
  db.exec(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 function stmt(sql,args=[]){return {bind(...v){return stmt(sql,v)},
  async first(){return db.prepare(sql).get(...args)||null},
  async all(){return {results:db.prepare(sql).all(...args)}},
  async run(){const row=db.prepare(sql).run(...args);return {meta:{changes:row.changes}}}};}
 const DB={prepare(sql){return stmt(sql)},async batch(items){
  db.exec('BEGIN');try{const rows=[];for(const item of items)rows.push(await item.run());db.exec('COMMIT');return rows}
  catch(err){db.exec('ROLLBACK');throw err}
 }};
 const env={DB,SESSION_SECRET:'friend-test-session-secret-12345678901234567890'};
 const t=Math.floor(Date.now()/1000),token=randomBytes(32).toString('hex');
 db.prepare(`INSERT INTO users(id,name,email,password_hash,password_salt,password_iterations,role,created_at)
 VALUES('friend-admin','Admin','owner@example.com','h','s',100000,'admin',?)`).run(t);
 db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
  .run(createHash('sha256').update(token).digest('hex'),'friend-admin',t+86400,t);
 async function call(path,method='GET',payload=null,admin=false){
  const request=new Request('https://8aim.site/api'+path,{method,headers:{
   'content-type':'application/json',...(method==='GET'?{}:{origin:'https://8aim.site'}),
   ...(admin?{cookie:'__Host-aim8_session='+token}:{})},
   ...(method==='GET'?{}:{body:JSON.stringify(payload||{})})});
  const res=await onRequest({request,env,params:{path:path.slice(1).split('/')}});
  return {status:res.status,data:await res.json()};
 }
 function phone(){
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const publicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64url');
  function sign(message){return createSign('SHA256').update(message).end()
    .sign({key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}
  return {publicKey,sign};
 }
 return {db,env,call,phone,close(){db.close()}};
}

test('Owner can target an ID before /start, then grant one package on first Android activation',async()=>{
 const x=fixture();
 try{
  const id='81234567';
  const unauthorized=await x.call('/admin/friend-codes/issue','POST',{telegramId:id,planId:'quarter'});
  assert.equal(unauthorized.status,401);
  const issue=await x.call('/admin/friend-codes/issue','POST',{telegramId:id,planId:'quarter'},true);
  assert.equal(issue.status,200,JSON.stringify(issue.data));
  assert.match(issue.data.code,/^A8-[A-Za-z0-9_-]{28}$/);
  assert.equal(issue.data.durationDays,90);
  assert.equal(issue.data.telegramConnected,false);
  assert.ok(issue.data.expiresAt>Math.floor(Date.now()/1000));
  const hash=createHash('sha256').update(issue.data.code).digest('hex');
  assert.equal(x.db.prepare('SELECT code_hash FROM friend_activation_codes WHERE id=?').get(issue.data.id).code_hash,hash);
  const duplicate=await x.call('/admin/friend-codes/issue','POST',{telegramId:id,planId:'half'},true);
  assert.equal(duplicate.status,409,'do not overwrite an unredeemed code');
  const p=x.phone(),fakeCh=await x.call('/telegram/device/challenge','POST',{telegramId:id});
  const beforeStart=await x.call('/telegram/device/activate','POST',{code:issue.data.code,
   challengeId:fakeCh.data.challengeId,publicKey:p.publicKey,
   signature:p.sign('AIM8:telegram:activate:'+fakeCh.data.challengeId+':'+fakeCh.data.nonce)});
  assert.equal(beforeStart.status,409,'the real Telegram owner must first establish their account via bot');
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM subscription_grants').get().n,0);
  await ensureTelegramAccount(x.env,id,id,{first_name:'Friend'});
  const ch=await x.call('/telegram/device/challenge','POST',{telegramId:id});
  assert.equal(ch.status,200);
  const activated=await x.call('/telegram/device/activate','POST',{code:issue.data.code,
   publicKey:p.publicKey,challengeId:ch.data.challengeId,
   signature:p.sign('AIM8:telegram:activate:'+ch.data.challengeId+':'+ch.data.nonce)});
  assert.equal(activated.status,200,JSON.stringify(activated.data));
  assert.equal(activated.data.gift,true);
  assert.equal(activated.data.telegramId,id);
  assert.ok(activated.data.subscriptionUntil>Math.floor(Date.now()/1000)+89*86400);
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM telegram_orders').get().n,0,
    'gift must not forge a paid Telegram order');
  assert.equal(x.db.prepare("SELECT COUNT(*) n FROM subscription_grants WHERE source='manual'").get().n,1);
  const extraGift=await x.call('/admin/friend-codes/issue','POST',{telegramId:id,planId:'half'},true);
  assert.equal(extraGift.status,200);
  const intruder=x.phone(),anotherChallenge=await x.call('/telegram/device/challenge','POST',{telegramId:id});
  const blockedOtherDevice=await x.call('/telegram/device/activate','POST',{code:extraGift.data.code,
   publicKey:intruder.publicKey,challengeId:anotherChallenge.data.challengeId,
   signature:intruder.sign('AIM8:telegram:activate:'+anotherChallenge.data.challengeId+':'+anotherChallenge.data.nonce)});
  assert.equal(blockedOtherDevice.status,409,'second Android device is denied even with the right ID and gift');
  assert.equal(x.db.prepare("SELECT COUNT(*) n FROM subscription_grants WHERE source='manual'").get().n,1,
    'failed second-device attempt must not add time');
  const acceptedSameDevice=await x.call('/telegram/device/activate','POST',{code:extraGift.data.code,
   publicKey:p.publicKey,challengeId:anotherChallenge.data.challengeId,
   signature:p.sign('AIM8:telegram:activate:'+anotherChallenge.data.challengeId+':'+anotherChallenge.data.nonce)});
  assert.equal(acceptedSameDevice.status,200,'existing device can receive later gift codes');
  assert.ok(acceptedSameDevice.data.subscriptionUntil>=activated.data.subscriptionUntil+179*86400);
  const replay=await x.call('/telegram/device/activate','POST',{code:issue.data.code,
   publicKey:p.publicKey,challengeId:ch.data.challengeId,signature:p.sign('unused')});
  assert.equal(replay.status,409,'activation code is burned');
  const list=await x.call('/admin/friend-codes','GET',null,true);
  assert.equal(list.status,200);
  assert.equal(list.data.codes.filter(c=>c.status==='redeemed').length,2);
  assert.equal(JSON.stringify(list.data).includes(issue.data.code),false,'never show stored codes again');
 }finally{x.close()}
});

test('Owner can cancel an unused code; another ID cannot take a friend gift',async()=>{
 const x=fixture();
 try{
  const a='81234569',b='81234570';
  const issue=await x.call('/admin/friend-codes/issue','POST',{telegramId:a,planId:'year'},true);
  assert.equal(issue.status,200);
  await ensureTelegramAccount(x.env,b,b,{first_name:'Wrong user'});
  const ch=await x.call('/telegram/device/challenge','POST',{telegramId:b}),p=x.phone();
  const wrong=await x.call('/telegram/device/activate','POST',{code:issue.data.code,
   publicKey:p.publicKey,challengeId:ch.data.challengeId,
   signature:p.sign('AIM8:telegram:activate:'+ch.data.challengeId+':'+ch.data.nonce)});
  assert.equal(wrong.status,409,'a device challenge for another Telegram ID cannot redeem this gift');
  const cancel=await x.call('/admin/friend-codes/cancel','POST',{id:issue.data.id},true);
  assert.equal(cancel.status,200);
  const repeated=await x.call('/admin/friend-codes/cancel','POST',{id:issue.data.id},true);
  assert.equal(repeated.status,409);
  const next=await x.call('/admin/friend-codes/issue','POST',{telegramId:a,planId:'half'},true);
  assert.equal(next.status,200,'cancel frees ID for a new code');
  const list=await x.call('/admin/friend-codes','GET',null,true);
  assert.deepEqual(list.data.codes.map(r=>r.status).sort(),['cancelled','ready']);
 }finally{x.close()}
});

test('Site owner console has a gift-only ID and package form while old controls are collapsed',()=>{
 const html=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/assets/main.js',import.meta.url),'utf8');
 assert.match(html,/id="friendCodeForm"/);
 assert.match(html,/id="friendTelegramId"/);
 assert.match(html,/id="friendPlanId"/);
 assert.match(html,/id="friendIssuedCode"/);
 assert.match(html,/admin-advanced/);
 assert.match(js,/post\('\/admin\/friend-codes\/issue'/);
 assert.match(js,/friendCodesInit\(\)/);
});
