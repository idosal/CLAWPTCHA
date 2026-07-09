---
title: Configuration
description: The current VOUCHA policy surface for accountability, gates, exemptions, passive signals, path rules, investigation, retries, and output.
---

Store repository policy in `.github/voucha.yml` on the default branch or
merge target branch. VOUCHA reads that merge-target file for every PR, so a
PR cannot weaken its own gate by editing config in the feature branch.

All fields are optional. Invalid fields fall back to their defaults rather than
breaking the whole policy file.

Copy `templates/voucha.yml` when a repository wants the built-in defaults
committed explicitly. The default template uses `draft_prs: ignore`, so draft
PRs stay quiet until they are marked ready for review. Copy
`templates/contributing-policy.md` when the repository also wants maintainer
language for AI-assisted or otherwise low-accountability PRs.

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
  - type: github_team
    teams: [maintainers, octo-org/security]
  - type: prior_merged_prs
    min_count: 3
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
    patterns: ["VOUCHA_DO_NOT_ADD_THIS"]
    paths: ["src/**", "infra/**"]

require_approval: first_time
max_attempts: 3
cooldown_minutes: 15
draft_prs: ignore

trust:
  default_author_associations: [OWNER, MEMBER, COLLABORATOR]

accountability:
  require_pr_acknowledgement: false
  require_ai_disclosure: false

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

enforcement:
  auto_close:
    enabled: false
    outcomes: [failed_assisted, failed_final]
```

## Capability map

| Area | Fields | What it controls |
| --- | --- | --- |
| Author-facing proof | `gates` | The challenge type, question count, and passing threshold. |
| Scope | `skip_paths`, `include_paths`, `min_changed_lines`, `path_rules` | Which PRs should skip, enter, or receive stricter policy. |
| Trust | `trust`, `exemptions`, `bot_policy` | Which default author associations, authors, teams, repository roles, contributor history, bots, and planned issues can avoid a challenge. |
| Approval and retry | `require_approval`, `accountability`, `max_attempts`, `cooldown_minutes`, `draft_prs`, `rechallenge` | Human approval, required PR-body accountability fields, drafts, retry limits, cooldown, and new-commit behavior. |
| Passive evidence | `signals`, `output.labels` | Honeypot fields, code canaries, and flagged-pass labels. |
| Investigation | `context`, `max_context_tokens` | How PR evidence is condensed before quiz generation. |
| Reporting | `output.comments`, `output.labels` | PR comment volume and best-effort labels. |
| Enforcement | `enforcement.auto_close` | Optional PR auto-close behavior after terminal hard failures. |

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
turns VOUCHA into opt-in scope: when non-empty, a PR is exempt unless at
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

- `first_time`: first-time or unknown GitHub authors need `/voucha approve`.
- `always`: every challenged PR needs maintainer approval.
- `never`: the challenge is served as soon as it is ready.

`draft_prs` accepts `challenge`, `neutral`, or `ignore`.

- `challenge`: drafts follow normal policy.
- `neutral`: drafts get a visible neutral check and no challenge.
- `ignore`: drafts produce no VOUCHA check. This is the default.

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
  - type: github_team
    teams: [maintainers, octo-org/security]
  - type: prior_merged_prs
    min_count: 3
```

Owners, members, and collaborators are trusted by default through `trust`.
Set the list to `[]` when they should take the challenge too:

```yaml
trust:
  default_author_associations: []
```

`author_login` and `author_association` add repository-specific trust. `repository_permission`
reuses GitHub's collaborator permission API, matching both `role_name` values
such as `maintain`, `admin`, and custom repository roles, and legacy
`permission` values such as `write` or `read`. If GitHub cannot resolve access,
VOUCHA falls back to the gate.

`github_team` trusts active members of named GitHub teams. Bare team slugs use
the repository owner; `org/team-slug` can point at a specific organization.
This requires the GitHub App to have Members read permission. `roles` is
optional and defaults to both team members and team maintainers.

```yaml
exemptions:
  - type: github_team
    teams: [maintainers, octo-org/security]
    roles: [member, maintainer]
```

`prior_merged_prs` trusts authors after enough merged PRs in the same
repository:

```yaml
exemptions:
  - type: prior_merged_prs
    min_count: 3
```

Both exemptions fail closed: when GitHub cannot resolve membership or search
history, the PR falls through to the normal gate.

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

## Accountability preflight

`accountability` can require the PR body to include explicit responsibility
fields before VOUCHA creates a quiz.

```yaml
accountability:
  require_pr_acknowledgement: true
  require_ai_disclosure: true
```

With both options enabled, the PR body must include a checked acknowledgement
and an AI assistance line:

```md
- [x] I understand, tested, and can support this change.
AI assistance: yes
```

Use `yes`, `no`, `n/a`, or `none` for the disclosure value. Start from
`templates/pull_request_template.md` so contributors see the required fields
before they open the PR.

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

VOUCHA discovers normal closing references such as `Fixes #123`, `Closes
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
    patterns: ["VOUCHA_DO_NOT_ADD_THIS"]
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

`on_push` accepts `never`, `always`, or `included_paths`. `included_paths` uses
the effective `include_paths`; if that list is empty, it behaves like `always`
so stale passes are not silently preserved. `ignore_paths` keeps low-risk pushes
from invalidating a prior pass. Legacy `rechallenge_on_push: true` maps to
`on_push: always` when `rechallenge` is omitted.

`output` controls PR noise and labels:

```yaml
output:
  comments: normal
  labels: true
```

`comments` accepts `quiet`, `normal`, or `detailed`. `labels: true` enables the
best-effort `pr-comprehension:flagged` label when a passed quiz has multiple passive
risk signals.

`enforcement.auto_close` is off by default. When enabled, VOUCHA closes the PR
after configured terminal hard-failure outcomes; it never closes retryable
failures, neutral service failures, drafts, or superseded challenges.

```yaml
enforcement:
  auto_close: true
```

The shorthand above closes PRs for both supported auto-close outcomes:
`failed_assisted` and `failed_final`. Use the object form to narrow it:

```yaml
enforcement:
  auto_close:
    enabled: true
    outcomes: [failed_final]
```

Auto-close is best-effort. If GitHub rejects the close request, the VOUCHA check
still stays failed and the PR comment asks maintainers to review manually.

## Context and investigation

`context.strategy: adaptive` is the normal mode. VOUCHA first builds an
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
| `trust` | `{ default_author_associations: ["OWNER", "MEMBER", "COLLABORATOR"] }` |
| `max_attempts` | `3` |
| `cooldown_minutes` | `15` |
| `draft_prs` | `ignore` |
| `accountability` | `{ require_pr_acknowledgement: false, require_ai_disclosure: false }` |
| `bot_policy` | `{ default: "skip", trusted_logins: [] }` |
| `rechallenge` | `{ on_push: "never", ignore_paths: [] }` |
| `min_changed_lines` | `10` |
| `skip_paths` | `["docs/**", "*.md"]` |
| `include_paths` | `[]` |
| `context` | adaptive Worker/Flue auto selection with 8000 map tokens, 24000 detail tokens, 12 files, and large PR threshold of 100 files or 5000 changed lines |
| `output` | `{ comments: "normal", labels: true }` |
| `enforcement` | `{ auto_close: { enabled: false, outcomes: ["failed_assisted", "failed_final"] } }` |
