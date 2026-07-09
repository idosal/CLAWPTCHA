import { describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:test";
import { signSessionCookie, verifySessionCookie } from "../src/ui/session";
import {
  prepareQuizForChallenge, startQuizAttempt, submitAnswer, type ChallengeDeps,
} from "../src/challenge";
import { getPreparedQuiz, insertChallenge, randomToken, getChallenge, upsertPreparedQuiz } from "../src/store";
import { DEFAULT_CONFIG } from "../src/config";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

const KEY = "0123456789abcdef0123456789abcdef";

describe("session cookie", () => {
  it("round-trips a session id", async () => {
    const cookie = await signSessionCookie(KEY, "sess-123");
    expect(await verifySessionCookie(KEY, cookie)).toBe("sess-123");
  });
  it("rejects tampered values and wrong keys", async () => {
    const cookie = await signSessionCookie(KEY, "sess-123");
    expect(await verifySessionCookie(KEY, cookie.replace("sess-123", "sess-999"))).toBeNull();
    expect(await verifySessionCookie("f".repeat(32), cookie)).toBeNull();
    expect(await verifySessionCookie(KEY, "garbage")).toBeNull();
  });
});

const quiz = {
  questions: [
    { type: "consequence_mcq" as const, prompt: "q1 prompt is long enough", options: ["a","b","c","d"], correct: [0] },
    { type: "blast_radius_multi" as const, prompt: "q2 prompt is long enough", options: ["a","b","c","d"], correct: [1,2] },
    { type: "false_claim" as const, prompt: "q3 prompt is long enough", options: ["a","b","c","d"], correct: [3] },
    { type: "consequence_mcq" as const, prompt: "q4 prompt is long enough", options: ["a","b","c","d"], correct: [2] },
  ],
};

const twoQuestionQuiz = {
  questions: quiz.questions.slice(0, 2),
};

function deps(overrides: Partial<ChallengeDeps> = {}): ChallengeDeps {
  return {
    generateQuiz: vi.fn(async () => ({ ok: true as const, quiz })),
    verifyTurnstile: vi.fn(async () => true),
    fetchPrContext: vi.fn(async () => ({ diff: "d", title: "t", body: null, files: ["a.ts"] })),
    onChallengeResolved: vi.fn(async () => {}),
    now: () => new Date("2026-07-02T12:00:00Z"),
    ...overrides,
  };
}

async function makeChallenge(status = "ready", config = DEFAULT_CONFIG): Promise<string> {
  const id = randomToken();
  await insertChallenge(testEnv.DB, {
    id, installation_id: 1, repo_full_name: "o/r", pr_number: 1,
    head_sha: randomToken(8), author_login: "alice", check_run_id: 42,
    status: status as any, approved_by: null, attempts_used: 0,
    cooldown_until: null, config_json: JSON.stringify(config),
  });
  return id;
}

describe("startQuizAttempt", () => {
  it("creates a quiz for the author when ready + turnstile ok", async () => {
    const id = await makeChallenge();
    const d = deps();
    const r = await startQuizAttempt(testEnv, d, id, "alice", "turnstile-token");
    expect(r.ok).toBe(true);
    expect(d.generateQuiz).toHaveBeenCalledTimes(1);
  });

  it("uses a prepared quiz after Turnstile without generating during start", async () => {
    const id = await makeChallenge();
    await upsertPreparedQuiz(testEnv.DB, id, quiz);
    const d = deps({
      fetchPrContext: vi.fn(async () => {
        throw new Error("should not fetch PR context when no code honeypot signal is configured");
      }),
      generateQuiz: vi.fn(async () => {
        throw new Error("should not generate quiz during start");
      }),
    });

    const r = await startQuizAttempt(testEnv, d, id, "alice", "turnstile-token");

    expect(r.ok).toBe(true);
    expect(d.fetchPrContext).not.toHaveBeenCalled();
    expect(d.generateQuiz).not.toHaveBeenCalled();
    expect(await getPreparedQuiz(testEnv.DB, id)).toBeNull();
    const row = await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM quizzes WHERE challenge_id=?")
      .bind(id).first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it("prepares a quiz without creating an attempt", async () => {
    const id = await makeChallenge();
    const d = deps();

    await prepareQuizForChallenge(testEnv, d, id);

    expect(d.fetchPrContext).toHaveBeenCalledTimes(1);
    expect(d.generateQuiz).toHaveBeenCalledTimes(1);
    const prepared = await getPreparedQuiz(testEnv.DB, id);
    expect(JSON.parse(prepared!.questions_json).questions).toHaveLength(4);
    const row = await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM quizzes WHERE challenge_id=?")
      .bind(id).first<{ count: number }>();
    expect(row?.count).toBe(0);
  });

  it("rejects a non-author even with a valid session", async () => {
    const id = await makeChallenge();
    const r = await startQuizAttempt(testEnv, deps(), id, "mallory", "tok");
    expect(r).toEqual({ ok: false, error: "not_author" });
  });

  it("rejects when awaiting approval", async () => {
    const id = await makeChallenge("awaiting_approval");
    const r = await startQuizAttempt(testEnv, deps(), id, "alice", "tok");
    expect(r).toEqual({ ok: false, error: "not_ready" });
  });

  it("fails closed when Turnstile does not validate the browser session", async () => {
    const id = await makeChallenge();
    const d = deps({
      verifyTurnstile: vi.fn(async () => false),
      fetchPrContext: vi.fn(async () => {
        throw new Error("should not fetch PR context");
      }),
      generateQuiz: vi.fn(async () => {
        throw new Error("should not generate quiz");
      }),
    });
    const r = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    expect(r).toEqual({
      ok: false,
      error: "bot_detected",
      reason: "Turnstile did not validate this browser session.",
    });
    expect(d.fetchPrContext).not.toHaveBeenCalled();
    expect(d.generateQuiz).not.toHaveBeenCalled();
    const challenge = await getChallenge(testEnv.DB, id);
    expect(challenge?.status).toBe("failed_assisted");
    expect(challenge?.attempts_used).toBe(1);
    const row = await testEnv.DB.prepare(
      "SELECT score, turnstile_ok, telemetry_json FROM quizzes WHERE challenge_id=?"
    ).bind(id).first<{ score: number; turnstile_ok: number; telemetry_json: string }>();
    expect(row?.score).toBe(0);
    expect(row?.turnstile_ok).toBe(0);
    expect(JSON.parse(row!.telemetry_json).botFailureReason)
      .toBe("Turnstile did not validate this browser session.");
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "failed_assisted",
        failureReason: "Turnstile did not validate this browser session.",
      })
    );
  });

  it("records a report-only honeypot hit from the start form", async () => {
    const id = await makeChallenge();
    const r = await startQuizAttempt(testEnv, deps(), id, "alice", "tok", true);
    if (!r.ok) throw new Error("setup failed");
    const row = await testEnv.DB.prepare("SELECT telemetry_json FROM quizzes WHERE id=?")
      .bind(r.quizId).first<{ telemetry_json: string }>();
    expect(JSON.parse(row!.telemetry_json)).toEqual({ honeypotTriggered: true });
  });

  it("records a report-only code honeypot hit from the PR diff", async () => {
    const id = await makeChallenge("ready", {
      ...DEFAULT_CONFIG,
      signals: [{
        type: "code_honeypot" as const,
        report_only: true,
        patterns: ["VOUCHA_DO_NOT_ADD_THIS"],
        paths: ["src/**"],
      }],
    });
    const d = deps({
      fetchPrContext: vi.fn(async () => ({
        diff: [
          "diff --git a/src/app.ts b/src/app.ts",
          "+++ b/src/app.ts",
          "+const marker = 'VOUCHA_DO_NOT_ADD_THIS';",
        ].join("\n"),
        title: "t",
        body: null,
        files: ["src/app.ts"],
      })),
    });
    const r = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    if (!r.ok) throw new Error("setup failed");
    const row = await testEnv.DB.prepare("SELECT telemetry_json FROM quizzes WHERE id=?")
      .bind(r.quizId).first<{ telemetry_json: string }>();
    expect(JSON.parse(row!.telemetry_json)).toEqual({ codeHoneypotTriggered: true });
  });

  it("does not record a code honeypot hit when the canary is only removed", async () => {
    const id = await makeChallenge("ready", {
      ...DEFAULT_CONFIG,
      signals: [{
        type: "code_honeypot" as const,
        report_only: true,
        patterns: ["VOUCHA_DO_NOT_ADD_THIS"],
        paths: ["src/**"],
      }],
    });
    const d = deps({
      fetchPrContext: vi.fn(async () => ({
        diff: [
          "diff --git a/src/app.ts b/src/app.ts",
          "+++ b/src/app.ts",
          "-const marker = 'VOUCHA_DO_NOT_ADD_THIS';",
        ].join("\n"),
        title: "t",
        body: null,
        files: ["src/app.ts"],
      })),
    });
    const r = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    if (!r.ok) throw new Error("setup failed");
    const row = await testEnv.DB.prepare("SELECT telemetry_json FROM quizzes WHERE id=?")
      .bind(r.quizId).first<{ telemetry_json: string }>();
    expect(JSON.parse(row!.telemetry_json)).toEqual({});
  });

  it("neutralizes the check when LLM generation fails twice", async () => {
    const id = await makeChallenge();
    const d = deps({ generateQuiz: vi.fn(async () => ({ ok: false as const, error: "boom" })) });
    const r = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    expect(r).toEqual({ ok: false, error: "generation_failed" });
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "neutral" })
    );
    expect((await getChallenge(testEnv.DB, id))?.status).toBe("neutral");
  });
});

describe("submitAnswer", () => {
  async function startedQuiz(passOverrides: Partial<ChallengeDeps> = {}) {
    const id = await makeChallenge();
    const d = deps(passOverrides);
    const started = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    if (!started.ok) throw new Error("setup failed");
    return { challengeId: id, quizId: started.quizId, d };
  }

  const telemetry = JSON.stringify({
    elapsedMs: 30000, answerChanges: 1, pointerDistancePx: 900,
    pointerSamples: 50, focusLossCount: 0, webdriver: false,
  });

  // submitAnswer leaves question_served_at NULL when advancing; in production
  // the question route stamps it via COALESCE when the question is first
  // rendered. This helper simulates that render-time stamp before answering
  // (COALESCE preserves an explicitly pre-set served_at, e.g. the over-time test).
  async function answerQ(
    d: ChallengeDeps, quizId: string, index: number, ans: number[],
    honeypotTriggered = false, telemetryJson = telemetry
  ) {
    await testEnv.DB.prepare(
      "UPDATE quizzes SET question_served_at=COALESCE(question_served_at, ?) WHERE id=?"
    ).bind(d.now().toISOString(), quizId).run();
    return submitAnswer(testEnv, d, quizId, index, ans, telemetryJson, honeypotTriggered);
  }

  it("passes with 3+ correct answers, resolves challenge as passed", async () => {
    const { challengeId, quizId, d } = await startedQuiz();
    await answerQ(d, quizId, 0, [0]);  // correct
    await answerQ(d, quizId, 1, [1, 2]); // correct
    await answerQ(d, quizId, 2, [0]);  // wrong (correct is 3)
    const final = await answerQ(d, quizId, 3, [2]); // correct
    expect(final.done).toBe(true);
    if (final.done && "passed" in final) expect(final.passed).toBe(true);
    else expect.fail("expected a graded result, not an error");
    expect((await getChallenge(testEnv.DB, challengeId))?.status).toBe("passed");
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "passed", score: 3 })
    );
  });

  it("still returns the recorded result when the GitHub resolution callback fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { challengeId, quizId, d } = await startedQuiz({
      onChallengeResolved: vi.fn(async () => {
        throw new Error("github unavailable");
      }),
    });

    await answerQ(d, quizId, 0, [0]);
    await answerQ(d, quizId, 1, [1, 2]);
    await answerQ(d, quizId, 2, [3]);
    const final = await answerQ(d, quizId, 3, [2]);

    expect(final).toEqual({ done: true, passed: true, score: 4, total: 4 });
    expect((await getChallenge(testEnv.DB, challengeId))?.status).toBe("passed");
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "passed", score: 4 })
    );
    expect(consoleError).toHaveBeenCalledWith(
      "challenge resolution callback failed",
      challengeId,
      expect.any(Error)
    );
    consoleError.mockRestore();
  });

  it("uses the configured multiple-choice gate threshold", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      pass_threshold: 2,
      gates: [{ type: "multiple_choice" as const, questions: 2, pass_threshold: 2 }],
    };
    const id = await makeChallenge("ready", config);
    const d = deps({ generateQuiz: vi.fn(async () => ({ ok: true as const, quiz: twoQuestionQuiz })) });
    const started = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    if (!started.ok) throw new Error("setup failed");
    await answerQ(d, started.quizId, 0, [0]);
    const final = await answerQ(d, started.quizId, 1, [1, 2]);
    expect(final).toEqual({ done: true, passed: true, score: 2, total: 2 });
  });

  it("carries a report-only honeypot hit into final telemetry without changing score", async () => {
    const { quizId, d } = await startedQuiz();
    await answerQ(d, quizId, 0, [0]);
    await answerQ(d, quizId, 1, [1, 2]);
    await answerQ(d, quizId, 2, [3]);
    const final = await answerQ(d, quizId, 3, [2], true);
    expect(final).toEqual({ done: true, passed: true, score: 4, total: 4 });
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "passed",
        telemetry: expect.objectContaining({ honeypotTriggered: true }),
      })
    );
  });

  it("carries a report-only code honeypot hit into final telemetry without changing score", async () => {
    const id = await makeChallenge("ready", {
      ...DEFAULT_CONFIG,
      signals: [{
        type: "code_honeypot" as const,
        report_only: true,
        patterns: ["VOUCHA_DO_NOT_ADD_THIS"],
        paths: ["src/**"],
      }],
    });
    const d = deps({
      fetchPrContext: vi.fn(async () => ({
        diff: [
          "diff --git a/src/app.ts b/src/app.ts",
          "+++ b/src/app.ts",
          "+const marker = 'VOUCHA_DO_NOT_ADD_THIS';",
        ].join("\n"),
        title: "t",
        body: null,
        files: ["src/app.ts"],
      })),
    });
    const started = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    if (!started.ok) throw new Error("setup failed");
    await answerQ(d, started.quizId, 0, [0]);
    await answerQ(d, started.quizId, 1, [1, 2]);
    await answerQ(d, started.quizId, 2, [3]);
    const final = await answerQ(d, started.quizId, 3, [2]);
    expect(final).toEqual({ done: true, passed: true, score: 4, total: 4 });
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "passed",
        telemetry: expect.objectContaining({ codeHoneypotTriggered: true }),
      })
    );
  });

  it("fails assisted when browser automation is reported during an otherwise correct quiz", async () => {
    const { challengeId, quizId, d } = await startedQuiz();
    const webdriverTelemetry = JSON.stringify({
      elapsedMs: 30000, answerChanges: 1, pointerDistancePx: 900,
      pointerSamples: 50, focusLossCount: 0, webdriver: true,
    });
    await answerQ(d, quizId, 0, [0], false, webdriverTelemetry);
    await answerQ(d, quizId, 1, [1, 2]);
    await answerQ(d, quizId, 2, [3]);
    const final = await answerQ(d, quizId, 3, [2]);

    expect(final).toEqual({
      done: true,
      passed: false,
      score: 4,
      total: 4,
      failureReason: "The browser identified itself as automated software.",
    });
    const ch = await getChallenge(testEnv.DB, challengeId);
    expect(ch?.status).toBe("failed_assisted");
    expect(ch?.attempts_used).toBe(1);
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "failed_assisted",
        failureReason: "The browser identified itself as automated software.",
      })
    );
    const row = await testEnv.DB.prepare("SELECT telemetry_json FROM quizzes WHERE id=?")
      .bind(quizId).first<{ telemetry_json: string }>();
    expect(JSON.parse(row!.telemetry_json).botFailureReason)
      .toBe("The browser identified itself as automated software.");
  });

  it("fails below threshold, sets cooldown, increments attempts", async () => {
    const { challengeId, quizId, d } = await startedQuiz();
    for (const [i, ans] of [[1], [0], [0], [0]].entries()) await answerQ(d, quizId, i, ans);
    const ch = await getChallenge(testEnv.DB, challengeId);
    expect(ch?.status).toBe("ready"); // retryable
    expect(ch?.attempts_used).toBe(1);
    expect(ch?.cooldown_until).toBe("2026-07-02T12:15:00.000Z");
  });

  it("marks failed_final when max attempts exhausted", async () => {
    const id = await makeChallenge();
    await testEnv.DB.prepare("UPDATE challenges SET attempts_used=2 WHERE id=?").bind(id).run();
    const d = deps();
    const started = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    if (!started.ok) throw new Error("setup failed");
    for (const [i, ans] of [[1], [0], [0], [0]].entries()) await answerQ(d, started.quizId, i, ans);
    expect((await getChallenge(testEnv.DB, id))?.status).toBe("failed_final");
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed_final" })
    );
  });

  it("counts an over-time answer as wrong", async () => {
    const { quizId, d } = await startedQuiz();
    // pretend the question was served 3 minutes ago
    await testEnv.DB.prepare("UPDATE quizzes SET question_served_at=? WHERE id=?")
      .bind("2026-07-02T11:57:00Z", quizId).run();
    const r = await submitAnswer(testEnv, d, quizId, 0, [0], telemetry);
    expect(r.done).toBe(false);
    const row = await testEnv.DB.prepare("SELECT answers_json FROM quizzes WHERE id=?")
      .bind(quizId).first<{ answers_json: string }>();
    expect(JSON.parse(row!.answers_json)[0]).toBeNull(); // recorded as timeout
  });

  it("purges question content from the quiz row after a pass (data custody)", async () => {
    const { quizId, d } = await startedQuiz();
    await answerQ(d, quizId, 0, [0]);
    await answerQ(d, quizId, 1, [1, 2]);
    await answerQ(d, quizId, 2, [3]);
    const final = await answerQ(d, quizId, 3, [2]);
    expect(final.done).toBe(true);
    const row = await testEnv.DB.prepare(
      "SELECT questions_json, score, answers_json, telemetry_json FROM quizzes WHERE id=?"
    ).bind(quizId).first<{ questions_json: string; score: number; answers_json: string; telemetry_json: string }>();
    expect(row!.questions_json).not.toContain("prompt is long enough");
    expect(JSON.parse(row!.questions_json)).toEqual({ questions: [] });
    // score, answers, telemetry are retained
    expect(row!.score).toBe(4);
    expect(JSON.parse(row!.answers_json)).toHaveLength(4);
    expect(JSON.parse(row!.telemetry_json).perQuestion).toHaveLength(4);
  });

  it("a quiz finished after the challenge closed cannot override the outcome", async () => {
    const { challengeId, quizId, d } = await startedQuiz();
    // Challenge leaves `ready` while the quiz is still in flight.
    await testEnv.DB.prepare("UPDATE challenges SET status='failed_final' WHERE id=?")
      .bind(challengeId).run();
    await answerQ(d, quizId, 0, [0]);
    await answerQ(d, quizId, 1, [1, 2]);
    await answerQ(d, quizId, 2, [3]);
    const final = await answerQ(d, quizId, 3, [2]); // would be a 4/4 pass
    expect(final).toEqual({ done: true, error: "challenge_closed" });
    expect((await getChallenge(testEnv.DB, challengeId))?.status).toBe("failed_final");
    expect(d.onChallengeResolved).not.toHaveBeenCalled();
  });

  it("starting a new attempt voids the previous open quiz", async () => {
    const id = await makeChallenge();
    const d = deps();
    const a = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    if (!a.ok) throw new Error("setup failed");
    const b = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    expect(b.ok).toBe(true);
    const rowA = await testEnv.DB.prepare("SELECT finished_at FROM quizzes WHERE id=?")
      .bind(a.quizId).first<{ finished_at: string | null }>();
    expect(rowA!.finished_at).not.toBeNull();
    const r = await submitAnswer(testEnv, d, a.quizId, 0, [0], telemetry);
    expect(r).toEqual({ done: true, error: "already_finished" });
  });

  it("a stale question index re-renders instead of consuming the next question", async () => {
    const { quizId, d } = await startedQuiz();
    const first = await answerQ(d, quizId, 0, [0]);
    expect(first).toEqual({ done: false, nextQuestion: 1 });
    // Duplicate POST for question 0 (back button / double submit).
    const dup = await submitAnswer(testEnv, d, quizId, 0, [3], telemetry);
    expect(dup).toEqual({ done: false, nextQuestion: 1 });
    const row = await testEnv.DB.prepare("SELECT answers_json FROM quizzes WHERE id=?")
      .bind(quizId).first<{ answers_json: string }>();
    expect(JSON.parse(row!.answers_json)).toHaveLength(1);
  });
});
