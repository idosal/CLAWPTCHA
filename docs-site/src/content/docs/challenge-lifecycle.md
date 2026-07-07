---
title: Challenge lifecycle
description: How CLAWPTCHA creates, serves, scores, and reports author comprehension challenges.
---

When no exemption applies, CLAWPTCHA creates a challenge for the pull request
author. The challenge is a short comprehension check about the actual PR.

It is not a humanity test. It is an author-ownership attestation.

## Approval gate

Some PRs wait for maintainer approval before the author can open the quiz.
`require_approval: first_time` applies this to first-time or unknown GitHub
authors. `always` applies it to every challenged PR. Maintainers approve with:

```text
/clawptcha approve
```

Approvers must have write or admin permission on the repository.

## Investigation

Before quiz generation, CLAWPTCHA builds a cached investigation from PR
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

The author signs in with GitHub before answering. The session is bound to the
challenge author so a leaked or transplanted quiz cookie cannot expose questions
to another account.

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
cooldown, CLAWPTCHA generates a fresh quiz from the cached investigation.

```yaml
max_attempts: 3
cooldown_minutes: 15
```

Once attempts are exhausted, the check becomes failed and maintainers should
review manually.

## Outcomes

| Outcome | Check behavior |
| --- | --- |
| Passed | Green check with an attestation summary. |
| Passed with multiple passive signals | Green check, explicit risk title, and optional `clawptcha:flagged` label. |
| Failed attempt | Cooldown and retry policy apply; detailed signal feedback is withheld until final outcome. |
| Attempts exhausted | Maintainer review is requested. |
| Generation failure | Neutral check; the PR is not blocked by service failure. |
| Superseded commit | Old challenge becomes inactive and the PR receives a current result. |
| Expired setup | Scheduled sweep neutralizes stale awaiting or ready challenges. |

The durable record is the check-run summary on the PR. It should show enough
context for maintainers to understand what CLAWPTCHA did without making them
open the service database.

## Data kept after resolution

Quiz questions and correct answers are needed while a challenge is active. Once
the challenge reaches a terminal result, stored question text is purged while
score, answers, status, and summary telemetry remain as the audit trail.
