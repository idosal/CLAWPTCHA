# Changelog

## 1.0.0 — 2026-07-11

VOUCHA's first stable public release.

### Hosted and self-hosted installation

- Free hosted GitHub App for public repositories.
- Cloudflare setup wizard for private repositories and operator-owned
  deployments.
- Repository-native policy in `.github/voucha.yml`, read from the PR's merge
  target so a contribution cannot weaken its own gate.

### Maintainer policy

- Diff-specific multiple-choice comprehension checks.
- Trust rules for repository relationships, named authors, GitHub teams,
  permissions, prior merged contributions, linked issues, paths, bots, drafts,
  and small changes.
- Path-specific policy overrides, delta-aware challenges after new commits,
  maintainer approval, retry, and optional terminal-failure auto-close.
- Repository-specific contributor wording for active challenge comments, with
  safe placeholders for the author, attempt limit, and challenge URL.
- Report-only form honeypots and maintainer-authored code canaries.

### Contributor and review workflow

- One-time GitHub-comment verification without GitHub user tokens.
- Turnstile and bounded interaction-risk signals with explicit privacy
  disclosure and an extended-timing option.
- Public check-run outcome and comprehension attestation, with detailed answers
  and summary telemetry retained as maintainer audit data.
- Neutral fail-open behavior for service and model failures.

### Public proof

- Hosted product and documentation at [voucha.dev](https://voucha.dev).
- Inspectable end-to-end workflow in the
  [public demo repository](https://github.com/idosal/voucha-owner-check-e2e)
  and [curated demo PR](https://github.com/idosal/voucha-owner-check-e2e/pull/7).
