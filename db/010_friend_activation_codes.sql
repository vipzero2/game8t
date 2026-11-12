-- AIM8 owner-issued gift activation codes. Independent from Telegram Stars purchases.
-- This table is also lazily created on first admin issue/activation, so production
-- does not require an urgent manual migration; retain this for schema bookkeeping.
CREATE TABLE IF NOT EXISTS friend_activation_codes(
 id TEXT PRIMARY KEY,
 telegram_user_id TEXT NOT NULL,
 plan_id TEXT NOT NULL,
 duration_days INTEGER NOT NULL CHECK(duration_days BETWEEN 1 AND 3660),
 code_hash TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 redeemed_at INTEGER,
 redeem_nonce TEXT UNIQUE,
 revoked_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_code_pending_id
 ON friend_activation_codes(telegram_user_id)
 WHERE redeemed_at IS NULL AND revoked_at IS NULL;
