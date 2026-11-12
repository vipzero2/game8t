-- Secure pairing of an AIM8 administrator's private Telegram chat to
-- suspicious-activity alerts. No Telegram ID is exposed to the browser.
CREATE TABLE IF NOT EXISTS telegram_alert_pairing (
 token_hash TEXT PRIMARY KEY,
 admin_user_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 used_at INTEGER,
 used_nonce TEXT
);
CREATE TABLE IF NOT EXISTS telegram_alert_settings (
 name TEXT PRIMARY KEY,
 telegram_chat_id TEXT NOT NULL,
 paired_by TEXT NOT NULL,
 linked_at INTEGER NOT NULL
);
