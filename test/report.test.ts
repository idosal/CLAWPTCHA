import { describe, it, expect } from "vitest";
import { buildRiskReport, renderRiskReportMarkdown, type Telemetry } from "../src/risk/report";

const humanTelemetry: Telemetry = {
  perQuestionMs: [42000, 61000, 35000, 55000],
  answerChanges: 3,
  pointerDistancePx: 8400,
  pointerSamples: 412,
  focusLossCount: 1,
  webdriver: false,
  turnstileOk: true,
};

const botTelemetry: Telemetry = {
  perQuestionMs: [4000, 5000, 3500, 4200],
  answerChanges: 0,
  pointerDistancePx: 30,
  pointerSamples: 4,
  focusLossCount: 0,
  webdriver: true,
  turnstileOk: false,
};

describe("buildRiskReport", () => {
  it("scores a human-looking pass as low risk", () => {
    const r = buildRiskReport(humanTelemetry);
    expect(r.automationLikely).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it("flags automation fingerprints and fast uniform answers", () => {
    const r = buildRiskReport(botTelemetry);
    expect(r.automationLikely).toBe(true);
    expect(r.signals).toContain("webdriver flag present");
    expect(r.signals).toContain("turnstile failed or missing");
    expect(r.signals).toContain("all answers under 10s");
    expect(r.signals).toContain("negligible pointer movement");
  });

  it("handles missing telemetry gracefully (reports unknown, not low-risk)", () => {
    const r = buildRiskReport(null);
    expect(r.automationLikely).toBe(false);
    expect(r.signals).toContain("no telemetry received");
  });
});

describe("renderRiskReportMarkdown", () => {
  it("includes timings, verdict and signals", () => {
    const md = renderRiskReportMarkdown(buildRiskReport(botTelemetry), botTelemetry);
    expect(md).toContain("automation-likely");
    expect(md).toContain("Q1: 4s");
    expect(md).toContain("Turnstile");
  });
});
