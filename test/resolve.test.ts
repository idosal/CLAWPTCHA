import { describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:test";
import { sweepStaleChallenges } from "../src/resolve";
import type { Env } from "../src/types";
import type { GitHubApi } from "../src/github/api";

const testEnv = env as unknown as Env;

function stubApi(overrides: Partial<Record<keyof GitHubApi, any>> = {}): GitHubApi {
  return {
    updateCheckRun: vi.fn(async () => {}),
    getCheckRun: vi.fn(async () => ({ status: "queued", conclusion: null })),
    upsertPrComment: vi.fn(async () => {}),
    ...overrides,
  } as unknown as GitHubApi;
}

const NOW = new Date("2026-07-02T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60_000).toISOString();

async function seedChallenge(opts: {
  id: string; status: string; createdAt: string; checkRunId?: number | null;
}): Promise<void> {
  await testEnv.DB.prepare(
    `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
       author_login, check_run_id, status, config_json, created_at)
     VALUES (?, 1, 'o/r', 1, ?, 'alice', ?, ?, '{}', ?)`
  ).bind(opts.id, `sha-${opts.id}`, opts.checkRunId ?? null, opts.status, opts.createdAt).run();
}

describe("sweepStaleChallenges", () => {
  it("purges rate_events older than 2h and keeps fresh ones", async () => {
    await testEnv.DB.prepare(
      "INSERT INTO rate_events (scope, created_at) VALUES ('user:old', ?), ('user:fresh', ?)"
    ).bind(hoursAgo(3), hoursAgo(1)).run();

    await sweepStaleChallenges(testEnv, NOW, async () => stubApi());

    const rows = await testEnv.DB.prepare("SELECT scope FROM rate_events").all<{ scope: string }>();
    const scopes = rows.results.map((r) => r.scope);
    expect(scopes).not.toContain("user:old");
    expect(scopes).toContain("user:fresh");
  });

  it("deletes sessions older than 2h and keeps fresh ones", async () => {
    await seedChallenge({ id: "ch-sess", status: "ready", createdAt: hoursAgo(1), checkRunId: null });
    await testEnv.DB.prepare(
      `INSERT INTO sessions (id, challenge_id, created_at)
       VALUES ('sess-old', 'ch-sess', ?), ('sess-fresh', 'ch-sess', ?)`
    ).bind(hoursAgo(3), hoursAgo(1)).run();

    await sweepStaleChallenges(testEnv, NOW, async () => stubApi());

    const rows = await testEnv.DB.prepare("SELECT id FROM sessions").all<{ id: string }>();
    const ids = rows.results.map((r) => r.id);
    expect(ids).not.toContain("sess-old");
    expect(ids).toContain("sess-fresh");
  });

  it("neutralizes a >24h-old ready challenge with no quizzes", async () => {
    await seedChallenge({ id: "ch-stale", status: "ready", createdAt: hoursAgo(25), checkRunId: 77 });
    const api = stubApi();

    await sweepStaleChallenges(testEnv, NOW, async () => api);

    expect(api.updateCheckRun).toHaveBeenCalledWith("o/r", 77, expect.objectContaining({
      status: "completed", conclusion: "neutral",
    }));
    const row = await testEnv.DB.prepare("SELECT status FROM challenges WHERE id='ch-stale'")
      .first<{ status: string }>();
    expect(row?.status).toBe("neutral");
  });

  it("leaves a fresh (<24h) pending challenge alone", async () => {
    await seedChallenge({ id: "ch-fresh", status: "ready", createdAt: hoursAgo(2), checkRunId: 88 });
    const api = stubApi();

    await sweepStaleChallenges(testEnv, NOW, async () => api);

    expect(api.updateCheckRun).not.toHaveBeenCalled();
    const row = await testEnv.DB.prepare("SELECT status FROM challenges WHERE id='ch-fresh'")
      .first<{ status: string }>();
    expect(row?.status).toBe("ready");
  });

  it("reconciles terminal challenges whose check run never completed, and only those", async () => {
    // Callback failed after DB commit: check run stuck at 'queued'.
    await seedChallenge({ id: "ch-stuck", status: "passed", createdAt: hoursAgo(1), checkRunId: 501 });
    // Callback succeeded: check run already completed — must be left intact.
    await seedChallenge({ id: "ch-done", status: "passed", createdAt: hoursAgo(1), checkRunId: 502 });
    const api = stubApi({
      getCheckRun: vi.fn(async (_repo: string, id: number) =>
        id === 501
          ? { status: "queued", conclusion: null }
          : { status: "completed", conclusion: "success" }
      ),
    });

    await sweepStaleChallenges(testEnv, NOW, async () => api);

    expect(api.updateCheckRun).toHaveBeenCalledWith("o/r", 501, expect.objectContaining({
      status: "completed", conclusion: "success",
    }));
    const calls = (api.updateCheckRun as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([, id]) => id === 502)).toBe(false);
  });
});
