---
title: Issue-backed triage
description: How linked issues can exempt planned work without requiring a new maintainer-only workflow.
---

`linked_issue_match` lets maintainers reuse normal GitHub issue workflow. A PR
can be exempted when it links to trusted planned work and the implementation
matches that issue closely enough.

The intent is conservative: CLAWPTCHA should recognize a PR that implements a
trusted issue, but it should not turn a weak issue reference into a blanket
pass.

## Link discovery

CLAWPTCHA looks for standard closing references:

- `Fixes #123`
- `Closes owner/repo#123`
- GitHub issue URLs

By default, linked issues must be in the same repository. Cross-repo issue
references are ignored unless `require_same_repo: false` is configured.

Missing, untrusted, cross-repo, or weakly related issues fall through to the
configured gate. They do not create a failure state.

## Trusted issue signals

An issue can become trusted through existing GitHub signals:

- maintainer or collaborator issue author;
- maintainer or collaborator assignee;
- configured `trusted_labels`.

```yaml
exemptions:
  - type: linked_issue_match
    require_same_repo: true
    require_trusted_signal: true
    min_match_score: 0.7
    max_issues: 5
    trusted_labels: [accepted]
```

`require_trusted_signal: true` keeps a random issue link from becoming an
automatic exemption. Set it to `false` only when issue references are already a
trusted planning artifact in the repository.

## Semantic match

The PR title, body, and file list are compared against the requested outcome in
the linked issue. The exemption applies only when the match score meets
`min_match_score`.

This keeps the workflow practical: maintainers can keep using issues for
planning, and CLAWPTCHA can avoid challenging implementation PRs that already
have reviewed context.

## Common operating pattern

Use issue triage for work that maintainers have already shaped:

1. Maintainer opens, labels, or assigns the issue.
2. Contributor links the issue in the PR body with a normal closing reference.
3. CLAWPTCHA checks trust and semantic match.
4. If both pass, the PR receives an exempt success check with the reason.
5. If either is weak, the PR follows the normal challenge path.

This avoids a CLAWPTCHA-specific ceremony. The policy reuses GitHub state that
maintainers already understand.

## Tuning advice

Keep `min_match_score` conservative. `0.7` is a reasonable default for planned
work: the PR should clearly implement the issue without requiring exact wording.

Use `trusted_labels` for labels that already mean accepted or ready to
implement. Do not add a label that means only "skip CLAWPTCHA" unless the
repository explicitly wants that process.

Keep `max_issues` small. A PR that links many issues can become ambiguous; it
is usually better for CLAWPTCHA to challenge the author than to infer ownership
from a broad issue list.
