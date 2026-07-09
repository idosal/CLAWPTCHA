---
title: Deployment
description: Self-deployed setup for VOUCHA, including GitHub App, Turnstile, model provider, Flue, and cron requirements.
---

VOUCHA currently runs as a self-deployed Cloudflare Worker in your own
account. Repository policy stays in `.github/voucha.yml`; credentials and
storage stay under the operator's Cloudflare and GitHub accounts.

Self-deploy when you want to control Cloudflare account, storage, model
provider, GitHub App, secrets, and retention posture.

Local setup requires Node.js 22.22.1 or newer and npm.

```bash
npx wrangler login && npm run setup
```

The setup wizard builds and deploys the Worker, provisions D1, creates the
GitHub App through the manifest flow, configures Turnstile, generates the
session signing key, and writes Worker secrets. Secrets are sent to Wrangler
through the secret APIs rather than saved in project files.

## Deploy button path

The Cloudflare deploy button can provision the Worker, D1 database, and Workers
AI binding from a fork. After that, clone the fork and run the same setup
wizard so the GitHub App, Turnstile, and secrets are configured.

```bash
npx wrangler login && npm run setup
```

The wizard's deploy step is safe to rerun against already-provisioned
resources.

## Manual setup

Manual setup is useful when a wizard phase fails or when an operator wants to
control every credential by hand.

1. Deploy the Worker and apply migrations.

   ```bash
   npm run deploy
   ```

   `npm run deploy` builds, deploys the Worker, and applies remote D1
   migrations. Use `npm run db:migrate:local` only when preparing local
   development data for `npm run dev`.

2. Create a GitHub App.

   Configure:

   - webhook URL: `https://<your-worker>/webhook`;
   - events: Pull request, Issue comment, Installation;
   - permissions: Checks read/write, Pull requests read/write (comments and
     optional auto-close), Contents
     read-only, Metadata read-only, Members read-only.

   Members read is needed only for `github_team` exemptions. Leave team
   exemptions unset if you do not want team membership lookups.

3. Convert the GitHub private key to PKCS#8 if needed.

   ```bash
   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app-pkcs8.pem
   ```

4. Create a Cloudflare Turnstile widget for the Worker domain. Use a real
   domain-bound widget in production, not Cloudflare's public testing keys.

5. Set public Worker vars.

   ```text
   APP_BASE_URL
   TURNSTILE_SITE_KEY
   LLM_PROVIDER
   LLM_MODEL
   AI_GATEWAY_ID
   ```

6. Set Worker secrets.

   ```text
   GITHUB_APP_ID
   GITHUB_PRIVATE_KEY
   GITHUB_WEBHOOK_SECRET
   TURNSTILE_SECRET_KEY
   SESSION_SIGNING_KEY
   LLM_API_KEY
   ```

   `LLM_API_KEY` is only needed for `anthropic` or keyed `openai-compat`
   providers.

## Model providers

Most self-deploys should start with `workers-ai`. It uses the Cloudflare AI
binding and does not require an external model API key.

Other options:

- `anthropic`: direct Anthropic API with `LLM_API_KEY`;
- `openai-compat`: any `/chat/completions` compatible endpoint with
  `LLM_BASE_URL`, `LLM_MODEL`, and optional `LLM_API_KEY`.

Model provider failures should resolve the challenge as neutral rather than
blocking the PR.

## Flue investigator

The main Worker can investigate normal PRs without Flue. Configure the optional
Flue investigator when large PRs are common and you want large evidence bundles
handled outside the main Worker.

Deploy the Flue Worker, then configure the main Worker with a service binding:

```jsonc
"services": [
  { "binding": "FLUE_INVESTIGATOR", "service": "voucha-flue-investigator" }
]
```

The Flue Worker is service-binding-only. It disables `workers.dev`, does not
require a shared secret, and does not support an external URL fallback.

If `context.investigator: flue` is configured and the service is unavailable,
VOUCHA reports neutral instead of falling back to raw large-diff generation.

## Scheduled sweep

The Worker includes a cron trigger that runs every 15 minutes. It removes old
rate-limit/session rows, neutralizes stale challenge setup, and reconciles
terminal challenges whose check-run update failed after the database state was
committed.

No separate service is required; deploy registers the trigger from
`wrangler.jsonc`.
