import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config";
import { evaluateAccountability } from "../src/policy/accountability";

describe("evaluateAccountability", () => {
  it("does nothing by default", () => {
    expect(evaluateAccountability(null, DEFAULT_CONFIG)).toEqual({ ok: true });
  });

  it("requires configured PR body acknowledgement and AI disclosure", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      accountability: {
        require_pr_acknowledgement: true,
        require_ai_disclosure: true,
      },
    };

    expect(evaluateAccountability("", cfg)).toEqual(expect.objectContaining({
      ok: false,
      missing: [
        "checked acknowledgement: I understand, tested, and can support this change.",
        "AI disclosure line: AI assistance: yes/no/n/a",
      ],
    }));
    expect(evaluateAccountability([
      "- [x] I understand, tested, and can support this change.",
      "AI assistance: yes",
      "",
    ].join("\n"), cfg)).toEqual({ ok: true });
  });
});
