---
title: Privacy and data
description: What CLAWPTCHA stores, what it reads transiently, and what contributors accept before a challenge starts.
---

CLAWPTCHA's managed service is for installed public open-source repositories.
Self-deployed operators control their own storage, provider choices, and data
retention.

The product is designed to keep data custody narrow: enough public PR context
to run the gate, plus the answers and summary signals a contributor accepts
before beginning a challenge.

The visible CLAWPTCHA result lives on the pull request in the same vein as CI
checks, branch-protection gates, review comments, and the contribution itself.
Maintainers should treat it as public review evidence. Detailed answer
selections and summary telemetry are retained for maintainer audit rather than
published as a separate public profile.

## What is stored

CLAWPTCHA stores:

- GitHub installation and repository identifiers for installed repositories;
- pull request number, head SHA, author login, challenge status, attempt state,
  and the resolved repository policy snapshot;
- generated quiz state while a challenge is active;
- derived investigation summaries from public PR metadata, changed-file lists,
  and selected patch evidence;
- contributor answer selections, quiz score, and terminal challenge outcome;
- summary challenge signals such as timing, answer-change counts, aggregate
  pointer movement, focus-loss counts, Turnstile outcome, browser automation
  hints, and report-only honeypot or code-canary findings;
- short-lived session, OAuth state, and rate-limit rows needed to serve the
  challenge safely.

## What is not stored

CLAWPTCHA does not persist raw PR diffs, GitHub installation tokens, keystrokes,
free-form answer text, browser recordings, or maintainer secrets.

Raw diffs and GitHub API responses are read transiently to decide policy,
generate questions, and build derived investigation summaries. Installation
tokens are minted on demand and cached in memory only.

## Contributor acceptance

Before a contributor starts a challenge, the start page requires a small
acknowledgement. By accepting it, the contributor agrees that CLAWPTCHA may use
the repository and PR context to generate the quiz, post the outcome on the PR,
and store their answer selections plus summary signals for the PR's
maintainers.

If the contributor does not accept, no quiz attempt is created and no answer or
challenge telemetry is collected.

## Retention posture

Generated questions and correct answers are needed while a challenge is active.
Once a challenge reaches a terminal result, stored question text is purged while
score, answer selections, challenge status, and summary telemetry remain as the
audit trail.

Scheduled sweeps remove expired sessions and old rate-limit rows. CLAWPTCHA
should be treated as review evidence, not as a permanent source repository or
analytics warehouse.
