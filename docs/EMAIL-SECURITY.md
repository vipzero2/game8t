# AIM8 — Gmail verification, password reset, device transfer

## Important: production D1 migration
Execute exactly once against the existing aim8-db BEFORE testing new signup:

```powershell
git pull origin main
npx wrangler d1 execute aim8-db --remote --file=./db/002_email_security.sql
```

This migration adds verified-email and device generation fields to `users`, plus `pending_signups`, `email_security_codes`, `account_events`. It does NOT erase existing accounts, payments, subscriptions or linked devices. Do not repeat ALTER TABLE statements.

## Email provider configuration: Resend
1. Open https://resend.com and create a Resend account.
2. Go to Domains and add `aim8.site`, then add the exact DNS verification records supplied by Resend at the DNS provider controlling that domain. Wait for verified status.
3. Create API key restricted to sending emails.
4. In Cloudflare Pages → game8t → Settings → Variables and secrets → Production:
   - `RESEND_API_KEY`: Secret containing the API key.
   - `EMAIL_FROM`: text, e.g. `AIM8 <security@aim8.site>`.
5. Redeploy Pages to apply bindings and variables. Do not commit secrets or share them in chat.

## Website paths
- New registration: `/auth.html` → sends code, then `/verify.html?mode=signup`.
- Forgot password: `/verify.html?mode=reset`.
- Existing accounts (created before migration): log in and open `/dashboard.html` to verify Gmail once before changing devices or resetting password.
- Change device: in dashboard, request a Gmail code and confirm. Old bound device loses permission on next server verification; a new device can then bind.

## Security
- Codes have a 10 minute expiry, 5 incorrect attempts, resend cooldown, daily/per-address limits, hashed storage, and single-use consumption.
- Resetting password clears all website sessions.
- Device change increments generation and invalidates old short-lived device authorization tokens, preserving subscription.
- Android client must call `/api/device/verify` on launch and periodically, and deny access after server says old device is rejected. Offline enforcement cannot be guaranteed by website code alone.
- Gmail-only means `@gmail.com` addresses, not Google OAuth. Domain matching alone is not proof of mailbox ownership; OTP is required.
- Deploy migration before using the new registration endpoints.
- Account emails and password codes cannot be sent until Resend is verified and configured.
