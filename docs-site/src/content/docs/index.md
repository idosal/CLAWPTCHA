---
title: CLAWPTCHA operating model
description: How CLAWPTCHA decides when to trust context, record signals, or ask a pull request author for proof.
hero:
  title: Maintainer operating model
  tagline: CLAWPTCHA is repository policy for pull requests, not a generic CAPTCHA. It resolves trust first, records passive evidence, and asks for author proof only when policy still needs it.
  actions:
    - text: Get started
      link: /docs/getting-started/
    - text: Why use it
      link: /docs/why-clawptcha/
      variant: secondary
---

CLAWPTCHA sits in the pull request review path as a fail-open governance layer.
It does not decide whether a change is good. It decides whether the author has
already supplied enough trusted context, or whether the repository should ask
for a short comprehension challenge before maintainer review.

## Decision order

| Stage | What CLAWPTCHA checks | Result |
| --- | --- | --- |
| Repository policy | `.github/clawptcha.yml` from the merge target | PRs cannot relax their own gate by editing config on the feature branch. |
| Path-specific policy | first matching `path_rules` entry | Sensitive paths can override gates, approval, attempts, cooldown, and scope. |
| Exemptions | built-in maintainer trust, author rules, repository permissions, paths, size, issue context | Trusted or out-of-scope work gets an explanatory success check. |
| Passive signals | hidden form fields, code canaries, Turnstile, timing, automation hints | Findings are summarized for maintainers, never used as a quiz score. |
| Challenge | generated questions about intent, behavior, affected surfaces, and blast radius | A passing author attests that they understand the change. |

## What maintainers get

- A check-run summary that explains why a PR passed, was exempt, needs approval,
  or degraded to neutral.
- A policy vocabulary centered on `gates`, `exemptions`, and report-only
  `signals`.
- Linked-issue triage that can reuse existing GitHub workflow instead of
  adding a CLAWPTCHA-specific label ceremony.
- Passive canary reporting for suspicious diffs without turning a canary into
  an automatic block.
- Adaptive PR investigation for normal and large PRs, with optional Flue-backed
  investigation when configured.
- Output controls for quiet, normal, or detailed PR comments and optional
  `clawptcha:flagged` labels.

## Start here

| Page | Use it for |
| --- | --- |
| [Why use CLAWPTCHA](/docs/why-clawptcha/) | Decide whether this belongs in the repository's review path. |
| [Getting started](/docs/getting-started/) | Add the first policy file and verify the first scenarios. |
| [Common practices](/docs/common-practices/) | Roll out honeypots, issue triage, path rules, drafts, retries, and output volume. |
| [Configuration](/docs/configuration/) | Check the full current policy surface and defaults. |

## Default failure posture

CLAWPTCHA should not become an outage-prone merge lock. Service-side failures,
model failures, malformed config fields, and unavailable signal providers
degrade narrowly and visibly. Maintainers still see the reason, but the product
is built as review evidence rather than an infallible gatekeeper.
