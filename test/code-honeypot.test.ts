import { describe, expect, it } from "vitest";
import { evaluateCodeHoneypotSignals } from "../src/policy/code-honeypot";
import type { CodeHoneypotSignal } from "../src/config";

const signal: CodeHoneypotSignal = {
  type: "code_honeypot",
  report_only: true,
  patterns: ["VOUCHA_DO_NOT_ADD_THIS"],
  paths: ["src/**"],
};

describe("evaluateCodeHoneypotSignals", () => {
  it("matches configured markers introduced on added lines", () => {
    const result = evaluateCodeHoneypotSignals([
      "diff --git a/src/app.ts b/src/app.ts",
      "+++ b/src/app.ts",
      "+const marker = 'VOUCHA_DO_NOT_ADD_THIS';",
      "",
    ].join("\n"), [signal]);

    expect(result).toEqual({
      triggered: true,
      matches: [{ path: "src/app.ts", signalIndex: 0, patternIndex: 0 }],
    });
  });

  it("ignores removed and context lines", () => {
    const result = evaluateCodeHoneypotSignals([
      "diff --git a/src/app.ts b/src/app.ts",
      "+++ b/src/app.ts",
      " const old = 'VOUCHA_DO_NOT_ADD_THIS';",
      "-const removed = 'VOUCHA_DO_NOT_ADD_THIS';",
      "",
    ].join("\n"), [signal]);

    expect(result.triggered).toBe(false);
  });

  it("respects path filters", () => {
    const result = evaluateCodeHoneypotSignals([
      "diff --git a/docs/notes.md b/docs/notes.md",
      "+++ b/docs/notes.md",
      "+VOUCHA_DO_NOT_ADD_THIS",
      "",
    ].join("\n"), [signal]);

    expect(result.triggered).toBe(false);
  });

  it("matches file paths that contain spaces", () => {
    const result = evaluateCodeHoneypotSignals([
      "diff --git a/src/generated prompt.ts b/src/generated prompt.ts",
      "+++ b/src/generated prompt.ts",
      "+const marker = 'VOUCHA_DO_NOT_ADD_THIS';",
      "",
    ].join("\n"), [signal]);

    expect(result).toEqual({
      triggered: true,
      matches: [{ path: "src/generated prompt.ts", signalIndex: 0, patternIndex: 0 }],
    });
  });

  it("matches quoted diff paths", () => {
    const result = evaluateCodeHoneypotSignals([
      "diff --git \"a/src/generated prompt.ts\" \"b/src/generated prompt.ts\"",
      "+++ \"b/src/generated prompt.ts\"",
      "+const marker = 'VOUCHA_DO_NOT_ADD_THIS';",
      "",
    ].join("\n"), [signal]);

    expect(result).toEqual({
      triggered: true,
      matches: [{ path: "src/generated prompt.ts", signalIndex: 0, patternIndex: 0 }],
    });
  });

  it("stays inert when no literal patterns are configured", () => {
    const result = evaluateCodeHoneypotSignals("+anything", [{
      type: "code_honeypot",
      report_only: true,
      patterns: [],
      paths: ["**"],
    }]);

    expect(result).toEqual({ triggered: false, matches: [] });
  });
});
