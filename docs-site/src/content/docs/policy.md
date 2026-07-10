---
title: Policy evaluation
description: How VOUCHA loads repository policy and resolves accountability, gates, exemptions, and fail-open outcomes.
---

VOUCHA evaluates repository policy before it asks an author to do anything.
The policy file is read from `.github/voucha.yml` on the merge target, so a
pull request cannot relax its own gate by changing config in the same branch.

Malformed fields fall back individually. A typo in one option should not take
down the check or silently erase the rest of the repository policy.

## Evaluation sequence

1. Load the merge-target policy.
2. Apply the first matching `path_rules` override, if any changed file matches.
3. Evaluate code honeypot signals against added diff lines so the result can be
   included even when the PR is later exempt.
4. Resolve draft PR handling.
5. Run the optional `accountability` PR-body preflight.
6. Resolve default author-association trust, author rules, bot
   behavior, size, and path scope.
7. Apply GitHub team, repository permission, and prior merged PR exemptions.
8. Evaluate issue-backed context when `linked_issue_match` is configured.
9. Reuse or invalidate a prior pass according to `rechallenge`.
10. Create an author-facing challenge only if no exemption applies.

Form honeypot signals are collected during challenge submission. Code honeypot
signals are available earlier because they come from the pull request diff.

## Gates

`gates` define what proof is required when a PR reaches the author-facing step.
The current production gate is `multiple_choice`, configured by question count
and pass threshold.

```yaml
gates:
  - type: multiple_choice
    questions: 4
    pass_threshold: 3
```

Questions should test the change, not the contributor. Useful questions cover:

- stated intent versus actual behavior;
- changed files and ownership boundaries;
- side effects and compatibility risks;
- affected user, maintainer, or infrastructure surfaces.

## Path-specific policy

`path_rules` let sensitive areas carry stricter policy without making every PR
heavier. The first rule with a matching changed file wins, so order specific
rules before broad rules.

```yaml
path_rules:
  - paths: ["src/core/**", "migrations/**"]
    gates:
      - type: multiple_choice
        questions: 6
        pass_threshold: 5
    require_approval: always
    max_attempts: 2
    cooldown_minutes: 30
    min_changed_lines: 0
```

Use this for runtime, auth, migrations, deployment workflows, or other surfaces
where a shallow pass would not be enough evidence.

Path rules can override `gates`, `require_approval`, `max_attempts`,
`cooldown_minutes`, `min_changed_lines`, `skip_paths`, and `include_paths`.

## Exemptions

`exemptions` are policy decisions that say a challenge is not needed. They are
best used for trust or scope, not as hidden scoring rules.

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
  - type: linked_issue_match
    require_same_repo: true
    require_trusted_signal: true
    min_match_score: 0.7
    max_issues: 5
    trusted_labels: [accepted]
```

When an exemption matches, VOUCHA posts a success check with the reason so
maintainers can see why the author was not challenged.

Owners, members, and collaborators are trusted by default through `trust`.
Configured exemptions are for additional trust relationships and planned work,
not for hiding policy decisions. Set the list to `[]` when owners, members, and
collaborators should take the challenge too.

```yaml
trust:
  default_author_associations: []
```

`repository_permission` matches GitHub's `role_name` values, including
`maintain`, `admin`, and custom repository roles, as well as the legacy
`permission` values returned by the same endpoint.

`github_team` resolves active GitHub team membership and requires the GitHub App
to have Members read permission. `prior_merged_prs` uses GitHub search to trust
authors after enough merged PRs in the repository. Both fail closed when GitHub
cannot resolve the signal.

## Accountability preflight

When enabled, `accountability` runs after draft handling and before exemptions
or challenge creation. It fails the check if required PR-template fields are
missing from the PR body.

```yaml
accountability:
  require_pr_acknowledgement: true
  require_ai_disclosure: true
```

This is meant for explicit maintainer policy: AI help is allowed, but the
submitter must state that they understand, tested, and can support the change.

## Drafts and push updates

Draft PRs are ignored by default. Repositories can opt into a visible neutral
check or normal challenge behavior:

```yaml
draft_prs: ignore
```

Pushes to an already-passed PR are controlled separately:

```yaml
rechallenge:
  on_push: included_paths
  ignore_paths: ["docs/**", "*.md"]
  questions: 2
```

The decision uses only the comparison between the latest passed head and the
incoming head. Use `included_paths` when a prior pass should survive
docs/example deltas but be invalidated by changes in core paths. If the
effective `include_paths` list is empty, `included_paths` falls back to strict
behavior and resets for any delta not ignored by `rechallenge.ignore_paths`.
The resulting follow-up quiz uses only that delta and up to the configured
`questions` count; it never expands the main gate.

## Approval, attempts, and cooldown

`require_approval` controls whether a maintainer must approve the challenge
path before the author can take the quiz. `first_time` applies only to GitHub
authors with first-time or unknown association. `always` requires approval for
every challenged PR. `never` serves the challenge as soon as it is ready.

Maintainers approve with a PR comment:

```text
/voucha approve
```

`max_attempts` and `cooldown_minutes` control retry behavior. A failed non-final
attempt enters cooldown and generates a fresh quiz on retry. Once attempts are
exhausted, the PR stays failed for maintainer review by default.

A write-capable maintainer can restart a terminal failed or neutral challenge
for the same commit without discarding the previous audit:

```text
/voucha retry
```

`/voucha retrigger` is accepted as an alias. A retry starts a new attempt cycle,
creates a new queued check run, and keeps the existing challenge link.

`enforcement.auto_close` can additionally close PRs after terminal hard-failure
outcomes. It is off by default and never closes retryable failures, neutral
service failures, or superseded challenges.

```yaml
enforcement:
  auto_close:
    enabled: true
    outcomes: [failed_assisted, failed_final]
```

## Output posture

VOUCHA reports through check runs first. `output.comments` controls PR
comment volume:

- `quiet`: check-run output only;
- `normal`: standard lifecycle comments;
- `detailed`: lifecycle comments plus risk detail.

`output.labels` controls whether a passed quiz with multiple passive risk
signals gets the best-effort `pr-comprehension:flagged` label.
