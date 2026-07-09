import type { Question } from "./schema";
import type { VouchaConfig } from "../config";
import type { ChallengeStatus } from "../types";

// answers: selected option indices; null = question timed out unanswered.
export type Answer = number[] | null;

export function gradeAnswer(q: Question, answer: Answer): boolean {
  if (answer === null || answer.length === 0) return false;
  const got = [...new Set(answer)].sort((a, b) => a - b);
  const want = [...q.correct].sort((a, b) => a - b);
  return got.length === want.length && got.every((v, i) => v === want[i]);
}

export function scoreQuiz(
  questions: Question[],
  answers: Answer[],
  passThreshold: number
): { score: number; passed: boolean } {
  const score = questions.reduce(
    (acc, q, i) => acc + (gradeAnswer(q, answers[i] ?? null) ? 1 : 0),
    0
  );
  return { score, passed: score >= passThreshold };
}

export interface AttemptState {
  status: ChallengeStatus;
  attempts_used: number;
  cooldown_until: string | null;
}

export type AttemptGate =
  | { allowed: true }
  | { allowed: false; reason: "not_ready" | "attempts_exhausted" | "cooldown" };

export function canStartAttempt(
  state: AttemptState,
  cfg: VouchaConfig,
  now: Date
): AttemptGate {
  if (state.status !== "ready") return { allowed: false, reason: "not_ready" };
  if (state.attempts_used >= cfg.max_attempts) {
    return { allowed: false, reason: "attempts_exhausted" };
  }
  if (state.cooldown_until && new Date(state.cooldown_until) > now) {
    return { allowed: false, reason: "cooldown" };
  }
  return { allowed: true };
}

export function nextCooldown(cfg: VouchaConfig, now: Date): string {
  return new Date(now.getTime() + cfg.cooldown_minutes * 60_000).toISOString();
}

// Server-side per-question time limit: 60s + 15s grace for network latency.
export const QUESTION_TIME_LIMIT_MS = 60_000;
const QUESTION_GRACE_MS = 15_000;

export function answerWithinTimeLimit(servedAt: string, now: Date): boolean {
  return now.getTime() - new Date(servedAt).getTime() <= QUESTION_TIME_LIMIT_MS + QUESTION_GRACE_MS;
}
