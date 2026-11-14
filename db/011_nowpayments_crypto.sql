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
DROP TRIGGER IF EXISTS trg_order_paid_grant;
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

-- Restore the existing OxaPay grant trigger exactly as in migration 004.
CREATE TRIGGER trg_order_paid_grant
AFTER UPDATE OF status ON orders
WHEN NEW.status = 'paid' AND OLD.status != 'paid'
BEGIN
  INSERT OR IGNORE INTO subscription_baselines(user_id,baseline_until,baseline_started_at,created_at)
  SELECT id,subscription_until,subscription_started_at,CAST(strftime('%s','now') AS INTEGER)
  FROM users WHERE id=NEW.user_id;

  INSERT INTO subscription_grants(id,user_id,source,source_id,granted_at,duration_seconds)
  VALUES('oxa:' || NEW.id,NEW.user_id,'oxapay',NEW.id,CAST(strftime('%s','now') AS INTEGER),NEW.duration_days*86400);

  UPDATE users SET
    subscription_started_at = CASE
      WHEN subscription_until < CAST(strftime('%s','now') AS INTEGER)
      THEN CAST(strftime('%s','now') AS INTEGER)
      ELSE COALESCE(subscription_started_at,CAST(strftime('%s','now') AS INTEGER))
    END,
    subscription_until = (
      WITH RECURSIVE ordered AS (
        SELECT ROW_NUMBER() OVER(ORDER BY granted_at,id) AS position,
               granted_at,duration_seconds
        FROM subscription_grants
        WHERE user_id=users.id AND revoked_at IS NULL
      ), timeline(position,expires_at) AS (
        SELECT 0,(SELECT baseline_until FROM subscription_baselines WHERE user_id=users.id)
        UNION ALL
        SELECT ordered.position,MAX(timeline.expires_at,ordered.granted_at)+ordered.duration_seconds
        FROM timeline JOIN ordered ON ordered.position=timeline.position+1
      )
      SELECT expires_at FROM timeline ORDER BY position DESC LIMIT 1
    )
  WHERE id=NEW.user_id;
END;
