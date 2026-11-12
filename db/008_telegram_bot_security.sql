-- Telegram bot protection: deduplicate Telegram update_id with retryable leases,
-- preserve a bounded pseudonymous abuse audit (no raw user IDs or codes).
-- Safe to reapply. The bot also creates these tables lazily after deployment.
CREATE TABLE IF NOT EXISTS telegram_webhook_updates(
 update_id INTEGER PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('processing','done')),
 lease_token TEXT NOT NULL,
 lease_until INTEGER NOT NULL,
 received_at INTEGER NOT NULL,
 completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS telegram_security_events(
 id TEXT PRIMARY KEY,
 category TEXT NOT NULL,
 actor_digest TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_security_events_created
 ON telegram_security_events(created_at);

-- Track code delivery separately from paid order state. If the Telegram API
-- fails after payment is recorded, a webhook retry can deliver the same code.
CREATE TABLE IF NOT EXISTS telegram_payment_notifications(
 order_id TEXT PRIMARY KEY REFERENCES telegram_orders(id),
 sent_at INTEGER NOT NULL
);
