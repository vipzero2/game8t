# AIM8 Telegram bot hardening — production operation

## Implemented

- Webhook request secret validation; supports an independent Cloudflare secret.
- Retry-safe idempotency by Telegram `update_id` with a 120-second processing lease.
- Per-Telegram-ID throttles: up to 30 text messages/minute, 30 button presses/minute,
  5 invoices/15 minutes and 20 invoices/day; extra pending invoices are rejected.
- **Never rate-limit real `successful_payment` or `refunded_payment` service updates.**
- Verified currency, amount, order, charge ID and Telegram account before issuing a code.
- Last 24 hours of pseudonymous security events visible only to AIM8 admins.
- Optional owner chat alert after recurring abuse, deduplicated per incident type.
- Safe re-delivery of unsent paid codes when Telegram's API fails.

## Required operator action: independent webhook secret

This source change intentionally **does not generate or publish** a secret in GitHub.

1. Open Cloudflare dashboard → Workers & Pages → `game8t` → Settings → Variables and Secrets (Production).
2. Add a **secret** `TELEGRAM_WEBHOOK_SECRET` (32 to 256 random
   `A-Z`, `a-z`, `0-9`, `_`, `-` characters). Store it in Cloudflare, **not** the GitHub repo, browser JavaScript, or chat.
3. Deploy this setting to Production. The new webhook secret takes effect when the Worker is deployed; expect a short bot outage until the Telegram webhook is updated.
4. As an authenticated AIM8 admin, open `https://8aim.site/admin.html` and press
   **Register/Configure Telegram Webhook** (the existing `adminTelegramWebhook` button).
   This calls `POST /api/admin/telegram/configure`, which installs the matching
   `secret_token` using Telegram's `setWebhook`.
5. Open `https://8aim.site/admin.html#telegramSecurity` and verify
   **Independent webhook secret: enabled**.
6. Test `/start`, the language picker and a callback without actually buying.
   Do not buy Stars to test rate limiting.

**Do not rotate `SESSION_SECRET` while active users/codes rely on it.**
The old HMAC-derived webhook secret is used only when the new secret is not configured,
so rollout of this code alone will not disconnect Telegram. Once the independent
secret is configured, the old derived one is **not accepted**.

## Optional Telegram alerts

Set `TELEGRAM_SECURITY_ALERT_CHAT_ID` in Cloudflare Production secrets/variables
to the numeric ID of your **own private chat with the AIM8 bot**. Start the bot
from that account before enabling alerts. Only categories of repeated suspicious
activity are sent. The operator ID is never included in public output. A missing
or incorrectly configured chat ID does **not** block payments.

## Secret and account compromise response

1. Revoke compromised bot token via BotFather and create a new one.
2. Update `TELEGRAM_BOT_TOKEN` in Cloudflare Production secret store.
3. Redeploy Production and use the admin webhook configure control.
4. Check unusual recent payments, refunds, bot webhook status and the 24-hour
   security report. Audit suspicious orders before revoking any entitlement.
5. Enable 2-step verification for the Telegram owner account, and MFA on
   Cloudflare and GitHub. Never share administrator session cookies.

## Security limits

This protects AIM8 backend state and resists common replay/spam attacks.
It does not guarantee security if the Telegram owner account or Cloudflare
administrator is compromised. Cloudflare WAF/rate limiting can be added at
`/api/telegram/webhook` for untrusted unauthenticated traffic if needed,
but **must not block legitimate Telegram payment and refund delivery**.

The D1 tables in `db/008_telegram_bot_security.sql` are also initialized
automatically by the Worker where required. No app changes are needed.
