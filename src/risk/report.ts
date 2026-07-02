import { z } from "zod";

export const telemetrySchema = z.object({
  perQuestionMs: z.array(z.number().nonnegative()).catch(() => []),
  answerChanges: z.number().int().nonnegative().catch(0),
  pointerDistancePx: z.number().nonnegative().catch(0),
  pointerSamples: z.number().int().nonnegative().catch(0),
  focusLossCount: z.number().int().nonnegative().catch(0),
  webdriver: z.boolean().catch(false),
  turnstileOk: z.boolean().catch(false),
});

export type Telemetry = z.infer<typeof telemetrySchema>;

export interface RiskReport {
  automationLikely: boolean;
  signals: string[];
}

// Simple heuristics only in v1 (spec: telemetry informs, never auto-fails).
export function buildRiskReport(t: Telemetry | null): RiskReport {
  if (t === null) {
    return { automationLikely: false, signals: ["no telemetry received"] };
  }
  const signals: string[] = [];
  if (t.webdriver) signals.push("webdriver flag present");
  if (!t.turnstileOk) signals.push("turnstile failed or missing");
  if (t.perQuestionMs.length > 0 && t.perQuestionMs.every((ms) => ms < 10_000)) {
    signals.push("all answers under 10s");
  }
  if (t.pointerDistancePx < 200 || t.pointerSamples < 10) {
    signals.push("negligible pointer movement");
  }
  // "automation-likely" needs 2+ independent signals — any single one can be
  // an accessibility setup (keyboard-only users have low pointer movement).
  return { automationLikely: signals.length >= 2, signals };
}

export function renderRiskReportMarkdown(report: RiskReport, t: Telemetry | null): string {
  const lines: string[] = ["### Risk report", ""];
  lines.push(
    report.automationLikely
      ? "**Verdict: automation-likely** — review this pass manually."
      : report.signals.length > 0
        ? "**Verdict: inconclusive** — some signals present."
        : "**Verdict: no automation signals.**"
  );
  lines.push("");
  if (t) {
    const total = t.perQuestionMs.reduce((a, b) => a + b, 0);
    lines.push(`- Total time: ${Math.round(total / 1000)}s`);
    lines.push(
      `- Per question: ${t.perQuestionMs.map((ms, i) => `Q${i + 1}: ${Math.round(ms / 1000)}s`).join(", ")}`
    );
    lines.push(`- Turnstile: ${t.turnstileOk ? "passed" : "failed/missing"}`);
    lines.push(`- Answer changes: ${t.answerChanges}, focus losses: ${t.focusLossCount}`);
    lines.push(`- Pointer: ${Math.round(t.pointerDistancePx)}px over ${t.pointerSamples} samples`);
  }
  if (report.signals.length > 0) {
    lines.push("", "Signals:");
    for (const s of report.signals) lines.push(`- ${s}`);
  }
  return lines.join("\n");
}
