import { describe, it, expect, vi } from "vitest";
import type { LinkedIssueMatchExemption } from "../src/config";
import {
  evaluateLinkedIssueExemption,
  extractLinkedIssueReferences,
  linkedIssueMatchScore,
  type IssueFacts,
} from "../src/policy/linked-issue";

const cfg: LinkedIssueMatchExemption = {
  type: "linked_issue_match",
  require_same_repo: true,
  require_trusted_signal: true,
  min_match_score: 0.7,
  max_issues: 5,
  trusted_labels: [],
};

const issue: IssueFacts = {
  repo: "o/r",
  number: 12,
  title: "Add dark mode to the dashboard",
  body: "Users need the dashboard to switch to a dark theme.",
  authorLogin: "maintainer",
  authorAssociation: "MEMBER",
  assignees: [],
  labels: [],
  isPullRequest: false,
};

describe("extractLinkedIssueReferences", () => {
  it("extracts closing-keyword issue references", () => {
    expect(extractLinkedIssueReferences("Fixes #12", "o/r", true)).toEqual([{ repo: "o/r", number: 12 }]);
    expect(extractLinkedIssueReferences("Resolves o/r#13", "o/r", true)).toEqual([{ repo: "o/r", number: 13 }]);
    expect(extractLinkedIssueReferences("Closes https://github.com/o/r/issues/14", "o/r", true))
      .toEqual([{ repo: "o/r", number: 14 }]);
  });

  it("ignores cross-repo references by default", () => {
    expect(extractLinkedIssueReferences("Fixes other/repo#12", "o/r", true)).toEqual([]);
  });
});

describe("linkedIssueMatchScore", () => {
  it("scores a PR that matches the issue intent", () => {
    const score = linkedIssueMatchScore(issue, {
      repo: "o/r",
      title: "Implement dashboard dark mode",
      body: "Fixes #12",
      changedFiles: ["src/dashboard/theme.ts"],
    });
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("scores an unrelated PR low", () => {
    const score = linkedIssueMatchScore(issue, {
      repo: "o/r",
      title: "Improve billing invoice export",
      body: "Fixes #12",
      changedFiles: ["src/billing/export.ts"],
    });
    expect(score).toBeLessThan(0.7);
  });
});

describe("evaluateLinkedIssueExemption", () => {
  it("exempts when a trusted linked issue matches the PR", async () => {
    const result = await evaluateLinkedIssueExemption(
      {
        repo: "o/r",
        title: "Implement dashboard dark mode",
        body: "Fixes #12",
        changedFiles: ["src/dashboard/theme.ts"],
      },
      cfg,
      {
        getIssue: vi.fn(async () => issue),
        getUserPermission: vi.fn(async () => "none"),
      }
    );
    expect(result.exempt).toBe(true);
  });

  it("falls back when the linked issue is untrusted", async () => {
    const result = await evaluateLinkedIssueExemption(
      {
        repo: "o/r",
        title: "Implement dashboard dark mode",
        body: "Fixes #12",
        changedFiles: ["src/dashboard/theme.ts"],
      },
      cfg,
      {
        getIssue: vi.fn(async () => ({ ...issue, authorAssociation: "NONE" })),
        getUserPermission: vi.fn(async () => "read"),
      }
    );
    expect(result).toEqual({ exempt: false });
  });

  it("trusts assigned maintainers without requiring a special label", async () => {
    const result = await evaluateLinkedIssueExemption(
      {
        repo: "o/r",
        title: "Implement dashboard dark mode",
        body: "Fixes #12",
        changedFiles: ["src/dashboard/theme.ts"],
      },
      cfg,
      {
        getIssue: vi.fn(async () => ({
          ...issue,
          authorAssociation: "NONE",
          assignees: ["maintainer"],
        })),
        getUserPermission: vi.fn(async () => "write"),
      }
    );
    expect(result.exempt).toBe(true);
  });
});
