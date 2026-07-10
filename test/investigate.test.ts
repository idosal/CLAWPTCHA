import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/config";
import {
  buildInvestigationPrompt,
  investigatePr,
  investigationMode,
  validateInvestigationArtifact,
} from "../src/quiz/investigate";
import type { CompletionParams, CompletionResult, QuizProvider } from "../src/quiz/providers";

const artifactJson = JSON.stringify({
  summary: "Adds safer archive download handling.",
  intent: "Prevent oversized archive downloads from exhausting memory.",
  behavior_changes: ["Archive downloads stop after a bounded response size."],
  affected_surfaces: ["Clawhub archive import"],
  risk_areas: ["Large downloads could still time out."],
  evidence: [{ path: "src/infra/clawhub.ts", why_it_matters: "It wraps archive response reading." }],
  unknowns: [],
  quiz_anchors: ["Why archive downloads are now bounded"],
  confidence: "high",
  mode: "normal",
});

function stubProvider(responses: Array<{ ok: true; text: string } | { ok: false; error: string }>) {
  let i = 0;
  const complete = vi.fn(
    async (_params: CompletionParams): Promise<CompletionResult> => responses[Math.min(i++, responses.length - 1)]
  );
  return { provider: { complete } as QuizProvider, complete };
}

describe("buildInvestigationPrompt", () => {
  it("uses selected file patches instead of blindly pasting the whole diff", () => {
    const prompt = buildInvestigationPrompt({
      diff: "x".repeat(20000),
      title: "fix downloads",
      body: null,
      files: ["src/infra/clawhub.ts", "package-lock.json"],
      changedLines: 300,
      filePatches: [
        {
          filename: "package-lock.json",
          status: "modified",
          additions: 5000,
          deletions: 1000,
          changes: 6000,
          patch: "+lock".repeat(1000),
        },
        {
          filename: "src/infra/clawhub.ts",
          status: "modified",
          additions: 40,
          deletions: 5,
          changes: 45,
          patch: "+bound archive response bodies",
        },
      ],
    }, DEFAULT_CONFIG);

    expect(prompt).toContain("Full changed-file map");
    expect(prompt).toContain("src/infra/clawhub.ts");
    expect(prompt.indexOf("src/infra/clawhub.ts")).toBeLessThan(prompt.indexOf("package-lock.json"));
    expect(prompt).not.toContain("x".repeat(1000));
  });

  it("classifies large PRs from server-side thresholds", () => {
    const ctx = {
      diff: "diff",
      title: "big change",
      body: null,
      files: ["a.ts"],
      changedLines: DEFAULT_CONFIG.context.large_pr.changed_lines,
    };
    expect(investigationMode(ctx, DEFAULT_CONFIG)).toBe("large_pr");
    expect(buildInvestigationPrompt(ctx, DEFAULT_CONFIG)).toContain("Investigation mode: large_pr");
  });

  it("limits a follow-up investigation to the delta after the passed head", () => {
    const prompt = buildInvestigationPrompt({
      diff: "DELTA_DIFF",
      title: "Full PR title",
      body: "Full PR body",
      files: ["follow-up.ts"],
      deltaBaseSha: "passed-sha",
    }, DEFAULT_CONFIG);

    expect(prompt).toContain("Follow-up scope: commits after passed head passed-sha");
    expect(prompt).toContain("Investigate only this follow-up delta");
  });
});

describe("investigatePr", () => {
  it("returns a validated investigation artifact", async () => {
    const { provider, complete } = stubProvider([{ ok: true, text: artifactJson }]);
    const result = await investigatePr(provider, {
      diff: "diff",
      title: "fix downloads",
      body: "bounds archive reads",
      files: ["src/infra/clawhub.ts"],
    }, DEFAULT_CONFIG);

    expect(result.ok).toBe(true);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      schema: expect.objectContaining({ required: expect.arrayContaining(["summary", "intent"]) }),
      maxTokens: 6000,
    }));
  });

  it("overrides model-returned mode with server-computed mode", async () => {
    const { provider } = stubProvider([{ ok: true, text: artifactJson }]);
    const result = await investigatePr(provider, {
      diff: "diff",
      title: "big change",
      body: null,
      files: ["src/infra/clawhub.ts"],
      changedLines: DEFAULT_CONFIG.context.large_pr.changed_lines,
    }, DEFAULT_CONFIG, 1);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.artifact.mode).toBe("large_pr");
  });

  it("rejects invalid cached artifacts", () => {
    const result = validateInvestigationArtifact({ summary: "" });
    expect(result.ok).toBe(false);
  });
});
