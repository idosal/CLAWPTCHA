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

## Threat model

"Somewhere in between" casual and adversarial:

- **Primary target:** lazy slop-submitters who fire off agent-generated PRs
  without reading them. Passing the quiz should require roughly as much
  effort as actually understanding the diff.
- **Deterred, not defeated:** contributors who would relay the challenge to an
  AI agent. Interactive UI, per-question time limits, one-question-at-a-time
  flow, and fresh questions per attempt make relaying awkward — but we do not
  chase full unforgeability (no proctoring, no keystroke spyware).
- **Out of scope:** determined fakers with automated relay pipelines.

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
  (opened, synchronize, reopened). OAuth used to identify the contributor
  taking the quiz.
- **Service** — Cloudflare Worker (Hono router). Handles webhooks, quiz
  generation, quiz serving, grading, and check updates.
- **Storage** — D1. Tables: `installations`, `quizzes` (per PR + head SHA,
  questions + correct answers server-side only), `attempts` (per contributor,
  score, timestamps, cooldown state).
- **LLM** — Anthropic API, `claude-sonnet-5`, structured output (JSON schema)
  for quiz generation.

## Flow

1. **Install:** maintainer installs the GitHub App. Optional
   `.github/clawptcha.yml` in the repo for policy overrides.
2. **PR opened/synchronized:** webhook → service creates a pending check run
   (`clawptcha`) and posts/updates one PR comment with the challenge link.
3. **Quiz generation:** service fetches the diff, PR title/description, and
   limited surrounding file context (token-capped). Claude generates ~4
   conceptual questions with answers. Stored in D1 keyed by PR + head SHA.
4. **Challenge:** contributor opens the link → GitHub OAuth → identity must
   match the PR author → quiz UI.
5. **Grading:** answers submitted per question, graded server-side.
   Pass (default 3/4) → check success + friendly PR comment.
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
- Progress + result screens; on pass, a small celebration; on fail, cooldown
  message with retry time.
- No copy-paste blocking or focus tracking in v1 (matches threat model).

## Configuration (`.github/clawptcha.yml`)

```yaml
# all fields optional; defaults shown
pass_threshold: 3        # of 4 questions
max_attempts: 3
cooldown_minutes: 15
rechallenge_on_push: false
skip_authors: []         # usernames always exempt
skip_bots: true          # dependabot, renovate, etc.
min_changed_lines: 10    # smaller diffs auto-pass
skip_paths: ["docs/**", "*.md"]  # diffs touching only these auto-pass
```

Maintainers, repo admins, and the app installer are exempt by default.

## Failure posture

Clawptcha must never block merges because of its own problems:

- LLM error / invalid quiz after retry → check reports **neutral** with an
  explanatory summary.
- Service errors on webhook → GitHub retries; persistent failure leaves the
  check pending, and a scheduled sweep marks stale pending checks neutral
  after 30 minutes.
- Docs-only / tiny diffs auto-pass per config defaults.

## Cost control

- Diff + context capped (~20k tokens); oversized diffs get truncated context
  with file-list summary.
- Quiz cached per (PR, head SHA) — regeneration only on retry-after-fail or
  a new head SHA when `rechallenge_on_push` is enabled.

## Security

- Webhook signatures verified (HMAC).
- OAuth state + PKCE; quiz session bound to the authenticated GitHub user,
  which must equal the PR author.
- Correct answers and generation prompts never leave the server.
- Quiz links contain an unguessable token; expire with the PR head SHA.

## Testing

- Unit: quiz JSON schema validation, grading logic, config parsing,
  exemption rules, cooldown/attempt state machine.
- Integration: webhook → check lifecycle with mocked GitHub + Anthropic APIs
  (Vitest + Workers test harness).
- E2E (manual for v1): demo repo with the app installed; scripted PR
  scenarios (pass, fail+retry, docs-only skip, LLM outage → neutral).

## Out of scope for v1 (future)

- Contributor CLI (pre-push self-check / attestation).
- Free-form "defend your PR" questions with LLM judging.
- Paste-detection / focus-loss signals.
- Org dashboards, analytics, billing.

## Milestones

1. **Core service:** GitHub App plumbing — webhooks, check runs, PR comment,
   config loading, exemptions. Check auto-passes everything (no quiz yet).
2. **Quiz engine:** LLM generation with schema validation, D1 storage,
   grading, attempt/cooldown state machine.
3. **Challenge UI:** OAuth flow, time-boxed quiz frontend, results.
4. **Hardening:** failure posture (neutral checks, stale sweep), cost caps,
   E2E demo repo pass.
