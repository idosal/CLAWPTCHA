---
title: Common practices
description: Operational patterns for honeypot files, issue-backed triage, path-specific gates, drafts, retries, and output volume.
---

CLAWPTCHA works best as a maintainer-facing policy system. The strongest
rollouts are explicit about what is trusted, what is merely suspicious, and
what should still go to human review.

## Keep passive signals report-only

Use passive signals to decide where maintainers should look harder, not to
silently fail a PR. Form honeypots, code canaries, Turnstile state, timings,
pointer summaries, and `webdriver` all have legitimate edge cases.

CLAWPTCHA currently forces `honeypot` and `code_honeypot` signals to
`report_only: true`. A matched signal can appear in check-run summaries, risk
reports, and flagged-pass labels, but it does not change the quiz score.

## Use code honeypots as canaries, not traps

Good code canaries are literal markers that should never appear in production
code through a careful human workflow. They are useful in:

- internal examples marked as do-not-copy;
- generated fixtures that coding agents may overgeneralize from;
- repository-local prompts or scaffolding notes;
- documentation snippets that describe bad output.

Keep patterns unique, scoped, and boring. Do not publish the exact marker in PR
comments if that would make the canary easy to remove. Configure `paths` so the
scan covers the areas where copying the marker matters.

```yaml
signals:
  - type: code_honeypot
    report_only: true
    patterns:
      - "CLAWPTCHA_DO_NOT_ADD_THIS"
    paths: ["src/**", "infra/**"]
```

Code honeypots scan added diff lines only. Moving or deleting a marker should
not count as introducing it.

## Reuse issue workflow for planned work

`linked_issue_match` is strongest when it reflects the repository's existing
triage process:

- trusted maintainers write or assign the issue;
- accepted work carries an existing planning label;
- the PR body links the issue with `Fixes #123`, `Closes #123`, or a GitHub URL;
- the PR title, body, and changed files match the requested outcome.

Keep `require_same_repo: true` unless cross-repo planning is a normal part of
the project. Keep `require_trusted_signal: true` unless issue references alone
are already considered enough review context.

## Use path rules for real differences in risk

Avoid a single heavyweight policy for the whole repo. Use `path_rules` when
maintainers would ask a different class of question:

- auth, permissions, billing, data deletion, and cryptography;
- database migrations and generated schema changes;
- CI, release, deployment, and infrastructure workflows;
- package manager, build, or runtime entrypoint changes.

Path rules can override gates, approval mode, attempts, cooldown, minimum
changed lines, and path scope. The first matching rule wins, so order specific
rules before broad rules.

## Pick a draft strategy deliberately

The default template uses `draft_prs: ignore`, so draft PRs produce no
CLAWPTCHA check until they become ready for review. Use `draft_prs: neutral`
when maintainers want visible check context without forcing unfinished work
through a quiz. Use `draft_prs: challenge` only if the repository treats drafts
as review-ready work.

## Rechallenge only when new commits matter

The default `rechallenge.on_push: never` is calm for contributors: a passed PR
keeps its pass across follow-up commits. Use `always` for strict repositories.
Use `included_paths` when only changes to configured `include_paths` should
invalidate a prior pass.

```yaml
include_paths: ["src/core/**", "migrations/**"]
rechallenge:
  on_push: included_paths
  ignore_paths: ["docs/**", "*.md"]
```

## Tune output for the repository

During rollout, `output.comments: normal` makes the workflow easy to inspect.
Use `detailed` briefly when maintainers need risk detail in PR comments. Use
`quiet` for high-volume repositories where check-run output is enough.

Keep `output.labels: true` if maintainers triage from the PR list. When a quiz
passes but multiple passive risk signals fire, CLAWPTCHA best-effort applies
`clawptcha:flagged` so the pass is visible without opening the check run.

## Treat large PRs as investigation problems

For large PRs, configure `context.ignore_paths`, `map_tokens`, `detail_tokens`,
and `max_files` so the investigation focuses on meaningful evidence. Generated
outputs, lockfiles, vendored code, and binary assets usually make poor quiz
anchors.

If large PRs are common and the deployment can support it, configure the Flue
investigator and keep `context.investigator: auto`. Normal PRs can stay on the
main Worker; large PRs use the external investigator when it is available.
