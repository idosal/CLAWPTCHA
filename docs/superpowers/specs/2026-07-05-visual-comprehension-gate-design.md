# Clawptcha — Visual Comprehension Gate Decision

**Date:** 2026-07-05
**Status:** Deferred — do not build for v1

## Decision

Do not add a generic LLM-generated `visual_comprehension` gate in v1.

Use the existing multiple-choice and explanation-style comprehension challenges
instead. Those formats are clearer, easier to review, easier to regenerate, and
more reliable to grade deterministically.

## Why

The visual-gate exploration repeatedly collapsed into one of two weak patterns:

- **Multiple choice with drag attached.** Multiple candidate answer cards plus
  one drop target is still a multiple-choice question, only slower.
- **Ambiguous diagram placement.** One draggable item plus several diagram slots
  can be more visual, but the generated task must invent the right abstraction,
  name the slots clearly, avoid giving away the answer, and remain fair for
  arbitrary PRs. That is too brittle for a merge-blocking check.

The product goal is still valid: Clawptcha should test whether the PR author
understands system intent, architecture, user-visible behavior, and blast
radius. The visual interaction is not reliable enough as a generic LLM-generated
format.

## What To Use Instead

Keep the challenge backbone text-first:

- `multiple_choice` questions for deterministic grading;
- explanation-style prompts where the author must state intent, effect, or risk
  in their own words when/if that format is supported;
- strong rationales and maintainer-visible review context;
- passive risk signals as report-only evidence, not hidden pass/fail rules.

The question generator should continue to avoid code trivia. Questions should
ask about system behavior, responsibility boundaries, user impact, operational
risk, and why the PR exists.

## Revisit Criteria

A visual gate is worth revisiting only if the visual structure is not invented
freeform by the LLM.

Acceptable future inputs:

- repository-owned architecture diagrams with stable node IDs;
- typed domain models generated from code or schema, with known relationships;
- product-owned task templates where the LLM fills labels but does not invent
  the interaction shape;
- deterministic validation data that can be reviewed and tested offline.

Without one of those anchors, the model has to generate both the diagram and the
answer key, and the UX becomes hard to understand or easy to spoof.

## Archived Exploration

The mock at `docs/superpowers/mockups/visual-comprehension-gate.html` is an
exploration artifact, not an implementation target.

It demonstrates the core failure mode: even when the task is reduced to one
drag, it either becomes an answer-selection UI or an ambiguous placement puzzle.
Do not implement it as-is.
