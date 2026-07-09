# Security Policy

VOUCHA handles GitHub webhook payloads, GitHub App installation tokens,
Cloudflare Worker secrets, generated quiz content, and contributor challenge
records. Please report vulnerabilities privately before public disclosure.

## Reporting

Open a private security advisory on GitHub:

https://github.com/idosal/VOUCHA/security/advisories/new

If GitHub advisories are unavailable, contact the maintainer through the
repository owner profile.

## Scope

Reports are especially useful when they involve:

- webhook signature verification bypasses;
- GitHub App permission or installation-token misuse;
- exposure of correct quiz answers to clients;
- persistence of raw PR diffs or secrets;
- challenge author-verification bypasses;
- unintended merge-blocking behavior during service failures.

Please do not run intrusive tests against repositories you do not control.
