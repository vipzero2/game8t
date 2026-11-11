-- Telegram Stars is independent from legacy OxaPay USD prices.
-- Apply once to production D1 via Wrangler after reviewing backups.
ALTER TABLE plans ADD COLUMN stars_price INTEGER NOT NULL DEFAULT 0 CHECK(stars_price >= 0);
ALTER TABLE plans ADD COLUMN stars_enabled INTEGER NOT NULL DEFAULT 0 CHECK(stars_enabled IN (0,1));

CREATE TABLE IF NOT EXISTS telegram_links (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_links_exp ON telegram_links(expires_at);

CREATE TABLE IF NOT EXISTS telegram_accounts (
  telegram_user_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  linked_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  telegram_user_id TEXT NOT NULL REFERENCES telegram_accounts(telegram_user_id),
  chat_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  duration_days INTEGER NOT NULL,
  stars_amount INTEGER NOT NULL CHECK(stars_amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','redeemed','refunded')),
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  telegram_charge_id TEXT UNIQUE,
  code_hash TEXT UNIQUE,
  code_expires_at INTEGER,
  redeemed_at INTEGER,
  redeem_nonce TEXT UNIQUE,
  refunded_at INTEGER,
  refund_nonce TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_telegram_orders_account ON telegram_orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_orders_charge ON telegram_orders(telegram_charge_id);

CREATE TABLE IF NOT EXISTS telegram_callbacks (
  callback_id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);
