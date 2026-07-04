# 🦞 Clawptcha

A captcha for GitHub contributions: gates PRs behind a short comprehension quiz
about the change itself. AI-written code is fine — not understanding it is not.
Passing posts a public attestation; maintainers get a behavioral risk report.

## How it works

1. Install the GitHub App on a repo.
2. When a PR opens, a `clawptcha` check + comment appear. First-time contributors
   need a maintainer to comment `/clawptcha approve` (configurable via
   `require_approval`).
3. The PR author opens the challenge link, signs in with GitHub, passes
   Turnstile, and takes a 4-question quiz generated from the diff (intent /
   blast radius / spot-the-false-claim).
4. Pass (3 of 4 by default) → green check + attestation comment. Fail →
   15-minute cooldown, fresh quiz on retry, up to 3 attempts by default.
5. The check run summary includes a risk report (timings, Turnstile verdict,
   automation fingerprints). Clawptcha never blocks merges on its own outages —
   failures report `neutral`.

## Configure per repo: `.github/clawptcha.yml`

All fields are optional; a maintainer typo in any single field falls back to
that field's default rather than breaking the whole config (`src/config.ts`).
The config is always read from the PR's **merge target** (base branch), never
the PR branch itself, so a PR cannot weaken its own gate.

```yaml
gates:
  - type: multiple_choice
    questions: 4
    pass_threshold: 3

exemptions:
  # Optional. Reuses ordinary GitHub issue workflow; no Clawptcha-specific
  # label is required when the linked issue already has a trusted signal.
  - type: linked_issue_match
    min_match_score: 0.7

max_attempts: 3
cooldown_minutes: 15
require_approval: first_time  # first_time | always | never
rechallenge_on_push: false
skip_authors: []
skip_bots: true
min_changed_lines: 10
skip_paths: ["docs/**", "*.md"]
max_context_tokens: null
```

| Field | Default | Behavior |
|---|---|---|
| `gates` | `[{ type: "multiple_choice", questions: 4, pass_threshold: 3 }]` | Author-facing challenge stages. Today Clawptcha supports `multiple_choice`, with `questions` as an integer 1–10 and `pass_threshold` capped at the question count. |
| `exemptions` | `[]` | Structured reasons no challenge is required. Today Clawptcha supports `linked_issue_match`, which can exempt a PR when it closes a trusted issue and the issue intent matches the PR. |
| `pass_threshold` | `3` | Legacy shortcut for the default multiple-choice gate's threshold when `gates` is omitted. New configs should prefer `gates[0].pass_threshold`. |
| `max_attempts` | `3` | Integer, 1–10. Total quiz attempts allowed per challenge before the check becomes `failed_final` and stays failed for maintainers to review manually. |
| `cooldown_minutes` | `15` | Integer, ≥ 0. Minutes an author must wait after a failed (non-final) attempt before starting a retry. |
| `require_approval` | `"first_time"` | Enum: `first_time` \| `always` \| `never`. `first_time` requires maintainer approval (`/clawptcha approve` PR comment) only when the author's GitHub `author_association` is `FIRST_TIME_CONTRIBUTOR`, `FIRST_TIMER`, or `NONE`; `always` requires approval for every PR; `never` skips the approval gate entirely. An invalid value falls back to `first_time`. |
| `rechallenge_on_push` | `false` | If `false`, a `synchronize` event (new commits) on a PR that already passed keeps the pass (auto green check). If `true`, any new head SHA invalidates the prior pass and issues a brand-new challenge. |
| `skip_authors` | `[]` | List of GitHub logins always exempt from the quiz (case-insensitive match). |
| `skip_bots` | `true` | If `true`, PR authors whose GitHub account type is `Bot` (e.g. dependabot, renovate) are auto-exempt. |
| `min_changed_lines` | `10` | Diffs with fewer than this many changed lines (additions + deletions) are exempt ("diff below min_changed_lines"). |
| `skip_paths` | `["docs/**", "*.md"]` | Glob list. If **every** changed file in the PR matches at least one pattern, the PR is exempt. PRs with zero reported changed files are never exempted this way. |
| `max_context_tokens` | `null` | `null` = uncapped: the full diff is sent to the LLM (bounded only by the model's context window). If set to a positive integer, the diff sent to the LLM is truncated to roughly that many tokens (~4 chars/token estimate) and replaced past that point with a full list of changed filenames. Invalid values (including `0` or negative numbers) fall back to `null`, not to some non-null default — `null` is the documented, deliberately fail-open default for this field. |

Maintainers, repo admins, and users with `OWNER`/`MEMBER`/`COLLABORATOR`
`author_association` are exempt by default regardless of config (checked
before `skip_authors`/size/path rules, per `src/policy/exemptions.ts`).

### Linked issue exemptions

`linked_issue_match` looks for normal GitHub closing references in the PR body
(`Fixes #123`, `Closes owner/repo#123`, or a GitHub issue URL), fetches the
issue, and exempts the PR only when:

- the issue has a trusted signal: maintainer/collaborator author, assigned
  maintainer/collaborator, or one of the optional `trusted_labels`;
- the PR title/body/files match the issue's requested outcome at or above
  `min_match_score`;
- the issue is in the same repo, unless `require_same_repo: false` is set.

If the issue is missing, untrusted, or only weakly related, Clawptcha falls back
to the configured `gates`; it does not fail the PR for an uncertain exemption.

### Glob semantics (`skip_paths`)

Implemented in `src/policy/exemptions.ts` (`matchesGlob`), evaluated per path
segment (split on `/`) — no regex, so it can't backtrack pathologically:

- `**` spans path segments and matches **zero or more** whole segments (so
  `docs/**` matches both `docs/a.md` and `docs/a/b/c.md`, and also `docs`
  itself if it appeared as a bare changed-file path).
- `*` matches within a single path segment only (so `*.md` matches
  `README.md` but not `docs/README.md`).
- Every other character — including `?`, `.`, `(` — is matched **literally**,
  not as a special glob/regex character.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=REPLACE_WITH_PUBLIC_GITHUB_URL)
<!-- TODO(publish): replace REPLACE_WITH_PUBLIC_GITHUB_URL with this repo's public GitHub URL when it's pushed. -->

Two easy paths — both end with the same wizard:

- **Deploy button (no local tooling to start):** click the button — Cloudflare
  forks the repo and provisions the Worker, D1 database, and Workers AI
  binding. Then clone **your fork** and run the wizard for the GitHub-side
  setup (its deploy step re-runs harmlessly against the already-provisioned
  resources):
  ```bash
  npx wrangler login && npm run setup
  ```
- **CLI:** clone this repo, then:
  ```bash
  npx wrangler login && npm run setup
  ```
  The wizard's first deploy auto-provisions D1 and applies migrations; it then
  creates the GitHub App in one click (manifest flow — app ID, webhook secret,
  private key, and OAuth credentials all come back from a single exchange, and
  the key is converted to PKCS#8 for you), sets up Turnstile (automatic if
  `CLOUDFLARE_API_TOKEN` with **Turnstile Sites Write** is set; guided
  copy-paste otherwise), generates the session signing key, and writes all 8
  secrets in one bulk call — they never touch disk or argv. The wizard keeps
  the default Workers AI provider (no API key needed, billed to your
  Cloudflare account, Kimi K2.7 Code by default); to use Anthropic or an
  OpenAI-compatible endpoint instead, see **Configure the LLM provider** in
  Manual setup below.

When the wizard finishes: install the GitHub App on a repo, open a test PR,
and walk the E2E checklist at the bottom of this file.

### Manual setup (what the wizard does)

If you prefer doing it by hand, or a wizard phase fails and points you here:

1. **Deploy (D1 is auto-provisioned) and apply migrations.**
   ```bash
   npm run deploy            # deploys and applies migrations/ to the remote D1
   npm run db:migrate:local  # optional, for local `wrangler dev`
   ```
   The D1 binding in `wrangler.jsonc` has no `database_id` — Wrangler creates
   the database on first deploy.

2. **Create a GitHub App** (github.com → Settings → Developer settings → GitHub Apps):
   - Webhook URL: `https://<your-worker>/webhook`; webhook secret = the value
     you'll put in `GITHUB_WEBHOOK_SECRET`.
   - Permissions: **Checks: Read & write**, **Pull requests: Read & write**,
     **Contents: Read-only**, **Metadata: Read-only**.
   - Subscribe to events: **Pull request**, **Issue comment**, **Installation**.
   - Under "Identifying and authorizing users", set the OAuth callback URL to
     `https://<your-worker>/oauth/callback` (this is used to identify the PR
     author taking the quiz, separate from app installation).
   - Generate a private key (downloads as PKCS#1, `BEGIN RSA PRIVATE KEY`).
     Web Crypto (used by the Worker) only imports PKCS#8, so convert it once:
     ```bash
     openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app-pkcs8.pem
     ```
     Use the contents of `app-pkcs8.pem` as `GITHUB_PRIVATE_KEY`. (The Worker
     detects and rejects a PKCS#1 key at runtime with an error pointing back
     at this command.)
   - Install the app on the target repo(s)/org.

3. **Create a Cloudflare Turnstile widget** (Cloudflare dashboard → Turnstile)
   for the domain the Worker will be served from. Note the site key and
   secret key.

4. **Configure the LLM provider** (`vars` in `wrangler.jsonc`) and **set the
   secrets** (`wrangler secret put <NAME>`), matching `Env` in `src/types.ts`:

   Most self-hosters should keep the default `workers-ai` — it needs no
   external API key and bills to your Cloudflare account. Choose `anthropic`
   or `openai-compat` only if you want a specific model or provider.

   Providers (`LLM_PROVIDER`):
   - `workers-ai` (default) — runs on your Cloudflare account's Workers AI.
     No LLM secret needed. `LLM_MODEL` defaults to Kimi K2.7 Code
     (`@cf/moonshotai/kimi-k2.7-code`). Optionally set `AI_GATEWAY_ID` to an
     AI Gateway for spend caps and analytics.
   - `anthropic` — direct Anthropic API. Set `LLM_MODEL` (e.g.
     `claude-sonnet-5`) and secret `LLM_API_KEY`.
   - `openai-compat` — any `/chat/completions` endpoint (OpenAI, Groq, local
     vLLM). Set `LLM_BASE_URL` (e.g. `https://api.openai.com/v1`),
     `LLM_MODEL`, and secret `LLM_API_KEY` if the endpoint needs one.

   Secrets (8, or 9 with `LLM_API_KEY`):
   - `GITHUB_APP_ID`
   - `GITHUB_PRIVATE_KEY` (PKCS#8 PEM from step 2)
   - `GITHUB_WEBHOOK_SECRET`
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - `TURNSTILE_SITE_KEY`
   - `TURNSTILE_SECRET_KEY`
   - `SESSION_SIGNING_KEY` (random 32+ bytes, hex — signs the session cookie)
   - `LLM_API_KEY` (only for `anthropic` / keyed `openai-compat`)

   Also confirm `APP_BASE_URL` in `wrangler.jsonc` matches your Worker's URL.

5. **Background sweeps.**
   A cron trigger (`*/15 * * * *`, already in `wrangler.jsonc`) runs
   `sweepStaleChallenges` to purge old rate-limit events and sessions and to
   neutralize challenges that have gone stale (no quiz attempt in 24h) or
   whose terminal check-run update failed to land. No extra setup — the deploy
   in step 1 registers the cron.

## Data custody & security

- The service **never holds maintainers' secrets**. Repo access is entirely
  through the GitHub App installation model: the only long-lived credential
  is the operator's own App private key. Per-repo access uses short-lived
  (~1 hour) installation tokens minted on demand and cached in memory only.
- PR diffs are read transiently to generate quiz questions and are **never
  persisted**. Only the generated quiz questions (with correct answers,
  server-side only) and a config snapshot are stored in D1 while a challenge
  is active.
- Once a challenge reaches a terminal state (`passed` or `failed_final`), its
  stored quiz question text is purged (`questions_json` is overwritten to an
  empty list) while score, answers, and telemetry are retained as an audit
  trail.
- Telemetry captured during the quiz is **summary statistics only** —
  per-question timings, answer-change counts, aggregate pointer-movement
  distance/sample counts, focus-loss counts, and automation fingerprints
  (e.g. a `webdriver` flag). There is no keystroke logging or content
  capture, and its collection is disclosed on the quiz page. Turnstile and
  telemetry inform the risk report; neither one blocks a pass on its own.
- Webhook payloads are authenticated via HMAC-SHA256 signature verification
  (`x-hub-signature-256`) before any processing happens.

## Known v1 limitations

- **Not an unbeatable gate.** A contributor whose coding agent has computer
  use (e.g. an agent that can drive a browser) can have that agent take the
  quiz itself. Clawptcha does not claim to prevent this — the product is
  attestation (making a pass a deliberate, on-the-record claim of
  understanding) plus a behavioral risk report for maintainers, not a proof
  of humanness.
- **Prompt injection into quiz generation.** The PR diff, title, and
  description flow directly into the LLM generation prompt, so a hostile
  author can try to steer the model toward an easier quiz. This is bounded:
  correct answers never reach the client, so an attacker can't verify an
  injection worked — worst case is a somewhat easier quiz, not a reliable
  bypass.
- **Webhook processing is async, fire-and-forget.** `POST /webhook` verifies
  the signature synchronously, returns `200 ok` immediately, and does the
  actual GitHub API work inside `c.executionCtx.waitUntil(...)`. If that
  background work throws, the error is only logged — there's no delivery
  ledger or retry from the Worker's side. Recovery today relies on GitHub's
  own webhook redelivery (the PR-event handler is idempotent per
  `(repo, pr_number, head_sha)`) and on the 15-minute cron sweep, which
  neutralizes challenges that never got a quiz attempt within 24 hours and
  reconciles terminal challenges whose check-run update failed to land.
- **PR file/comment listing is not paginated.** `listPrFiles` and
  `upsertPrComment`'s existing-comment lookup both request a single page
  (`per_page=100`). PRs with more than 100 changed files or more than 100
  existing issue comments on the thread will see truncated file lists (which
  can affect `skip_paths` exemption evaluation and LLM context) or may fail
  to find/update Clawptcha's own tracked comment.

## Manual E2E verification checklist

Requires a deployed Worker and a demo repo with the GitHub App installed;
cannot run in CI. Walk each scenario and record the outcome:

- [ ] Open a PR from a non-maintainer account → check goes `queued`, a PR
      comment appears, status is `awaiting_approval`.
- [ ] Comment `/clawptcha approve` from a maintainer account → the comment
      updates with the challenge link.
- [ ] Open the link, OAuth as the PR author, pass Turnstile, answer the
      quiz → green check, attestation comment posted, risk report visible in
      the check run details.
- [ ] Push a new commit → the new head SHA keeps the existing pass (default
      `rechallenge_on_push: false`).
- [ ] Open a docs-only PR → gets a success check with an "Exempt" summary.
- [ ] Fail a quiz deliberately → red check, cooldown message shown; retrying
      after the cooldown gets a freshly generated quiz.
- [ ] Temporarily break the LLM config (e.g. set `LLM_MODEL` to a nonexistent
      model, or an invalid `LLM_API_KEY`) and start a quiz → check goes
      `neutral`, merge is not blocked.
