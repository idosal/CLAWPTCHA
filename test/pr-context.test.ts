import { describe, expect, it, vi } from "vitest";
import { fetchPrContextForChallenge } from "../src/github/pr-context";
import type { GitHubApi } from "../src/github/api";
import type { Challenge } from "../src/types";

function deltaChallenge(): Challenge {
  return {
    id: "delta-challenge",
    installation_id: 1,
    repo_full_name: "o/r",
    pr_number: 7,
    head_sha: "new-sha",
    delta_base_sha: "passed-sha",
    author_login: "alice",
    check_run_id: 42,
    status: "ready",
    approved_by: "maintainer",
    attempts_used: 0,
    retry_cycle: 0,
    cooldown_until: null,
    config_json: "{}",
    auto_closed_at: null,
    terminal_reconciled_at: null,
    created_at: "2026-07-10T00:00:00.000Z",
  };
}

describe("fetchPrContextForChallenge", () => {
  it("scopes a follow-up quiz to commits since the passed head", async () => {
    const api = {
      getPr: vi.fn(async () => ({
        number: 7,
        head_sha: "new-sha",
        author_login: "alice",
        author_type: "User",
        author_association: "CONTRIBUTOR",
        draft: false,
        additions: 100,
        deletions: 20,
        title: "Add the complete feature",
        body: "Full PR description",
      })),
      getPrDiff: vi.fn(async () => "FULL PR DIFF"),
      listPrFileDetails: vi.fn(async () => []),
      compareCommits: vi.fn(async () => ({
        status: "ahead",
        aheadBy: 1,
        behindBy: 0,
        totalCommits: 1,
        files: [{
          filename: "src/follow-up.ts",
          status: "modified",
          additions: 5,
          deletions: 2,
          changes: 7,
          patch: "+follow up",
        }],
      })),
      getCommitComparisonDiff: vi.fn(async () => "DELTA DIFF ONLY"),
    } as unknown as GitHubApi;

    const context = await fetchPrContextForChallenge(api, deltaChallenge());

    expect(api.compareCommits).toHaveBeenCalledWith("o/r", "passed-sha", "new-sha");
    expect(api.getCommitComparisonDiff).toHaveBeenCalledWith("o/r", "passed-sha", "new-sha");
    expect(api.getPrDiff).not.toHaveBeenCalled();
    expect(api.listPrFileDetails).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      diff: "DELTA DIFF ONLY",
      files: ["src/follow-up.ts"],
      changedLines: 7,
      deltaBaseSha: "passed-sha",
    });
  });
});
