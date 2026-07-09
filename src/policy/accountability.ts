import type { VouchaConfig } from "../config";

export const ACCOUNTABILITY_ACKNOWLEDGEMENT_TEXT =
  "I understand, tested, and can support this change.";

export const AI_DISCLOSURE_TEXT =
  "AI assistance: yes/no/n/a";

export type AccountabilityResult =
  | { ok: true }
  | { ok: false; missing: string[]; summary: string };

const CHECKED_ACK_RE = /-\s*\[[xX]\]\s*I understand, tested, and can support this change\.?/i;
const AI_DISCLOSURE_RE = /^\s*AI assistance:\s*(yes|no|n\/a|none)\s*$/im;

export function evaluateAccountability(
  body: string | null,
  cfg: VouchaConfig
): AccountabilityResult {
  const text = body ?? "";
  const missing: string[] = [];
  if (cfg.accountability.require_pr_acknowledgement && !CHECKED_ACK_RE.test(text)) {
    missing.push(`checked acknowledgement: ${ACCOUNTABILITY_ACKNOWLEDGEMENT_TEXT}`);
  }
  if (cfg.accountability.require_ai_disclosure && !AI_DISCLOSURE_RE.test(text)) {
    missing.push(`AI disclosure line: ${AI_DISCLOSURE_TEXT}`);
  }
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    missing,
    summary: [
      "This pull request is missing required accountability fields from the repository policy.",
      "",
      ...missing.map((item) => `- ${item}`),
      "",
      "Update the PR body, then push or reopen the PR to re-run VOUCHA.",
    ].join("\n"),
  };
}
