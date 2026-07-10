// test/grade.test.ts
import { describe, it, expect } from "vitest";
import {
  QUESTION_TIME_LIMIT_MS,
  answerWithinTimeLimit,
  canStartAttempt,
  gradeAnswer,
  nextCooldown,
  questionRemainingMs,
  scoreQuiz,
} from "../src/quiz/grade";
import type { Question } from "../src/quiz/schema";
import { DEFAULT_CONFIG } from "../src/config";

const mcq: Question = {
  type: "consequence_mcq",
  prompt: "x?",
  options: ["a", "b", "c", "d"],
  correct: [2],
};
const multi: Question = {
  type: "blast_radius_multi",
  prompt: "y?",
  options: ["a", "b", "c", "d"],
  correct: [0, 3],
};

describe("gradeAnswer", () => {
  it("grades single-choice exactly", () => {
    expect(gradeAnswer(mcq, [2])).toBe(true);
    expect(gradeAnswer(mcq, [1])).toBe(false);
    expect(gradeAnswer(mcq, [])).toBe(false);
  });

  it("grades multi-select as exact set match", () => {
    expect(gradeAnswer(multi, [3, 0])).toBe(true);   // order-insensitive
    expect(gradeAnswer(multi, [0])).toBe(false);      // subset fails
    expect(gradeAnswer(multi, [0, 3, 1])).toBe(false); // superset fails
  });

  it("treats timed-out answers (null) as wrong", () => {
    expect(gradeAnswer(mcq, null)).toBe(false);
  });
});

describe("scoreQuiz", () => {
  it("counts correct answers and applies threshold", () => {
    const questions = [mcq, multi, mcq, mcq];
    const answers = [[2], [0, 3], [1], [2]]; // 3 of 4 correct
    const r = scoreQuiz(questions, answers, 3);
    expect(r).toEqual({ score: 3, passed: true });
    expect(scoreQuiz(questions, answers, 4).passed).toBe(false);
  });
});

describe("question time limit", () => {
  it("defaults to 60 seconds with server grace", () => {
    expect(QUESTION_TIME_LIMIT_MS).toBe(60_000);
    const servedAt = "2026-07-02T12:00:00.000Z";
    expect(answerWithinTimeLimit(servedAt, new Date("2026-07-02T12:01:15.000Z"))).toBe(true);
    expect(answerWithinTimeLimit(servedAt, new Date("2026-07-02T12:01:16.000Z"))).toBe(false);
  });

  it("keeps refreshes on the original server-authoritative deadline", () => {
    const servedAt = "2026-07-02T12:00:00.000Z";
    expect(questionRemainingMs(servedAt, new Date("2026-07-02T12:00:20.000Z"), 60_000)).toBe(40_000);
    expect(questionRemainingMs(servedAt, new Date("2026-07-02T12:01:01.000Z"), 60_000)).toBe(0);
    expect(questionRemainingMs("invalid", new Date("2026-07-02T12:00:20.000Z"), 60_000)).toBe(0);
  });
});

describe("canStartAttempt", () => {
  const now = new Date("2026-07-02T12:00:00Z");
  const base = {
    status: "ready" as const,
    attempts_used: 0,
    cooldown_until: null as string | null,
  };

  it("allows a fresh challenge", () => {
    expect(canStartAttempt(base, DEFAULT_CONFIG, now)).toEqual({ allowed: true });
  });

  it("blocks during cooldown", () => {
    const r = canStartAttempt(
      { ...base, attempts_used: 1, cooldown_until: "2026-07-02T12:10:00Z" },
      DEFAULT_CONFIG,
      now
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("cooldown");
  });

  it("allows after cooldown expires", () => {
    const r = canStartAttempt(
      { ...base, attempts_used: 1, cooldown_until: "2026-07-02T11:59:00Z" },
      DEFAULT_CONFIG,
      now
    );
    expect(r.allowed).toBe(true);
  });

  it("blocks when attempts exhausted", () => {
    const r = canStartAttempt({ ...base, attempts_used: 3 }, DEFAULT_CONFIG, now);
    expect(r).toEqual({ allowed: false, reason: "attempts_exhausted" });
  });

  it("blocks when not in ready state", () => {
    for (const status of ["awaiting_approval", "passed", "failed_assisted", "failed_final", "neutral", "superseded"] as const) {
      const r = canStartAttempt({ ...base, status }, DEFAULT_CONFIG, now);
      expect(r.allowed).toBe(false);
    }
  });
});

describe("nextCooldown", () => {
  it("returns ISO time cooldown_minutes after now", () => {
    const now = new Date("2026-07-02T12:00:00.000Z");
    expect(nextCooldown(DEFAULT_CONFIG, now)).toBe("2026-07-02T12:15:00.000Z");
  });
});
