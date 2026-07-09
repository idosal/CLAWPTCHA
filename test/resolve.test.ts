import { describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:test";
import { onChallengeResolved, sweepStaleChallenges } from "../src/resolve";
import { parseConfig } from "../src/config";
import type { Challenge, Env } from "../src/types";
import type { GitHubApi } from "../src/github/api";
import type { Telemetry } from "../src/risk/report";

const testEnv = env as unknown as Env;

function stubApi(overrides: Partial<Record<keyof GitHubApi, any>> = {}): GitHubApi {
  return {
    updateCheckRun: vi.fn(async () => {}),
    getCheckRun: vi.fn(async () => ({ status: "queued", conclusion: null })),
    getPr: vi.fn(async () => ({
      number: 1,
      head_sha: "sha-1",
      author_login: "alice",
      author_type: "User",
      author_association: "CONTRIBUTOR",
      draft: false,
      additions: 1,
      deletions: 0,
      title: "Change",
      body: null,
    })),
    upsertPrComment: vi.fn(async () => {}),
    ensureLabel: vi.fn(async () => {}),
    addLabels: vi.fn(async () => {}),
    closePullRequest: vi.fn(async () => {}),
    ...overrides,
  } as unknown as GitHubApi;
}

const NOW = new Date("2026-07-02T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60_000).toISOString();

async function seedChallenge(opts: {
  id: string;
  status: string;
  createdAt: string;
  checkRunId?: number | null;
  configJson?: string;
  headSha?: string;
  autoClosedAt?: string | null;
  terminalReconciledAt?: string | null;
}): Promise<void> {
  await testEnv.DB.prepare(
     `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
       author_login, check_run_id, status, config_json, auto_closed_at, terminal_reconciled_at, created_at)
     VALUES (?, 1, 'o/r', 1, ?, 'alice', ?, ?, ?, ?, ?, ?)`
  ).bind(
    opts.id,
    opts.headSha ?? `sha-${opts.id}`,
    opts.checkRunId ?? null,
    opts.status,
    opts.configJson ?? "{}",
    opts.autoClosedAt ?? null,
    opts.terminalReconciledAt ?? null,
    opts.createdAt
  ).run();
}

const scriptedTelemetry: Telemetry = {
  perQuestionMs: [4000, 5000, 3500, 4200],
  answerChanges: 0,
  pointerDistancePx: 30,
  pointerSamples: 4,
  focusLossCount: 0,
  webdriver: true,
  turnstileOk: false,
  honeypotTriggered: true,
  codeHoneypotTriggered: true,
};

function passedChallenge(): Challenge {
  return {
    id: "ch-1", installation_id: 1, repo_full_name: "o/r", pr_number: 1,
    head_sha: "sha-1", author_login: "alice", check_run_id: 42, status: "passed",
    approved_by: null, attempts_used: 1, cooldown_until: null,
    config_json: "{}", auto_closed_at: null, terminal_reconciled_at: null,
    created_at: "2026-07-02T10:00:00.000Z",
  };
}

describe("onChallengeResolved", () => {
  it("ensures and applies a flagged-pass label, then inlines the signals in the comment", async () => {
    const api = stubApi();
    await onChallengeResolved(testEnv, {
      challenge: passedChallenge(), outcome: "passed", score: 4, total: 4,
      telemetry: scriptedTelemetry, cfg: parseConfig(null),
    }, async () => api);

    expect(api.ensureLabel).toHaveBeenCalledWith(
      "o/r",
      "pr-comprehension:flagged",
      "b60205",
      "Multiple passive risk signals were observed on a passed PR comprehension challenge."
    );
    expect(api.addLabels).toHaveBeenCalledWith("o/r", 1, ["pr-comprehension:flagged"]);

    const [, , patch] = (api.updateCheckRun as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch.output.title).toBe("Passed — but the quiz looks scripted");

    const [, , comment] = (api.upsertPrComment as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(comment).toContain("looks scripted");
    expect(comment).toContain("every answer took under 10 seconds");
    expect(comment).not.toContain("see the check run details");
  });

  it("does not label a clean pass and keeps the plain title", async () => {
    const api = stubApi();
    await onChallengeResolved(testEnv, {
      challenge: passedChallenge(), outcome: "passed", score: 4, total: 4,
      telemetry: null, cfg: parseConfig(null),
    }, async () => api);

    expect(api.ensureLabel).not.toHaveBeenCalled();
    expect(api.addLabels).not.toHaveBeenCalled();
    const [, , patch] = (api.updateCheckRun as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch.output.title).toBe("Passed");
  });

  it("suppresses outcome comments when output comments are quiet", async () => {
    const api = stubApi();
    await onChallengeResolved(testEnv, {
      challenge: passedChallenge(), outcome: "passed", score: 4, total: 4,
      telemetry: null, cfg: parseConfig("output:\n  comments: quiet\n"),
    }, async () => api);

    expect(api.updateCheckRun).toHaveBeenCalled();
    expect(api.upsertPrComment).not.toHaveBeenCalled();
  });

  it("can disable flagged labels while preserving the check-run warning", async () => {
    const api = stubApi();
    await onChallengeResolved(testEnv, {
      challenge: passedChallenge(), outcome: "passed", score: 4, total: 4,
      telemetry: scriptedTelemetry, cfg: parseConfig("output:\n  labels: false\n"),
    }, async () => api);

    expect(api.ensureLabel).not.toHaveBeenCalled();
    expect(api.addLabels).not.toHaveBeenCalled();
    const [, , patch] = (api.updateCheckRun as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch.output.title).toBe("Passed — but the quiz looks scripted");
  });

  it("withholds the risk report on a retryable failure (no mid-challenge signal feedback)", async () => {
    const api = stubApi();
    await onChallengeResolved(testEnv, {
      challenge: { ...passedChallenge(), status: "ready" }, outcome: "failed_retry",
      score: 1, total: 4, telemetry: scriptedTelemetry, cfg: parseConfig(null),
    }, async () => api);

    const [, , patch] = (api.updateCheckRun as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch.output.summary).toContain("Score 1/4");
    expect(patch.output.summary).not.toContain("Risk report");
    expect(patch.output.summary).not.toContain("under 10 seconds");
    expect(patch.details_url).toContain("/challenge/ch-1");
    expect(api.upsertPrComment).toHaveBeenCalledWith("o/r", 1, expect.stringContaining("VOUCHA — retry needed"));
    expect(api.upsertPrComment).toHaveBeenCalledWith("o/r", 1, expect.stringContaining("/challenge/ch-1"));
  });

  it("includes the full risk report on final failure", async () => {
    const api = stubApi();
    await onChallengeResolved(testEnv, {
      challenge: { ...passedChallenge(), status: "failed_final" }, outcome: "failed_final",
      score: 1, total: 4, telemetry: scriptedTelemetry, cfg: parseConfig(null),
    }, async () => api);

    const [, , patch] = (api.updateCheckRun as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch.output.summary).toContain("Risk report");
    expect(patch.output.summary).toContain("every answer took under 10 seconds");
  });

  it("auto-closes configured terminal failures", async () => {
    const api = stubApi();
    await onChallengeResolved(testEnv, {
      challenge: { ...passedChallenge(), status: "failed_final" }, outcome: "failed_final",
      score: 1, total: 4, telemetry: scriptedTelemetry, cfg: parseConfig("enforcement:\n  auto_close: true\n"),
    }, async () => api);

    expect(api.closePullRequest).toHaveBeenCalledWith("o/r", 1);
    const [, , patch] = (api.updateCheckRun as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch.output.summary).toContain("auto-closed this pull request");
    expect(api.upsertPrComment).toHaveBeenCalledWith("o/r", 1, expect.stringContaining("auto-closed this PR"));
  });

  it("records auto-close before updating the check run", async () => {
    await seedChallenge({
      id: "ch-1",
      status: "failed_final",
      createdAt: hoursAgo(1),
      checkRunId: 42,
      headSha: "sha-1",
    });
    const api = stubApi({
      updateCheckRun: vi.fn(async () => { throw new Error("check update failed"); }),
    });

    await expect(onChallengeResolved(testEnv, {
      challenge: { ...passedChallenge(), status: "failed_final" }, outcome: "failed_final",
      score: 1, total: 4, telemetry: scriptedTelemetry, cfg: parseConfig("enforcement:\n  auto_close: true\n"),
    }, async () => api)).rejects.toThrow("check update failed");

    expect(api.closePullRequest).toHaveBeenCalledWith("o/r", 1);
    const row = await testEnv.DB.prepare("SELECT auto_closed_at FROM challenges WHERE id='ch-1'")
      .first<{ auto_closed_at: string | null }>();
    expect(row?.auto_closed_at).toEqual(expect.any(String));
  });

  it("does not auto-close an obsolete terminal challenge for an older PR head", async () => {
    const api = stubApi({
      getPr: vi.fn(async () => ({
        number: 1,
        head_sha: "new-sha",
        author_login: "alice",
        author_type: "User",
        author_association: "CONTRIBUTOR",
        draft: false,
        additions: 1,
        deletions: 0,
        title: "Change",
        body: null,
      })),
    });
    await onChallengeResolved(testEnv, {
      challenge: { ...passedChallenge(), status: "failed_final" }, outcome: "failed_final",
      score: 1, total: 4, telemetry: scriptedTelemetry, cfg: parseConfig("enforcement:\n  auto_close: true\n"),
    }, async () => api);

    expect(api.closePullRequest).not.toHaveBeenCalled();
    const [, , patch] = (api.updateCheckRun as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch.output.summary).toContain("older commit");
    expect(api.upsertPrComment).toHaveBeenCalledWith("o/r", 1, expect.stringContaining("older commit"));
  });

  it("does not auto-close retryable failures", async () => {
    const api = stubApi();
    await onChallengeResolved(testEnv, {
      challenge: { ...passedChallenge(), status: "ready" }, outcome: "failed_retry",
      score: 1, total: 4, telemetry: scriptedTelemetry, cfg: parseConfig("enforcement:\n  auto_close: true\n"),
    }, async () => api);

    expect(api.closePullRequest).not.toHaveBeenCalled();
  });

  it("keeps the failed check and comment when auto-close fails", async () => {
    const api = stubApi({ closePullRequest: vi.fn(async () => { throw new Error("403"); }) });
    await onChallengeResolved(testEnv, {
      challenge: { ...passedChallenge(), status: "failed_assisted" }, outcome: "failed_assisted",
      score: 4, total: 4, telemetry: scriptedTelemetry, cfg: parseConfig("enforcement:\n  auto_close: true\n"),
      failureReason: "Challenge assistance signals were detected.",
    }, async () => api);

    expect(api.updateCheckRun).toHaveBeenCalled();
    const [, , patch] = (api.updateCheckRun as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch.output.summary).toContain("could not close it");
    expect(api.upsertPrComment).toHaveBeenCalledWith("o/r", 1, expect.stringContaining("could not close it"));
  });

  it("still posts the attestation comment when labeling fails", async () => {
    const api = stubApi({ addLabels: vi.fn(async () => { throw new Error("403"); }) });
    await onChallengeResolved(testEnv, {
      challenge: passedChallenge(), outcome: "passed", score: 4, total: 4,
      telemetry: scriptedTelemetry, cfg: parseConfig(null),
    }, async () => api);

    expect(api.upsertPrComment).toHaveBeenCalled();
  });

  it("still posts the attestation comment when label creation fails", async () => {
    const api = stubApi({ ensureLabel: vi.fn(async () => { throw new Error("403"); }) });
    await onChallengeResolved(testEnv, {
      challenge: passedChallenge(), outcome: "passed", score: 4, total: 4,
      telemetry: scriptedTelemetry, cfg: parseConfig(null),
    }, async () => api);

    expect(api.addLabels).not.toHaveBeenCalled();
    expect(api.upsertPrComment).toHaveBeenCalled();
  });
});

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

  it("auto-closes configured terminal failures during reconciliation", async () => {
    await seedChallenge({
      id: "ch-close",
      status: "failed_final",
      createdAt: hoursAgo(1),
      checkRunId: 701,
      headSha: "sha-1",
      configJson: JSON.stringify(parseConfig("enforcement:\n  auto_close: true\n")),
    });
    const api = stubApi({
      getCheckRun: vi.fn(async () => ({ status: "queued", conclusion: null })),
    });

    await sweepStaleChallenges(testEnv, NOW, async () => api);

    expect(api.closePullRequest).toHaveBeenCalledWith("o/r", 1);
    expect(api.updateCheckRun).toHaveBeenCalledWith("o/r", 701, expect.objectContaining({
      status: "completed", conclusion: "failure",
      output: expect.objectContaining({
        summary: expect.stringContaining("auto-closed this pull request"),
      }),
    }));
  });

  it("does not re-close a PR during reconciliation after auto-close was recorded", async () => {
    await seedChallenge({
      id: "ch-recorded-close",
      status: "failed_final",
      createdAt: hoursAgo(1),
      checkRunId: 702,
      headSha: "sha-1",
      configJson: JSON.stringify(parseConfig("enforcement:\n  auto_close: true\n")),
      autoClosedAt: hoursAgo(0.5),
    });
    const api = stubApi({
      getCheckRun: vi.fn(async () => ({ status: "queued", conclusion: null })),
    });

    await sweepStaleChallenges(testEnv, NOW, async () => api);

    expect(api.getPr).not.toHaveBeenCalled();
    expect(api.closePullRequest).not.toHaveBeenCalled();
    expect(api.updateCheckRun).toHaveBeenCalledWith("o/r", 702, expect.objectContaining({
      status: "completed", conclusion: "failure",
      output: expect.objectContaining({
        summary: expect.stringContaining("auto-closed this pull request"),
      }),
    }));
  });

  it("skips already reconciled terminal rows during reconciliation", async () => {
    await seedChallenge({
      id: "ch-reconciled",
      status: "failed_final",
      createdAt: hoursAgo(1),
      checkRunId: 703,
      terminalReconciledAt: hoursAgo(0.5),
      configJson: JSON.stringify(parseConfig("enforcement:\n  auto_close: true\n")),
    });
    const api = stubApi();

    await sweepStaleChallenges(testEnv, NOW, async () => api);

    expect(api.getCheckRun).not.toHaveBeenCalledWith("o/r", 703);
    expect(api.closePullRequest).not.toHaveBeenCalled();
  });

  it("reconciles a challenge created >24h ago whose quiz finished recently", async () => {
    // Attempts + cooldowns can push resolution well past 24h from PR open.
    // Recency must key on quiz finished_at, not challenge created_at, or this
    // stuck check would never be repaired.
    await seedChallenge({ id: "ch-slow", status: "passed", createdAt: hoursAgo(30), checkRunId: 601 });
    await testEnv.DB.prepare(
      `INSERT INTO quizzes (id, challenge_id, attempt_number, questions_json, score, finished_at)
       VALUES ('qz-slow', 'ch-slow', 2, '{"questions":[]}', 4, ?)`
    ).bind(hoursAgo(1)).run();
    const api = stubApi();

    await sweepStaleChallenges(testEnv, NOW, async () => api);

    expect(api.updateCheckRun).toHaveBeenCalledWith("o/r", 601, expect.objectContaining({
      status: "completed", conclusion: "success",
    }));
  });
});
