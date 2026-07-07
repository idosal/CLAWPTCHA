---
title: Policy evaluation
description: How CLAWPTCHA loads repository policy and resolves gates, exemptions, and fail-open outcomes.
---

CLAWPTCHA evaluates repository policy before it asks an author to do anything.
The policy file is read from `.github/clawptcha.yml` on the merge target, so a
pull request cannot relax its own gate by changing config in the same branch.

Malformed fields fall back individually. A typo in one option should not take
down the check or silently erase the rest of the repository policy.

## Evaluation sequence

1. Load the merge-target policy.
2. Apply the first matching `path_rules` override, if any changed file matches.
3. Evaluate code honeypot signals against added diff lines so the result can be
   included even when the PR is later exempt.
4. Resolve draft PR handling, built-in maintainer trust, author rules, bot
   behavior, size, and path scope.
5. Apply repository permission exemptions through GitHub's collaborator
   permission API.
6. Evaluate issue-backed context when `linked_issue_match` is configured.
7. Reuse or invalidate a prior pass according to `rechallenge`.
8. Create an author-facing challenge only if no exemption applies.

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
    permissions: [write]
  - type: linked_issue_match
    require_same_repo: true
    require_trusted_signal: true
    min_match_score: 0.7
    max_issues: 5
    trusted_labels: [accepted]
```

When an exemption matches, CLAWPTCHA posts a success check with the reason so
maintainers can see why the author was not challenged.

Owners, members, and collaborators are trusted by default. Configured
exemptions are for additional trust relationships and planned work, not for
hiding policy decisions.

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
```

Use `included_paths` when a prior pass should survive docs/example updates but
be invalidated by changes in core paths.

## Approval, attempts, and cooldown

`require_approval` controls whether a maintainer must approve the challenge
path before the author can take the quiz. `first_time` applies only to GitHub
authors with first-time or unknown association. `always` requires approval for
every challenged PR. `never` serves the challenge as soon as it is ready.

Maintainers approve with a PR comment:

```text
/clawptcha approve
```

`max_attempts` and `cooldown_minutes` control retry behavior. A failed non-final
attempt enters cooldown and generates a fresh quiz on retry. Once attempts are
exhausted, the PR stays failed for maintainer review.

## Output posture

CLAWPTCHA reports through check runs first. `output.comments` controls PR
comment volume:

- `quiet`: check-run output only;
- `normal`: standard lifecycle comments;
- `detailed`: lifecycle comments plus risk detail.

`output.labels` controls whether a passed quiz with multiple passive risk
signals gets the best-effort `clawptcha:flagged` label.
