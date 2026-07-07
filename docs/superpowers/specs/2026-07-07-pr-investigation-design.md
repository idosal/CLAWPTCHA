# CLAWPTCHA PR Investigation Design

**Date:** 2026-07-07
**Status:** Worker investigator plus Flue large-PR investigator

## Goal

Large PRs should not be reduced to "the first 32k tokens." CLAWPTCHA now treats
PR understanding as a small investigation step followed by quiz generation.
The investigation is cached by `(repo_full_name, pr_number, head_sha)` and can
be reused for retries and maintainer summaries.

## Artifact Contract

The investigator produces concise JSON:

```json
{
  "summary": "One-sentence summary.",
  "intent": "What this PR is trying to accomplish.",
  "behavior_changes": ["User or system behavior changes."],
  "affected_surfaces": ["Areas a maintainer should think about."],
  "risk_areas": ["Review risks or likely failure modes."],
  "evidence": [
    { "path": "src/example.ts", "why_it_matters": "Why this file supports the investigation." }
  ],
  "unknowns": ["What the investigator could not confidently inspect."],
  "quiz_anchors": ["Concepts suitable for author-facing questions."],
  "confidence": "low | medium | high",
  "mode": "normal | large_pr"
}
```

The quiz generator consumes this artifact and still asks short questions about
intent, behavior, and blast radius. It must not ask code trivia.

## Current Worker Investigator

The Worker implementation:

- fetches the full PR diff for passive code-honeypot scanning;
- fetches paginated PR file details from GitHub;
- ranks low-signal paths like lockfiles, generated outputs, and binary assets
  behind ordinary source/config/test files;
- sends a full file map plus selected patch evidence to the LLM;
- stores the validated artifact in `pr_investigations`;
- can fall back to bounded direct generation for non-large Worker failures.

## Flue Investigator

The Flue investigator lives in `flue-investigator/` and exposes the workflow:

```text
POST /workflows/investigate-pr?wait=result
```

The main Worker chooses an investigator with `context.investigator`:

- `auto`: use Flue for large PRs when the `FLUE_INVESTIGATOR` service binding
  or `FLUE_INVESTIGATOR_URL` is configured with `FLUE_INVESTIGATOR_SECRET`,
  otherwise use the Worker investigator.
- `worker`: always use the Worker investigator.
- `flue`: require Flue. Missing config or workflow failure neutralizes the
  challenge instead of sending the huge raw diff through direct generation.

The Flue request includes repo identity, PR metadata, the full changed-file map,
selected patch evidence, a bounded diff excerpt, and budget hints. GitHub
installation tokens are never sent to Flue or stored in workflow payloads.
For same-account Cloudflare deployments, the main Worker should call Flue over
a Worker service binding; `FLUE_INVESTIGATOR_URL` remains a fallback for
cross-account or external deployments.

Its default posture is read-only:

- inspect only the PR head and changed paths authorized by the Worker payload;
- inspect only Worker-provided evidence unless future tooling adds a
  non-persisted, service-bound read path;
- avoid running contributor code unless a repo explicitly opts into a
  sandboxed, secretless execution mode;
- persist only the investigation artifact and small evidence references, not a
  broad copy of repo contents.

The quiz UI, grading, and attestation flow should not need to know which
backend produced the investigation.
