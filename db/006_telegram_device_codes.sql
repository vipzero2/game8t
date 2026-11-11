-- Passwordless Telegram ID licensing for new Android AIM8 clients.
-- Existing Telegram orders, grants and admin login remain unchanged.
-- The Telegram bot and device endpoints also run CREATE TABLE IF NOT EXISTS
-- for safe gradual rollout before operators apply this migration.
CREATE TABLE IF NOT EXISTS telegram_device_codes (
  telegram_user_id TEXT PRIMARY KEY REFERENCES telegram_accounts(telegram_user_id),
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_nonce TEXT
);
