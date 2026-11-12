# AIM8 Stars Refund Monitor — migrate from GitHub Actions to Cloudflare Cron

**Important: two-phase migration, no monitoring gap.** The old GitHub Actions
schedule stays active **until the new Worker is deployed AND a successful
Cloudflare Cron run appears in the AIM8 admin panel**. Both schedulers share
the same D1-backed scan lease, so overlapping runs do not double revoke.

Cloudflare Pages does not support Cron Triggers. The separate Worker
`aim8-stars-cron` runs every five minutes at `*/5 * * * *` UTC (offset from the legacy GitHub schedule),
calls the existing Pages Stars endpoint, and authenticates via HMAC-SHA256
with a fresh 128-bit nonce and a timestamp valid for two minutes.
D1 stores only keyed nonces for replay prevention. No Telegram bot token or
D1 binding is copied into the Cron Worker.

## Phase 1: prepare the existing Pages project (already in GitHub)

After the source changes reach `main`, confirm a successful Pages deploy.

Create **one** fresh random 32-byte base64url secret, for example in Windows
PowerShell with Node.js installed:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Never put the resulting key in GitHub, a ticket, or this chat.**

1. In Cloudflare dashboard: Workers & Pages → **Pages project `game8t`**
   (not the old Worker and not `game8t-auth-hasher`) → Settings →
   Variables and Secrets → **Production**.
2. Add `STARS_CRON_SECRET` as an **encrypted Secret**, using the random
   value. Do not change `SESSION_SECRET`, `TELEGRAM_WEBHOOK_SECRET`,
   or `TELEGRAM_BOT_TOKEN`.
3. Save, then **Retry Deployment** for the latest production deployment.
4. Open `https://8aim.site/admin.html#starsMonitor`. It should display
   `Cron secret on Pages: configured`, while `Cloudflare Cron: not
   confirmed` is expected until the second Worker is deployed.

## Phase 2: deploy the standalone Cron Worker

Use a Windows PowerShell terminal in a fresh checkout of the repository:

```powershell
git clone https://github.com/vipzero2/game8t.git
cd game8t
npm install
npx wrangler login
npx wrangler deploy --config wrangler.stars-cron.jsonc
npx wrangler secret put STARS_CRON_SECRET --config wrangler.stars-cron.jsonc
```

For the last command, **paste the exact SAME random key** stored in
Pages as `STARS_CRON_SECRET`. The secret will not be echoed to the
screen and is encrypted in the standalone Worker.

If already working in a local checkout, run `git pull` instead of
`git clone`.

This deploys a **new** Worker called `aim8-stars-cron`, with no public
HTTP route. It does **not** replace or alter `game8t-auth-hasher`.
It has the `scheduled` handler and Cron Trigger defined by
`wrangler.stars-cron.jsonc`. The Worker does not require a D1 binding
or Telegram token; only `STARS_CRON_SECRET`.

The cron schedule appears under **Compute → Workers & Pages →
`aim8-stars-cron` → Settings → Triggers → Cron Triggers**.

## Phase 3: check the cutover, then stop GitHub Actions

1. Wait for at least one due Cron Trigger (up to roughly five minutes,
   propagation may add more). Open `8aim.site/admin.html#starsMonitor`,
   press **Refresh**, and verify:
   - **Cloudflare Cron: working ✅**
   - **Last successful Cloudflare scan:** recent timestamp
   - **Cron secret on Pages: configured ✅**
2. The same dashboard retains bot balance, mismatched-refund alarms,
   matching refund counts, and the manual **Scan now** button.
3. Only **after** the independent Cron is healthy, remove the
   `schedule:` block from `.github/workflows/stars-reconcile.yml`.
   Keep `workflow_dispatch` temporarily for emergency manual fallback
   if desired. This avoids unnecessary recurring GitHub Actions minutes
   on a private repository.
4. Confirm the GitHub **Actions** tab no longer shows newly scheduled
   Stars reconciliation runs; the Cloudflare Cron Worker should continue.

If the cloud Cron cannot be deployed or repeatedly errors, leave GitHub's
schedule active until the problem is resolved. Do not delete the existing
Worker or Github workflow in advance.

## Verifying or troubleshooting

- The Pages handler is `POST /api/telegram/reconcile/cron`; raw or replayed
  requests return HTTP 401, and there is no public activation link.
- Its `STARS_CRON_SECRET` must be identical in both places and must have
  at least 43 base64url characters. Unlike Telegram webhook credentials,
  this key authorizes *only* the Stars reconciliation endpoint.
- The existing GitHub OIDC route `POST /api/telegram/reconcile` stays
  unchanged for manual emergency use during cutover.
- View Worker logs/errors via Cloudflare Workers & Pages →
  `aim8-stars-cron` → Observability.
- A Pages HTTP 401 in the Cron Worker logs usually means one secret is
  missing, mismatched or an old production deployment is running.
- If the Cron Worker is missing a schedule, re-run `wrangler deploy`
  using the dedicated config file.
- The Cron Worker itself has very small CPU usage; the existing Pages
  application still does all the work. Free Workers have a 10ms Cron
  CPU budget; monitor execution errors and upgrade only if necessary.
- The current transaction matching scheme is unchanged: a matching
  Telegram charge ID, matching amount and compatible counterparty are
  required before revoking the purchase. A balance drop alone never
  revokes a license. Some external refund types can still be invisible
  to Telegram's ledger, so no guarantee of detecting every refund.

## Rollback

If Cloudflare Cron runs fail, optionally re-enable the old GitHub
schedule to restore monitoring, while investigating logs. Never
revoke purchases manually based on Star balance alone.
