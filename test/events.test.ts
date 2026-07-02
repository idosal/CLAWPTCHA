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
    getPr: vi.fn(async (): Promise<PrDetails> => pr),
    listPrFiles: vi.fn(async () => ["src/app.ts"]),
    getFileContent: vi.fn(async () => null), // no clawptcha.yml → defaults
    upsertPrComment: vi.fn(async () => {}),
    getUserPermission: vi.fn(async () => "none"),
    ...overrides,
  } as unknown as GitHubApi;
}

const pr: PrDetails = {
  number: 7, head_sha: "abc123", author_login: "contributor",
  author_type: "User", author_association: "FIRST_TIME_CONTRIBUTOR",
  additions: 100, deletions: 30, title: "Add feature", body: "Does a thing",
};

const prPayload = {
  action: "opened",
  installation: { id: 1 },
  repository: { full_name: "o/r" },
  pull_request: {
    number: 7, head: { sha: "abc123" }, base: { sha: "base000" },
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
      name: "clawptcha", head_sha: "abc123", status: "queued",
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

  it("auto-passes exempt PRs (docs-only) with a success check and no challenge row", async () => {
    const api = stubApi({ listPrFiles: vi.fn(async () => ["docs/x.md", "README.md"]) });
    const n = uniq + 3;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed", conclusion: "success",
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("is idempotent for the same head sha (webhook redelivery)", async () => {
    const api = stubApi();
    const n = uniq + 4;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledTimes(1);
  });

  it("keeps a pass on synchronize by default", async () => {
    const api = stubApi();
    const n = uniq + 5;
    await handlePullRequestEvent(testEnv, api, payloadFor(n, "sha1"));
    // simulate the sha1 challenge having been passed
    await testEnv.DB.prepare(
      "UPDATE challenges SET status='passed' WHERE repo_full_name='o/r' AND pr_number=? AND head_sha='sha1'"
    ).bind(n).run();
    const p2 = payloadFor(n, "sha2");
    p2.action = "synchronize";
    const api2 = stubApi({ getPr: vi.fn(async () => ({ ...pr, number: n, head_sha: "sha2" })) });
    await handlePullRequestEvent(testEnv, api2, p2);
    // rechallenge_on_push=false → new sha auto-passes because prior pass exists
    expect(api2.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      head_sha: "sha2", status: "completed", conclusion: "success",
    }));
  });

  it("reads clawptcha.yml from the base SHA, not the PR head", async () => {
    const getFileContent = vi.fn(async () => null);
    const api = stubApi({ getFileContent });
    const n = uniq + 8;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(getFileContent).toHaveBeenCalledWith("o/r", ".github/clawptcha.yml", "base000");
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
  it("approves the newest challenge on '/clawptcha approve' from a maintainer", async () => {
    const api = stubApi();
    const n = uniq + 6;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    const approver = stubApi({ getUserPermission: vi.fn(async () => "write") });
    await handleIssueCommentEvent(testEnv, approver, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: { body: "/clawptcha approve", user: { login: "maintainer" } },
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
      comment: { body: "/clawptcha approve", user: { login: "rando" } },
    });
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("awaiting_approval");
  });
});
