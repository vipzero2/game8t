# AIM8 — Cloudflare Free password hashing

Cloudflare Pages Workers Free have 10ms CPU per request. 100,000-iteration PBKDF2 may exceed it. Use a separate SQLite-backed Durable Object with its own CPU limit, without weakening hashing.

## Deploy (PowerShell inside cloned repository)

```powershell
git pull origin main
npx wrangler deploy --config auth-hasher/wrangler.toml
npx wrangler secret put PASSWORD_PEPPER --config auth-hasher/wrangler.toml
```

Use the SAME existing PASSWORD_PEPPER secret if any accounts were successfully created. If no account ever succeeded and you lost it, generate a new 48-byte secret locally with Node. Don't publish the secret to GitHub.

## Pages binding

Cloudflare Pages game8t → Settings → Bindings → Add → Durable Object
- Variable name: AUTH_HASHER
- Namespace: PasswordHasher in game8t-auth-hasher
- Production environment

Save, redeploy Pages. Until linked, signup/login return HASHER_NOT_CONFIGURED (503) without consuming attempts.

## Clear old test-only signup locks

Only while the site is prelaunch and you have no real customers:
```powershell
npx wrangler d1 execute aim8-db --remote --command "DELETE FROM rate_limits;"
```
This clears all current login/signup rate counters, so only run it in the prelaunch environment for one-time recovery.

## Logs

```powershell
npx wrangler pages deployment tail --project-name game8t --environment production
```

Then attempt to register ONCE. If it fails, share the error name/code from the logs, not passwords or secret values.

The Worker default fetch responds 404; its Durable Object is callable only via the binding.
