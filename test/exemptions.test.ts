import { describe, it, expect } from "vitest";
import { evaluateExemption, matchesGlob } from "../src/policy/exemptions";
import { DEFAULT_CONFIG } from "../src/config";

const basePr = {
  authorLogin: "contributor",
  authorType: "User" as const,
  authorAssociation: "FIRST_TIME_CONTRIBUTOR",
  changedLines: 120,
  changedFiles: ["src/app.ts", "test/app.test.ts"],
};

describe("matchesGlob", () => {
  it("matches * within a segment and ** across segments", () => {
    expect(matchesGlob("*.md", "README.md")).toBe(true);
    expect(matchesGlob("*.md", "docs/README.md")).toBe(false);
    expect(matchesGlob("docs/**", "docs/a/b.txt")).toBe(true);
    expect(matchesGlob("docs/**", "src/a.ts")).toBe(false);
  });
});

describe("evaluateExemption", () => {
  it("challenges a normal contributor PR", () => {
    expect(evaluateExemption(basePr, DEFAULT_CONFIG)).toEqual({ exempt: false });
  });

  it("exempts bots when skip_bots", () => {
    const r = evaluateExemption({ ...basePr, authorType: "Bot" }, DEFAULT_CONFIG);
    expect(r).toEqual({ exempt: true, reason: "bot author" });
  });

  it("exempts allowlisted authors", () => {
    const cfg = { ...DEFAULT_CONFIG, skip_authors: ["contributor"] };
    expect(evaluateExemption(basePr, cfg).exempt).toBe(true);
  });

  it("exempts maintainers (OWNER/MEMBER/COLLABORATOR)", () => {
    for (const assoc of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      const r = evaluateExemption({ ...basePr, authorAssociation: assoc }, DEFAULT_CONFIG);
      expect(r.exempt).toBe(true);
    }
  });

  it("exempts tiny diffs", () => {
    const r = evaluateExemption({ ...basePr, changedLines: 5 }, DEFAULT_CONFIG);
    expect(r).toEqual({ exempt: true, reason: "diff below min_changed_lines" });
  });

  it("exempts docs-only diffs via skip_paths", () => {
    const r = evaluateExemption(
      { ...basePr, changedFiles: ["docs/guide.md", "CHANGELOG.md"] },
      DEFAULT_CONFIG
    );
    expect(r).toEqual({ exempt: true, reason: "all changed files match skip_paths" });
  });

  it("does not exempt when only some files match skip_paths", () => {
    const r = evaluateExemption(
      { ...basePr, changedFiles: ["docs/guide.md", "src/app.ts"] },
      DEFAULT_CONFIG
    );
    expect(r.exempt).toBe(false);
  });
});
