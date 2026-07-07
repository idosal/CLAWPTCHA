---
title: Deployment
description: Managed and self-deployed setup paths for CLAWPTCHA, including GitHub App, Turnstile, model provider, Flue, and cron requirements.
---

CLAWPTCHA can run as the free managed service for public open-source
repositories, or as a self-deployed Cloudflare Worker in your own account. Both
models keep repository policy in `.github/clawptcha.yml`.

## Managed service

Use the managed service when you want CLAWPTCHA without operating the Worker,
D1 database, model provider, Turnstile, or optional large-PR investigator.

The managed service is intended for installed public repositories. The visible
outcome is posted to the pull request as review evidence. See
[Privacy and data](/docs/privacy-data/) for what is stored and what stays
transient.

## Self-deploy

Self-deploy when you want to control Cloudflare account, storage, model
provider, GitHub App, secrets, and retention posture.

Local setup requires Node.js 22.15 or newer and npm.

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
wizard so the GitHub App, OAuth callback, Turnstile, and secrets are configured.

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
   - OAuth callback URL: `https://<your-worker>/oauth/callback`;
   - events: Pull request, Issue comment, Installation;
   - permissions: Checks read/write, Pull requests read/write, Contents
     read-only, Metadata read-only, Members read-only.

   Members read is needed only for `github_team` exemptions. Leave team
   exemptions unset if you do not want team membership lookups.

3. Convert the GitHub private key to PKCS#8 if needed.

   ```bash
   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app-pkcs8.pem
   ```

4. Create a Cloudflare Turnstile widget for the Worker domain.

5. Set Worker secrets.

   ```text
   GITHUB_APP_ID
   GITHUB_PRIVATE_KEY
   GITHUB_WEBHOOK_SECRET
   GITHUB_OAUTH_CLIENT_ID
   GITHUB_OAUTH_CLIENT_SECRET
   TURNSTILE_SITE_KEY
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

Same-account deployments should prefer a service binding:

```jsonc
"services": [
  { "binding": "FLUE_INVESTIGATOR", "service": "clawptcha-flue-investigator" }
]
```

Set the shared secret on the main Worker:

```bash
npx wrangler secret put FLUE_INVESTIGATOR_SECRET
```

For external deployments, set `FLUE_INVESTIGATOR_URL` plus
`FLUE_INVESTIGATOR_SECRET`.

If `context.investigator: flue` is configured and the service is unavailable,
CLAWPTCHA reports neutral instead of falling back to raw large-diff generation.

## Scheduled sweep

The Worker includes a cron trigger that runs every 15 minutes. It removes old
rate-limit/session rows, neutralizes stale challenge setup, and reconciles
terminal challenges whose check-run update failed after the database state was
committed.

No separate service is required; deploy registers the trigger from
`wrangler.jsonc`.
