import type { Challenge, ChallengeStatus, PrInvestigation, PreparedQuiz } from "./types";
import type { Quiz } from "./quiz/schema";

export function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getChallengeByPr(
  db: D1Database, repo: string, prNumber: number, headSha: string
): Promise<Challenge | null> {
  return db
    .prepare("SELECT * FROM challenges WHERE repo_full_name=? AND pr_number=? AND head_sha=?")
    .bind(repo, prNumber, headSha)
    .first<Challenge>();
}

export async function getChallenge(db: D1Database, id: string): Promise<Challenge | null> {
  return db.prepare("SELECT * FROM challenges WHERE id=?").bind(id).first<Challenge>();
}

export async function getLatestChallengeForPr(
  db: D1Database, repo: string, prNumber: number
): Promise<Challenge | null> {
  return db
    .prepare(
      "SELECT * FROM challenges WHERE repo_full_name=? AND pr_number=? ORDER BY created_at DESC, rowid DESC LIMIT 1"
    )
    .bind(repo, prNumber)
    .first<Challenge>();
}

export async function hasPassedChallenge(
  db: D1Database, repo: string, prNumber: number
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS x FROM challenges WHERE repo_full_name=? AND pr_number=? AND status='passed' LIMIT 1"
    )
    .bind(repo, prNumber)
    .first();
  return row !== null;
}

export async function insertChallenge(db: D1Database, c: Omit<Challenge, "created_at">): Promise<void> {
  await db
    .prepare(
      `INSERT INTO challenges
       (id, installation_id, repo_full_name, pr_number, head_sha, author_login,
        check_run_id, status, approved_by, attempts_used, cooldown_until, config_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      c.id, c.installation_id, c.repo_full_name, c.pr_number, c.head_sha, c.author_login,
      c.check_run_id, c.status, c.approved_by, c.attempts_used, c.cooldown_until, c.config_json
    )
    .run();
}

export async function updateChallengeCheckRun(
  db: D1Database, repo: string, prNumber: number, headSha: string, checkRunId: number
): Promise<void> {
  await db.prepare(
    "UPDATE challenges SET check_run_id=? WHERE repo_full_name=? AND pr_number=? AND head_sha=?"
  ).bind(checkRunId, repo, prNumber, headSha).run();
}

export async function setChallengeStatus(
  db: D1Database, id: string, status: ChallengeStatus, approvedBy?: string
): Promise<void> {
  if (approvedBy !== undefined) {
    await db.prepare("UPDATE challenges SET status=?, approved_by=? WHERE id=?")
      .bind(status, approvedBy, id).run();
  } else {
    await db.prepare("UPDATE challenges SET status=? WHERE id=?").bind(status, id).run();
  }
}

export async function supersedeOldChallenges(
  db: D1Database, repo: string, prNumber: number, keepHeadSha: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE challenges SET status='superseded'
       WHERE repo_full_name=? AND pr_number=? AND head_sha != ?
         AND status IN ('awaiting_approval','ready')`
    )
    .bind(repo, prNumber, keepHeadSha)
    .run();
}

export async function getInvestigationByPr(
  db: D1Database, repo: string, prNumber: number, headSha: string
): Promise<PrInvestigation | null> {
  return db
    .prepare(
      `SELECT * FROM pr_investigations
       WHERE repo_full_name=? AND pr_number=? AND head_sha=?
       LIMIT 1`
    )
    .bind(repo, prNumber, headSha)
    .first<PrInvestigation>();
}

export async function upsertInvestigation(
  db: D1Database,
  investigation: Omit<PrInvestigation, "created_at" | "updated_at">
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO pr_investigations
       (id, repo_full_name, pr_number, head_sha, source, status, artifact_json, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(repo_full_name, pr_number, head_sha) DO UPDATE SET
         source=excluded.source,
         status=excluded.status,
         artifact_json=excluded.artifact_json,
         error=excluded.error,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    )
    .bind(
      investigation.id,
      investigation.repo_full_name,
      investigation.pr_number,
      investigation.head_sha,
      investigation.source,
      investigation.status,
      investigation.artifact_json,
      investigation.error
    )
    .run();
}

export async function getPreparedQuiz(
  db: D1Database,
  challengeId: string
): Promise<PreparedQuiz | null> {
  return db.prepare(
    "SELECT challenge_id, questions_json, created_at, updated_at FROM prepared_quizzes WHERE challenge_id=?"
  ).bind(challengeId).first<PreparedQuiz>();
}

export async function upsertPreparedQuiz(
  db: D1Database,
  challengeId: string,
  quiz: Quiz
): Promise<void> {
  await db.prepare(
    `INSERT INTO prepared_quizzes (challenge_id, questions_json)
     VALUES (?, ?)
     ON CONFLICT(challenge_id) DO UPDATE SET
       questions_json=excluded.questions_json,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`
  ).bind(challengeId, JSON.stringify(quiz)).run();
}

export async function deletePreparedQuiz(db: D1Database, challengeId: string): Promise<void> {
  await db.prepare("DELETE FROM prepared_quizzes WHERE challenge_id=?")
    .bind(challengeId)
    .run();
}

export interface ChallengeSession {
  id: string;
  challenge_id: string;
  gh_login: string | null;
  verify_code: string | null;
  created_at: string;
}

export async function getSession(db: D1Database, id: string): Promise<ChallengeSession | null> {
  return db.prepare(
    "SELECT id, challenge_id, gh_login, verify_code, created_at FROM sessions WHERE id=?"
  ).bind(id).first<ChallengeSession>();
}

export async function insertVerificationSession(
  db: D1Database,
  id: string,
  challengeId: string,
  verifyCode: string
): Promise<void> {
  await db.prepare(
    "INSERT INTO sessions (id, challenge_id, verify_code) VALUES (?, ?, ?)"
  ).bind(id, challengeId, verifyCode).run();
}

export async function setSessionVerifyCode(
  db: D1Database,
  id: string,
  verifyCode: string
): Promise<void> {
  await db.prepare("UPDATE sessions SET verify_code=? WHERE id=?")
    .bind(verifyCode, id).run();
}

export async function verifySessionFromComment(
  db: D1Database,
  challengeId: string,
  verifyCode: string,
  login: string
): Promise<boolean> {
  const session = await db.prepare(
    "SELECT id FROM sessions WHERE challenge_id=? AND verify_code=? AND gh_login IS NULL LIMIT 1"
  ).bind(challengeId, verifyCode).first<{ id: string }>();
  if (!session) return false;
  const updated = await db.prepare(
    "UPDATE sessions SET gh_login=?, verify_code=NULL WHERE id=? AND gh_login IS NULL"
  ).bind(login, session.id).run();
  return updated.meta.changes > 0;
}
