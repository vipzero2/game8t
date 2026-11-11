# AIM8 Telegram Stars integration (staging branch)

This feature is developed on a **feature branch**. It does not become live until the branch is merged and Cloudflare deploys it.

## Prerequisites
- Cloudflare Pages project connected to GitHub `vipzero2/game8t`, build output `public`, Pages Functions enabled.
- Existing D1 binding `DB` and `SESSION_SECRET` preserved, `AUTH_HASHER` and account verification working.
- Secret `TELEGRAM_BOT_TOKEN` added **only in Cloudflare**, never in GitHub.
- Verify the production hostname is **8aim.site**. Existing project text may still reference the older `aim8.site` domain; correct other pages before launch.

## Production database migration
Back up D1 before applying schema changes. Run this **once** in the existing project directory:

```powershell
npx wrangler d1 execute aim8-db --remote --file=./db/003_telegram_stars.sql
```

Use your configured D1 database name if different; do **not** run `schema.sql` against a database that already has data.

## Admin configuration
1. Merge/deploy branch after validation.
2. Log in as a site admin at `https://8aim.site/admin.html`.
3. Set a positive `stars_price` for each plan, enable the plans desired for Stars independently from OxaPay, save.
4. Press **ربط Webhook مع تيليجرام** in the admin panel while on `https://8aim.site`. This calls `setWebhook` on Telegram with a secret token generated from `SESSION_SECRET`. Verify bot status via BotFather or Telegram's `getWebhookInfo` through a secure admin-only server call.
5. Test a purchase and one-use redemption using a small Stars amount before enabling public sales. Test refund handling separately in a controlled environment.

## Customer path
1. Confirm email, sign in, choose Stars plan on `/dashboard.html`, press the Telegram link.
2. On a Telegram private chat, `/start <one-time-link>` links the Telegram account to the site account; the bot sends an invoice with currency XTR.
3. After Telegram sends `successful_payment`, a deterministic code is generated from the *charge ID* and server secret and delivered to the buyer; its salted SHA-256 lookup hash is persisted (raw code is not stored).
4. The customer redeems within 24 hours, once, only in the *same AIM8 account*. The D1 write batch updates both order and entitlement.
5. Telegram `refunded_payment` marks the order refunded and revokes its credited days; no new redemption is allowed.

## Important limitations and launch checks
- Keep `PAYMENTS_ENABLED=false` if OxaPay is retired; Telegram pricing uses `stars_enabled` separately.
- This version uses expiry arithmetic for refunds rather than independent time-bounded grants. **Before taking live payments, validate mixed purchases and historical subscriptions**. In particular, a refund long after original activation may require a grant-ledger adjustment to avoid unintended loss of unrelated entitlements.
- Existing site pages, checkout and legal copy still mention OxaPay; update them before marketing a Stars-only checkout.
- Automatic email notifications, reconciliation of missed refund events, and a dashboard ledger of Stars orders are not implemented.
- Bot token rotation, secure server configuration and periodic payment-event reconciliation should be part of operational procedures.
- For refund disputes, the bot supports `/paysupport` pointing to the site's support system.

References: https://core.telegram.org/bots/payments-stars and https://core.telegram.org/bots/api
