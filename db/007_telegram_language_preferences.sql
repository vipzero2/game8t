-- Save the customer's explicitly selected Telegram bot language by Telegram ID.
-- No country-specific duplicates: e.g. a single Arabic option uses 🇸🇦.
-- Safe to run again; the bot also initializes the table on first use.
CREATE TABLE IF NOT EXISTS telegram_language_preferences (
  telegram_user_id TEXT PRIMARY KEY,
  language_code TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
