# Contributing

We welcome contributions, including work produced with AI assistance. The
submitter is responsible for the pull request.

Before opening a PR, make sure you can explain:

- what problem the change solves;
- why these files and APIs changed;
- how behavior changes for users, maintainers, or infrastructure;
- what you tested and what risk remains;
- whether any generated or AI-assisted code was reviewed by you.

Maintainers may close PRs that appear automated, unsupported, unrelated to an
accepted issue, or difficult to review because the author cannot explain or
iterate on the change.

Some PRs may be asked to pass VOUCHA before merge. Passing is a public
attestation that you personally understand, tested, and can support the change.
AI assistance in authoring a PR is allowed; AI or agent assistance answering a
VOUCHA challenge is not.

## Local Verification

Use Node.js 22.22.1 or newer.

```bash
npm ci
npm run typecheck
npm test
npm run build
```

For large-PR investigation changes, also run:

```bash
npm --prefix flue-investigator run check
```
