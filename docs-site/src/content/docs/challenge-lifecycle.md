---
title: Challenge lifecycle
description: How VOUCHA creates, serves, scores, and reports author comprehension challenges.
---

When no exemption applies, VOUCHA creates a challenge for the pull request
author. The challenge is a short comprehension check about the actual PR.

It is not a humanity test. It is an author-ownership attestation.

## Approval gate

Some PRs wait for maintainer approval before the author can open the quiz.
`require_approval: first_time` applies this to first-time or unknown GitHub
authors. `always` applies it to every challenged PR. Maintainers approve with:

```text
/voucha approve
```

Approvers must have write/push, maintain, or admin access on the repository.

## Investigation

Before quiz generation, VOUCHA builds a cached investigation from PR
metadata, changed files, and selected patch evidence. The quiz is generated from
that artifact instead of a blind prefix of a large diff.

The investigation should identify:

- the apparent intent of the change;
- important files and subsystems touched;
- externally visible behavior changes;
- compatibility or migration risks;
- likely blast radius.

It also records evidence paths, unknowns, quiz anchors, confidence, and whether
the PR is in normal or large-PR mode. For large PRs, the artifact should name
unknowns instead of pretending every changed line was inspected.

`context.investigator` controls where that work happens:

| Value | Behavior |
| --- | --- |
| `auto` | Use the Worker for normal PRs; use the Flue investigator for large PRs when configured. |
| `worker` | Keep investigation in the main Worker. |
| `flue` | Require the Flue investigator service. If missing or failing, report neutral. |

## Challenge serving

The author verifies from GitHub before answering by commenting a one-time
`/voucha verify <code>` command on the PR. The challenge page copies the
command, opens the PR, and polls until GitHub's signed webhook binds that
browser session to the PR author without granting VOUCHA delegated account
access.

Before quiz generation starts, the author accepts the challenge terms on the
start page. If they do not accept, VOUCHA does not create a quiz attempt or
collect answer telemetry. The acknowledgement is intentionally small: it tells
contributors that VOUCHA uses the public PR context to generate the quiz and
stores their answer selections plus summary signals for maintainer review.

Each question is served with a time window. Refreshing the page does not reset
the question timer.

The shipped gate is `multiple_choice`. The repository controls question count
and pass threshold:

```yaml
gates:
  - type: multiple_choice
    questions: 4
    pass_threshold: 3
```

Questions should test ownership-level understanding: intent, behavior changes,
affected surfaces, compatibility, and blast radius. They should not test code
trivia.

## Retry behavior

A failed non-final attempt enters cooldown. When the author retries after
cooldown, VOUCHA generates a fresh quiz from the cached investigation.

```yaml
max_attempts: 3
cooldown_minutes: 15
```

Once attempts are exhausted, the check becomes failed and maintainers should
review manually. Repositories can optionally auto-close terminal hard failures
with `enforcement.auto_close`.

## Outcomes

| Outcome | Check behavior |
| --- | --- |
| Passed | Green check with an attestation summary. |
| Passed with multiple passive signals | Green check, explicit risk title, and optional `pr-comprehension:flagged` label. |
| Failed attempt | Cooldown and retry policy apply; detailed signal feedback is withheld until final outcome. |
| Challenge assistance detected | Failed check; optional PR auto-close when configured for `failed_assisted`. |
| Attempts exhausted | Failed check; optional PR auto-close when configured for `failed_final`. |
| Generation failure | Neutral check; the PR is not blocked by service failure. |
| Superseded commit | Old challenge becomes inactive and the PR receives a current result. |
| Expired setup | Scheduled sweep neutralizes stale awaiting or ready challenges. |

The durable record is the check-run summary on the PR. It should show enough
context for maintainers to understand what VOUCHA did without making them
open the service database.

## Data kept after resolution

Quiz questions and correct answers are needed while a challenge is active. Once
the challenge reaches a terminal result, stored question text is purged while
score, answers, status, and summary telemetry remain as the audit trail.

See [Privacy and data](/docs/privacy-data/) for the self-deployed data boundary
and the contributor acceptance flow.
