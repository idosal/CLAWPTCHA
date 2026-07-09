import type { Env, Challenge } from "./types";
import {
  deletePreparedQuiz,
  getChallenge,
  getPreparedQuiz,
  randomToken,
  setChallengeStatus,
  upsertPreparedQuiz,
} from "./store";
import {
  getCodeHoneypotSignals,
  getMultipleChoiceGate,
  hasHoneypotSignal,
  resolveConfig,
  type VouchaConfig,
} from "./config";
import { validateQuiz, type Quiz, type Question } from "./quiz/schema";
import {
  canStartAttempt, scoreQuiz, nextCooldown, answerWithinTimeLimit, type Answer,
} from "./quiz/grade";
import { checkAndRecordRate } from "./policy/ratelimit";
import { evaluateCodeHoneypotSignals } from "./policy/code-honeypot";
import { buildRiskReport, telemetrySchema, type Telemetry } from "./risk/report";
import type { GenerateResult } from "./quiz/generate";
import { normalizeGitHubLogin, sameGitHubLogin } from "./github/login";

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
  outcome: "passed" | "failed_retry" | "failed_assisted" | "failed_final" | "neutral";
  score?: number;
  total?: number;
  telemetry: Telemetry | null;
  cfg: VouchaConfig;
  failureReason?: string;
}

// All side-effectful collaborators are injected for testability.
export interface ChallengeDeps {
  generateQuiz(ctx: PrContext, cfg: VouchaConfig): Promise<GenerateResult>;
  verifyTurnstile(token: string): Promise<boolean>;
  fetchPrContext(challenge: Challenge): Promise<PrContext>;
  onChallengeResolved(resolved: ResolvedChallenge): Promise<void>;
  now(): Date;
}

export type StartResult =
  | { ok: true; quizId: string }
  | { ok: false; error: "not_found" | "not_author" | "not_ready" | "cooldown" | "attempts_exhausted" | "rate_limited" | "generation_failed" }
  | { ok: false; error: "bot_detected"; reason: string };

export const TURNSTILE_BOT_FAILURE_REASON = "Turnstile did not validate this browser session.";
export const WEBDRIVER_BOT_FAILURE_REASON = "The browser identified itself as automated software.";

// Data custody (spec): once a challenge reaches a terminal state, quiz
// question content is deleted. Score/answers/telemetry are kept for audit.
async function purgeQuizQuestions(env: Env, challengeId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE quizzes SET questions_json='{"questions":[]}' WHERE challenge_id=?`
  ).bind(challengeId).run();
}

async function notifyChallengeResolved(
  deps: ChallengeDeps,
  resolved: ResolvedChallenge
): Promise<void> {
  try {
    await deps.onChallengeResolved(resolved);
  } catch (err) {
    console.error("challenge resolution callback failed", resolved.challenge.id, err);
  }
}

async function failChallengeForBotSignal(
  env: Env,
  deps: ChallengeDeps,
  challenge: Challenge,
  cfg: VouchaConfig,
  reason: string,
  now: Date
): Promise<StartResult> {
  const quizId = randomToken();
  const gate = getMultipleChoiceGate(cfg);
  const telemetry = telemetrySchema.parse({ turnstileOk: false });

  await env.DB.prepare(
    "UPDATE quizzes SET finished_at=? WHERE challenge_id=? AND finished_at IS NULL"
  ).bind(now.toISOString(), challenge.id).run();
  await env.DB.prepare(
    `INSERT INTO quizzes (id, challenge_id, attempt_number, questions_json, question_served_at,
       turnstile_ok, telemetry_json, finished_at, score)
     VALUES (?, ?, ?, '{"questions":[]}', NULL, 0, ?, ?, 0)`
  ).bind(
    quizId,
    challenge.id,
    challenge.attempts_used + 1,
    JSON.stringify({ botFailureReason: reason }),
    now.toISOString()
  ).run();
  await env.DB.prepare(
    "UPDATE challenges SET status='failed_assisted', attempts_used=?, cooldown_until=NULL WHERE id=?"
  ).bind(challenge.attempts_used + 1, challenge.id).run();

  const fresh = (await getChallenge(env.DB, challenge.id))!;
  await notifyChallengeResolved(deps, {
    challenge: fresh,
    outcome: "failed_assisted",
    score: 0,
    total: gate.questions,
    telemetry,
    cfg,
    failureReason: reason,
  });
  return { ok: false, error: "bot_detected", reason };
}

async function takePreparedQuiz(env: Env, challengeId: string, questionCount: number): Promise<Quiz | null> {
  const prepared = await getPreparedQuiz(env.DB, challengeId);
  if (!prepared) return null;
  await deletePreparedQuiz(env.DB, challengeId);
  try {
    const parsed = validateQuiz(JSON.parse(prepared.questions_json), questionCount);
    if (parsed.ok) return parsed.quiz;
    console.error("prepared quiz validation failed", { challengeId, error: parsed.error });
    return null;
  } catch (err) {
    console.error("prepared quiz JSON invalid", { challengeId, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function prepareQuizForChallenge(
  env: Env,
  deps: ChallengeDeps,
  challengeId: string
): Promise<void> {
  const challenge = await getChallenge(env.DB, challengeId);
  if (!challenge) return;
  const cfg = resolveConfig(challenge.config_json);
  const gate = canStartAttempt(challenge, cfg, deps.now());
  if (!gate.allowed) return;
  if (await getPreparedQuiz(env.DB, challenge.id)) return;

  const ctx = await deps.fetchPrContext(challenge);
  const generated = await deps.generateQuiz(ctx, cfg);
  if (!generated.ok) {
    console.error("prepared quiz generation failed", {
      challengeId: challenge.id,
      repo: challenge.repo_full_name,
      prNumber: challenge.pr_number,
      headSha: challenge.head_sha,
      error: generated.error,
    });
    return;
  }

  await upsertPreparedQuiz(env.DB, challenge.id, generated.quiz);
}

export async function startQuizAttempt(
  env: Env, deps: ChallengeDeps, challengeId: string, ghLogin: string, turnstileToken: string,
  honeypotTriggered = false
): Promise<StartResult> {
  const challenge = await getChallenge(env.DB, challengeId);
  if (!challenge) return { ok: false, error: "not_found" };
  if (!sameGitHubLogin(challenge.author_login, ghLogin)) return { ok: false, error: "not_author" };

  const cfg = resolveConfig(challenge.config_json);
  const now = deps.now();
  const gate = canStartAttempt(challenge, cfg, now);
  if (!gate.allowed) {
    return { ok: false, error: gate.reason === "not_ready" ? "not_ready" : gate.reason };
  }

  const rate = await checkAndRecordRate(env.DB, {
    user: `user:${normalizeGitHubLogin(ghLogin)}`,
    repo: `repo:${challenge.repo_full_name}`,
    installation: `inst:${challenge.installation_id}`,
  }, now);
  if (!rate.allowed) return { ok: false, error: "rate_limited" };

  const turnstileOk = await deps.verifyTurnstile(turnstileToken);
  if (!turnstileOk) {
    return failChallengeForBotSignal(env, deps, challenge, cfg, TURNSTILE_BOT_FAILURE_REASON, now);
  }

  const codeHoneypotSignals = getCodeHoneypotSignals(cfg);
  const preparedQuiz = await takePreparedQuiz(env, challenge.id, getMultipleChoiceGate(cfg).questions);
  let codeHoneypot = { triggered: false };
  let generated: GenerateResult;
  if (preparedQuiz) {
    if (codeHoneypotSignals.length > 0) {
      const ctx = await deps.fetchPrContext(challenge);
      codeHoneypot = evaluateCodeHoneypotSignals(ctx.diff, codeHoneypotSignals);
    }
    generated = { ok: true, quiz: preparedQuiz };
  } else {
    const ctx = await deps.fetchPrContext(challenge);
    codeHoneypot = evaluateCodeHoneypotSignals(ctx.diff, codeHoneypotSignals);
    generated = await deps.generateQuiz(ctx, cfg);
  }
  if (!generated.ok) {
    console.error("quiz generation failed", {
      challengeId: challenge.id,
      repo: challenge.repo_full_name,
      prNumber: challenge.pr_number,
      headSha: challenge.head_sha,
      error: generated.error,
    });
    // Never block merges on our own failure: neutralize.
    await setChallengeStatus(env.DB, challenge.id, "neutral");
    // Terminal state: drop any question content from earlier attempts.
    // DB state (status, score, purge) is finalized before the GitHub callback —
    // a callback failure leaves consistent state for the cron sweep to reconcile.
    await purgeQuizQuestions(env, challenge.id);
    await notifyChallengeResolved(deps, {
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
    JSON.stringify(generated.quiz), now.toISOString(), turnstileOk ? 1 : 0,
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
  | { done: true; passed: boolean; score: number; total: number; failureReason?: string }
  | { done: true; error: "not_found" | "already_finished" | "challenge_closed" };

interface PerQuestionTelemetry {
  elapsedMs: number; answerChanges: number; pointerDistancePx: number;
  pointerSamples: number; focusLossCount: number; webdriver: boolean;
}

interface StoredTelemetry {
  perQuestion: PerQuestionTelemetry[];
  honeypotTriggered: boolean;
  codeHoneypotTriggered: boolean;
  botFailureReason?: string;
}

function parseStoredTelemetry(json: string): StoredTelemetry {
  try {
    const parsed = JSON.parse(json || "{}") as {
      perQuestion?: unknown;
      honeypotTriggered?: unknown;
      codeHoneypotTriggered?: unknown;
      botFailureReason?: unknown;
    };
    return {
      perQuestion: Array.isArray(parsed.perQuestion)
        ? parsed.perQuestion as PerQuestionTelemetry[]
        : [],
      honeypotTriggered: parsed.honeypotTriggered === true,
      codeHoneypotTriggered: parsed.codeHoneypotTriggered === true,
      botFailureReason: typeof parsed.botFailureReason === "string" ? parsed.botFailureReason : undefined,
    };
  } catch {
    return { perQuestion: [], honeypotTriggered: false, codeHoneypotTriggered: false };
  }
}

function botFailureReasonForQuiz(quiz: QuizRow, perQuestion: PerQuestionTelemetry[]): string | undefined {
  if (quiz.turnstile_ok === 0) return TURNSTILE_BOT_FAILURE_REASON;
  if (perQuestion.some((t) => t.webdriver)) return WEBDRIVER_BOT_FAILURE_REASON;
  return undefined;
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
  // next question's 60s window starts when it's first rendered (route stamps via COALESCE)
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
  const { score, passed: scorePassed } = scoreQuiz(questions, answers, quizGate.pass_threshold);
  const botFailureReason = botFailureReasonForQuiz(quiz, perQuestion);

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
  const report = buildRiskReport(telemetry);
  const assistanceReason = botFailureReason ??
    (scorePassed && report.automationLikely ? "Challenge assistance signals were detected." : undefined);
  const passed = scorePassed && !assistanceReason;

  if (assistanceReason) {
    await env.DB.prepare("UPDATE quizzes SET score=?, telemetry_json=? WHERE id=?").bind(
      score,
      JSON.stringify({
        perQuestion,
        honeypotTriggered,
        codeHoneypotTriggered,
        botFailureReason: assistanceReason,
      }),
      quiz.id
    ).run();
  } else {
    await env.DB.prepare("UPDATE quizzes SET score=? WHERE id=?").bind(score, quiz.id).run();
  }

  let outcome: ResolvedChallenge["outcome"];
  if (passed) {
    outcome = "passed";
    await setChallengeStatus(env.DB, challenge.id, "passed");
  } else if (assistanceReason) {
    outcome = "failed_assisted";
    await env.DB.prepare("UPDATE challenges SET status='failed_assisted', attempts_used=?, cooldown_until=NULL WHERE id=?")
      .bind(challenge.attempts_used + 1, challenge.id).run();
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
  if (outcome === "passed" || outcome === "failed_assisted" || outcome === "failed_final") {
    await purgeQuizQuestions(env, challenge.id);
  }

  const fresh = (await getChallenge(env.DB, challenge.id))!;
  await notifyChallengeResolved(deps, {
    challenge: fresh, outcome, score, total: questions.length, telemetry, cfg,
    failureReason: assistanceReason,
  });
  const result = { done: true as const, passed, score, total: questions.length };
  return assistanceReason ? { ...result, failureReason: assistanceReason } : result;
}
