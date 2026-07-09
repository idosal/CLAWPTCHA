---
title: Why use VOUCHA
description: When a repository should ask pull request authors for proof of understanding, and what VOUCHA deliberately does not claim to solve.
---

VOUCHA is a free open-source project for to help maintainers accept contributions without being overwhelmed by the wave of cheap pull requests that don't signal intent. The product gives maintainers a policy layer between "trust every
contributor" and "close every unknown PR".

It does not try to prove that a human wrote the code. It asks the PR author to
make an on-record claim that they understand the change, while giving
maintainers a risk report about the way that claim was made. It is designed to
complement code review, CI, tests, branch protection, and existing maintainer
workflows, not replace them.

## Use it when

- The repository receives outside PRs and maintainers need a consistent first
  pass before investing review time.
- AI-assisted work is welcome, but authors still need to understand the intent,
  behavior changes, affected surfaces, and blast radius.
- Maintainers want planned work, trusted issue context, and known authors to
  move through with less friction.
- Maintainers want a middle ground for trusted teams, repo role holders, and
  contributors who already have a body of merged work.
- The project allows AI-assisted work but wants PR authors to explicitly accept
  responsibility for understanding, testing, and follow-up.
- Sensitive paths such as auth, migrations, runtime, CI, infrastructure, or
  generated-release code need stronger policy than docs or examples.
- You want passive evidence such as honeypot fields or code canaries to appear
  in maintainer summaries without turning those signals into automatic blocks.

## Do not use it as

- A replacement for tests, security review, code review, or branch protection.
- A detector that decides whether a PR was written by AI.
- A quality score for the implementation.

The intended posture is fail-open and evidence-oriented. If quiz generation,
model access, or an optional investigator service fails, VOUCHA should
report neutral rather than convert its own outage into a merge blocker.

## What changes for maintainers

VOUCHA moves common review questions earlier:

- Is this PR already covered by trusted context?
- Is the author a maintainer, known contributor, trusted bot, trusted team
  member, repo role holder, or contributor with enough prior merged PRs?
- Did the PR body include the repository's required accountability fields?
- Did the PR only touch paths the repository has chosen to skip?
- Did the author pass a challenge about the change itself?
- Did challenge-taking signals suggest automation or outside assistance?

The result is a check run with a reasoned outcome: exempt, awaiting approval,
awaiting challenge, passed, failed, or neutral. The maintainer remains the
decision-maker.

## What changes for contributors

For PRs that reach a challenge, the author verifies from GitHub with a one-time
PR comment and answers a short multiple-choice quiz generated from PR evidence.
The challenge page copies the verification command, opens the PR, and advances
automatically when GitHub confirms the author comment. The questions should be
about ownership-level understanding, not trivia about line numbers or function
names.

A pass becomes a public attestation on the PR. A failure leads to a cooldown and
fresh retry, up to the configured attempt limit. Attempts exhausted means the PR
needs maintainer review instead of more automatic retries.
