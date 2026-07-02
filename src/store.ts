import type { Challenge, ChallengeStatus } from "./types";

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
