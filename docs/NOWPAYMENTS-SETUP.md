# AIM8 — NOWPayments (independent crypto checkout)

NOWPayments runs separately from Telegram Stars and OxaPay. The Telegram bot does not sell crypto payment links: it verifies the Telegram ID via an authenticated private webhook and delivers codes after successful checkout from the website.

## Prices

- 90 days: USD 4
- 180 days: USD 6
- 365 days: USD 10
- Buyer website: https://8aim.site/crypto.html

## Buyer flow

1. The website generates a random 10-minute challenge. Telegram verifies the buyer's ID through the authenticated private /start event. A typed Telegram ID is never sufficient.
2. The website creates a unique NOWPayments invoice for that verified identity using USD pricing, non-fixed crypto rate, and no forced payment currency.
3. The callback checks the HMAC-SHA512 IPN signature and independently checks the payment with the merchant API. The server verifies order ID, payment ID, optional invoice ID, USD amount and final finished status.
4. The server sends the verified buyer an activation code in their private Telegram chat. The code has a 24-hour validity period and is single-use.
5. Android verifies the code with device possession proof and credits the relevant subscription days once from a separate nowpayments ledger.

## Prerequisites before merging and deployment

1. Back up the actual production D1 database and verify the backup. Migration 011 rebuilds the subscription grants table, retaining old grants and the existing OxaPay trigger. Avoid concurrent writes during migration.
2. Apply migration 011 to the D1 database that is bound to the production Pages project, after existing migrations 003-010:

    npx wrangler d1 execute aim8-db --remote --file=./db/011_nowpayments_crypto.sql

3. Set the following in Cloudflare Pages Settings > Variables and Secrets:
   - NOWPAYMENTS_API_KEY = private API key (encrypted secret)
   - NOWPAYMENTS_IPN_SECRET = full secret in IPN settings (encrypted secret)
   - NOWPAYMENTS_ENABLED = true (only after migrations and smoke testing)
   - Preserve the existing DB binding, SESSION_SECRET, TELEGRAM_BOT_TOKEN and the Telegram webhook configuration.
4. In NOWPayments IPN settings, set webhook URL to https://8aim.site/api/nowpayments/webhook, classic format, 3 retries every 1 minute. The backend passes this same callback URL for every new invoice.
5. Cloudflare Access/email allowlist/WAF must not intercept the incoming webhook POST. Exempt only the webhook route from browser-login challenges; the endpoint authenticates the message via HMAC and merchant lookup. If crypto.html is intended for customers without Gmail, allow the page and related checkout API routes without opening admin or unrelated routes.
6. Test with a real verified Telegram ID and a fresh API-generated invoice. Verify incorrect signatures fail, pending or partial payments do not grant access, finished payments deliver codes, and repeated IPNs never award extra subscription time.
7. Monitor Cloudflare logs and NOWPayments callback retries. If a refund state does not generate a webhook, the merchant must reconcile it operationally.

## Important: the three static payment links

The $4 / $6 / $10 links created manually in NOWPayments cannot be used for automated Telegram-ID-bound activation: they have no verified buyer mapping. Do not distribute them for automatic activation. This new checkout makes unique API invoices with unique merchant order IDs.

## Changed files

- public/crypto.html and public/assets/crypto.js: separate checkout UI.
- functions/_lib/nowpayments-identity.js: passwordless bot verification.
- functions/_lib/nowpayments.js: invoice and signed IPN.
- functions/_lib/telegram.js: private chat challenge proof.
- functions/_lib/telegram-license.js: native single-device grant redemption.
- functions/api/[[path]].js: backend routes.
- db/011_nowpayments_crypto.sql: D1 schema.
- tests/nowpayments.test.mjs: regression checks.

The feature flag is disabled by default. Writing the code did not charge a customer or deploy the webhook.
