import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handlePullRequestEvent, handleIssueCommentEvent } from "../src/github/events";
import { getChallengeByPr } from "../src/store";
import type { Env } from "../src/types";
import type { GitHubApi, PrDetails } from "../src/github/api";

const testEnv = env as unknown as Env;

function stubApi(overrides: Partial<Record<keyof GitHubApi, any>> = {}): GitHubApi {
  return {
    createCheckRun: vi.fn(async () => 42),
    updateCheckRun: vi.fn(async () => {}),
    getPrDiff: vi.fn(async () => "diff --git a/src/app.ts b/src/app.ts\n+code"),
    compareCommits: vi.fn(async () => ({
      status: "ahead",
      aheadBy: 1,
      behindBy: 0,
      totalCommits: 1,
      files: [{
        filename: "src/app.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        changes: 1,
        patch: "+code",
      }],
    })),
    getPr: vi.fn(async (): Promise<PrDetails> => pr),
    listPrFiles: vi.fn(async () => ["src/app.ts"]),
    getIssue: vi.fn(async () => null),
    getFileContent: vi.fn(async () => null), // no voucha.yml → defaults
    upsertPrComment: vi.fn(async () => {}),
    getUserPermission: vi.fn(async () => "none"),
    getTeamMembership: vi.fn(async () => null),
    countMergedPullRequestsByAuthor: vi.fn(async () => 0),
    ...overrides,
  } as unknown as GitHubApi;
}

const pr: PrDetails = {
  number: 7, head_sha: "abc123", author_login: "contributor",
  author_type: "User", author_association: "FIRST_TIME_CONTRIBUTOR",
  draft: false, additions: 100, deletions: 30, title: "Add feature", body: "Does a thing",
};

const codeHoneypotYaml = [
  "signals:",
  "  - type: code_honeypot",
  "    patterns:",
  "      - VOUCHA_DO_NOT_ADD_THIS",
  "    paths:",
  "      - '**'",
  "",
].join("\n");

const codeHoneypotDiff = [
  "diff --git a/src/app.ts b/src/app.ts",
  "+++ b/src/app.ts",
  "+const marker = 'VOUCHA_DO_NOT_ADD_THIS';",
  "",
].join("\n");

const prPayload = {
  action: "opened",
  installation: { id: 1 },
  repository: { full_name: "o/r" },
  pull_request: {
    number: 7, head: { sha: "abc123" }, base: { ref: "main", sha: "base000" },
    user: { login: "contributor", type: "User" },
    author_association: "FIRST_TIME_CONTRIBUTOR",
    additions: 100, deletions: 30, title: "Add feature", body: "Does a thing",
  },
};

let uniq = 0;
function payloadFor(prNumber: number, sha = "abc123") {
  const p = structuredClone(prPayload);
  p.pull_request.number = prNumber;
  p.pull_request.head.sha = sha;
  return p;
}

beforeEach(() => { uniq += 100; });

describe("handlePullRequestEvent", () => {
  it("creates a pending check, comment, and awaiting_approval challenge for first-timers", async () => {
    const api = stubApi();
    const n = uniq + 1;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      name: "PR comprehension check", head_sha: "abc123", status: "queued",
      details_url: expect.stringContaining("/challenge/"),
    }));
    expect(api.upsertPrComment).toHaveBeenCalled();
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("awaiting_approval");
    expect(ch?.check_run_id).toBe(42);
  });

  it("skips approval gate for known contributors under first_time policy", async () => {
    const api = stubApi({
      getPr: vi.fn(async () => ({ ...pr, author_association: "CONTRIBUTOR" })),
    });
    const n = uniq + 2;
    const p = payloadFor(n);
    p.pull_request.author_association = "CONTRIBUTOR";
    await handlePullRequestEvent(testEnv, api, p);
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("ready");
  });

  it("creates a challenge for owner PRs when default author association trust is disabled", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => [
        "trust:",
        "  default_author_associations: []",
        "",
      ].join("\n")),
      getPr: vi.fn(async () => ({
        ...pr,
        author_login: "owner",
        author_association: "OWNER",
      })),
    });
    const n = uniq + 26;
    const p = payloadFor(n);
    p.pull_request.user.login = "owner";
    p.pull_request.author_association = "OWNER";

    await handlePullRequestEvent(testEnv, api, p);

    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      name: "PR comprehension check",
      head_sha: "abc123",
      status: "queued",
    }));
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("ready");
  });

  it("neutralizes draft PRs when configured", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => "draft_prs: neutral\n"),
      getPr: vi.fn(async () => ({ ...pr, draft: true })),
    });
    const n = uniq + 15;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed",
      conclusion: "neutral",
      output: expect.objectContaining({ title: "Draft PR" }),
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("ignores draft PRs by default", async () => {
    const api = stubApi({
      getPr: vi.fn(async () => ({ ...pr, draft: true })),
    });
    const n = uniq + 20;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).not.toHaveBeenCalled();
    expect(api.upsertPrComment).not.toHaveBeenCalled();
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("applies path rule overrides before challenge creation", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => [
        "path_rules:",
        "  - paths: ['src/core/**']",
        "    gates:",
        "      - type: multiple_choice",
        "        questions: 6",
        "        pass_threshold: 5",
        "    require_approval: always",
        "",
      ].join("\n")),
      getPr: vi.fn(async () => ({ ...pr, author_association: "CONTRIBUTOR" })),
      listPrFiles: vi.fn(async () => ["src/core/service.ts"]),
    });
    const n = uniq + 16;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));

    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("awaiting_approval");
    expect(JSON.parse(ch!.config_json).gates).toEqual([{
      type: "multiple_choice",
      questions: 6,
      pass_threshold: 5,
    }]);
  });

  it("does not post a challenge comment when output comments are quiet", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => [
        "output:",
        "  comments: quiet",
        "",
      ].join("\n")),
    });
    const n = uniq + 17;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).not.toBeNull();
    expect(api.upsertPrComment).not.toHaveBeenCalled();
  });

  it("exempts docs-only PRs with a success check and no challenge row", async () => {
    const api = stubApi({ listPrFiles: vi.fn(async () => ["docs/x.md", "README.md"]) });
    const n = uniq + 3;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed", conclusion: "success",
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("exempts PRs that do not touch configured include paths", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => "include_paths: ['src/core/**']\n"),
      listPrFiles: vi.fn(async () => ["examples/demo.txt"]),
    });
    const n = uniq + 14;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed",
      conclusion: "success",
      output: expect.objectContaining({
        title: "Exempt",
        summary: expect.stringContaining("no changed files match include_paths"),
      }),
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("surfaces code honeypot matches on normally exempt PRs", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => codeHoneypotYaml),
      getPrDiff: vi.fn(async () => codeHoneypotDiff),
      listPrFiles: vi.fn(async () => ["docs/x.md", "README.md"]),
    });
    const n = uniq + 12;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed",
      conclusion: "success",
      output: expect.objectContaining({
        title: "Exempt",
        summary: expect.stringContaining("configured code honeypot marker"),
      }),
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("exempts a PR that matches a trusted linked issue", async () => {
    const yaml = [
      codeHoneypotYaml.trimEnd(),
      "exemptions:",
      "  - type: linked_issue_match",
      "    min_match_score: 0.7",
      "",
    ].join("\n");
    const api = stubApi({
      getFileContent: vi.fn(async () => yaml),
      getPrDiff: vi.fn(async () => codeHoneypotDiff),
      getPr: vi.fn(async () => ({
        ...pr,
        title: "Implement dashboard dark mode",
        body: "Fixes #12",
      })),
      listPrFiles: vi.fn(async () => ["src/dashboard/theme.ts"]),
      getIssue: vi.fn(async () => ({
        repo: "o/r",
        number: 12,
        title: "Add dark mode to the dashboard",
        body: "Users need the dashboard to switch to a dark theme.",
        authorLogin: "maintainer",
        authorAssociation: "MEMBER",
        assignees: [],
        labels: [],
        isPullRequest: false,
      })),
    });
    const n = uniq + 11;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.getIssue).toHaveBeenCalledWith("o/r", 12);
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed", conclusion: "success",
      output: expect.objectContaining({
        title: "Exempt",
        summary: expect.stringContaining("configured code honeypot marker"),
      }),
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("exempts PR authors with a configured repository permission", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => [
        "exemptions:",
        "  - type: repository_permission",
        "    permissions: [write]",
        "",
      ].join("\n")),
      getUserPermission: vi.fn(async () => "write"),
    });
    const n = uniq + 13;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));

    expect(api.getUserPermission).toHaveBeenCalledWith("o/r", "contributor");
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed",
      conclusion: "success",
      output: expect.objectContaining({
        title: "Exempt",
        summary: expect.stringContaining("trusted repository permission (write)"),
      }),
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("exempts PR authors with a configured repository role name", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => [
        "exemptions:",
        "  - type: repository_permission",
        "    permissions: [maintain]",
        "",
      ].join("\n")),
      getUserPermission: vi.fn(async () => ({ permission: "write", role_name: "maintain" })),
    });
    const n = uniq + 21;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));

    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed",
      conclusion: "success",
      output: expect.objectContaining({
        title: "Exempt",
        summary: expect.stringContaining("trusted repository permission (maintain)"),
      }),
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("exempts PR authors with a configured GitHub team", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => [
        "exemptions:",
        "  - type: github_team",
        "    teams: [maintainers]",
        "",
      ].join("\n")),
      getTeamMembership: vi.fn(async () => ({ state: "active", role: "member" })),
    });
    const n = uniq + 22;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));

    expect(api.getTeamMembership).toHaveBeenCalledWith("o", "maintainers", "contributor");
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed",
      conclusion: "success",
      output: expect.objectContaining({
        title: "Exempt",
        summary: expect.stringContaining("trusted GitHub team (o/maintainers)"),
      }),
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("exempts PR authors with enough prior merged PRs", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => [
        "exemptions:",
        "  - type: prior_merged_prs",
        "    min_count: 3",
        "",
      ].join("\n")),
      countMergedPullRequestsByAuthor: vi.fn(async () => 4),
    });
    const n = uniq + 23;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));

    expect(api.countMergedPullRequestsByAuthor).toHaveBeenCalledWith("o/r", "contributor");
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed",
      conclusion: "success",
      output: expect.objectContaining({
        title: "Exempt",
        summary: expect.stringContaining("author has 4 prior merged PRs"),
      }),
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("fails a PR with missing required accountability fields", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => [
        "accountability:",
        "  require_pr_acknowledgement: true",
        "  require_ai_disclosure: true",
        "",
      ].join("\n")),
    });
    const n = uniq + 24;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));

    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed",
      conclusion: "failure",
      output: expect.objectContaining({
        title: "PR policy incomplete",
        summary: expect.stringContaining("AI disclosure line"),
      }),
    }));
    expect(api.upsertPrComment).toHaveBeenCalledWith("o/r", n, expect.stringContaining("PR body"));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("continues when required accountability fields are present", async () => {
    const api = stubApi({
      getFileContent: vi.fn(async () => [
        "accountability:",
        "  require_pr_acknowledgement: true",
        "  require_ai_disclosure: true",
        "",
      ].join("\n")),
      getPr: vi.fn(async () => ({
        ...pr,
        body: [
          "- [x] I understand, tested, and can support this change.",
          "AI assistance: no",
          "",
        ].join("\n"),
      })),
    });
    const n = uniq + 25;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).not.toBeNull();
  });

  it("is idempotent for the same head sha (webhook redelivery)", async () => {
    const api = stubApi();
    const n = uniq + 4;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledTimes(1);
  });

  it("keeps a pass on synchronize when gate resets are disabled", async () => {
    const yaml = `${codeHoneypotYaml}rechallenge:\n  on_push: never\n`;
    const api = stubApi({ getFileContent: vi.fn(async () => yaml) });
    const n = uniq + 5;
    await handlePullRequestEvent(testEnv, api, payloadFor(n, "sha1"));
    // simulate the sha1 challenge having been passed
    await testEnv.DB.prepare(
      "UPDATE challenges SET status='passed' WHERE repo_full_name='o/r' AND pr_number=? AND head_sha='sha1'"
    ).bind(n).run();
    const p2 = payloadFor(n, "sha2");
    p2.action = "synchronize";
    const api2 = stubApi({
      getFileContent: vi.fn(async () => yaml),
      getPrDiff: vi.fn(async () => codeHoneypotDiff),
      getPr: vi.fn(async () => ({ ...pr, number: n, head_sha: "sha2" })),
    });
    await handlePullRequestEvent(testEnv, api2, p2);
    // on_push=never → new sha keeps success because prior pass exists
    expect(api2.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      head_sha: "sha2", status: "completed", conclusion: "success",
      output: expect.objectContaining({
        title: "Pass carried forward",
        summary: expect.stringContaining("configured code honeypot marker"),
      }),
    }));
  });

  it("keeps a prior pass when structured rechallenge included_paths does not match", async () => {
    const yaml = [
      "include_paths: ['src/core/**']",
      "rechallenge:",
      "  on_push: included_paths",
      "",
    ].join("\n");
    const api = stubApi({
      getFileContent: vi.fn(async () => yaml),
      listPrFiles: vi.fn(async () => ["src/core/service.ts"]),
    });
    const n = uniq + 18;
    await handlePullRequestEvent(testEnv, api, payloadFor(n, "sha1"));
    await testEnv.DB.prepare(
      "UPDATE challenges SET status='passed' WHERE repo_full_name='o/r' AND pr_number=? AND head_sha='sha1'"
    ).bind(n).run();

    const p2 = payloadFor(n, "sha2");
    p2.action = "synchronize";
    const api2 = stubApi({
      getFileContent: vi.fn(async () => yaml),
      getPr: vi.fn(async () => ({ ...pr, number: n, head_sha: "sha2" })),
      listPrFiles: vi.fn(async () => ["docs/guide.md"]),
    });
    await handlePullRequestEvent(testEnv, api2, p2);
    expect(api2.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      head_sha: "sha2",
      status: "completed",
      conclusion: "success",
      output: expect.objectContaining({
        title: "Exempt",
        summary: expect.stringContaining("no changed files match include_paths"),
      }),
    }));
  });

  it("decides whether to reset a passed gate from the commit delta, not the whole PR", async () => {
    const yaml = [
      "include_paths: ['src/core/**']",
      "rechallenge:",
      "  on_push: included_paths",
      "",
    ].join("\n");
    const n = uniq + 30;
    const firstApi = stubApi({
      getFileContent: vi.fn(async () => yaml),
      listPrFiles: vi.fn(async () => ["src/core/service.ts"]),
    });
    await handlePullRequestEvent(testEnv, firstApi, payloadFor(n, "sha1"));
    await testEnv.DB.prepare(
      "UPDATE challenges SET status='passed' WHERE repo_full_name='o/r' AND pr_number=? AND head_sha='sha1'"
    ).bind(n).run();

    const nextPayload = payloadFor(n, "sha2");
    nextPayload.action = "synchronize";
    const nextApi = stubApi({
      getFileContent: vi.fn(async () => yaml),
      getPr: vi.fn(async () => ({ ...pr, number: n, head_sha: "sha2" })),
      // The full PR still contains core code, but this push changed only docs.
      listPrFiles: vi.fn(async () => ["src/core/service.ts", "docs/guide.md"]),
      compareCommits: vi.fn(async () => ({
        status: "ahead",
        aheadBy: 1,
        behindBy: 0,
        totalCommits: 1,
        files: [{
          filename: "docs/guide.md",
          status: "modified",
          additions: 2,
          deletions: 0,
          changes: 2,
          patch: "+docs",
        }],
      })),
    });

    await handlePullRequestEvent(testEnv, nextApi, nextPayload);

    expect(nextApi.compareCommits).toHaveBeenCalledWith("o/r", "sha1", "sha2");
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "sha2")).toBeNull();
    expect(nextApi.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      head_sha: "sha2",
      status: "completed",
      conclusion: "success",
      output: expect.objectContaining({ title: "Pass carried forward" }),
    }));
  });

  it("re-challenges a prior pass when structured rechallenge included_paths matches", async () => {
    const yaml = [
      "include_paths: ['src/core/**']",
      "rechallenge:",
      "  on_push: included_paths",
      "",
    ].join("\n");
    const api = stubApi({
      getFileContent: vi.fn(async () => yaml),
      listPrFiles: vi.fn(async () => ["src/core/service.ts"]),
    });
    const n = uniq + 19;
    await handlePullRequestEvent(testEnv, api, payloadFor(n, "sha1"));
    await testEnv.DB.prepare(
      "UPDATE challenges SET status='passed', approved_by='maintainer' WHERE repo_full_name='o/r' AND pr_number=? AND head_sha='sha1'"
    ).bind(n).run();

    const p2 = payloadFor(n, "sha2");
    p2.action = "synchronize";
    const api2 = stubApi({
      getFileContent: vi.fn(async () => yaml),
      getPr: vi.fn(async () => ({ ...pr, number: n, head_sha: "sha2" })),
      listPrFiles: vi.fn(async () => ["src/core/service.ts"]),
      compareCommits: vi.fn(async () => ({
        status: "ahead",
        aheadBy: 1,
        behindBy: 0,
        totalCommits: 1,
        files: [{
          filename: "src/core/service.ts",
          status: "modified",
          additions: 4,
          deletions: 1,
          changes: 5,
          patch: "+new behavior",
        }],
      })),
    });
    await handlePullRequestEvent(testEnv, api2, p2);
    const followUp = await getChallengeByPr(testEnv.DB, "o/r", n, "sha2");
    expect(followUp).not.toBeNull();
    expect(followUp?.delta_base_sha).toBe("sha1");
    expect(followUp?.status).toBe("ready");
    expect(followUp?.approved_by).toBe("maintainer");
    expect(JSON.parse(followUp!.config_json).gates).toEqual([{
      type: "multiple_choice",
      questions: 2,
      pass_threshold: 2,
    }]);
    expect(api2.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      output: expect.objectContaining({
        title: "Awaiting follow-up challenge",
        summary: expect.stringContaining("changes since sha1"),
      }),
    }));
    expect(api2.upsertPrComment).toHaveBeenCalledWith(
      "o/r",
      n,
      expect.stringContaining("changes since sha1")
    );
  });

  it("reads voucha.yml from the base ref, not the PR head or stale base SHA", async () => {
    const getFileContent = vi.fn(async () => null);
    const api = stubApi({ getFileContent });
    const n = uniq + 8;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(getFileContent).toHaveBeenCalledWith("o/r", ".github/voucha.yml", "main");
  });

  it("supersedes an open challenge when a new sha arrives", async () => {
    const api = stubApi();
    const n = uniq + 9;
    await handlePullRequestEvent(testEnv, api, payloadFor(n, "sha1"));
    const p2 = payloadFor(n, "sha2");
    p2.action = "synchronize";
    const api2 = stubApi({ getPr: vi.fn(async () => ({ ...pr, number: n, head_sha: "sha2" })) });
    await handlePullRequestEvent(testEnv, api2, p2);
    const old = await getChallengeByPr(testEnv.DB, "o/r", n, "sha1");
    expect(old?.status).toBe("superseded");
    const fresh = await getChallengeByPr(testEnv.DB, "o/r", n, "sha2");
    expect(fresh?.status).toBe("awaiting_approval");
  });

  it("re-challenges on push when rechallenge_on_push is true, despite a prior pass", async () => {
    const yaml = "rechallenge_on_push: true\n";
    const api = stubApi({ getFileContent: vi.fn(async () => yaml) });
    const n = uniq + 10;
    await handlePullRequestEvent(testEnv, api, payloadFor(n, "sha1"));
    await testEnv.DB.prepare(
      "UPDATE challenges SET status='passed' WHERE repo_full_name='o/r' AND pr_number=? AND head_sha='sha1'"
    ).bind(n).run();
    const p2 = payloadFor(n, "sha2");
    p2.action = "synchronize";
    const api2 = stubApi({
      getFileContent: vi.fn(async () => yaml),
      getPr: vi.fn(async () => ({ ...pr, number: n, head_sha: "sha2" })),
    });
    await handlePullRequestEvent(testEnv, api2, p2);
    const fresh = await getChallengeByPr(testEnv.DB, "o/r", n, "sha2");
    expect(fresh).not.toBeNull(); // new challenge created despite prior pass
    // prior passed row is untouched by supersede
    const old = await getChallengeByPr(testEnv.DB, "o/r", n, "sha1");
    expect(old?.status).toBe("passed");
  });
});

describe("handleIssueCommentEvent", () => {
  it("binds a verification session when the PR author comments the one-time code", async () => {
    const api = stubApi({
      getPr: vi.fn(async () => ({ ...pr, author_login: "Contributor" })),
    });
    const n = uniq + 28;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch).not.toBeNull();
    await testEnv.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, verify_code) VALUES ('sessVerify', ?, 'abc123')"
    ).bind(ch!.id).run();

    await handleIssueCommentEvent(testEnv, api, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: { body: "/voucha verify ABC123", user: { login: "contributor" } },
    });

    const row = await testEnv.DB.prepare("SELECT gh_login, verify_code FROM sessions WHERE id='sessVerify'")
      .first<{ gh_login: string | null; verify_code: string | null }>();
    expect(row).toEqual({ gh_login: "contributor", verify_code: null });
  });

  it("starts quiz preparation after a ready challenge verification comment binds", async () => {
    const api = stubApi({
      getPr: vi.fn(async () => ({ ...pr, author_association: "CONTRIBUTOR" })),
    });
    const n = uniq + 30;
    const p = payloadFor(n);
    p.pull_request.author_association = "CONTRIBUTOR";
    await handlePullRequestEvent(testEnv, api, p);
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("ready");
    await testEnv.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, verify_code) VALUES ('sessPrepare', ?, 'beef42')"
    ).bind(ch!.id).run();
    const prepareQuiz = vi.fn(async () => {});

    await handleIssueCommentEvent(testEnv, api, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: { body: "/voucha verify beef42", user: { login: "contributor" } },
    }, { prepareQuiz });

    expect(prepareQuiz).toHaveBeenCalledWith(expect.objectContaining({ id: ch!.id }));
  });

  it("ignores verification comments from anyone other than the PR author", async () => {
    const api = stubApi();
    const n = uniq + 29;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch).not.toBeNull();
    await testEnv.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, verify_code) VALUES ('sessWrongAuthor', ?, 'def456')"
    ).bind(ch!.id).run();

    await handleIssueCommentEvent(testEnv, api, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: { body: "/voucha verify def456", user: { login: "rando" } },
    });

    const row = await testEnv.DB.prepare("SELECT gh_login, verify_code FROM sessions WHERE id='sessWrongAuthor'")
      .first<{ gh_login: string | null; verify_code: string | null }>();
    expect(row).toEqual({ gh_login: null, verify_code: "def456" });
  });

  it("approves the newest challenge on '/voucha approve' from a maintainer", async () => {
    const api = stubApi();
    const n = uniq + 6;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    const approver = stubApi({ getUserPermission: vi.fn(async () => ({ permission: "write", role_name: "maintain" })) });
    await handleIssueCommentEvent(testEnv, approver, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: { body: "/voucha approve", user: { login: "maintainer" } },
    });
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("ready");
    expect(ch?.approved_by).toBe("maintainer");
  });

  it("ignores approval from users without write access", async () => {
    const api = stubApi();
    const n = uniq + 7;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    await handleIssueCommentEvent(testEnv, api, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: { body: "/voucha approve", user: { login: "rando" } },
    });
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("awaiting_approval");
  });

  it("restarts a terminal challenge when a maintainer comments '/voucha retry'", async () => {
    const api = stubApi({
      getPr: vi.fn(async () => ({ ...pr, author_association: "CONTRIBUTOR" })),
    });
    const n = uniq + 31;
    const p = payloadFor(n);
    p.pull_request.author_association = "CONTRIBUTOR";
    await handlePullRequestEvent(testEnv, api, p);
    const original = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(original?.status).toBe("ready");
    await testEnv.DB.prepare(
      "UPDATE challenges SET status='failed_assisted', attempts_used=1, terminal_reconciled_at=? WHERE id=?"
    ).bind(new Date().toISOString(), original!.id).run();
    await testEnv.DB.prepare(
      `INSERT INTO quizzes (id, challenge_id, attempt_number, retry_cycle, questions_json, score, finished_at)
       VALUES (?, ?, 1, 0, '{"questions":[]}', 0, ?)`
    ).bind(`quizRetry${n}`, original!.id, new Date().toISOString()).run();

    const retryApi = stubApi({
      createCheckRun: vi.fn(async () => 99),
      getPr: vi.fn(async () => ({ ...pr, number: n, head_sha: "abc123" })),
      getUserPermission: vi.fn(async () => ({ permission: "write", role_name: "maintain" })),
    });
    await handleIssueCommentEvent(testEnv, retryApi, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: { body: "/voucha retry", user: { login: "maintainer" } },
    });

    const restarted = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(restarted).toEqual(expect.objectContaining({
      id: original!.id,
      status: "ready",
      attempts_used: 0,
      retry_cycle: 1,
      check_run_id: 99,
      approved_by: "maintainer",
      terminal_reconciled_at: null,
    }));
    expect(retryApi.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      name: "PR comprehension check",
      head_sha: "abc123",
      status: "queued",
      details_url: expect.stringContaining(`/challenge/${original!.id}`),
    }));
    expect(retryApi.upsertPrComment).toHaveBeenCalledWith(
      "o/r",
      n,
      expect.stringContaining("Retry requested by @maintainer")
    );
    const previousQuiz = await testEnv.DB.prepare(
      "SELECT retry_cycle, score FROM quizzes WHERE id=?"
    ).bind(`quizRetry${n}`).first<{ retry_cycle: number; score: number }>();
    expect(previousQuiz).toEqual({ retry_cycle: 0, score: 0 });
  });

  it("does not let a contributor restart a terminal challenge", async () => {
    const api = stubApi({
      getPr: vi.fn(async () => ({ ...pr, author_association: "CONTRIBUTOR" })),
    });
    const n = uniq + 32;
    const p = payloadFor(n);
    p.pull_request.author_association = "CONTRIBUTOR";
    await handlePullRequestEvent(testEnv, api, p);
    const original = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    await testEnv.DB.prepare("UPDATE challenges SET status='failed_final', attempts_used=3 WHERE id=?")
      .bind(original!.id).run();

    const contributorApi = stubApi({ getUserPermission: vi.fn(async () => "none") });
    await handleIssueCommentEvent(testEnv, contributorApi, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: { body: "/voucha retrigger", user: { login: "contributor" } },
    });

    expect(contributorApi.createCheckRun).not.toHaveBeenCalled();
    expect((await getChallengeByPr(testEnv.DB, "o/r", n, "abc123"))?.status).toBe("failed_final");
  });

  it("trusts GitHub's signed OWNER association for retry authorization", async () => {
    const api = stubApi({
      getPr: vi.fn(async () => ({ ...pr, author_association: "CONTRIBUTOR" })),
    });
    const n = uniq + 33;
    const p = payloadFor(n);
    p.pull_request.author_association = "CONTRIBUTOR";
    await handlePullRequestEvent(testEnv, api, p);
    const original = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    await testEnv.DB.prepare("UPDATE challenges SET status='neutral' WHERE id=?").bind(original!.id).run();

    const ownerApi = stubApi({
      createCheckRun: vi.fn(async () => 100),
      getPr: vi.fn(async () => ({ ...pr, number: n, head_sha: "abc123" })),
      getUserPermission: vi.fn(async () => ({ permission: "none", role_name: "none" })),
    });
    await handleIssueCommentEvent(testEnv, ownerApi, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: {
        body: "/voucha retry",
        author_association: "OWNER",
        user: { login: "owner" },
      },
    });

    expect(ownerApi.getUserPermission).not.toHaveBeenCalled();
    expect((await getChallengeByPr(testEnv.DB, "o/r", n, "abc123"))?.status).toBe("ready");
  });
});
