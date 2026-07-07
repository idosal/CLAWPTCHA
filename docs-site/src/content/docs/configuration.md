---
title: Configuration
description: The current CLAWPTCHA policy surface for gates, exemptions, passive signals, path rules, investigation, retries, and output.
---

Store repository policy in `.github/clawptcha.yml` on the default branch or
merge target branch. CLAWPTCHA reads that merge-target file for every PR, so a
PR cannot weaken its own gate by editing config in the feature branch.

All fields are optional. Invalid fields fall back to their defaults rather than
breaking the whole policy file.

Copy `templates/clawptcha.yml` when a repository wants the built-in defaults
committed explicitly. The default template uses `draft_prs: ignore`, so draft
PRs stay quiet until they are marked ready for review.

## Full example

```yaml
gates:
  - type: multiple_choice
    questions: 4
    pass_threshold: 3

path_rules:
  - paths: ["src/core/**", "migrations/**", ".github/workflows/**"]
    gates:
      - type: multiple_choice
        questions: 6
        pass_threshold: 5
    require_approval: always
    max_attempts: 2
    cooldown_minutes: 30
    min_changed_lines: 0
    skip_paths: []
    include_paths: ["src/core/**", "migrations/**"]

exemptions:
  - type: author_login
    logins: [octocat]
  - type: author_association
    associations: [CONTRIBUTOR]
  - type: repository_permission
    permissions: [write, maintain, admin]
  - type: linked_issue_match
    require_same_repo: true
    require_trusted_signal: true
    min_match_score: 0.7
    max_issues: 5
    trusted_labels: [accepted, ready]

signals:
  - type: honeypot
    report_only: true
  - type: code_honeypot
    report_only: true
    patterns: ["CLAWPTCHA_DO_NOT_ADD_THIS"]
    paths: ["src/**", "infra/**"]

require_approval: first_time
max_attempts: 3
cooldown_minutes: 15
draft_prs: ignore

bot_policy:
  default: skip
  trusted_logins: ["dependabot[bot]", "renovate[bot]"]

rechallenge:
  on_push: never
  ignore_paths: ["docs/**", "*.md"]

min_changed_lines: 10
skip_paths: ["docs/**", "*.md"]
include_paths: []

context:
  strategy: adaptive
  investigator: auto
  map_tokens: 8000
  detail_tokens: 24000
  max_files: 12
  max_model_calls: 3
  ignore_paths: ["dist/**", "*.lock"]
  large_pr:
    changed_files: 100
    changed_lines: 5000

max_context_tokens: null

output:
  comments: normal
  labels: true
```

## Capability map

| Area | Fields | What it controls |
| --- | --- | --- |
| Author-facing proof | `gates` | The challenge type, question count, and passing threshold. |
| Scope | `skip_paths`, `include_paths`, `min_changed_lines`, `path_rules` | Which PRs should skip, enter, or receive stricter policy. |
| Trust | `exemptions`, `bot_policy` | Which authors, permissions, and planned issues can avoid a challenge. |
| Approval and retry | `require_approval`, `max_attempts`, `cooldown_minutes`, `draft_prs`, `rechallenge` | Human approval, drafts, retry limits, cooldown, and new-commit behavior. |
| Passive evidence | `signals`, `output.labels` | Honeypot fields, code canaries, and flagged-pass labels. |
| Investigation | `context`, `max_context_tokens` | How PR evidence is condensed before quiz generation. |
| Reporting | `output.comments`, `output.labels` | PR comment volume and best-effort labels. |

## Gates

The current shipped gate is `multiple_choice`.

```yaml
gates:
  - type: multiple_choice
    questions: 4
    pass_threshold: 3
```

`questions` accepts 1 through 10. `pass_threshold` accepts 1 through 10 and is
capped at the question count.

Legacy top-level `pass_threshold` still works when `gates` is omitted. New
configs should use `gates[0].pass_threshold`.

## Scope and path rules

`skip_paths` exempts a PR only when every changed file matches. `include_paths`
turns CLAWPTCHA into opt-in scope: when non-empty, a PR is exempt unless at
least one changed file matches.

```yaml
skip_paths: ["docs/**", "*.md"]
include_paths: ["src/core/**", "packages/runtime/**"]
```

`min_changed_lines` exempts tiny diffs based on additions plus deletions.
Keep it low enough that a multi-file behavior change cannot hide behind it.

`path_rules` apply the first matching override to the effective policy. They
can override `gates`, `require_approval`, `max_attempts`, `cooldown_minutes`,
`min_changed_lines`, `skip_paths`, and `include_paths`.

```yaml
path_rules:
  - paths: ["src/auth/**", "migrations/**"]
    require_approval: always
    gates:
      - type: multiple_choice
        questions: 6
        pass_threshold: 5
```

The glob implementation is intentionally small: `**` matches path segments and
`*` matches inside one segment. Other characters are literals.

## Approval, drafts, attempts

`require_approval` accepts `first_time`, `always`, or `never`.

- `first_time`: first-time or unknown GitHub authors need `/clawptcha approve`.
- `always`: every challenged PR needs maintainer approval.
- `never`: the challenge is served as soon as it is ready.

`draft_prs` accepts `challenge`, `neutral`, or `ignore`.

- `challenge`: drafts follow normal policy.
- `neutral`: drafts get a visible neutral check and no challenge.
- `ignore`: drafts produce no CLAWPTCHA check. This is the default.

`max_attempts` accepts 1 through 10. `cooldown_minutes` accepts 0 or greater.
A failed non-final attempt waits for cooldown and then receives a fresh quiz.

## Author and bot trust

Use `exemptions` for explicit trust decisions:

```yaml
exemptions:
  - type: author_login
    logins: [octocat]
  - type: author_association
    associations: [CONTRIBUTOR]
  - type: repository_permission
    permissions: [write, maintain, admin]
```

Owners, members, and collaborators are trusted by default. `author_login` and
`author_association` add repository-specific trust. `repository_permission`
reuses GitHub's collaborator permission API and falls back to the gate if the
permission cannot be resolved.

Bots are controlled separately:

```yaml
bot_policy:
  default: skip
  trusted_logins: ["dependabot[bot]", "renovate[bot]"]
```

`default: challenge` challenges bot authors except trusted named logins.
Legacy `skip_bots` maps into this setting when `bot_policy` is omitted.
Legacy `skip_authors` still works as an author allowlist, but new configs
should prefer `exemptions: [{ type: author_login, ... }]`.

## Linked issue exemptions

`linked_issue_match` exempts planned work only when the linked issue is trusted
and the PR semantically matches it.

```yaml
exemptions:
  - type: linked_issue_match
    require_same_repo: true
    require_trusted_signal: true
    min_match_score: 0.7
    max_issues: 5
    trusted_labels: [accepted]
```

CLAWPTCHA discovers normal closing references such as `Fixes #123`, `Closes
owner/repo#123`, and GitHub issue URLs. With the defaults, the issue must be in
the same repository and must have a trusted signal: maintainer or collaborator
author, trusted assignee, or configured trusted label.

If the issue is missing, untrusted, cross-repo, or weakly related, the PR falls
through to the normal gate instead of failing.

## Passive signals

`signals` defaults to the form honeypot:

```yaml
signals:
  - type: honeypot
    report_only: true
```

Set `signals: []` to disable passive honeypot collection. Supported passive
signals are forced report-only even if the config says otherwise.

`code_honeypot` scans added diff lines for maintainer-authored literal canaries:

```yaml
signals:
  - type: code_honeypot
    report_only: true
    patterns: ["CLAWPTCHA_DO_NOT_ADD_THIS"]
    paths: ["src/**", "infra/**"]
```

`patterns` supports up to 20 non-empty strings. `paths` defaults to `["**"]`
and can contain up to 50 glob patterns.

## Rechallenge and output

`rechallenge` controls whether new commits invalidate a previous pass:

```yaml
rechallenge:
  on_push: included_paths
  ignore_paths: ["docs/**", "*.md"]
```

`on_push` accepts `never`, `always`, or `included_paths`. `ignore_paths` keeps
low-risk pushes from invalidating a prior pass. Legacy `rechallenge_on_push:
true` maps to `on_push: always` when `rechallenge` is omitted.

`output` controls PR noise and labels:

```yaml
output:
  comments: normal
  labels: true
```

`comments` accepts `quiet`, `normal`, or `detailed`. `labels: true` enables the
best-effort `clawptcha:flagged` label when a passed quiz has multiple passive
risk signals.

## Context and investigation

`context.strategy: adaptive` is the normal mode. CLAWPTCHA first builds an
investigation artifact from PR metadata, file map, and selected patch evidence,
then generates the quiz from that artifact.

```yaml
context:
  strategy: adaptive
  investigator: auto
  map_tokens: 8000
  detail_tokens: 24000
  max_files: 12
  max_model_calls: 3
  ignore_paths: ["dist/**", "*.lock"]
  large_pr:
    changed_files: 100
    changed_lines: 5000
```

`investigator` accepts `auto`, `worker`, or `flue`. `auto` uses the main Worker
for normal PRs and the Flue investigator for large PRs when configured. `flue`
requires a configured Flue investigator; if it is missing or fails, quiz
generation reports neutral rather than falling back to raw large-diff
generation.

`context.ignore_paths` removes low-signal files from quiz evidence without
changing whether the PR is challenged.

`max_context_tokens` is a legacy/direct-generation cap used by
`context.strategy: truncate`. Keep it `null` unless you intentionally want that
older truncation path.

## Defaults

| Field | Default |
| --- | --- |
| `gates` | `[{ type: "multiple_choice", questions: 4, pass_threshold: 3 }]` |
| `path_rules` | `[]` |
| `signals` | `[{ type: "honeypot", report_only: true }]` |
| `exemptions` | `[]` |
| `require_approval` | `first_time` |
| `max_attempts` | `3` |
| `cooldown_minutes` | `15` |
| `draft_prs` | `ignore` |
| `bot_policy` | `{ default: "skip", trusted_logins: [] }` |
| `rechallenge` | `{ on_push: "never", ignore_paths: [] }` |
| `min_changed_lines` | `10` |
| `skip_paths` | `["docs/**", "*.md"]` |
| `include_paths` | `[]` |
| `context` | adaptive Worker/Flue auto selection with 8000 map tokens, 24000 detail tokens, 12 files, and large PR threshold of 100 files or 5000 changed lines |
| `output` | `{ comments: "normal", labels: true }` |
