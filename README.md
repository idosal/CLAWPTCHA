# 🦞 CLAWPTCHA

A repo governance layer for GitHub PRs: maintainers choose which contributions
need extra proof before merge, from diff-specific checks to issue-backed
exemptions and report-only honeypots. AI-written code is fine; unreviewed slop
is not. Passing posts a public attestation; maintainers get a behavioral risk
report.

## How it works

1. Install the GitHub App on a repo and add `.github/clawptcha.yml` if the
   defaults are not your policy.
2. When a PR opens, CLAWPTCHA resolves the repo's governance preferences:
   maintainer/bot/path/size exemptions, trusted linked-issue exemptions, passive
   signals, and any configured gates.
3. If a challenge is required, the PR author opens the link, signs in with
   GitHub, passes Turnstile, and completes the configured gate. CLAWPTCHA
   first builds a cached PR investigation from the file map and selected patch
   evidence, then generates the author-facing quiz from that artifact. Today
   the shipped gate is a multiple-choice quiz about intent, behavior, and
   blast radius. Passive signals such as Turnstile, timing, browser automation
   hints, and report-only honeypots feed the risk report, not the quiz score.
4. Pass (3 of 4 by default) → green check + attestation comment. Fail →
   15-minute cooldown, fresh quiz on retry, up to 3 attempts by default.
5. The check run summary includes a risk report (timings, Turnstile verdict,
   automation fingerprints). CLAWPTCHA never blocks merges on its own outages —
   failures report `neutral`.

## Configure per repo: `.github/clawptcha.yml`

All fields are optional; a maintainer typo in any single field falls back to
that field's default rather than breaking the whole config (`src/config.ts`).
The config is always read from the PR's **merge target** (base branch), never
the PR branch itself, so a PR cannot weaken its own gate.

Copy [templates/clawptcha.yml](templates/clawptcha.yml) when a repository wants
the built-in defaults committed explicitly. The default template uses
`draft_prs: ignore`, so draft PRs stay quiet until they are marked ready for
review. Copy [templates/contributing-policy.md](templates/contributing-policy.md)
when maintainers want a matching contribution-policy snippet: AI assistance is
allowed, but the submitter is accountable for understanding, testing, and
supporting the PR.

```yaml
gates:
  - type: multiple_choice
    questions: 4
    pass_threshold: 3

path_rules:
  - paths: ["src/core/**", "migrations/**", ".github/workflows/**"]
    gates:
      - type: multiple_choice
        questions: 6
        pass_threshold: 5
    require_approval: always

exemptions:
  # Optional. Trust named GitHub logins without relying on broad relationship rules.
  - type: author_login
    logins: [octocat, trusted-bot-owner]

  # Optional. Trust GitHub's author_association signal for prior contributors.
  # OWNER/MEMBER/COLLABORATOR are already exempt by default.
  - type: author_association
    associations: [CONTRIBUTOR]

  # Optional. Trust repo roles or legacy permission groups from GitHub's
  # collaborator permission API.
  - type: repository_permission
    permissions: [write, maintain, admin]

  # Optional. Reuses ordinary GitHub issue workflow; no CLAWPTCHA-specific
  # label is required when the linked issue already has a trusted signal.
  - type: linked_issue_match
    min_match_score: 0.7

signals:
  # Enabled by default. This is a passive risk signal, never a scoring rule.
  - type: honeypot
    report_only: true
  # Optional. Maintainer-authored literal canaries scanned only in added diff lines.
  - type: code_honeypot
    report_only: true
    patterns: ["CLAWPTCHA_DO_NOT_ADD_THIS"]
    paths: ["src/**", "*.md"]

max_attempts: 3
cooldown_minutes: 15
draft_prs: ignore          # challenge | neutral | ignore
require_approval: first_time  # first_time | always | never
bot_policy:
  default: skip            # skip | challenge
  trusted_logins: ["dependabot[bot]", "renovate[bot]"]
rechallenge:
  on_push: never           # never | always | included_paths
  ignore_paths: ["docs/**", "*.md"]
min_changed_lines: 10
skip_paths: ["docs/**", "*.md"]
include_paths: []        # optional opt-in scope, e.g. ["src/core/**"]
context:
  strategy: adaptive     # adaptive | truncate
  investigator: auto     # auto | worker | flue
  map_tokens: 8000       # file-list budget for PR investigation
  detail_tokens: 24000   # selected patch evidence budget
  max_files: 12          # max files with patch evidence
  max_model_calls: 3     # investigation + quiz retries
  ignore_paths: ["dist/**", "*.lock"]
  large_pr:
    changed_files: 100
    changed_lines: 5000
max_context_tokens: null
output:
  comments: normal        # quiet | normal | detailed
  labels: true
```

| Field | Default | Behavior |
|---|---|---|
| `gates` | `[{ type: "multiple_choice", questions: 4, pass_threshold: 3 }]` | Author-facing challenge stages. Today CLAWPTCHA supports `multiple_choice`, with `questions` as an integer 1–10 and `pass_threshold` capped at the question count. |
| `path_rules` | `[]` | First matching path-specific policy override. Supports `paths`, `gates`, `require_approval`, `max_attempts`, `cooldown_minutes`, `min_changed_lines`, `skip_paths`, and `include_paths`. |
| `exemptions` | `[]` | Structured reasons no challenge is required. Today CLAWPTCHA supports `author_login`, `author_association`, `repository_permission`, and `linked_issue_match`. |
| `signals` | `[{ type: "honeypot", report_only: true }]` | Passive risk signals that appear in the maintainer report. Today CLAWPTCHA supports `honeypot`, an off-screen decoy form field that can flag broad automated form filling, and `code_honeypot`, maintainer-authored literal canary patterns scanned only in added diff lines. Set `signals: []` to disable passive honeypot collection. |
| `pass_threshold` | `3` | Legacy shortcut for the default multiple-choice gate's threshold when `gates` is omitted. New configs should prefer `gates[0].pass_threshold`. |
| `max_attempts` | `3` | Integer, 1–10. Total quiz attempts allowed per challenge before the check becomes `failed_final` and stays failed for maintainers to review manually. |
| `cooldown_minutes` | `15` | Integer, ≥ 0. Minutes an author must wait after a failed (non-final) attempt before starting a retry. |
| `draft_prs` | `"ignore"` | Enum: `challenge` \| `neutral` \| `ignore`. Controls whether draft PRs get the normal challenge, a neutral check, or no check. The default keeps drafts quiet until `ready_for_review`. |
| `require_approval` | `"first_time"` | Enum: `first_time` \| `always` \| `never`. `first_time` requires maintainer approval (`/clawptcha approve` PR comment) only when the author's GitHub `author_association` is `FIRST_TIME_CONTRIBUTOR`, `FIRST_TIMER`, or `NONE`; `always` requires approval for every PR; `never` skips the approval gate entirely. An invalid value falls back to `first_time`. |
| `bot_policy` | `{ default: "skip", trusted_logins: [] }` | Structured bot handling. `default: challenge` lets repos challenge bots except named trusted bot logins. Legacy `skip_bots` maps into this when `bot_policy` is omitted. |
| `rechallenge` | `{ on_push: "never", ignore_paths: [] }` | Structured push policy. `on_push` can be `never`, `always`, or `included_paths`; `ignore_paths` keeps low-risk pushes from invalidating a prior pass. `included_paths` uses the effective `include_paths`; when that list is empty it behaves like `always` so stale passes are not silently preserved. |
| `min_changed_lines` | `10` | Diffs with fewer than this many changed lines (additions + deletions) are exempt ("diff below min_changed_lines"). |
| `skip_paths` | `["docs/**", "*.md"]` | Glob list. If **every** changed file in the PR matches at least one pattern, the PR is exempt. PRs with zero reported changed files are never exempted this way. |
| `include_paths` | `[]` | Optional glob list for opt-in scope. When non-empty, a PR is exempt unless at least one changed file matches one of these patterns. PRs with zero reported changed files are never exempted this way. |
| `context` | `{ strategy: "adaptive", investigator: "auto", map_tokens: 8000, detail_tokens: 24000, max_files: 12, max_model_calls: 3, ignore_paths: [], large_pr: { changed_files: 100, changed_lines: 5000 } }` | Controls PR investigation before quiz generation. `context.ignore_paths` removes low-signal files from quiz evidence without changing whether the PR is challenged. `context.investigator: auto` uses the Flue investigator for large PRs when configured. |
| `max_context_tokens` | `null` | Legacy/direct-generation cap used when `context.strategy: truncate`. `null` = uncapped: the full diff is sent to the LLM (bounded only by the model's context window). If set to a positive integer, the diff sent to the LLM is truncated to roughly that many tokens (~4 chars/token estimate) and replaced past that point with a full list of changed filenames. Invalid values fall back to `null`. Adaptive fallback uses a bounded cap from `context.detail_tokens`; large/Flue investigation failures do not fall back to direct raw-diff generation. |
| `output` | `{ comments: "normal", labels: true }` | Controls PR comment volume and whether flagged-pass labels are applied. `comments: quiet` relies on check-run output only; `detailed` includes risk detail in outcome comments. |

Maintainers, repo admins, and users with `OWNER`/`MEMBER`/`COLLABORATOR`
`author_association` are exempt by default regardless of config (checked
before configured author/size/path rules, per `src/policy/exemptions.ts`).

### Author exemptions

Use `author_login` when specific GitHub users should skip the challenge, and
`author_association` when a whole GitHub relationship class should skip it.
Values are normalized case-insensitively, so `OctoCat` and `octocat` are
equivalent, as are `contributor` and `CONTRIBUTOR`.

```yaml
exemptions:
  - type: author_login
    logins: [octocat, trusted-bot-owner]

  - type: author_association
    associations: [CONTRIBUTOR]
```

Use `CONTRIBUTOR` when prior merged contributors should skip the challenge.
Avoid adding `FIRST_TIME_CONTRIBUTOR`, `FIRST_TIMER`, or `NONE` unless the repo
explicitly wants broadly open no-challenge behavior.

Legacy configs can still use `skip_authors`, but new configs should prefer the
structured `author_login` exemption.

### Repository permission exemptions

`repository_permission` lets a repo trust role or permission names returned by
GitHub's collaborator permission API. CLAWPTCHA checks both GitHub's
`role_name` value, such as `maintain`, `admin`, or a custom repository role,
and GitHub's legacy `permission` value, such as `write` or `read`. This reuses
the same GitHub signal CLAWPTCHA already uses for maintainer approvals and
trusted linked issues.

```yaml
exemptions:
  - type: repository_permission
    permissions: [write, maintain, admin]
```

If GitHub cannot resolve the author's permission, CLAWPTCHA falls back to the
configured `gates` rather than treating the author as trusted.

Legacy configs can still use `skip_bots`; when `bot_policy` is omitted it maps
to `bot_policy.default`. New configs should prefer `bot_policy`.

### Contributor accountability policy

CLAWPTCHA is not an AI detector. It is an accountability gate: the author may
use AI, but passing records that they personally understand, tested, and can
support the PR. Repositories dealing with low-effort or unsupported PRs should
also document that policy for humans, not only enforce it in YAML. Start from
[templates/contributing-policy.md](templates/contributing-policy.md) and adapt
it to the project's review norms.

### Linked issue exemptions

`linked_issue_match` looks for normal GitHub closing references in the PR body
(`Fixes #123`, `Closes owner/repo#123`, or a GitHub issue URL), fetches the
issue, and exempts the PR only when:

- the issue has a trusted signal: maintainer/collaborator author, assigned
  maintainer/collaborator, or one of the optional `trusted_labels`;
- the PR title/body/files match the issue's requested outcome at or above
  `min_match_score`;
- the issue is in the same repo, unless `require_same_repo: false` is set.

If the issue is missing, untrusted, or only weakly related, CLAWPTCHA falls back
to the configured `gates`; it does not fail the PR for an uncertain exemption.

### PR investigation

Quiz generation is intentionally two-step by default. On the first quiz start
for a `(repo, PR, head_sha)`, CLAWPTCHA builds a compact investigation artifact
from PR metadata, the paginated changed-file list, and selected patch evidence.
That artifact records intent, behavior changes, affected surfaces, risk areas,
evidence paths, unknowns, quiz anchors, confidence, and whether the PR crossed
the configured large-PR threshold.

The author-facing quiz is generated from the cached artifact, not from a blind
prefix of a huge diff. Retries reuse the same investigation unless the PR head
SHA changes. This keeps large PRs more truthful: when the system cannot inspect
everything, the artifact should say what is unknown instead of pretending a
fixed token cap saw the whole change.

Normal PRs can be investigated inside the main Worker. Large PRs can use the
Flue investigator service in `flue-investigator/`, which exposes
`POST /workflows/investigate-pr?wait=result`. The main Worker calls it with a
shared internal secret and a bounded PR evidence bundle. GitHub installation
tokens are never sent to Flue or stored in workflow payloads. CLAWPTCHA stores
only the validated artifact in D1.

For same-account Cloudflare deployments, prefer a service binding after the
Flue Worker exists:

```jsonc
"services": [
  { "binding": "FLUE_INVESTIGATOR", "service": "clawptcha-flue-investigator" }
]
```

Configure the main Worker with the shared secret:

```text
FLUE_INVESTIGATOR_SECRET=<same random secret as the Flue Worker>
```

For cross-account or external deployments, set `FLUE_INVESTIGATOR_URL` instead
of a service binding.

Configure the Flue investigator Worker with:

```text
CLAWPTCHA_FLUE_SECRET=<same random secret>
CLAWPTCHA_FLUE_MODEL=cloudflare/@cf/zai-org/glm-4.7-flash
```

If `context.investigator: flue` is set and the Flue service is missing or
fails, quiz generation becomes neutral rather than sending the huge raw diff
through the direct prompt path.

### Passive risk signals

`honeypot` renders an off-screen, unfocusable decoy text field in challenge
forms. A normal author should never touch it. If broad form-filling automation
submits a value, CLAWPTCHA records "a hidden form field was submitted" in the
risk report.

`code_honeypot` lets maintainers configure literal canary strings that should
never be introduced by a careful contributor. CLAWPTCHA scans the PR's unified
diff and only matches added lines in the configured `paths`; removed lines and
context lines do not count. If an added line contains a canary, the risk report
records "the PR introduced a configured code honeypot marker" without exposing
the exact marker in the PR comment. If the PR is exempt or reuses a prior pass,
the same report-only signal is shown in the success check summary.

Like Turnstile, timing, pointer summaries, and `webdriver`, passive honeypots
are report-only. A filled form honeypot or matched code canary never changes
the quiz score and never silently fails an otherwise correct challenge on its
own.

When a passed quiz has multiple passive risk signals, CLAWPTCHA marks the check
title and PR comment, and best-effort creates/applies the `clawptcha:flagged`
label so maintainers can spot it from the PR list.

### Path scope

Use `skip_paths` to exempt PRs where every changed file is low-risk, such as
docs-only changes. Use `include_paths` when CLAWPTCHA should only run for core
directories:

```yaml
skip_paths: ["docs/**", "*.md"]
include_paths: ["src/core/**", "packages/runtime/**"]
```

With `include_paths` set, a PR that only touches `examples/**` or docs gets a
green exempt check. A PR that touches at least one included path proceeds
through the normal exemption and gate flow. If GitHub reports zero changed
files, path scope does not exempt the PR.

### Glob semantics (`skip_paths` and `include_paths`)

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

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/idosal/CLAWPTCHA)

Local CLI setup requires Node.js 22.15+ and npm. CLAWPTCHA uses Vite with
Cloudflare's Workers plugin for local development and build output.

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
   npm run db:migrate:local  # optional, for local `npm run dev`
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

5. **Optional: deploy the Flue large-PR investigator.**
   The main Worker works without this service, but `context.investigator: auto`
   uses it for large PRs once configured.
   ```bash
   cd flue-investigator
   npm install
   npm run deploy
   npx wrangler secret put CLAWPTCHA_FLUE_SECRET
   ```
   For same-account deployments, uncomment the `FLUE_INVESTIGATOR` service
   binding example in `wrangler.jsonc`, then use the same random secret for the
   main Worker:
   ```bash
   npx wrangler secret put FLUE_INVESTIGATOR_SECRET
   ```
   If you cannot use a service binding, also set `FLUE_INVESTIGATOR_URL` to the
   Flue Worker's URL.
   The Flue Worker uses Workers AI through its `AI` binding and defaults to
   `cloudflare/@cf/zai-org/glm-4.7-flash`; set `CLAWPTCHA_FLUE_MODEL` on the
   Flue Worker if you want a different Flue model.

6. **Background sweeps.**
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
  distance/sample counts, focus-loss counts, whether the report-only honeypot
  was submitted, whether configured code canaries appeared in added diff lines,
  and automation fingerprints (e.g. a `webdriver` flag). There is no keystroke
  logging or content capture, and its collection is disclosed on the quiz page.
  Turnstile and telemetry inform the risk report; neither one blocks a pass on
  its own.
- Webhook payloads are authenticated via HMAC-SHA256 signature verification
  (`x-hub-signature-256`) before any processing happens.

## Known v1 limitations

- **Not an unbeatable gate.** A contributor whose coding agent has computer
  use (e.g. an agent that can drive a browser) can have that agent take the
  quiz itself. CLAWPTCHA does not claim to prevent this — the product is
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
- **PR comment lookup is not paginated.** `upsertPrComment`'s
  existing-comment lookup requests a single page (`per_page=100`). PRs with
  more than 100 existing issue comments on the thread may fail to find/update
  CLAWPTCHA's own tracked comment and may get a duplicate comment.

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
      `rechallenge.on_push: never`).
- [ ] Open a docs-only PR → gets a success check with an "Exempt" summary.
- [ ] Fail a quiz deliberately → red check, cooldown message shown; retrying
      after the cooldown gets a freshly generated quiz.
- [ ] Temporarily break the LLM config (e.g. set `LLM_MODEL` to a nonexistent
      model, or an invalid `LLM_API_KEY`) and start a quiz → check goes
      `neutral`, merge is not blocked.
