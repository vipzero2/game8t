-- Migration after 003_telegram_stars.sql.
-- Baseline is captured from a user's existing subscription just before the
-- first Stars redemption. Subsequent Stars and manual credits are represented
-- as grants, allowing cancellation of one charge without erasing another.
CREATE TABLE IF NOT EXISTS subscription_baselines (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  baseline_until INTEGER NOT NULL,
  baseline_started_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS subscription_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('telegram','manual','oxapay')),
  source_id TEXT NOT NULL UNIQUE,
  granted_at INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK(duration_seconds > 0),
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_subscription_grants_user ON subscription_grants(user_id,granted_at,id);

-- Refund webhook events can arrive before the matching successful_payment
-- update has finished processing; persist them until reconciled.
CREATE TABLE IF NOT EXISTS telegram_refund_inbox (
  telegram_charge_id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  stars_amount INTEGER NOT NULL,
  payload TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

-- The existing trigger grants OxaPay days directly on users, bypassing the
-- per-payment ledger. Replace it atomically in this same migration, before
-- any Telegram Stars purchase can be redeemed.
DROP TRIGGER IF EXISTS trg_order_paid_grant;
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
