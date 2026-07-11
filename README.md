# VOUCHA

A repo governance layer for GitHub PRs: maintainers choose which contributions
need an accountability check before merge, from diff-specific questions to
issue-backed exemptions and report-only honeypots. AI-written code is fine;
submitting changes without understanding them is not. Challenge answers must
come from the PR author's own understanding. Passing posts a public
attestation; maintainers get a behavioral risk report.

**[Install VOUCHA on GitHub](https://github.com/apps/voucha-app/installations/new)**
· **[See the live demo](https://github.com/idosal/voucha-owner-check-e2e/pull/7)**
· **[Read the docs](https://voucha.dev/docs/)**

![VOUCHA uses repository-specific contributor wording in its managed pull request comment](https://raw.githubusercontent.com/idosal/voucha-owner-check-e2e/main/docs/screenshots/voucha-custom-comment.jpg)

The hosted app is free for public repositories. Install it, select a repository,
and open a pull request; the built-in defaults work without a policy file.
Private repositories and teams that want full control can
[self-host the same open-source app](#self-host-voucha).

## Quick start

1. [Install the hosted GitHub App](https://github.com/apps/voucha-app/installations/new)
   and select a public repository.
2. Open a pull request. VOUCHA resolves trust and path exemptions first, then
   adds a comprehension check only when the repository policy calls for one.
3. Keep the defaults, or copy [`templates/voucha.yml`](templates/voucha.yml) to
   `.github/voucha.yml` on the merge target branch and adapt it to your review
   risks.
4. Walk through [the public demo PR](https://github.com/idosal/voucha-owner-check-e2e/pull/7)
   to see the GitHub check, author verification, diff-specific challenge, and
   resulting attestation in context.

## How it works

1. Install the GitHub App on a repo and add `.github/voucha.yml` if the
   defaults are not your policy.
2. When a PR opens, VOUCHA resolves the repo's governance preferences:
   draft handling, optional PR-body accountability fields, maintainer/bot/path/
   size exemptions, team and repository-role trust, prior contributor history,
   trusted linked-issue exemptions, passive signals, and any configured gates.
3. If a challenge is required, the PR author opens the link, verifies from the
   PR with a one-time GitHub comment, passes Turnstile, and completes the gate.
   VOUCHA first builds a cached PR investigation from the file map and selected patch
   evidence, then generates the author-facing quiz from that artifact. Today
   the shipped gate is a multiple-choice quiz about intent, behavior, and
   affected surfaces. Turnstile, browser automation checks, and repeated
   server-measured sub-two-second answers can fail the gate with a clear reason;
   merely fast answers, pointer/focus summaries, and honeypots stay report-only.
4. Pass (3 of 4 by default) → green check + attestation comment. Fail →
   15-minute cooldown, fresh quiz on retry, up to 3 attempts by default.
5. The check run summary includes a risk report (timings, Turnstile verdict,
   automation fingerprints). VOUCHA never blocks merges on its own outages —
   failures report `neutral`.

## Configure per repo: `.github/voucha.yml`

All fields are optional; a maintainer typo in any single field falls back to
that field's default rather than breaking the whole config (`src/config.ts`).
The config is always read from the PR's **merge target** (base branch), never
the PR branch itself, so a PR cannot weaken its own gate.

Copy [templates/voucha.yml](templates/voucha.yml) when a repository wants
the built-in defaults committed explicitly. The default template uses
`draft_prs: ignore`, so draft PRs stay quiet until they are marked ready for
review. Copy [templates/contributing-policy.md](templates/contributing-policy.md)
and [templates/pull_request_template.md](templates/pull_request_template.md)
when maintainers want matching human-facing policy: AI assistance in authoring
is allowed, but challenge answers must come from the author's own
understanding. The submitter is accountable for understanding, testing, and
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
  # OWNER/MEMBER/COLLABORATOR are trusted by default through `trust`.
  - type: author_association
    associations: [CONTRIBUTOR]

  # Optional. Trust repo roles or legacy permission groups from GitHub's
  # collaborator permission API.
  - type: repository_permission
    permissions: [write, maintain, admin]

  # Optional. Trust members of GitHub teams. Bare team slugs use the repo owner.
  # This needs GitHub App "Members: read" organization permission.
  - type: github_team
    teams: [maintainers, octo-org/security]

  # Optional. Trust authors after enough merged PRs in this repository.
  - type: prior_merged_prs
    min_count: 3

  # Optional. Reuses ordinary GitHub issue workflow; no VOUCHA-specific
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
    patterns: ["VOUCHA_DO_NOT_ADD_THIS"]
    paths: ["src/**", "*.md"]

max_attempts: 3
cooldown_minutes: 15
draft_prs: ignore          # challenge | neutral | ignore
require_approval: first_time  # first_time | always | never
trust:
  default_author_associations: [OWNER, MEMBER, COLLABORATOR]
accountability:
  require_pr_acknowledgement: false
  require_ai_disclosure: false
bot_policy:
  default: skip            # skip | challenge
  trusted_logins: ["dependabot[bot]", "renovate[bot]"]
rechallenge:
  on_push: included_paths  # never | always | included_paths
  ignore_paths: ["docs/**", "*.md"]
  questions: 2             # max follow-up quiz length, 1-10
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
  # Optional Markdown intro; supports {{author}}, {{max_attempts}}, and {{challenge_url}}
  contributor_message: null
enforcement:
  auto_close: false       # false | true, or { enabled: true, outcomes: [failed_final] }
```

| Field | Default | Behavior |
|---|---|---|
| `gates` | `[{ type: "multiple_choice", questions: 4, pass_threshold: 3 }]` | Author-facing challenge stages. Today VOUCHA supports `multiple_choice`, with `questions` as an integer 1–10 and `pass_threshold` capped at the question count. |
| `path_rules` | `[]` | First matching path-specific policy override. Supports `paths`, `gates`, `require_approval`, `max_attempts`, `cooldown_minutes`, `min_changed_lines`, `skip_paths`, and `include_paths`. |
| `exemptions` | `[]` | Structured reasons no challenge is required. Today VOUCHA supports `author_login`, `author_association`, `repository_permission`, `github_team`, `prior_merged_prs`, and `linked_issue_match`. |
| `signals` | `[{ type: "honeypot", report_only: true }]` | Passive risk signals that appear in the maintainer report. Today VOUCHA supports `honeypot`, an off-screen decoy form field that can flag broad automated form filling, and `code_honeypot`, maintainer-authored literal canary patterns scanned only in added diff lines. Set `signals: []` to disable passive honeypot collection. |
| `pass_threshold` | `3` | Legacy shortcut for the default multiple-choice gate's threshold when `gates` is omitted. New configs should prefer `gates[0].pass_threshold`. |
| `max_attempts` | `3` | Integer, 1–10. Total quiz attempts allowed per challenge before the check becomes `failed_final`; maintainers review manually unless `enforcement.auto_close` is enabled for that outcome. |
| `cooldown_minutes` | `15` | Integer, ≥ 0. Minutes an author must wait after a failed (non-final) attempt before starting a retry. |
| `draft_prs` | `"ignore"` | Enum: `challenge` \| `neutral` \| `ignore`. Controls whether draft PRs get the normal challenge, a neutral check, or no check. The default keeps drafts quiet until `ready_for_review`. |
| `require_approval` | `"first_time"` | Enum: `first_time` \| `always` \| `never`. `first_time` requires maintainer approval (`/voucha approve` PR comment) only when the author's GitHub `author_association` is `FIRST_TIME_CONTRIBUTOR`, `FIRST_TIMER`, or `NONE`; `always` requires approval for every PR; `never` skips the approval gate entirely. An invalid value falls back to `first_time`. |
| `trust` | `{ default_author_associations: ["OWNER", "MEMBER", "COLLABORATOR"] }` | Built-in GitHub `author_association` classes that skip the challenge before other author, size, and path rules. Set `default_author_associations: []` when owners, members, and collaborators should take the challenge too. |
| `accountability` | `{ require_pr_acknowledgement: false, require_ai_disclosure: false }` | Optional PR-body preflight. When enabled, VOUCHA fails the check before creating a quiz unless the PR body has the configured acknowledgement and/or AI assistance disclosure line. |
| `bot_policy` | `{ default: "skip", trusted_logins: [] }` | Structured bot handling. `default: challenge` lets repos challenge bots except named trusted bot logins. Legacy `skip_bots` maps into this when `bot_policy` is omitted. |
| `rechallenge` | `{ on_push: "included_paths", ignore_paths: ["docs/**", "*.md"], questions: 2 }` | Delta-aware push policy. VOUCHA compares the latest passed head with the new head. `never` carries the pass forward, `always` resets on any non-ignored delta, and `included_paths` resets only when the delta reaches the effective `include_paths` (or any non-ignored file when `include_paths` is empty). A reset creates an up-to-`questions`-long follow-up quiz using only that delta and excludes ignored files from its evidence. |
| `min_changed_lines` | `10` | Diffs with fewer than this many changed lines (additions + deletions) are exempt ("diff below min_changed_lines"). |
| `skip_paths` | `["docs/**", "*.md"]` | Glob list. If **every** changed file in the PR matches at least one pattern, the PR is exempt. PRs with zero reported changed files are never exempted this way. |
| `include_paths` | `[]` | Optional glob list for opt-in scope. When non-empty, a PR is exempt unless at least one changed file matches one of these patterns. PRs with zero reported changed files are never exempted this way. |
| `context` | `{ strategy: "adaptive", investigator: "auto", map_tokens: 8000, detail_tokens: 24000, max_files: 12, max_model_calls: 3, ignore_paths: [], large_pr: { changed_files: 100, changed_lines: 5000 } }` | Controls PR investigation before quiz generation. `context.ignore_paths` removes low-signal files from quiz evidence without changing whether the PR is challenged. `context.investigator: auto` uses the Flue investigator for large PRs when configured. |
| `max_context_tokens` | `null` | Legacy/direct-generation cap used when `context.strategy: truncate`. `null` = uncapped: the full diff is sent to the LLM (bounded only by the model's context window). If set to a positive integer, the diff sent to the LLM is truncated to roughly that many tokens (~4 chars/token estimate) and replaced past that point with a full list of changed filenames. Invalid values fall back to `null`. Adaptive fallback uses a bounded cap from `context.detail_tokens`; large/Flue investigation failures do not fall back to direct raw-diff generation. |
| `output` | `{ comments: "normal", labels: true, contributor_message: null }` | Controls PR comment volume, optional repository-specific challenge wording, and flagged-pass labels. `contributor_message` supports Markdown plus `{{author}}`, `{{max_attempts}}`, and `{{challenge_url}}`; `comments: quiet` relies on check-run output only, while `detailed` includes risk detail in outcome comments. |
| `enforcement` | `{ auto_close: { enabled: false, outcomes: ["failed_assisted", "failed_final"] } }` | Optional PR auto-close behavior. When enabled, VOUCHA closes PRs after configured terminal hard failures only; retryable failures and neutral service failures are never auto-closed. |

Maintainers, repo admins, and users with `OWNER`/`MEMBER`/`COLLABORATOR`
`author_association` are exempt by default through `trust.default_author_associations`
(checked before configured author/size/path rules, per `src/policy/exemptions.ts`).
Set that list to `[]` when a repository wants maintainers and owners to take
the challenge too.

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

To change the built-in owner/member/collaborator trust posture:

```yaml
trust:
  default_author_associations: []
```

Legacy configs can still use `skip_authors`, but new configs should prefer the
structured `author_login` exemption.

### Repository permission exemptions

`repository_permission` lets a repo trust role or permission names returned by
GitHub's collaborator permission API. VOUCHA checks both GitHub's
`role_name` value, such as `maintain`, `admin`, or a custom repository role,
and GitHub's legacy `permission` value, such as `write` or `read`. This reuses
the same GitHub signal VOUCHA already uses for maintainer approvals and
trusted linked issues.

```yaml
exemptions:
  - type: repository_permission
    permissions: [write, maintain, admin]
```

If GitHub cannot resolve the author's permission, VOUCHA falls back to the
configured `gates` rather than treating the author as trusted.

Legacy configs can still use `skip_bots`; when `bot_policy` is omitted it maps
to `bot_policy.default`. New configs should prefer `bot_policy`.

### Team and contributor-history exemptions

`github_team` lets organization repos trust named GitHub teams. Bare team slugs
use the repository owner (`maintainers` in `octo-org/repo` means
`octo-org/maintainers`); `org/team-slug` can point at a specific organization.
The membership must be active, and GitHub must let the app read team membership.

```yaml
exemptions:
  - type: github_team
    teams: [maintainers, octo-org/security]
    roles: [member, maintainer] # optional; defaults to both
```

This requires the GitHub App to have **Members: Read-only** organization
permission. If membership cannot be resolved, VOUCHA falls back to the gate.

`prior_merged_prs` trusts contributors after they have enough merged pull
requests in the same repository. This is useful for maintainers who want a
middle tier between first-timers and core maintainers.

```yaml
exemptions:
  - type: prior_merged_prs
    min_count: 3
```

VOUCHA counts merged PRs with GitHub issue search. If GitHub search is
unavailable, the exemption does not match.

### Contributor accountability policy

VOUCHA is not an AI detector. It is an accountability gate: the author may
use AI, but passing records that they personally understand, tested, and can
support the PR. Repositories dealing with low-effort or unsupported PRs should
also document that policy for humans, not only enforce it in YAML.

Start from [templates/contributing-policy.md](templates/contributing-policy.md)
and [templates/pull_request_template.md](templates/pull_request_template.md),
then opt into PR-body enforcement when the repository wants it:

```yaml
accountability:
  require_pr_acknowledgement: true
  require_ai_disclosure: true
```

With both fields enabled, the PR body must include:

```md
- [x] I understand, tested, and can support this change.
AI assistance: yes
```

Use `yes`, `no`, `n/a`, or `none` for the AI assistance line.

### GitHub-native PR limits

For high-volume repositories, pair VOUCHA with GitHub's own contribution
controls: PR creation limits, trusted bypass lists, and temporary restrictions
on who can open PRs. VOUCHA should provide accountability and evidence for
PRs that reach review; GitHub-native controls should handle volume throttling.

### Linked issue exemptions

`linked_issue_match` looks for normal GitHub closing references in the PR body
(`Fixes #123`, `Closes owner/repo#123`, or a GitHub issue URL), fetches the
issue, and exempts the PR only when:

- the issue has a trusted signal: maintainer/collaborator author, assigned
  maintainer/collaborator, or one of the optional `trusted_labels`;
- the PR title/body/files match the issue's requested outcome at or above
  `min_match_score`;
- the issue is in the same repo, unless `require_same_repo: false` is set.

If the issue is missing, untrusted, or only weakly related, VOUCHA falls back
to the configured `gates`; it does not fail the PR for an uncertain exemption.

### PR investigation

Quiz generation is intentionally two-step by default. On the first quiz start
for a `(repo, PR, head_sha)`, VOUCHA builds a compact investigation artifact
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
`POST /workflows/investigate-pr?wait=result` through a Cloudflare service
binding. The main Worker calls it with a bounded PR evidence bundle. GitHub
installation tokens are never sent to Flue or stored in workflow payloads.
VOUCHA stores only the validated artifact in D1.

After the Flue Worker exists, configure the main Worker with a service binding:

```jsonc
"services": [
  { "binding": "FLUE_INVESTIGATOR", "service": "voucha-flue-investigator" }
]
```

Configure the optional Flue model override on the Flue investigator Worker if
needed:

```text
VOUCHA_FLUE_MODEL=cloudflare/@cf/zai-org/glm-4.7-flash
```

The Flue Worker is service-binding-only; it disables `workers.dev` and does
not support an external URL fallback.

If `context.investigator: flue` is set and the Flue service is missing or
fails, quiz generation becomes neutral rather than sending the huge raw diff
through the direct prompt path.

### Passive risk signals

`honeypot` renders an off-screen, unfocusable decoy text field in challenge
forms. A normal author should never touch it. If broad form-filling automation
submits a value, VOUCHA records "a hidden form field was submitted" in the
risk report.

`code_honeypot` lets maintainers configure literal canary strings that should
never be introduced by a careful contributor. VOUCHA scans the PR's unified
diff and only matches added lines in the configured `paths`; removed lines and
context lines do not count. If an added line contains a canary, the risk report
records "the PR introduced a configured code honeypot marker" without exposing
the exact marker in the PR comment. If the PR is exempt or reuses a prior pass,
the same report-only signal is shown in the success check summary.

Turnstile, `webdriver`, and repeated server-measured sub-two-second answers are
strong challenge-taking evidence and can invalidate an otherwise correct quiz.
Merely fast answers, pointer absence, focus loss, form honeypots, and code
canaries are inconclusive and remain report-only. They never combine into a
hidden behavioral verdict.

Inconclusive signals remain inside the check-run risk report. They do not change
the check title, add a label, or invalidate an otherwise correct challenge.

### Path scope

Use `skip_paths` to exempt PRs where every changed file is low-risk, such as
docs-only changes. Use `include_paths` when VOUCHA should only run for core
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

## Install or self-host

### Hosted GitHub App

For public repositories, use the managed service:

**[Install VOUCHA on GitHub](https://github.com/apps/voucha-app/installations/new)**

No Cloudflare account or model key is required. Select the repositories VOUCHA
may access, then use the built-in policy or add `.github/voucha.yml` to the base
branch. The hosted app intentionally supports public repositories only.

### Self-host VOUCHA

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/idosal/VOUCHA)

Local CLI setup requires Node.js 22.22.1+ and npm. VOUCHA uses Vite with
Cloudflare's Workers plugin for local development and build output.

Self-host when you need private-repository support, your own Cloudflare and
model-provider boundary, or full control over retention and operations. The
setup wizard deploys the Worker and creates a GitHub App in your own account.

Two self-deploy paths — both end with the same wizard:

- **Deploy button (no local tooling to start):** click the button — Cloudflare
  forks the repo and provisions the Worker, D1 database, and Workers AI
  binding. Then clone **your fork** and run the wizard for the GitHub-side
  setup (its deploy step reruns harmlessly against the already-provisioned
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
  and private key come back from a single exchange, and the key is converted
  to PKCS#8 for you), sets up Turnstile (automatic if
  `CLOUDFLARE_API_TOKEN` with **Turnstile Sites Write** is set; guided
  copy-paste otherwise), generates the session signing key, and writes all 6
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
   - Permissions: **Checks: Read & write**, **Pull requests: Read & write**
     (comments and optional auto-close), **Contents: Read-only**, **Metadata:
     Read-only**, and **Members:
     Read-only**. Members read is used by `github_team` exemptions and is
     harmless if the repository does not configure them.
   - Subscribe to events: **Pull request**, **Issue comment**, **Installation**.
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
   secret key. Do not use Cloudflare's public testing site keys in production;
   they deliberately render a testing label in the browser.

4. **Configure public settings** (`vars` in `wrangler.jsonc`) and **set the
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

   Public vars:
   - `APP_BASE_URL`
   - `TURNSTILE_SITE_KEY` (public; it is embedded in the challenge page HTML)
   - `LLM_PROVIDER`
   - `LLM_MODEL`
   - `AI_GATEWAY_ID` (optional, for Workers AI spend caps and analytics)

   Secrets (5, or 6 with `LLM_API_KEY`):
   - `GITHUB_APP_ID`
   - `GITHUB_PRIVATE_KEY` (PKCS#8 PEM from step 2)
   - `GITHUB_WEBHOOK_SECRET`
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
   ```
   Then uncomment the `FLUE_INVESTIGATOR` service binding example in
   `wrangler.jsonc` and redeploy the main Worker.
   The Flue Worker uses Workers AI through its `AI` binding and defaults to
   `cloudflare/@cf/zai-org/glm-4.7-flash`; set `VOUCHA_FLUE_MODEL` on the
   Flue Worker if you want a different Flue model.

6. **Background sweeps.**
   A cron trigger (`*/15 * * * *`, already in `wrangler.jsonc`) runs
   `sweepStaleChallenges` to purge old rate-limit events and sessions and to
   neutralize challenges that have gone stale (no quiz attempt in 24h) or
   whose terminal check-run update failed to land. No extra setup — the deploy
   in step 1 registers the cron.

## Data custody & security

- Self-deployed operators control their own storage, model provider, GitHub App
  credentials, and retention posture.
- The service **never holds maintainers' secrets**. Repo access is entirely
  through the GitHub App installation model: the only long-lived credential
  is the operator's own App private key. Per-repo access uses short-lived
  (~1 hour) installation tokens minted on demand and cached in memory only.
- PR diffs are read transiently to generate quiz questions and are **never
  persisted**. D1 stores repository/PR identifiers, the resolved config
  snapshot, active challenge state, generated quiz questions (with correct
  answers, server-side only), and derived investigation summaries from public
  PR context.
- Once a challenge reaches a terminal state (`passed`, `failed_assisted`, or `failed_final`), its
  stored quiz question text is purged (`questions_json` is overwritten to an
  empty list) while score, answers, and telemetry are retained as an audit
  trail.
- Before a quiz attempt starts, the contributor must accept a short challenge
  terms acknowledgement. If they do not accept, no quiz attempt is created and
  no answer or challenge telemetry is collected.
- The visible VOUCHA outcome is posted on the pull request in the same vein
  as CI checks, branch-protection gates, review comments, and the contribution
  itself. Detailed answer selections and summary telemetry remain audit data
  for maintainers rather than a separate public profile.
- Telemetry captured during the quiz is **summary statistics only** —
  per-question timings, answer-change counts, aggregate pointer-movement
  distance/sample counts, focus-loss counts, whether the report-only honeypot
  was submitted, whether configured code canaries appeared in added diff lines,
  and automation fingerprints (e.g. a `webdriver` flag). There is no keystroke
  logging or content capture, and its collection is disclosed on the quiz page.
  Turnstile validation, browser automation flags, and repeated server-measured
  sub-two-second answers can fail the challenge with that reason. Merely fast
  answers, pointer/focus summaries, honeypots, and code-canary signals remain
  maintainer review evidence.
- Webhook payloads are authenticated via HMAC-SHA256 signature verification
  (`x-hub-signature-256`) before any processing happens.

## Known v1 limitations

- **Not an unbeatable gate.** A contributor whose coding agent has computer
  use (e.g. an agent that can drive a browser) can have that agent take the
  quiz itself. VOUCHA does not claim to prevent this — the product is
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
  VOUCHA's own tracked comment and may get a duplicate comment.

## Manual E2E verification checklist

Requires a deployed Worker and a demo repo with the GitHub App installed;
cannot run in CI. Walk each scenario and record the outcome:

- [ ] Open a PR from a non-maintainer account → check goes `queued`, a PR
      comment appears, status is `awaiting_approval`.
- [ ] Comment `/voucha approve` from a maintainer account → the comment
      updates with the challenge link.
- [ ] Open the link, use "Copy command and open PR", paste the one-time
      `/voucha verify <code>` command as the PR author, return to the
      auto-advanced challenge tab, pass Turnstile, answer the quiz → green
      check, attestation comment posted, risk report visible in the check run
      details.
- [ ] Push a meaningful code commit after a pass → the new head gets a
      two-question follow-up challenge generated only from that commit delta.
- [ ] Push only docs/Markdown after a pass → the new head carries the pass
      forward with an explicit check summary.
- [ ] Open a docs-only PR → gets a success check with an "Exempt" summary.
- [ ] Fail a quiz deliberately → red check, cooldown message shown; retrying
      after the cooldown gets a freshly generated quiz.
- [ ] Exhaust attempts, then comment `/voucha retry` from a write-capable
      maintainer → a new queued check appears on the same commit, the existing
      challenge link becomes active, and the previous audit remains stored.
- [ ] Temporarily break the LLM config (e.g. set `LLM_MODEL` to a nonexistent
      model, or an invalid `LLM_API_KEY`) and start a quiz → check goes
      `neutral`, merge is not blocked.
