# Clawptcha — Setup Wizard & Deploy-to-Cloudflare Button

**Date:** 2026-07-03
**Status:** Approved

## Summary

Self-hosting Clawptcha today means a five-chore runbook: D1 create + ID paste,
~10 manual GitHub App dashboard steps plus an openssl key conversion, a
Turnstile widget in a second dashboard, 8–9 `wrangler secret put` calls, and an
`APP_BASE_URL` chicken-and-egg. This spec collapses that to:

- **Cloned-repo path:** `npx wrangler login && npm run setup` — an interactive
  wizard that deploys, registers the GitHub App via the manifest flow (one
  browser click returns app ID, private key, webhook secret, and OAuth
  client credentials in a single API exchange), converts the key to PKCS#8
  in-process, handles Turnstile, generates the session key, and bulk-writes
  all secrets.
- **No-clone path:** a **Deploy to Cloudflare** button in the README that
  provisions the Worker + D1 + AI binding, followed by clone + `npm run setup`
  for the GitHub-side setup.

Out of scope (deliberately): a Worker-served first-run `/setup` page,
Turnstile-optional mode, Docker/other-platform ports.

## Verified external contracts (2026-07)

- **GitHub App manifest flow:** POST a `manifest` JSON form to
  `github.com/settings/apps/new`; user clicks "Create"; GitHub redirects to
  our `redirect_url` (localhost is supported) with a temporary `code`;
  `POST https://api.github.com/app-manifests/{code}/conversions` (no auth)
  returns `id`, `pem` (PKCS#1), `webhook_secret`, `client_id`,
  `client_secret`, `html_url`, `slug`. Code is valid for one hour.
- **Deploy button / Wrangler auto-provisioning:** D1 (also KV/R2) bindings
  declared **without** a resource ID are auto-provisioned at deploy; the
  button additionally forks the repo and sets up CI. Migrations should run
  from the `deploy` script referencing the **binding** name (`DB`).
- **Turnstile API:** `POST /accounts/{account_id}/challenges/widgets` with a
  Bearer token holding `Turnstile Sites Write`; returns `sitekey` + `secret`.
  Wrangler's OAuth login does not expose a token usable for this call, hence
  the two-path design below.

## Design

### 1. Repo changes enabling auto-provisioning

- `wrangler.jsonc`: remove the `database_id: "REPLACE_AFTER_wrangler_d1_create"`
  placeholder from the D1 binding (keep `binding: "DB"`,
  `database_name: "clawptcha"`). Auto-provisioning then creates the database
  on first deploy for both the wizard and the button.
- `package.json`: `"deploy"` becomes
  `wrangler d1 migrations apply DB --remote && wrangler deploy`
  (migrations reference the binding name per deploy-button docs, so they work
  whatever the operator named the database). Keep `db:migrate`/`db:migrate:local`
  scripts as-is for direct use. Exact provisioning/first-run interaction of
  `d1 migrations apply` on a not-yet-provisioned DB is a
  **verify-at-implementation** point; if apply-before-first-deploy fails, the
  deploy script order flips to `wrangler deploy && wrangler d1 migrations apply DB --remote`.
- Add `tsx` to `devDependencies` if the parallel session's task hasn't landed
  it by implementation time (the wizard runs via tsx like `local-quizgen.mts`).

### 2. `npm run setup` — the wizard

**Files:** `scripts/setup.mts` (interactive shell, thin) +
`scripts/setup-lib.mts` (pure, testable helpers). No new runtime
dependencies: `node:http`, `node:crypto`, `node:readline/promises`,
`node:child_process` (shelling to `npx wrangler`).

Phases (each idempotent-ish: detects prior completion and offers skip):

1. **Preflight.** `npx wrangler whoami` must succeed (else: print
   `npx wrangler login` instruction and exit 1). Warn if git tree looks like
   a template placeholder wasn't updated.
2. **Deploy + discover URL.** Run `npm run deploy`; parse the
   `https://<name>.<subdomain>.workers.dev` URL from wrangler output
   (auto-provisioning creates D1 here; migrations applied by the deploy
   script). Patch `APP_BASE_URL` in `wrangler.jsonc` (targeted string
   replacement preserving JSONC comments/formatting) when it differs, and
   remember whether a final redeploy is needed.
3. **GitHub App via manifest.** Start a localhost HTTP server on an
   OS-assigned port serving (a) `/` — an auto-submitting HTML form that POSTs
   the manifest JSON to `https://github.com/settings/apps/new?state=<nonce>`,
   and (b) `/callback` — receives `?code=&state=`, validates the nonce.
   Manifest fields: prompted app name (default `clawptcha-<cf-account-or-random>`),
   `url` = APP_BASE_URL, `hook_attributes.url` = `<APP_BASE_URL>/webhook`,
   `redirect_url` = the localhost callback, `callback_urls` =
   `[<APP_BASE_URL>/oauth/callback]`, `public: false`,
   `default_permissions: { checks: "write", pull_requests: "write", contents: "read", metadata: "read" }`,
   `default_events: ["pull_request", "issue_comment", "installation"]`.
   Exchange the code via the conversions endpoint; convert `pem` PKCS#1 →
   PKCS#8 with `crypto.createPrivateKey(pem).export({ type: "pkcs8", format: "pem" })`.
   Open the browser via `open`/platform equivalent, with the URL also printed
   for headless use. Finish by offering to open `<html_url>/installations/new`
   so the operator installs the app on a repo.
4. **Turnstile.** If `CLOUDFLARE_API_TOKEN` is set: create the widget via API
   (`domains: [<worker hostname>]`, `mode: "managed"`, name `clawptcha`),
   using the account ID from `wrangler whoami`. Otherwise: print the
   dashboard deep link (`dash.cloudflare.com/?to=/:account/turnstile`) with
   exact instructions and prompt-paste the site key and secret key.
5. **Session key.** `crypto.randomBytes(32).toString("hex")` — never shown,
   never persisted outside the secret store.
6. **Write secrets.** Single `npx wrangler secret bulk` call with the JSON
   piped over **stdin** (secrets never touch disk): GITHUB_APP_ID,
   GITHUB_PRIVATE_KEY (PKCS#8), GITHUB_WEBHOOK_SECRET,
   GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, TURNSTILE_SITE_KEY,
   TURNSTILE_SECRET_KEY, SESSION_SIGNING_KEY. (No LLM secret on the
   workers-ai default path.)
7. **Finalize.** Redeploy if `APP_BASE_URL` changed in step 2. Print a
   no-secrets summary: app slug + link, worker URL, what was created, and
   next steps (install the App on a repo, open a test PR, the README E2E
   checklist).

Failure behavior: each phase prints what to do manually on failure and which
phase to re-run; the wizard is a convenience wrapper around documented manual
steps, never the only path. Ctrl-C-safe: nothing partially-secret is left on
disk at any point.

`package.json` gains `"setup": "tsx scripts/setup.mts"`.

### 3. Deploy to Cloudflare button + README restructure

- Button at the top of the README Deploy section:
  `[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=<REPO_URL>)`
  where `<REPO_URL>` is the canonical GitHub URL (placeholder + TODO note if
  the repo has no public GitHub remote at implementation time).
- Runbook restructured to lead with the two easy paths:
  1. *Quick (recommended):* button (provisions Worker + D1 + bindings) →
     clone your fork → `npx wrangler login && npm run setup`.
  2. *CLI:* clone → `npx wrangler login && npm run setup` (the wizard's first
     deploy provisions everything).
  The existing manual runbook stays, retitled "Manual setup (what the wizard
  does)" — it documents the same steps and doubles as the wizard's failure
  fallback.

### 4. Testing

- `test/setup-lib.test.ts` (main vitest suite) for the pure helpers:
  manifest JSON builder (exact permissions/events/URLs), wrangler output URL
  parser, `wrangler.jsonc` APP_BASE_URL patcher (formatting/comments
  preserved), secrets-JSON builder (correct key set per Turnstile path),
  PKCS#1→PKCS#8 conversion (workerd `nodejs_compat` supports `node:crypto`
  key import/export — **verify-at-implementation**; if not, that one helper
  is exercised by the smoke test instead).
- Wizard smoke test (manual, no-commit): run `npm run setup` far enough to
  verify preflight failure without login, the manifest form renders/parses,
  and the callback rejects a bad state nonce — without creating real
  resources. Full E2E (real app creation) is an operator action noted in the
  README checklist.

## Security notes

- Secrets flow: GitHub conversion response → memory → `wrangler secret bulk`
  stdin. Never argv (visible in `ps`), never temp files, never logged.
- The localhost callback validates a random `state` nonce and only accepts
  one exchange; server closes immediately after.
- The manifest flow means the operator's browser session creates the App —
  the wizard never holds GitHub account credentials.

## Out of scope

- Worker-served `/setup` first-run page (revisit if button-path users skip
  the wizard).
- Turnstile-optional mode.
- `npm run doctor` post-setup verifier (separate future item).
- Publishing/Marketplace listing.
