---
title: Verification checklist
description: Manual smoke tests, rollout checks, and known limitations for operating CLAWPTCHA on a real repository.
---

Use this page after installation or after changing policy. The automated test
suite covers the code paths; these checks prove the deployed GitHub App,
Worker, Turnstile, model provider, and repository policy work together.

## Local checks

Run these before deploying or when editing the docs/site:

```bash
npm run typecheck
npm test
npm run build
```

For release readiness, also run:

```bash
npm audit --audit-level=high
npx wrangler deploy --dry-run
```

## First repository smoke

Use a demo repository with the GitHub App installed.

- Open a PR from a non-maintainer account. The check should be queued and the
  PR should receive a CLAWPTCHA comment.
- If `require_approval: first_time` applies, the challenge should wait for
  `/clawptcha approve`.
- Comment `/clawptcha approve` from a write or admin user. The comment should
  update with the challenge link.
- Open the link as the PR author, accept the challenge terms, pass Turnstile,
  and answer the quiz.
- Confirm the check turns green, the PR comment records the attestation, and
  the check-run output includes the risk report.

## Policy scenarios

Walk each scenario that the repository intends to rely on:

- docs-only or skipped paths produce an exempt success check;
- draft PRs stay quiet when `draft_prs: ignore`;
- missing required accountability fields fail before a quiz is created;
- valid acknowledgement and AI disclosure allow the PR to continue;
- a linked trusted issue can exempt planned work;
- untrusted or weakly related issue links fall through to the gate;
- configured `github_team` or `repository_permission` exemptions work for a
  known account;
- `prior_merged_prs` exempts an author with enough merged PRs;
- configured `code_honeypot` patterns appear as report-only findings when
  introduced in added diff lines;
- a passed PR keeps or loses its pass according to `rechallenge`.

## Failure drills

CLAWPTCHA should fail open for service-side problems and fail closed only for
repository policy requirements.

- Temporarily break the model provider or model name, then start a quiz. The
  check should become neutral rather than blocking the merge.
- Configure `context.investigator: flue` without a working Flue service. Quiz
  generation should become neutral.
- Submit a wrong quiz answer. A non-final failure should enter cooldown and a
  later retry should get a fresh quiz.
- Exhaust all attempts. The check should stay failed for manual maintainer
  review.
- Leave an awaiting or ready challenge untouched. The scheduled sweep should
  neutralize stale setup after the configured stale window.

## What to record

For each rollout, record:

- repository and PR used for the smoke test;
- effective `.github/clawptcha.yml`;
- expected and observed check conclusion;
- whether a PR comment was created or updated;
- whether the author-facing quiz link worked;
- any risk-report signals, labels, or neutral outcomes;
- whether the result was acceptable for branch protection.

## Known limitations

CLAWPTCHA is an accountability and review-evidence layer, not an unbeatable
security boundary.

- An agent with browser control can potentially take the quiz on behalf of the
  author. The product records an attestation and risk report; it does not prove
  humanness.
- Pull request text and diff content are untrusted input to quiz generation. A
  hostile contributor can try prompt injection. Correct answers stay
  server-side, so this can make a quiz weaker but should not reveal an answer
  key.
- Webhook handling is asynchronous. If background work fails after GitHub
  accepts the webhook, recovery depends on GitHub redelivery, idempotent event
  handling, and the scheduled sweep.
- PR comment lookup currently checks one page of issue comments. Very noisy PRs
  can receive a duplicate CLAWPTCHA comment if the tracked comment is beyond
  that page.
