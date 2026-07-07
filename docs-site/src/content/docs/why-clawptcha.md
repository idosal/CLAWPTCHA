---
title: Why use CLAWPTCHA
description: When a repository should ask pull request authors for proof of understanding, and what CLAWPTCHA deliberately does not claim to solve.
---

CLAWPTCHA exists for a specific maintainer problem: more pull requests can now
be produced cheaply, but review attention is still scarce. The product gives
maintainers a policy layer between "trust every contributor" and "close every
unknown PR".

It does not try to prove that a human wrote the code. It asks the PR author to
make an on-record claim that they understand the change, while giving
maintainers a risk report about the way that claim was made.

## Use it when

- The repository receives outside PRs and maintainers need a consistent first
  pass before investing review time.
- AI-assisted work is welcome, but authors still need to understand the intent,
  behavior changes, affected surfaces, and blast radius.
- Maintainers want planned work, trusted issue context, and known authors to
  move through with less friction.
- Sensitive paths such as auth, migrations, runtime, CI, infrastructure, or
  generated-release code need stronger policy than docs or examples.
- You want passive evidence such as honeypot fields or code canaries to appear
  in maintainer summaries without turning those signals into automatic blocks.

## Do not use it as

- A replacement for tests, security review, code review, or branch protection.
- A detector that decides whether a PR was written by AI.
- A quality score for the implementation.
- A hard service dependency that should stop merges when CLAWPTCHA itself is
  unavailable.

The intended posture is fail-open and evidence-oriented. If quiz generation,
model access, or an optional investigator service fails, CLAWPTCHA should
report neutral rather than convert its own outage into a merge blocker.

## What changes for maintainers

CLAWPTCHA moves common review questions earlier:

- Is this PR already covered by trusted context?
- Is the author a maintainer, known contributor, trusted bot, or trusted repo
  permission holder?
- Did the PR only touch paths the repository has chosen to skip?
- Did the author pass a challenge about the change itself?
- Did passive signals suggest that the pass deserves a second look?

The result is a check run with a reasoned outcome: exempt, awaiting approval,
awaiting challenge, passed, failed, or neutral. The maintainer remains the
decision-maker.

## What changes for contributors

For PRs that reach a challenge, the author signs in with GitHub and answers a
short multiple-choice quiz generated from PR evidence. The questions should be
about ownership-level understanding, not trivia about line numbers or function
names.

A pass becomes a public attestation on the PR. A failure leads to a cooldown and
fresh retry, up to the configured attempt limit. Attempts exhausted means the PR
needs maintainer review instead of more automatic retries.
