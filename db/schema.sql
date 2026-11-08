-- AIM8 / Cloudflare D1. Run this once on production database.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  blocked INTEGER NOT NULL DEFAULT 0,
  device_public_key TEXT,
  device_bound_at INTEGER,
  subscription_started_at INTEGER,
  subscription_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 3660),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK(price_cents >= 0),
  enabled INTEGER NOT NULL DEFAULT 0,
  highlighted INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO plans(id,name,days,price_cents,enabled,highlighted) VALUES
 ('week','الأسبوعية',7,0,0,0),
 ('month','الشهرية',30,0,0,1),
 ('quarter','3 أشهر',90,0,0,0);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  duration_days INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paying','paid','failed','expired')),
  track_id TEXT UNIQUE,
  payment_url TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
-- Exactly-once subscription extension: updating an order to paid updates the user atomically.
CREATE TRIGGER IF NOT EXISTS trg_order_paid_grant
AFTER UPDATE OF status ON orders
WHEN NEW.status = 'paid' AND OLD.status != 'paid'
BEGIN
  UPDATE users SET
    subscription_started_at = CASE
      WHEN subscription_until < CAST(strftime('%s','now') AS INTEGER)
      THEN CAST(strftime('%s','now') AS INTEGER)
      ELSE COALESCE(subscription_started_at, CAST(strftime('%s','now') AS INTEGER)) END,
    subscription_until = MAX(subscription_until, CAST(strftime('%s','now') AS INTEGER)) + NEW.duration_days * 86400
  WHERE id = NEW.user_id;
END;
CREATE TABLE IF NOT EXISTS device_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_challenges_exp ON device_challenges(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES users(id),
  target_id TEXT,
  action TEXT NOT NULL,
  info TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  reply TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','closed')),
  created_at INTEGER NOT NULL,
  replied_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_tickets(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_created ON support_tickets(created_at DESC);
