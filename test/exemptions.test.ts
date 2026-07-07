import { describe, it, expect } from "vitest";
import {
  applyPathRules,
  evaluateExemption,
  evaluateGitHubTeamExemption,
  evaluatePriorMergedPrsExemption,
  evaluateRepositoryPermissionExemption,
  matchesGlob,
  shouldRechallengeOnPush,
} from "../src/policy/exemptions";
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

describe("matchesGlob hardening", () => {
  it("treats ? and regex metacharacters as literals", () => {
    expect(matchesGlob("file?.md", "file?.md")).toBe(true);
    expect(matchesGlob("file?.md", "fileX.md")).toBe(false);
    expect(matchesGlob("*.md", "a+(b).md")).toBe(true);
    expect(matchesGlob("a.b", "axb")).toBe(false);
  });

  it("lets ** match zero segments", () => {
    expect(matchesGlob("**/*.md", "README.md")).toBe(true);
    expect(matchesGlob("**/*.md", "a/b/c.md")).toBe(true);
    expect(matchesGlob("**/*.md", "a/b/c.ts")).toBe(false);
  });

  it("is not vulnerable to catastrophic backtracking", () => {
    const evil = Array(40).fill("a").join("**");
    const path = Array(60).fill("a").join("x");
    const start = performance.now();
    matchesGlob(evil, path);
    expect(performance.now() - start).toBeLessThan(200);
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

  it("challenges untrusted bots when bot_policy opts in", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      skip_bots: false,
      bot_policy: { default: "challenge" as const, trusted_logins: ["dependabot[bot]"] },
    };

    expect(evaluateExemption({ ...basePr, authorType: "Bot", authorLogin: "renovate[bot]" }, cfg))
      .toEqual({ exempt: false });
    expect(evaluateExemption({ ...basePr, authorType: "Bot", authorLogin: "Dependabot[bot]" }, cfg))
      .toEqual({ exempt: true, reason: "trusted bot author" });
  });

  it("exempts allowlisted authors", () => {
    const cfg = { ...DEFAULT_CONFIG, skip_authors: ["contributor"] };
    expect(evaluateExemption(basePr, cfg).exempt).toBe(true);
  });

  it("exempts configured author logins", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      exemptions: [{ type: "author_login" as const, logins: ["Contributor"] }],
    };
    expect(evaluateExemption(basePr, cfg)).toEqual({
      exempt: true,
      reason: "author in author_login exemption",
    });
  });

  it("exempts maintainers (OWNER/MEMBER/COLLABORATOR)", () => {
    for (const assoc of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      const r = evaluateExemption({ ...basePr, authorAssociation: assoc }, DEFAULT_CONFIG);
      expect(r.exempt).toBe(true);
    }
  });

  it("challenges maintainers when default author association trust is disabled", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      trust: { default_author_associations: [] },
    };

    expect(evaluateExemption({ ...basePr, authorAssociation: "OWNER" }, cfg)).toEqual({ exempt: false });
  });

  it("exempts configured trusted author associations", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      exemptions: [{ type: "author_association" as const, associations: ["CONTRIBUTOR"] }],
    };

    expect(evaluateExemption({ ...basePr, authorAssociation: "CONTRIBUTOR" }, cfg)).toEqual({
      exempt: true,
      reason: "trusted author association (CONTRIBUTOR)",
    });
    expect(evaluateExemption(basePr, cfg)).toEqual({ exempt: false });
  });

  it("exempts configured repository role names and legacy permissions", async () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      exemptions: [{ type: "repository_permission" as const, permissions: ["write", "maintain"] }],
    };

    await expect(evaluateRepositoryPermissionExemption(
      { repo: "o/r", authorLogin: "contributor" },
      cfg,
      { getUserPermission: async () => ({ permission: "write", role_name: "maintain" }) }
    )).resolves.toEqual({
      exempt: true,
      reason: "trusted repository permission (maintain)",
    });

    await expect(evaluateRepositoryPermissionExemption(
      { repo: "o/r", authorLogin: "contributor" },
      { ...DEFAULT_CONFIG, exemptions: [{ type: "repository_permission" as const, permissions: ["write"] }] },
      { getUserPermission: async () => ({ permission: "write", role_name: "maintain" }) }
    )).resolves.toEqual({
      exempt: true,
      reason: "trusted repository permission (write)",
    });
  });

  it("falls back when a repository permission lookup is unavailable", async () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      exemptions: [{ type: "repository_permission" as const, permissions: ["write"] }],
    };

    await expect(evaluateRepositoryPermissionExemption(
      { repo: "o/r", authorLogin: "contributor" },
      cfg,
      { getUserPermission: async () => { throw new Error("missing permission"); } }
    )).resolves.toEqual({ exempt: false });
  });

  it("exempts configured GitHub team members", async () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      exemptions: [{ type: "github_team" as const, teams: ["maintainers"], roles: ["maintainer" as const] }],
    };

    await expect(evaluateGitHubTeamExemption(
      { repo: "octo-org/repo", authorLogin: "contributor" },
      cfg,
      {
        getTeamMembership: async (org, teamSlug, username) => {
          expect({ org, teamSlug, username }).toEqual({
            org: "octo-org",
            teamSlug: "maintainers",
            username: "contributor",
          });
          return { state: "active", role: "maintainer" };
        },
      }
    )).resolves.toEqual({
      exempt: true,
      reason: "trusted GitHub team (octo-org/maintainers)",
    });
  });

  it("does not exempt missing or role-mismatched GitHub team members", async () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      exemptions: [{ type: "github_team" as const, teams: ["octo-org/security"], roles: ["maintainer" as const] }],
    };

    await expect(evaluateGitHubTeamExemption(
      { repo: "octo-org/repo", authorLogin: "contributor" },
      cfg,
      { getTeamMembership: async () => ({ state: "active", role: "member" }) }
    )).resolves.toEqual({ exempt: false });
    await expect(evaluateGitHubTeamExemption(
      { repo: "octo-org/repo", authorLogin: "contributor" },
      cfg,
      { getTeamMembership: async () => null }
    )).resolves.toEqual({ exempt: false });
  });

  it("exempts authors with enough prior merged PRs", async () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      exemptions: [{ type: "prior_merged_prs" as const, min_count: 3 }],
    };

    await expect(evaluatePriorMergedPrsExemption(
      { repo: "o/r", authorLogin: "contributor" },
      cfg,
      { countMergedPullRequestsByAuthor: async () => 4 }
    )).resolves.toEqual({
      exempt: true,
      reason: "author has 4 prior merged PRs",
    });
    await expect(evaluatePriorMergedPrsExemption(
      { repo: "o/r", authorLogin: "contributor" },
      cfg,
      { countMergedPullRequestsByAuthor: async () => 2 }
    )).resolves.toEqual({ exempt: false });
  });

  it("exempts tiny diffs", () => {
    const r = evaluateExemption({ ...basePr, changedLines: 5 }, DEFAULT_CONFIG);
    expect(r).toEqual({ exempt: true, reason: "diff below min_changed_lines" });
  });

  it("exempts PRs outside configured include_paths", () => {
    const cfg = { ...DEFAULT_CONFIG, include_paths: ["src/core/**"] };

    expect(evaluateExemption({ ...basePr, changedFiles: ["examples/demo.txt"] }, cfg)).toEqual({
      exempt: true,
      reason: "no changed files match include_paths",
    });
  });

  it("does not exempt when any changed file matches include_paths", () => {
    const cfg = { ...DEFAULT_CONFIG, include_paths: ["src/core/**"] };

    expect(evaluateExemption({ ...basePr, changedFiles: ["src/core/service.ts", "examples/demo.txt"] }, cfg))
      .toEqual({ exempt: false });
  });

  it("does not exempt an empty file list via include_paths", () => {
    const cfg = { ...DEFAULT_CONFIG, include_paths: ["src/core/**"] };
    expect(evaluateExemption({ ...basePr, changedFiles: [] }, cfg).exempt).toBe(false);
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

  it("does not exempt an empty file list via skip_paths", () => {
    expect(evaluateExemption({ ...basePr, changedFiles: [] }, DEFAULT_CONFIG).exempt).toBe(false);
  });

  it("applies the first matching path rule as effective config", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      path_rules: [{
        paths: ["src/core/**"],
        gates: [{ type: "multiple_choice" as const, questions: 6, pass_threshold: 5 }],
        require_approval: "always" as const,
        max_attempts: 2,
        skip_paths: undefined,
        include_paths: undefined,
      }],
    };

    const effective = applyPathRules(cfg, ["src/core/service.ts"]);
    expect(effective.gates).toEqual([{ type: "multiple_choice", questions: 6, pass_threshold: 5 }]);
    expect(effective.require_approval).toBe("always");
    expect(effective.max_attempts).toBe(2);
    expect(applyPathRules(cfg, ["docs/guide.md"])).toBe(cfg);
  });

  it("decides rechallenge on push from structured policy", () => {
    expect(shouldRechallengeOnPush({
      ...DEFAULT_CONFIG,
      rechallenge: { on_push: "always", ignore_paths: ["docs/**"] },
    }, ["docs/guide.md"])).toBe(false);

    expect(shouldRechallengeOnPush({
      ...DEFAULT_CONFIG,
      include_paths: ["src/core/**"],
      rechallenge: { on_push: "included_paths", ignore_paths: [] },
    }, ["src/core/service.ts"])).toBe(true);

    expect(shouldRechallengeOnPush({
      ...DEFAULT_CONFIG,
      include_paths: ["src/core/**"],
      rechallenge: { on_push: "included_paths", ignore_paths: [] },
    }, ["docs/guide.md"])).toBe(false);

    expect(shouldRechallengeOnPush({
      ...DEFAULT_CONFIG,
      include_paths: [],
      rechallenge: { on_push: "included_paths", ignore_paths: [] },
    }, ["docs/guide.md"])).toBe(true);
  });

  it("matches skip_authors case-insensitively", () => {
    const cfg = { ...DEFAULT_CONFIG, skip_authors: ["Contributor"] };
    expect(evaluateExemption(basePr, cfg).exempt).toBe(true);
  });

  it("exempts an allowlisted bot even when skip_bots is false", () => {
    const cfg = { ...DEFAULT_CONFIG, skip_bots: false, skip_authors: ["contributor"] };
    expect(evaluateExemption({ ...basePr, authorType: "Bot" }, cfg).exempt).toBe(true);
  });
});
