# AIM8 Google Play review license

This license is **only for app reviewers**. It does not change the existing Telegram Stars subscription, single-device code or refund rules.

## Admin setup
1. Log in to https://8aim.site/admin.html as an authorized site administrator.
2. In **كود مراجعة Google Play**, select **إصدار كود مراجعة**.
3. Save the code shown once. It begins with `A8R-`. The server stores only its SHA-256 hash, not plaintext.
4. Put this credential and instructions in **Play Console → App content → App access**. Reviewers paste the code into the regular AIM8 activation field.
5. Ensure Telegram security alerts are paired in the **حماية بوت تيليجرام** section or `TELEGRAM_SECURITY_ALERT_CHAT_ID` is configured as a Cloudflare secret. If not configured, the admin panel warns you.

The code has no automatic expiry, is reusable on any device and does not register a permanent device identity. Do not revoke it during review; if it leaks, rotate it and **update App access immediately** so Play reviewers retain access.

## Runtime endpoints
- `POST /api/telegram/device/review/activate` with JSON `{"code":"A8R-..."}` — creates a randomly generated, revocable review session, returns `sessionToken`, server timestamp and short lease.
- `POST /api/telegram/device/review/verify` with `{"sessionToken":"..."}` — refreshes activity and lease.
- `GET /api/admin/review/status` — administrator only, active counts.
- `POST /api/admin/review/issue` with `{"label":"Google Play review"}` — administrator only, issues one active code at a time.
- `POST /api/admin/review/revoke` with `{"id":"..."}` — administrator only, revokes all sessions for that license.

Cloudflare Access must **not** redirect native Android requests to a login screen. The review endpoints are nested under the existing protected `/api/telegram/device/*` client API exception. Keep account management endpoints restricted to logged-in administrators.

## Activity and alerts
- Active count = distinct valid review **sessions** that have checked in during the past **360 seconds**.
- More than **30** active sessions triggers a Telegram security alert containing the current count; alerts are throttled to at most one every **15 minutes** per review license.
- Exceeding 30 triggers a warning **only**. No user is automatically blocked.
- Closed or offline devices age out of the active count; uninstall/reset does not permanently consume a slot.
- The count is approximate and is *not* a cryptographically verified count of physical devices. A rooted or modified client could create multiple sessions. It is a signal to investigate possible credential leaks, not definitive proof.
- Sessions are represented by random bearer credentials stored as hashes in D1. Do not expose the full code, session tokens or bot token in logs.

## Deployment and testing
- The schema is created on demand in D1 by the new server function. No manual production migration is needed.
- Deploy the code to Cloudflare Pages and verify the access policy permits the `/api/telegram/device/review/*` paths.
- Use `npm run check` and specifically `node --test tests/review-license.test.mjs` in a complete checkout with Node 22+.
- The Android code is delivered separately as a complete ZIP of the `android` and `lib` directories, based on the latest clean UI and Kotlin fix. Merge into your full Flutter project, then build and test.
- If app review access is interrupted or the review code is rotated, update the credential instructions in Play Console.

Do not embed review codes or backend secrets into APK, and do not use this review credential to hide functionality from reviewers.
