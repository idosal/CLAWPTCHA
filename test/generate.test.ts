import { describe, it, expect, vi } from "vitest";
import {
  generateQuiz,
  generateQuizFromInvestigation,
  buildGenerationPrompt,
  buildInvestigatedGenerationPrompt,
  capContext,
} from "../src/quiz/generate";
import type { QuizProvider, CompletionParams, CompletionResult } from "../src/quiz/providers";

const goodQuizJson = JSON.stringify({
  questions: [
    { type: "consequence_mcq", prompt: "What happens when X after this change?", options: ["a", "b", "c", "d"], correct: [0] },
    { type: "blast_radius_multi", prompt: "Which behaviors are affected by this PR?", options: ["a", "b", "c", "d"], correct: [1, 2] },
    { type: "false_claim", prompt: "Which statement about this PR is false?", options: ["a", "b", "c", "d"], correct: [3] },
    { type: "consequence_mcq", prompt: "What happens on cold start after this change?", options: ["a", "b", "c", "d"], correct: [2] },
  ],
});

function stubProvider(responses: Array<{ ok: true; text: string } | { ok: false; error: string }>) {
  let i = 0;
  const complete = vi.fn(
    async (_params: CompletionParams): Promise<CompletionResult> => responses[Math.min(i++, responses.length - 1)]
  );
  return { provider: { complete } as QuizProvider, complete };
}

describe("capContext", () => {
  it("passes small diffs through untouched", () => {
    expect(capContext("small diff", ["a.ts"], null)).toBe("small diff");
  });
  it("truncates and appends a file list when over the cap", () => {
    const big = "x".repeat(400);
    const out = capContext(big, ["a.ts", "b.ts"], 50); // 50 tokens ≈ 200 chars
    expect(out.length).toBeLessThan(big.length);
    expect(out).toContain("[diff truncated]");
    expect(out).toContain("a.ts");
  });
});

describe("generateQuiz", () => {
  it("returns a validated quiz from the provider", async () => {
    const { provider } = stubProvider([{ ok: true, text: goodQuizJson }]);
    const r = await generateQuiz(provider, "diff", "title", "body", ["a.ts"], null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.quiz.questions).toHaveLength(4);
  });

  it("passes system prompt, user prompt, schema, and maxTokens to the provider", async () => {
    const { provider, complete } = stubProvider([{ ok: true, text: goodQuizJson }]);
    await generateQuiz(provider, "THE_DIFF", "title", null, ["a.ts"], null);
    const params = complete.mock.calls[0][0];
    expect(params.system).toContain("SHORT questions");
    expect(params.prompt).toContain("THE_DIFF");
    expect(params.schema).toBeDefined();
    expect(params.maxTokens).toBe(16000);
  });

  it("retries once on invalid output, then succeeds", async () => {
    const { provider, complete } = stubProvider([
      { ok: true, text: "not json at all" },
      { ok: true, text: goodQuizJson },
    ]);
    const r = await generateQuiz(provider, "diff", "t", null, [], null);
    expect(r.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("retries once on a provider error, then succeeds", async () => {
    const { provider, complete } = stubProvider([
      { ok: false, error: "anthropic: HTTP 529" },
      { ok: true, text: goodQuizJson },
    ]);
    const r = await generateQuiz(provider, "diff", "t", null, [], null);
    expect(r.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("fails after two invalid outputs", async () => {
    const { provider, complete } = stubProvider([{ ok: true, text: '{"questions": []}' }]);
    const r = await generateQuiz(provider, "diff", "t", null, [], null);
    expect(r.ok).toBe(false);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("passes configured question count to validation", async () => {
    const twoQuestionQuiz = JSON.stringify({
      questions: JSON.parse(goodQuizJson).questions.slice(0, 2),
    });
    const { provider } = stubProvider([{ ok: true, text: twoQuestionQuiz }]);
    const r = await generateQuiz(provider, "diff", "title", "body", ["a.ts"], null, 2);
    expect(r.ok).toBe(true);
  });
});

describe("buildGenerationPrompt", () => {
  it("includes diff, title, and question-type instructions", () => {
    const p = buildGenerationPrompt("THE_DIFF", "My title", "My body", ["a.ts"], null);
    expect(p).toContain("THE_DIFF");
    expect(p).toContain("My title");
    expect(p).toContain("blast_radius_multi");
  });

  it("includes the configured question count", () => {
    const p = buildGenerationPrompt("diff", "title", null, ["a.ts"], null, 6);
    expect(p).toContain("Question count: 6");
  });
});

describe("investigation-backed generation", () => {
  const investigation = {
    summary: "Bounds archive download bodies.",
    intent: "Prevent oversized archive downloads from exhausting memory.",
    behavior_changes: ["Large archive responses are stopped before they grow without bound."],
    affected_surfaces: ["Clawhub archive imports"],
    risk_areas: ["Large downloads can still fail and need a clear error."],
    evidence: [{ path: "src/infra/clawhub.ts", why_it_matters: "Archive responses are read through a bounded path." }],
    unknowns: [],
    quiz_anchors: ["Why archive downloads are bounded"],
    confidence: "high" as const,
    mode: "normal" as const,
  };

  it("builds a prompt from the investigation artifact", () => {
    const prompt = buildInvestigatedGenerationPrompt(investigation, "title", null, ["src/infra/clawhub.ts"], 4);
    expect(prompt).toContain("Investigation artifact");
    expect(prompt).toContain("Prevent oversized archive downloads");
    expect(prompt).not.toContain("```diff");
  });

  it("generates and validates a quiz from an investigation artifact", async () => {
    const { provider, complete } = stubProvider([{ ok: true, text: goodQuizJson }]);
    const result = await generateQuizFromInvestigation(provider, investigation, "title", null, ["a.ts"], 4, 1);
    expect(result.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].prompt).toContain("Investigation artifact");
  });
});
