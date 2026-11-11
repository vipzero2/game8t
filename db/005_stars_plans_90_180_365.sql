-- AIM8 2026 Telegram Stars plans. Apply ONCE after migrations 003 and 004.
-- Existing historical orders keep their plan IDs and saved durations.
-- Old weekly/monthly plans are retained for FK history but cannot be sold.
UPDATE plans SET stars_enabled=0, enabled=0 WHERE id IN ('week','month');

INSERT INTO plans(id,name,days,price_cents,enabled,highlighted,stars_price,stars_enabled)
VALUES
  ('quarter','3 أشهر',90,0,0,0,150,0),
  ('half','6 أشهر',180,0,0,1,250,0),
  ('year','سنة كاملة',365,0,0,0,450,0)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  days=excluded.days,
  highlighted=excluded.highlighted,
  stars_price=excluded.stars_price,
  stars_enabled=0,
  enabled=0;

-- Payment must be explicitly enabled for each plan from the admin page
-- only AFTER the bot and three new amounts have been verified.
