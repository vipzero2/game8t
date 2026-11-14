-- 011: independent NOWPayments invoices. Only a Telegram private chat can prove an ID.
CREATE TABLE IF NOT EXISTS nowpayments_verifications (
  token_hash TEXT PRIMARY KEY,
  telegram_user_id TEXT,
  user_id TEXT,
  chat_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_np_verify_expiry ON nowpayments_verifications(expires_at);

CREATE TABLE IF NOT EXISTS nowpayments_orders (
  id TEXT PRIMARY KEY,
  verification_hash TEXT NOT NULL UNIQUE REFERENCES nowpayments_verifications(token_hash),
  user_id TEXT NOT NULL REFERENCES users(id),
  telegram_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  duration_days INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents IN (400,600,1000)),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','paid','redeemed','refunded')),
  invoice_id TEXT UNIQUE,
  invoice_url TEXT,
  payment_id TEXT UNIQUE,
  code_hash TEXT,
  code_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  redeemed_at INTEGER,
  refunded_at INTEGER,
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_np_orders_user ON nowpayments_orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_np_orders_status ON nowpayments_orders(status,created_at DESC);

-- Extend the grant source constraint without touching the legacy Stars,
-- manual and OxaPay grants. No subscriptions are credited by this migration.
CREATE TABLE subscription_grants_np_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('telegram','manual','oxapay','nowpayments')),
  source_id TEXT NOT NULL UNIQUE,
  granted_at INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK(duration_seconds > 0),
  revoked_at INTEGER
);
INSERT INTO subscription_grants_np_new
  SELECT id,user_id,source,source_id,granted_at,duration_seconds,revoked_at
  FROM subscription_grants;
DROP TABLE subscription_grants;
ALTER TABLE subscription_grants_np_new RENAME TO subscription_grants;
CREATE INDEX IF NOT EXISTS idx_subscription_grants_user
 ON subscription_grants(user_id,granted_at,id);
