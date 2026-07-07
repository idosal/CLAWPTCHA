import type { Env, Challenge } from "./types";
import { getChallenge, setChallengeStatus, randomToken } from "./store";
import {
  getCodeHoneypotSignals,
  getMultipleChoiceGate,
  hasHoneypotSignal,
  resolveConfig,
  type ClawptchaConfig,
} from "./config";
import type { Quiz, Question } from "./quiz/schema";
import {
  canStartAttempt, scoreQuiz, nextCooldown, answerWithinTimeLimit, type Answer,
} from "./quiz/grade";
import { checkAndRecordRate } from "./policy/ratelimit";
import { evaluateCodeHoneypotSignals } from "./policy/code-honeypot";
import { telemetrySchema, type Telemetry } from "./risk/report";
import type { GenerateResult } from "./quiz/generate";

export interface PrFilePatch {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
}

export interface PrContext {
  diff: string;
  title: string;
  body: string | null;
  files: string[];
  repoFullName?: string;
  prNumber?: number;
  headSha?: string;
  installationId?: number;
  changedLines?: number;
  filePatches?: PrFilePatch[];
}

export interface ResolvedChallenge {
  challenge: Challenge;
  outcome: "passed" | "failed_retry" | "failed_final" | "neutral";
  score?: number;
  total?: number;
  telemetry: Telemetry | null;
  cfg: ClawptchaConfig;
}

// All side-effectful collaborators are injected for testability.
export interface ChallengeDeps {
  generateQuiz(ctx: PrContext, cfg: ClawptchaConfig): Promise<GenerateResult>;
  verifyTurnstile(token: string): Promise<boolean>;
  fetchPrContext(challenge: Challenge): Promise<PrContext>;
  onChallengeResolved(resolved: ResolvedChallenge): Promise<void>;
  now(): Date;
}

export type StartResult =
  | { ok: true; quizId: string }
  | { ok: false; error: "not_found" | "not_author" | "not_ready" | "cooldown" | "attempts_exhausted" | "rate_limited" | "generation_failed" };

// Data custody (spec): once a challenge reaches a terminal state, quiz
// question content is deleted. Score/answers/telemetry are kept for audit.
async function purgeQuizQuestions(env: Env, challengeId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE quizzes SET questions_json='{"questions":[]}' WHERE challenge_id=?`
  ).bind(challengeId).run();
}

export async function startQuizAttempt(
  env: Env, deps: ChallengeDeps, challengeId: string, ghLogin: string, turnstileToken: string,
  honeypotTriggered = false
): Promise<StartResult> {
  const challenge = await getChallenge(env.DB, challengeId);
  if (!challenge) return { ok: false, error: "not_found" };
  if (challenge.author_login !== ghLogin) return { ok: false, error: "not_author" };

  const cfg = resolveConfig(challenge.config_json);
  const gate = canStartAttempt(challenge, cfg, deps.now());
  if (!gate.allowed) {
    return { ok: false, error: gate.reason === "not_ready" ? "not_ready" : gate.reason };
  }

  const rate = await checkAndRecordRate(env.DB, {
    user: `user:${ghLogin}`,
    repo: `repo:${challenge.repo_full_name}`,
    installation: `inst:${challenge.installation_id}`,
  }, deps.now());
  if (!rate.allowed) return { ok: false, error: "rate_limited" };

  // Turnstile informs the risk report; it never blocks (spec).
  const turnstileOk = await deps.verifyTurnstile(turnstileToken);

  const ctx = await deps.fetchPrContext(challenge);
  const codeHoneypot = evaluateCodeHoneypotSignals(ctx.diff, getCodeHoneypotSignals(cfg));
  const generated = await deps.generateQuiz(ctx, cfg);
  if (!generated.ok) {
    // Never block merges on our own failure: neutralize.
    await setChallengeStatus(env.DB, challenge.id, "neutral");
    // Terminal state: drop any question content from earlier attempts.
    // DB state (status, score, purge) is finalized before the GitHub callback —
    // a callback failure leaves consistent state for the cron sweep to reconcile.
    await purgeQuizQuestions(env, challenge.id);
    await deps.onChallengeResolved({
      challenge, outcome: "neutral", telemetry: null, cfg,
    });
    return { ok: false, error: "generation_failed" };
  }

  // A new attempt invalidates any quiz still open for this challenge.
  await env.DB.prepare(
    "UPDATE quizzes SET finished_at=? WHERE challenge_id=? AND finished_at IS NULL"
  ).bind(deps.now().toISOString(), challenge.id).run();

  const quizId = randomToken();
  const initialTelemetry: { honeypotTriggered?: boolean; codeHoneypotTriggered?: boolean } = {};
  if (hasHoneypotSignal(cfg) && honeypotTriggered) initialTelemetry.honeypotTriggered = true;
  if (codeHoneypot.triggered) initialTelemetry.codeHoneypotTriggered = true;
  await env.DB.prepare(
    `INSERT INTO quizzes (id, challenge_id, attempt_number, questions_json, question_served_at, turnstile_ok, telemetry_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    quizId, challenge.id, challenge.attempts_used + 1,
    JSON.stringify(generated.quiz), deps.now().toISOString(), turnstileOk ? 1 : 0,
    JSON.stringify(initialTelemetry)
  ).run();
  return { ok: true, quizId };
}

interface QuizRow {
  id: string; challenge_id: string; questions_json: string; current_question: number;
  question_served_at: string | null; answers_json: string; telemetry_json: string;
  turnstile_ok: number | null; finished_at: string | null;
}

export type SubmitResult =
  | { done: false; nextQuestion: number }
  | { done: true; passed: boolean; score: number; total: number }
  | { done: true; error: "not_found" | "already_finished" | "challenge_closed" };

interface PerQuestionTelemetry {
  elapsedMs: number; answerChanges: number; pointerDistancePx: number;
  pointerSamples: number; focusLossCount: number; webdriver: boolean;
}

interface StoredTelemetry {
  perQuestion: PerQuestionTelemetry[];
  honeypotTriggered: boolean;
  codeHoneypotTriggered: boolean;
}

function parseStoredTelemetry(json: string): StoredTelemetry {
  try {
    const parsed = JSON.parse(json || "{}") as {
      perQuestion?: unknown;
      honeypotTriggered?: unknown;
      codeHoneypotTriggered?: unknown;
    };
    return {
      perQuestion: Array.isArray(parsed.perQuestion)
        ? parsed.perQuestion as PerQuestionTelemetry[]
        : [],
      honeypotTriggered: parsed.honeypotTriggered === true,
      codeHoneypotTriggered: parsed.codeHoneypotTriggered === true,
    };
  } catch {
    return { perQuestion: [], honeypotTriggered: false, codeHoneypotTriggered: false };
  }
}

export async function submitAnswer(
  env: Env, deps: ChallengeDeps, quizId: string, questionIndex: number,
  answer: number[], telemetryJson: string, honeypotTriggered = false
): Promise<SubmitResult> {
  // Defense in depth: option indices outside the rendered range are discarded.
  answer = answer.filter((n) => Number.isInteger(n) && n >= 0 && n <= 3);

  const quiz = await env.DB.prepare(
    `SELECT q.*, ch.config_json
     FROM quizzes q JOIN challenges ch ON ch.id = q.challenge_id
     WHERE q.id=?`
  ).bind(quizId).first<QuizRow & { config_json: string }>();
  if (!quiz) return { done: true, error: "not_found" };
  if (quiz.finished_at) return { done: true, error: "already_finished" };

  // A stale/duplicate POST (back button, double submit) re-renders the current
  // question instead of consuming the next one.
  if (questionIndex !== quiz.current_question) {
    return { done: false, nextQuestion: quiz.current_question };
  }

  const questions = (JSON.parse(quiz.questions_json) as Quiz).questions;
  const answers = JSON.parse(quiz.answers_json) as Answer[];
  const now = deps.now();

  const withinTime = quiz.question_served_at !== null &&
    answerWithinTimeLimit(quiz.question_served_at, now);
  answers.push(withinTime ? answer : null);

  // accumulate per-question telemetry (best-effort; malformed input → skipped)
  const cfg = resolveConfig(quiz.config_json);
  const stored = parseStoredTelemetry(quiz.telemetry_json);
  const perQuestion = stored.perQuestion;
  const sawHoneypot = stored.honeypotTriggered || (hasHoneypotSignal(cfg) && honeypotTriggered);
  const sawCodeHoneypot = stored.codeHoneypotTriggered;
  try {
    perQuestion.push(JSON.parse(telemetryJson) as PerQuestionTelemetry);
  } catch { /* missing telemetry is itself a signal, handled at report time */ }

  const nextIndex = quiz.current_question + 1;
  const isLast = nextIndex >= questions.length;

  // Guarded write: if a concurrent duplicate already advanced or finished this
  // quiz, we lose the race and must not double-record or double-finalize.
  // next question's 90s window starts when it's first rendered (route stamps via COALESCE)
  const updated = await env.DB.prepare(
    `UPDATE quizzes SET answers_json=?, telemetry_json=?, current_question=?,
       question_served_at=?, finished_at=?
     WHERE id=? AND current_question=? AND finished_at IS NULL`
  ).bind(
    JSON.stringify(answers),
    JSON.stringify({
      perQuestion,
      honeypotTriggered: sawHoneypot,
      codeHoneypotTriggered: sawCodeHoneypot,
    }),
    nextIndex,
    null,
    isLast ? now.toISOString() : null,
    quizId,
    quiz.current_question
  ).run();
  if (updated.meta.changes === 0) return { done: true, error: "already_finished" };

  if (!isLast) return { done: false, nextQuestion: nextIndex };
  return finalizeQuiz(env, deps, quiz, questions, answers, perQuestion, sawHoneypot, sawCodeHoneypot, now);
}

async function finalizeQuiz(
  env: Env, deps: ChallengeDeps, quiz: QuizRow, questions: Question[],
  answers: Answer[], perQuestion: PerQuestionTelemetry[], honeypotTriggered: boolean,
  codeHoneypotTriggered: boolean, now: Date
): Promise<SubmitResult> {
  const challenge = (await getChallenge(env.DB, quiz.challenge_id))!;
  // Outcomes only apply to a live challenge. A quiz finishing after the
  // challenge left `ready` (failed_final, superseded, passed via another quiz,
  // neutral) must not override that state — pre-starting multiple quizzes
  // would otherwise bypass the attempt cap and cooldown entirely.
  if (challenge.status !== "ready") {
    return { done: true, error: "challenge_closed" };
  }
  const cfg = resolveConfig(challenge.config_json);
  const quizGate = getMultipleChoiceGate(cfg);
  const { score, passed } = scoreQuiz(questions, answers, quizGate.pass_threshold);

  await env.DB.prepare("UPDATE quizzes SET score=? WHERE id=?").bind(score, quiz.id).run();

  const telemetry: Telemetry | null =
    perQuestion.length === 0 && !honeypotTriggered && !codeHoneypotTriggered
      ? null
      : telemetrySchema.parse({
        perQuestionMs: perQuestion.map((t) => t.elapsedMs),
        answerChanges: perQuestion.reduce((a, t) => a + t.answerChanges, 0),
        pointerDistancePx: perQuestion.reduce((a, t) => a + t.pointerDistancePx, 0),
        pointerSamples: perQuestion.reduce((a, t) => a + t.pointerSamples, 0),
        focusLossCount: perQuestion.reduce((a, t) => a + t.focusLossCount, 0),
        webdriver: perQuestion.some((t) => t.webdriver),
        turnstileOk: quiz.turnstile_ok === 1,
        honeypotTriggered,
        codeHoneypotTriggered,
      });

  let outcome: ResolvedChallenge["outcome"];
  if (passed) {
    outcome = "passed";
    await setChallengeStatus(env.DB, challenge.id, "passed");
  } else {
    const attemptsUsed = challenge.attempts_used + 1;
    if (attemptsUsed >= cfg.max_attempts) {
      outcome = "failed_final";
      await env.DB.prepare("UPDATE challenges SET status='failed_final', attempts_used=? WHERE id=?")
        .bind(attemptsUsed, challenge.id).run();
    } else {
      outcome = "failed_retry";
      await env.DB.prepare("UPDATE challenges SET attempts_used=?, cooldown_until=? WHERE id=?")
        .bind(attemptsUsed, nextCooldown(cfg, now), challenge.id).run();
    }
  }

  // Terminal states only: retryable failures get a fresh quiz next attempt,
  // but the challenge itself is still live.
  // DB state (status, score, purge) is finalized before the GitHub callback —
  // a callback failure leaves consistent state for the cron sweep to reconcile.
  if (outcome === "passed" || outcome === "failed_final") {
    await purgeQuizQuestions(env, challenge.id);
  }

  const fresh = (await getChallenge(env.DB, challenge.id))!;
  await deps.onChallengeResolved({
    challenge: fresh, outcome, score, total: questions.length, telemetry, cfg,
  });
  return { done: true, passed, score, total: questions.length };
}
