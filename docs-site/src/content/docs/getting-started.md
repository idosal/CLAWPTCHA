---
title: Getting started
description: A practical first rollout path for adding VOUCHA to a repository.
---

Start with a narrow policy, verify the check-run behavior on a few known PRs,
then tighten path-specific rules only where maintainers actually need them.

## 1. Install VOUCHA

For a public repository, [install the hosted GitHub App](https://github.com/apps/voucha-checks/installations/new)
and select the repositories it may access. The hosted service is free and uses
the built-in policy until you add `.github/voucha.yml` to a merge target.

For private repositories or a fully operator-owned data boundary, self-host the
Worker, D1 database, GitHub App credentials, Turnstile keys, and model provider.
The setup wizard deploys the Worker, creates the GitHub App through GitHub's
manifest flow, and writes Worker secrets:

```bash
npx wrangler login && npm run setup
```

The Worker uses Workers AI by default. External model providers and the
optional Flue investigator are advanced deployment choices, not prerequisites
for the first repository.

See the entire hosted flow on the
[public demo pull request](https://github.com/idosal/voucha-owner-check-e2e/pull/11).

![A live VOUCHA comment recording a passed challenge and maintainer risk report](https://raw.githubusercontent.com/idosal/voucha-owner-check-e2e/main/docs/screenshots/voucha-custom-comment.jpg)

## 2. Add the first policy file

Create `.github/voucha.yml` on the default branch or the branch you merge
into. VOUCHA reads policy from the PR's merge target, not from the PR branch.
The full default policy template is `templates/voucha.yml`; this abbreviated
first policy keeps the same core behavior.

```yaml
gates:
  - type: multiple_choice
    questions: 4
    pass_threshold: 3

require_approval: first_time
draft_prs: ignore

signals:
  - type: honeypot
    report_only: true

skip_paths: ["docs/**", "*.md"]
min_changed_lines: 10
output:
  comments: normal
  labels:
    passed: false
    failed: true
    flagged: true
  contributor_message: >
    Thanks for contributing, {{author}}. Please complete this short check
    when you're ready.
```

This gives first-time contributors a maintainer checkpoint before the quiz,
keeps draft PRs quiet until they are ready for review, skips docs-only work,
and records the default form honeypot signal as review evidence.
The label object keeps successful PRs quiet by default, makes failures visible
from the PR list, and flags suspicious passes. Set `passed: true` when the
repository also wants a durable success label.
`contributor_message` is optional; it lets the repository set the tone of the
action-required PR comment while VOUCHA keeps the challenge link and status
wording consistent.

Also copy or adapt `templates/contributing-policy.md` into `CONTRIBUTING.md`
and `templates/pull_request_template.md` into the repository PR template. It
tells contributors the same policy VOUCHA enforces: AI assistance in PR
authoring is allowed, but challenge answers must come from the author's own
understanding. The submitter must understand, test, explain, and support the PR.

## 3. Verify the first scenarios

Before tightening policy, open or replay a few predictable PRs:

- a docs-only PR should get an exempt success check;
- a first-time contributor PR should wait for `/voucha approve`;
- a normal challenged PR should produce a quiz link, pass, and then post a
  green attestation check; if `output.labels.passed` is enabled, it should also
  replace any stale failure label with `VOUCHA:passed`;
- a failed quiz should offer an immediate fresh retry by default;
- a meaningful code commit after a pass should create a two-question follow-up
  quiz scoped to that delta; a docs/Markdown-only commit should carry the pass
  forward.

If the check reports neutral, treat that as a VOUCHA-side availability or
generation problem, not as a verdict on the PR.

## 4. Add repository-specific rules

Once the default path is working, add policy where the repository has real
review risk:

```yaml
path_rules:
  - paths: ["src/auth/**", "migrations/**", ".github/workflows/**"]
    gates:
      - type: multiple_choice
        questions: 6
        pass_threshold: 5
    require_approval: always
    max_attempts: 2
    cooldown_minutes: 30
```

Use path rules for sensitive areas instead of making every contribution pay the
same cost.

## 5. Introduce trusted context

When maintainers already plan work in GitHub issues, add issue-backed triage.
This lets VOUCHA exempt PRs that link to trusted issues and semantically
match the requested outcome.

```yaml
exemptions:
  - type: linked_issue_match
    require_same_repo: true
    require_trusted_signal: true
    min_match_score: 0.7
    trusted_labels: [accepted, ready]
```

Prefer labels and assignments your maintainers already use. Avoid adding a
VOUCHA-only label ceremony unless the repository truly wants that workflow.
