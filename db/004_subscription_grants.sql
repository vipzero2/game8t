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
  source TEXT NOT NULL CHECK(source IN ('telegram','manual')),
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
