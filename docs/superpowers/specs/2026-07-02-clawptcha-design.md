# Clawptcha — Design Spec

**Date:** 2026-07-02
**Status:** Approved

## Summary

Clawptcha is a "captcha for GitHub contributions": a GitHub App plus a hosted
service that gates PR merges behind a short, time-boxed comprehension quiz
about the PR itself. It targets the growing problem of contributors submitting
AI-agent-generated PRs they don't understand.

The philosophy: **AI-written code is fine — not understanding it is not.**
The quiz does not test line-level recall. It tests whether the submitter
understands the *intent*, *architecture*, and *effects* of their change.

**Product truth:** a contributor whose coding agent has computer use can tell
it to take the quiz, and no quiz design prevents that. Clawptcha therefore
does not claim to be an unbeatable gate. Its value is threefold: it forces
genuine engagement from the honest majority; it converts careless
slop-submission into *deliberate, on-the-record deception* for cheaters
(attestation); and it hands maintainers a behavioral risk report so a
suspicious pass is visible rather than silent.

## Threat model

"Somewhere in between" casual and adversarial:

- **Primary target:** lazy slop-submitters who fire off agent-generated PRs
  without reading them. Passing the quiz should require roughly as much
  effort as actually understanding the diff.
- **Deterred, not defeated:** contributors who would relay the challenge to an
  AI agent. Coding agents with built-in computer use (e.g., Codex) can take
  the quiz at ~zero marginal cost, so relay friction alone is not prevention.
  Against this population Clawptcha relies on (a) automation detection
  surfaced to the maintainer as a risk report, and (b) the attestation making
  cheating a deliberate, visible act rather than mere carelessness.
- **Explicitly not attempted:** proving humanness. No proctoring, webcams,
  keystroke spyware, or WebAuthn presence ceremonies — a lazy user would tap
  a passkey without reading anything, so these add invasiveness without
  adding meaning.
- **Known v1 limitation — prompt injection into quiz generation:** the PR
  diff/title/description flow into the generation prompt, so a hostile author
  can try to steer the model toward a trivially easy quiz. Blast radius is
  bounded: correct answers never reach the client, so the attacker cannot
  verify the injection worked — at worst they get a possibly-easier quiz,
  not a reliable bypass. Future hardening: wrap untrusted PR text in
  explicit "untrusted data" framing and/or sanity-check quiz difficulty.

## Architecture

Three components, one deployable:

```
GitHub  ──webhooks──▶  Clawptcha service (Cloudflare Workers + Hono)
   ▲                        │        │
   │ Checks API,            │        └──▶ Anthropic API (quiz generation)
   │ Comments, OAuth        └──▶ D1 (quizzes, attempts, installations)
   │
Contributor ──challenge link──▶ Quiz web UI (served by same Worker)
```

- **GitHub App** — installed per repo/org by maintainers. Permissions:
  checks (read/write), pull requests (read/write, for comments), contents
  (read, for file context), metadata. Webhook events: `pull_request`
  (opened, synchronize, reopened), `issue_comment` (for `/clawptcha approve`),
  and `installation` (install bookkeeping). OAuth used to identify the
  contributor taking the quiz.
- **Service** — Cloudflare Worker (Hono router). Handles webhooks, quiz
  generation, quiz serving, grading, and check updates.
- **Storage** — D1. Tables: `installations`, `quizzes` (per PR + head SHA,
  questions + correct answers server-side only), `attempts` (per contributor,
  score, timestamps, cooldown state).
- **LLM** — Anthropic API, `claude-sonnet-5`, structured output (JSON schema)
  for quiz generation. (superseded by
  `docs/superpowers/specs/2026-07-03-llm-provider-and-hosted-deployment-design.md`)

## Flow

1. **Install:** maintainer installs the GitHub App. Optional
   `.github/clawptcha.yml` in the repo for policy overrides.
2. **PR opened/synchronized:** webhook → service creates a pending check run
   (`clawptcha`) and posts/updates one PR comment with the challenge link.
   No LLM call happens here.
3. **Approval gate:** per `require_approval` config (default: first-time
   contributors), the challenge is locked — the check reads "awaiting
   maintainer approval" — until someone with write access approves via a
   link in the PR comment or a `/clawptcha approve` comment. This mirrors
   GitHub Actions' first-time-contributor workflow approval and prevents
   malicious actors from burning LLM spend with drive-by PRs.
4. **Challenge (lazy generation):** contributor opens the link → GitHub
   OAuth → identity must match the PR author → Turnstile → only then does
   the service fetch the diff, PR title/description, and surrounding file
   context, and have Claude generate ~4 conceptual questions with answers
   (stored in D1 keyed by PR + head SHA). LLM spend therefore occurs only
   per real, authenticated, approved quiz attempt — never per webhook.
5. **Grading:** answers submitted per question, graded server-side.
   Pass (default 3/4) → check success + attestation comment on the PR:
   the author certified under challenge that they personally understand the
   change. The check run summary includes a **risk report** for maintainers:
   total time, per-question timing distribution, Turnstile verdict, and
   automation fingerprints — so a pass that looks automated (e.g., 4/4
   conceptual questions in 40 seconds with sterile pointer telemetry) is
   flagged "passed, automation-likely" rather than silently green.
   Fail → check stays failure, 15-minute cooldown, retry gets a **freshly
   generated** quiz. After max attempts (default 3), the check stays failed
   and the maintainer is notified via the PR comment to review manually.
6. **New commits:** on `synchronize`, an existing pass is kept by default.
   With `rechallenge_on_push: true`, any push that changes the head SHA
   invalidates the pass and issues a new challenge.

## Question types (v1)

All generated per-PR by the LLM from diff + description + context. Each quiz
contains ~4 questions drawn from:

1. **Consequence MCQ** — "After this change, what happens when X?"
   4 options, one correct, distractors plausible.
2. **Blast-radius multi-select** — "Which of these behaviors/areas does this
   PR affect?" Graded as exact set match.
3. **Spot-the-false-claim** — 4 statements describing what the PR does; one
   is subtly wrong. Contributor picks the false one.

Generation requirements:

- Questions must be answerable from understanding the change's intent and
  effects — not from memorizing lines, and not from generic knowledge alone.
- Distractors must be plausible to someone who *hasn't* read the diff.
- Structured output validated against a JSON schema; on validation failure,
  retry once, then fall back to neutral check (see failure posture).

## Quiz UI behavior

- One question at a time; no back navigation.
- Per-question time limit (default 90s); expiry counts as wrong.
- Correct answers never sent to the browser; grading is server-side.
- Progress + result screens; on pass, a small celebration plus the
  attestation notice ("your pass will be posted to the PR as a personal
  certification of understanding"); on fail, cooldown message with retry time.
- **Cloudflare Turnstile** gates quiz start; its verdict feeds the risk
  report (informs, never solely blocks).
- **Behavioral telemetry captured, not enforced:** per-question response
  times, answer-change counts, pointer-movement summary statistics, focus
  loss, and automation fingerprints (webdriver flags, CDP artifacts). All of
  it flows into the maintainer risk report; none of it auto-fails a quiz.
- No copy-paste blocking in v1.

## Configuration (`.github/clawptcha.yml`)

```yaml
# all fields optional; defaults shown
gates:
  - type: multiple_choice
    questions: 4
    pass_threshold: 3
exemptions: []           # e.g. linked_issue_match for trusted matching issues
max_attempts: 3
cooldown_minutes: 15
require_approval: first_time  # first_time | always | never — maintainer must
                              # approve before the challenge can run
rechallenge_on_push: false
skip_authors: []         # usernames always exempt
skip_bots: true          # dependabot, renovate, etc.
min_changed_lines: 10    # smaller diffs are exempt
skip_paths: ["docs/**", "*.md"]  # diffs touching only these are exempt
max_context_tokens: null # off by default; set to cap diff+context sent to the LLM
```

Maintainers, repo admins, and the app installer are exempt by default.

## Failure posture

Clawptcha must never block merges because of its own problems:

- LLM error / invalid quiz after retry → check reports **neutral** with an
  explanatory summary.
- Service errors on webhook → the scheduled sweep is the backstop. A challenge
  left pending with no quiz attempt after 24h is marked **neutral**; a
  terminal challenge whose check-run update failed after the DB was already
  finalized is re-issued idempotently (the sweep only touches check runs that
  never completed, so it never clobbers a real risk report).
- Docs-only / tiny diffs are exempt per config defaults.

## Cost control

- Diff + context token cap is **off by default** and configurable via
  `max_context_tokens`. When set, oversized diffs get truncated context with
  a file-list summary; when unset, the full diff + context is sent (bounded
  only by the model's context window).
- Quiz cached per (PR, head SHA) — regeneration only on retry-after-fail or
  a new head SHA when `rechallenge_on_push` is enabled.

### Abuse protection

LLM spend is gated behind three locks, so hostile traffic cannot run up
costs for maintainers or the operator:

- **Maintainer approval** (`require_approval`, default `first_time`) — no
  challenge runs for unapproved PRs; webhooks alone never trigger the LLM.
- **Lazy generation** — quizzes are generated only when an authenticated
  contributor (matching the PR author) passes Turnstile and starts the quiz.
- **Rate limits** — per-user, per-repo, and per-installation caps on quiz
  generations per hour, on top of the existing `max_attempts` + cooldown per
  PR. Exceeding them leaves the check pending; the quiz-taker sees an
  explanatory message on the challenge page (the check itself is not updated).

## Security

- Webhook signatures verified (HMAC).
- OAuth with single-use `state` bound to the server-side session (PKCE is
  unnecessary here: the Worker is a confidential client holding the secret,
  and GitHub does not enforce PKCE); quiz session bound to the authenticated
  GitHub user, which must equal the PR author.
- Correct answers and generation prompts never leave the server.
- Quiz links contain an unguessable token; expire with the PR head SHA.
- Telemetry is summary statistics only (timings, aggregate pointer stats,
  focus events) — no keystroke logging, no content capture — and its
  collection is disclosed on the quiz page.

### Data custody

The hosted service **never holds maintainers' secrets**. Repo access comes
from the GitHub App installation model: the only long-lived credential is the
operator's own App private key; per-repo access uses short-lived (~1h)
installation tokens minted on demand, scoped to the installed repos and the
declared permissions, cached in memory only. Maintainers provide no PATs, no
deploy keys, and no LLM API keys (LLM billing is operator-side by design).

What the service does handle is **derived data**: PR diffs are read
transiently for quiz generation (never persisted), and the generated quiz
questions + a config snapshot are stored in D1. For private repos, quiz
questions are derived from private code — privacy-sensitive maintainers can
self-host their own instance (the service is a single open-source Worker with
their own GitHub App), and quiz *question content* is purged once a challenge
resolves — the row is kept for audit (score, answers, telemetry) but the
diff-derived question text is emptied (retention rule).

## Testing

- Unit: quiz JSON schema validation, grading logic, config parsing,
  exemption rules, approval-gate and rate-limit logic, cooldown/attempt
  state machine, risk-report assembly from telemetry fixtures.
- Integration: webhook → check lifecycle with mocked GitHub + Anthropic APIs
  (Vitest + Workers test harness).
- E2E (manual for v1): demo repo with the app installed; scripted PR
  scenarios (pass, fail+retry, docs-only skip, LLM outage → neutral).

## Out of scope for v1 (future)

- Contributor CLI (pre-push self-check / attestation).
- Free-form "defend your PR" questions with LLM judging.
- Paste detection; ML-based scoring of the telemetry (v1 reports raw
  signals and simple heuristics only).
- Org dashboards, analytics, billing.

## Milestones

1. **Core service:** GitHub App plumbing — webhooks, check runs, PR comment,
   config loading, exemptions, approval gate. Check succeeds without a quiz
   (no quiz yet).
2. **Quiz engine:** lazy LLM generation with schema validation, D1 storage,
   grading, attempt/cooldown state machine, rate limits.
3. **Challenge UI:** OAuth flow, time-boxed quiz frontend, results,
   attestation comment.
4. **Risk report:** Turnstile integration, behavioral telemetry capture,
   check-summary risk report with simple heuristics.
5. **Hardening:** failure posture (neutral checks, stale sweep), cost caps,
   E2E demo repo pass.
