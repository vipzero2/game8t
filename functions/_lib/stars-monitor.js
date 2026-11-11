// Telegram Stars ledger monitor. The stable charge ID, not just a Telegram
// account ID or a change in the bot's balance, identifies a refundable grant.
// All persistence uses existing D1 tables; no production migration required.
import {sha256, now, json, requireAdmin} from './common.js';
import {telegram,applyRefund} from './telegram.js';

const LEASE='stars:monitor:lease';
const LAST='stars:monitor:lastSuccess';
const BALANCE='stars:monitor:balance';
const LAST_ERROR='stars:monitor:lastError';
const TRUNCATED='stars:monitor:truncated';
const PAGE_SIZE=100;
const MAX_PAGES=8; // 800 recent movements per pass. Flag truncation for review.

async function saveMetric(db,key,count,stamp=now()){
 await db.prepare('INSERT INTO rate_limits(key,count,reset_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,reset_at=excluded.reset_at')
  .bind(key,count,stamp).run();
}
async function alert(env,kind,tx,amount){
 const hash=(await sha256(String(tx.id||'unknown')+':'+kind)).slice(0,32);
 const key='stars:monitor:alert:'+kind+':'+hash;
 // Do not log raw transaction identifiers or private customer information.
 await env.DB.prepare('INSERT OR IGNORE INTO rate_limits(key,count,reset_at) VALUES(?,?,?)')
  .bind(key,Math.min(2147483647,Math.abs(amount)),now()).run();
}
function refundPartnerMatches(tx,order){
 const partner=tx.receiver;
 if(!partner)return true; // A transaction charge ID and amount remain authoritative.
 if(partner.type!=='user')return false;
 if(partner.user?.id!=null&&String(partner.user.id)!==order.telegram_user_id)return false;
 if(partner.invoice_payload!=null&&partner.invoice_payload!==order.id)return false;
 if(partner.transaction_type!=null&&partner.transaction_type!=='invoice_payment')return false;
 return true;
}
function ledgerAmount(tx){return typeof tx?.amount==='number'&&Number.isSafeInteger(tx.amount)?tx.amount:NaN;}

async function lease(db,t){
 const r=await db.prepare(
  'INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET reset_at=excluded.reset_at WHERE rate_limits.reset_at<?'
 ).bind(LEASE,t+240,t).run();
 return r.meta?.changes===1;
}
async function release(db){await db.prepare('UPDATE rate_limits SET reset_at=? WHERE key=?').bind(now(),LEASE).run();}

export async function reconcileStars(env){
 if(!env?.DB||!env.TELEGRAM_BOT_TOKEN)throw Error('Missing D1 or Telegram bot configuration');
 const t=now();
 if(!await lease(env.DB,t))return {ok:true,skipped:true,reason:'scan_already_running'};
 try{
  const paid=(await env.DB.prepare(
   "SELECT id,telegram_user_id,telegram_charge_id,stars_amount,status FROM telegram_orders WHERE telegram_charge_id IS NOT NULL AND status IN ('paid','redeemed')"
  ).all()).results;
  const orders=new Map(paid.map(o=>[o.telegram_charge_id,o]));
  let checked=0,pages=0,revoked=0,alerts=0,unmatched=0,hasMore=false;
  const seen=new Set();
  for(let page=0;page<MAX_PAGES;page++){
   const result=await telegram(env,'getStarTransactions',{offset:page*PAGE_SIZE,limit:PAGE_SIZE});
   const txns=result?.transactions;
   if(!Array.isArray(txns))throw Error('Unexpected getStarTransactions response');
   pages++;
   for(const tx of txns){
    checked++;
    if(!tx||typeof tx.id!=='string'||tx.id.length>300)continue;
    const amount=ledgerAmount(tx);
    if(!Number.isFinite(amount)||amount>=0)continue;
    // A negative ledger line can also be a regular withdrawal, ad spend,
    // or transfer. Never cancel users based on amount or partner ID alone.
    const order=orders.get(tx.id);
    if(!order){
     // Unknown negative movement: retain anonymized evidence for admin review.
     await alert(env,'unmatched',tx,amount);
     unmatched++;continue;
    }
    if(!refundPartnerMatches(tx,order)||amount!==-order.stars_amount){
     await alert(env,'mismatch',tx,amount);alerts++;continue;
    }
    if(seen.has(tx.id))continue;
    seen.add(tx.id);
    // The exact original charge + exact refund amount are proven by
    // Telegram's authenticated getStarTransactions response.
    await env.DB.prepare(
     'INSERT OR IGNORE INTO telegram_refund_inbox(telegram_charge_id,telegram_user_id,currency,stars_amount,payload,received_at) VALUES(?,?,?,?,?,?)'
    ).bind(order.telegram_charge_id,order.telegram_user_id,'XTR',order.stars_amount,order.id,now()).run();
    const applied=await applyRefund(env,order.telegram_charge_id);
    if(!applied)throw Error('Matching Stars refund could not be reconciled');
    revoked++;
   }
   if(txns.length<PAGE_SIZE){hasMore=false;break;}
   hasMore=page===MAX_PAGES-1;
  }
  await saveMetric(env.DB,TRUNCATED,hasMore?1:0);
  // Monitor the balance as a diagnostic only. A balance decrease is NOT
  // evidence that any particular buyer refunded a payment.
  let balance=null,drop=0;
  try{
   const current=await telegram(env,'getMyStarBalance',{});
   if(Number.isSafeInteger(current?.amount)){
    balance=current.amount;
    const previous=await env.DB.prepare('SELECT count FROM rate_limits WHERE key=?').bind(BALANCE).first();
    if(previous&&balance<previous.count){
     drop=previous.count-balance;
     await saveMetric(env.DB,'stars:monitor:balanceDrop',drop);
    }
    await saveMetric(env.DB,BALANCE,balance);
   }
  }catch(e){console.error('Stars balance diagnostic unavailable:',String(e?.message||e));}
  await saveMetric(env.DB,LAST,revoked);
  await saveMetric(env.DB,LAST_ERROR,0);
  return {ok:true,scanned:checked,pages,revoked,unmatched,alerts,balance,drop,truncated:hasMore};
 }catch(error){
  await saveMetric(env.DB,LAST_ERROR,1);
  console.error('Stars reconciliation failed:',String(error?.message||error));
  throw error;
 }finally{
  await release(env.DB);
 }
}

export async function adminScan(ctx){
 await requireAdmin(ctx);
 return json(await reconcileStars(ctx.env));
}
export async function monitorStatus(ctx){
 await requireAdmin(ctx);
 const data=(await ctx.env.DB.prepare(
  "SELECT key,count,reset_at FROM rate_limits WHERE key IN (?,?,?,?,?) OR key LIKE 'stars:monitor:alert:%' ORDER BY reset_at DESC LIMIT 100"
 ).bind(LAST,BALANCE,LAST_ERROR,TRUNCATED,'stars:monitor:balanceDrop').all()).results;
 const get=k=>data.find(x=>x.key===k);
 return json({ok:true,lastSync:get(LAST)?.reset_at||null,lastRevocations:get(LAST)?.count||0,
  balance:get(BALANCE)?.count??null,balanceAt:get(BALANCE)?.reset_at||null,
  lastError:!!get(LAST_ERROR)?.count,truncated:!!get(TRUNCATED)?.count,
  lastBalanceDrop:get('stars:monitor:balanceDrop')?.count||0,
  unmatchedAlerts:data.filter(x=>x.key.startsWith('stars:monitor:alert:')).length});
}
