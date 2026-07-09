---
title: Common practices
description: Operational patterns for accountability, GitHub PR limits, trust tiers, honeypots, issue triage, path-specific gates, drafts, retries, and output volume.
---

VOUCHA works best as a maintainer-facing policy system. The strongest
rollouts are explicit about what is trusted, what is merely suspicious, and
what should still go to human review.

## Document accountability, not AI purity

Low-effort PRs are expensive because maintainers have to infer intent, check
whether the author can iterate, and separate plausible-looking output from
maintained work. Do not frame policy as "no AI." Frame it as responsibility:
AI assistance in authoring is allowed, but challenge answers must come from the
author's own understanding. The submitter must understand, test, explain, and
support the change.

Use `templates/contributing-policy.md` as a starting point for `CONTRIBUTING.md`
and `templates/pull_request_template.md` as a PR template. VOUCHA should
reinforce that policy with an attestation challenge, not replace ordinary
maintainer judgment.

If the repository wants the PR template fields to be mandatory, enable the
accountability preflight:

```yaml
accountability:
  require_pr_acknowledgement: true
  require_ai_disclosure: true
```

That check is deliberately about responsibility, not authorship detection.

## Pair with GitHub-native volume controls

For high-volume repositories, use GitHub's PR creation limits, trusted bypass
lists, or temporary restrictions on who can open pull requests to reduce review
load before a PR reaches VOUCHA. VOUCHA is best at proving understanding
and preserving review evidence for PRs that are already in the queue; GitHub
should own raw volume throttling.

## Trust contributors in tiers

Use `author_login` for named people, `github_team` for org-managed groups,
`repository_permission` for repository roles, and `prior_merged_prs` when a
repo wants to trust contributors after a visible body of merged work.

```yaml
exemptions:
  - type: github_team
    teams: [maintainers, security]
  - type: prior_merged_prs
    min_count: 3
```

Team checks require Members read permission on the GitHub App. Merged-PR counts
use GitHub search. If either signal is unavailable, VOUCHA falls back to the
normal gate.

## Keep passive signals report-only

Use passive signals to decide where maintainers should look harder, not to
silently fail a PR. Form honeypots, code canaries, timings, and pointer
summaries all have legitimate edge cases. Turnstile validation and browser
automation flags are bot-verification gates and fail with an explicit reason.

VOUCHA currently forces `honeypot` and `code_honeypot` signals to
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
      - "VOUCHA_DO_NOT_ADD_THIS"
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
VOUCHA check until they become ready for review. Use `draft_prs: neutral`
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

If `include_paths` is empty, `included_paths` behaves like `always`. That is a
strict fallback so a typo or incomplete config does not silently preserve stale
passes.

## Tune output for the repository

During rollout, `output.comments: normal` makes the workflow easy to inspect.
Use `detailed` briefly when maintainers need risk detail in PR comments. Use
`quiet` for high-volume repositories where check-run output is enough.

Keep `output.labels: true` if maintainers triage from the PR list. When a quiz
passes but multiple passive risk signals fire, VOUCHA best-effort applies
`pr-comprehension:flagged` so the pass is visible without opening the check run.

## Treat large PRs as investigation problems

For large PRs, configure `context.ignore_paths`, `map_tokens`, `detail_tokens`,
and `max_files` so the investigation focuses on meaningful evidence. Generated
outputs, lockfiles, vendored code, and binary assets usually make poor quiz
anchors.

If large PRs are common and the deployment can support it, configure the Flue
investigator and keep `context.investigator: auto`. Normal PRs can stay on the
main Worker; large PRs use the external investigator when it is available.
