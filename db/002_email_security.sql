-- Apply once to existing AIM8 D1. Keep schema.sql unchanged for production.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN device_generation INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS pending_signups (
 email TEXT PRIMARY KEY COLLATE NOCASE,
 name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL,
 password_iterations INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_signups_exp ON pending_signups(expires_at);
CREATE TABLE IF NOT EXISTS email_security_codes (
 email TEXT NOT NULL COLLATE NOCASE,
 purpose TEXT NOT NULL CHECK(purpose IN ('signup','verify_email','password_reset','device_change')),
 code_hash TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 expires_at INTEGER NOT NULL,
 cooldown_until INTEGER NOT NULL,
 consumed_at INTEGER,
 PRIMARY KEY(email,purpose)
);
CREATE INDEX IF NOT EXISTS idx_email_codes_exp ON email_security_codes(expires_at);
CREATE TABLE IF NOT EXISTS account_events (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_type TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_events_user ON account_events(user_id,created_at DESC);
