import { ApiError, body, constantTime, currentUser, enc, fail, hmac, json, now, randomToken, requireAdmin, sha256, uid, base64url } from './common.js';
import { entitlementEndSql } from './grants.js';

const site = 'https://8aim.site';

async function telegram(env, method, args) {
  if (!env.TELEGRAM_BOT_TOKEN) fail('BOT_NOT_CONFIGURED', 'توكن تيليجرام غير مضبوط', 503);
  const response = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args || {}), signal: AbortSignal.timeout(8000)
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true) {
    console.error('Telegram API error:', method, data.error_code, data.description);
    fail('TELEGRAM_UNAVAILABLE', 'تعذر التواصل مع تيليجرام', 502);
  }
  return data.result;
}

async function send(env, chat, text, markup) {
  return telegram(env, 'sendMessage', { chat_id: chat, text, ...(markup ? { reply_markup: markup } : {}) });
}
function codeFor(env, chargeId) {
  return hmac(env.SESSION_SECRET, 'aim8:stars:code:v1:' + chargeId)
    .then(bytes => 'A8-' + base64url(bytes).slice(0, 28));
}
async function webhookSecret(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
    fail('CONFIG_MISSING', 'مفتاح الخادم غير مضبوط', 503);
  return base64url(await hmac(env.SESSION_SECRET, 'aim8:telegram:webhook:v1'));
}
function sameSecret(received, expected) {
  return constantTime(enc.encode(received), enc.encode(expected));
}
function fromId(v) { return String(v || ''); }
function goodPlan(p) {
  return p && ['quarter', 'half', 'year'].includes(p.id) && p.stars_enabled === 1 && Number.isSafeInteger(p.stars_price) && p.stars_price > 0;
}
async function sendInvoice(env, chatId, telegramId, planId) {
  const account = await env.DB.prepare('SELECT * FROM telegram_accounts WHERE telegram_user_id=?').bind(telegramId).first();
  if (!account || account.chat_id !== chatId) {
    await send(env, chatId, 'افتح حسابك في ' + site + ' ثم اضغط اشتراك Telegram Stars لربط الحساب.');
    return;
  }
  const plan = await env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(planId).first();
  if (!goodPlan(plan)) {
    await send(env, chatId, 'الباقة غير مفعلة للدفع بالنجوم حالياً.');
    return;
  }
  const orderId = 'ts_' + uid();
  await env.DB.prepare('INSERT INTO telegram_orders(id,user_id,telegram_user_id,chat_id,plan_id,duration_days,stars_amount,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(orderId, account.user_id, telegramId, chatId, plan.id, plan.days, plan.stars_price, now()).run();
  await telegram(env, 'sendInvoice', {
    chat_id: chatId, title: 'AIM8 - ' + plan.name,
    description: 'اشتراك AIM8 لمدة ' + plan.days + ' يوم. يصدر كود صالح 24 ساعة بعد الدفع.',
    payload: orderId, currency: 'XTR',
    prices: [{ label: plan.name, amount: plan.stars_price }],
    start_parameter: 'aim8-payment'
  });
}

export async function startLink(ctx) {
  const user = await currentUser(ctx);
  if (!user.email_verified) fail('EMAIL_UNVERIFIED', 'أكد بريدك أولاً', 403);
  const d = await body(ctx.request);
  const plan = await ctx.env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(String(d.planId || '')).first();
  if (!goodPlan(plan)) fail('PLAN_DISABLED', 'هذه الباقة غير مفعلة للنجوم بعد');
  const bot = await telegram(ctx.env, 'getMe', {});
  const username = String(bot.username || '');
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) fail('BOT_USERNAME', 'اسم البوت غير صالح', 503);
  const token = randomToken(24);
  await ctx.env.DB.prepare('INSERT INTO telegram_links(token_hash,user_id,plan_id,expires_at,created_at) VALUES(?,?,?,?,?)')
    .bind(await sha256(token), user.id, plan.id, now() + 600, now()).run();
  return json({ ok: true, url: 'https://t.me/' + username + '?start=' + token, expiresIn: 600 });
}

export async function redeem(ctx) {
  const user = await currentUser(ctx);
  const d = await body(ctx.request);
  const code = String(d.code || '').trim();
  if (!/^A8-[A-Za-z0-9_-]{28}$/.test(code)) fail('INVALID_CODE', 'صيغة الكود غير صحيحة');
  const hash = await sha256(code);
  const order = await ctx.env.DB.prepare('SELECT * FROM telegram_orders WHERE code_hash=?').bind(hash).first();
  if (!order || order.user_id !== user.id) fail('INVALID_CODE', 'الكود غير مخصص لهذا الحساب أو غير موجود', 404);
  if (order.status !== 'paid' || order.redeemed_at) fail('USED_OR_REFUNDED', 'الكود مستخدم أو الدفعة مسترجعة');
  if (!order.code_expires_at || order.code_expires_at <= now()) fail('CODE_EXPIRED', 'انتهت صلاحية الكود');
  const t = now(), nonce = uid();
  // D1.batch is transactional. Capture any pre-existing subscription once,
  // consume exactly one code, create one grant, then recompute the expiry.
  const results = await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT OR IGNORE INTO subscription_baselines(user_id,baseline_until,baseline_started_at,created_at) SELECT id,subscription_until,subscription_started_at,? FROM users WHERE id=?')
      .bind(t, user.id),
    ctx.env.DB.prepare("UPDATE telegram_orders SET status='redeemed',redeemed_at=?,redeem_nonce=? WHERE id=? AND user_id=? AND status='paid' AND redeemed_at IS NULL AND code_expires_at>?")
      .bind(t, nonce, order.id, user.id, t),
    ctx.env.DB.prepare("INSERT INTO subscription_grants(id,user_id,source,source_id,granted_at,duration_seconds) SELECT ?,user_id,'telegram',id,?,duration_days*86400 FROM telegram_orders WHERE id=? AND status='redeemed' AND redeem_nonce=?")
      .bind(uid(), t, order.id, nonce),
    ctx.env.DB.prepare('UPDATE users SET subscription_started_at=CASE WHEN subscription_until<? THEN ? ELSE COALESCE(subscription_started_at,?) END, subscription_until=' + entitlementEndSql +
      " WHERE id=? AND EXISTS(SELECT 1 FROM telegram_orders WHERE id=? AND redeem_nonce=? AND status='redeemed')")
      .bind(t, t, t, user.id, order.id, nonce)
  ]);
  if (results[1]?.meta?.changes !== 1 || results[2]?.meta?.changes !== 1 || results[3]?.meta?.changes !== 1)
    fail('REDEEM_FAILED', 'الكود مستخدم؛ حدّث الصفحة ثم افحص الاشتراك', 409);
  const updated = await ctx.env.DB.prepare('SELECT subscription_until FROM users WHERE id=?').bind(user.id).first();
  return json({ ok: true, subscriptionUntil: updated.subscription_until, days: order.duration_days });
}

async function onStart(env, message, token) {
  const tgId = fromId(message.from?.id), chat = fromId(message.chat?.id);
  if (!token) {
    const existing = await env.DB.prepare('SELECT * FROM telegram_accounts WHERE telegram_user_id=?').bind(tgId).first();
    if (!existing) return send(env, chat, 'أهلاً بك في AIM8. سجل حسابك في ' + site + ' ثم اختَر باقة Telegram Stars من الموقع.');
    const plans = (await env.DB.prepare('SELECT id,name,days,stars_price FROM plans WHERE id IN ('quarter','half','year') AND stars_enabled=1 AND stars_price>0 ORDER BY days').all()).results;
    if (!plans.length) return send(env, chat, 'اشتراكات النجوم غير مفعلة بعد.');
    return send(env, chat, 'اختر الباقة لحساب AIM8 المرتبط:', {
      inline_keyboard: plans.map(p => [{ text: p.name + ' — ' + p.stars_price + ' ⭐', callback_data: 'buy:' + p.id }])
    });
  }
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return send(env, chat, 'رابط غير صحيح. ارجع للموقع للحصول على رابط جديد.');
  const hashed = await sha256(token);
  const link = await env.DB.prepare('SELECT * FROM telegram_links WHERE token_hash=? AND expires_at>? AND used_at IS NULL').bind(hashed, now()).first();
  if (!link) return send(env, chat, 'انتهت صلاحية الربط. ارجع لموقع AIM8 وابدأ من جديد.');
  const consumed = await env.DB.prepare('UPDATE telegram_links SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?')
    .bind(now(), hashed, now()).run();
  if (consumed.meta.changes !== 1) return send(env, chat, 'الرابط مستخدم. اطلب رابط جديد من الموقع.');
  await env.DB.prepare('INSERT OR IGNORE INTO telegram_accounts(telegram_user_id,user_id,chat_id,linked_at) VALUES(?,?,?,?)')
    .bind(tgId, link.user_id, chat, now()).run();
  const account = await env.DB.prepare('SELECT * FROM telegram_accounts WHERE telegram_user_id=?').bind(tgId).first();
  if (!account || account.user_id !== link.user_id || account.chat_id !== chat)
    return send(env, chat, 'حساب تيليجرام هذا مربوط بحساب AIM8 مختلف، أو حسابك مربوط بتيليجرام آخر. تواصل مع الدعم.');
  await sendInvoice(env, chat, tgId, link.plan_id);
}

async function onPreCheckout(env, q) {
  const order = await env.DB.prepare('SELECT o.*,p.stars_enabled FROM telegram_orders o JOIN plans p ON o.plan_id=p.id WHERE o.id=?')
    .bind(String(q.invoice_payload || '')).first();
  const valid = order && order.status === 'pending' &&
    order.telegram_user_id === fromId(q.from?.id) &&
    order.created_at > now() - 1800 && order.stars_enabled === 1 &&
    q.currency === 'XTR' && q.total_amount === order.stars_amount;
  await telegram(env, 'answerPreCheckoutQuery', {
    pre_checkout_query_id: q.id, ok: !!valid,
    ...(!valid ? { error_message: 'الفاتورة غير صالحة أو انتهت صلاحيتها. افتح رابط شراء جديد من موقع AIM8.' } : {})
  });
}

async function applyRefund(env, charge) {
  const order = await env.DB.prepare('SELECT * FROM telegram_orders WHERE telegram_charge_id=?').bind(charge).first();
  const event = await env.DB.prepare('SELECT * FROM telegram_refund_inbox WHERE telegram_charge_id=?').bind(charge).first();
  if (!order || !event) return false;
  if (order.telegram_user_id !== event.telegram_user_id ||
      order.stars_amount !== event.stars_amount || event.currency !== 'XTR' ||
      order.id !== event.payload) {
    console.error('Telegram refund event does not match charge:', charge.slice(0, 12));
    return false;
  }
  if (order.status === 'refunded') return true;
  const t = now(), nonce = uid();
  const result = await env.DB.batch([
    env.DB.prepare("UPDATE telegram_orders SET status='refunded',refunded_at=?,refund_nonce=? WHERE id=? AND telegram_charge_id=? AND status IN ('paid','redeemed')")
      .bind(t, nonce, order.id, charge),
    env.DB.prepare("UPDATE subscription_grants SET revoked_at=? WHERE source='telegram' AND source_id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM telegram_orders WHERE id=? AND refund_nonce=? AND status='refunded')")
      .bind(t, order.id, order.id, nonce),
    env.DB.prepare('UPDATE users SET subscription_until=' + entitlementEndSql +
      " WHERE id=? AND EXISTS(SELECT 1 FROM telegram_orders WHERE id=? AND refund_nonce=? AND status='refunded' AND redeemed_at IS NOT NULL)")
      .bind(order.user_id, order.id, nonce)
  ]);
  if (result[0]?.meta?.changes === 1) {
    // Delivery errors should not undo the refund already recorded in D1.
    try { await send(env, order.chat_id, 'تم تسجيل استرجاع دفعة النجوم. أُلغي كود الدفع وأُزيلت مدة هذه الدفعة فقط.'); }
    catch (e) { console.error('Could not notify refunded user:', String(e)); }
  }
  return true;
}

async function onPaid(env, m, pay) {
  const tgId = fromId(m.from?.id), chat = fromId(m.chat?.id), id = String(pay.invoice_payload || '');
  const order = await env.DB.prepare('SELECT * FROM telegram_orders WHERE id=?').bind(id).first();
  if (!order || order.telegram_user_id !== tgId || order.chat_id !== chat ||
      pay.currency !== 'XTR' || pay.total_amount !== order.stars_amount ||
      !pay.telegram_payment_charge_id) {
    console.error('Unexpected Telegram payment for order:', id);
    throw new ApiError(409, 'PAYMENT_MISMATCH', 'Telegram payment mismatch');
  }
  const charge = String(pay.telegram_payment_charge_id);
  const code = await codeFor(env, charge), hash = await sha256(code);
  if (order.status === 'pending') {
    await env.DB.prepare("UPDATE telegram_orders SET status='paid',paid_at=?,telegram_charge_id=?,code_hash=?,code_expires_at=? WHERE id=? AND status='pending'")
      .bind(now(), charge, hash, now() + 86400, order.id).run();
  }
  const current = await env.DB.prepare('SELECT * FROM telegram_orders WHERE id=?').bind(order.id).first();
  if (current.telegram_charge_id !== charge) throw new ApiError(409, 'CHARGE_MISMATCH', 'Charge ID mismatch');
  // An out-of-order refund update must win over later delivery.
  await applyRefund(env, charge);
  const after = await env.DB.prepare('SELECT * FROM telegram_orders WHERE id=?').bind(order.id).first();
  if (after.status === 'refunded' || after.status === 'redeemed') return;
  if (after.status !== 'paid') throw new ApiError(409, 'PAYMENT_STATE', 'Unexpected payment state');
  await send(env, chat, 'تم الدفع بنجاح ✅\nكود AIM8 الخاص بحسابك:\n' + code +
    '\n\nصالح حتى ' + new Date(after.code_expires_at * 1000).toISOString() +
    '\nاستخدمه مرة واحدة في صفحة حسابك على ' + site + '/dashboard.html');
}

async function onRefund(env, m, pay) {
  const tgId = fromId(m.from?.id), charge = String(pay.telegram_payment_charge_id || '');
  if (!charge || pay.currency !== 'XTR' || !Number.isSafeInteger(pay.total_amount) ||
      typeof pay.invoice_payload !== 'string' || !pay.invoice_payload.startsWith('ts_')) return;
  await env.DB.prepare('INSERT OR IGNORE INTO telegram_refund_inbox(telegram_charge_id,telegram_user_id,currency,stars_amount,payload,received_at) VALUES(?,?,?,?,?,?)')
    .bind(charge, tgId, 'XTR', pay.total_amount, pay.invoice_payload, now()).run();
  await applyRefund(env, charge);
}

async function onMessage(env, m) {
  if (m.chat?.type !== 'private' || !m.from || m.from.is_bot) return;
  if (m.successful_payment) return onPaid(env, m, m.successful_payment);
  if (m.refunded_payment) return onRefund(env, m, m.refunded_payment);
  const text = String(m.text || '').trim();
  if (/^\/paysupport(?:@\w+)?\b/i.test(text))
    return send(env, m.chat.id, 'لدعم الدفع والاسترجاع: افتح ' + site + '/support.html وسجّل تذكرة بحسابك. احتفظ بإيصال تيليجرام.');
  const match = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]+))?$/);
  if (match) return onStart(env, m, match[1] || '');
}

async function onCallback(env, q) {
  if (q.message?.chat?.type !== 'private' || !q.from) return;
  const cb = String(q.data || '').match(/^buy:(quarter|half|year)$/);
  if (!cb) return telegram(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'خيار غير متاح' });
  const seen = await env.DB.prepare('INSERT OR IGNORE INTO telegram_callbacks(callback_id,received_at) VALUES(?,?)')
    .bind(q.id, now()).run();
  if (seen.meta.changes !== 1) return;
  await telegram(env, 'answerCallbackQuery', { callback_query_id: q.id });
  await sendInvoice(env, fromId(q.message.chat.id), fromId(q.from.id), cb[1]);
}

export async function webhook(ctx) {
  if (!ctx.env.TELEGRAM_BOT_TOKEN) return new Response('not configured', { status: 503 });
  const expected = await webhookSecret(ctx.env);
  if (!sameSecret(ctx.request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '', expected))
    return new Response('unauthorized', { status: 401 });
  if (!ctx.request.headers.get('content-type')?.startsWith('application/json'))
    return new Response('invalid type', { status: 415 });
  if (Number(ctx.request.headers.get('content-length') || 0) > 65536)
    return new Response('too large', { status: 413 });
  const raw = await ctx.request.text();
  if (raw.length > 65536) return new Response('too large', { status: 413 });
  let update;
  try { update = JSON.parse(raw); } catch { return new Response('invalid json', { status: 400 }); }
  if (!update || typeof update !== 'object') return new Response('invalid update', { status: 400 });
  if (update.message) await onMessage(ctx.env, update.message);
  if (update.pre_checkout_query) await onPreCheckout(ctx.env, update.pre_checkout_query);
  if (update.callback_query) await onCallback(ctx.env, update.callback_query);
  return new Response('ok');
}

export async function configureWebhook(ctx) {
  await requireAdmin(ctx);
  const url = new URL(ctx.request.url);
  if (url.protocol !== 'https:') fail('HTTPS_REQUIRED', 'استخدم الرابط الآمن', 400);
  const destination = url.origin + '/api/telegram/webhook';
  await telegram(ctx.env, 'setWebhook', {
    url: destination, secret_token: await webhookSecret(ctx.env),
    allowed_updates: ['message', 'pre_checkout_query', 'callback_query'],
    drop_pending_updates: false
  });
  return json({ ok: true, webhookUrl: destination });
}

export async function setStarsPlan(ctx) {
  await requireAdmin(ctx);
  const d = await body(ctx.request);
  const id = String(d.id || '');
  const amount = Number(d.starsPrice), enabled = d.enabled === true ? 1 : 0;
  if (!/^(quarter|half|year)$/.test(id) || !Number.isSafeInteger(amount) ||
    amount < 0 || amount > 100000 || (enabled && amount < 1))
    fail('INVALID_STARS_PRICE', 'حدد سعراً صحيحاً بالنجوم');
  const result = await ctx.env.DB.prepare('UPDATE plans SET stars_price=?, stars_enabled=? WHERE id=?')
    .bind(amount, enabled, id).run();
  if (result.meta.changes !== 1) fail('PLAN_NOT_FOUND', 'الباقة غير موجودة', 404);
  return json({ ok: true, starsPrice: amount, enabled: !!enabled });
}
