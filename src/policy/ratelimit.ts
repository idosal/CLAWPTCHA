// Sliding 1-hour window caps on quiz *generations* (the expensive LLM call).
export const RATE_LIMITS = { user: 6, repo: 20, installation: 60 } as const;
const WINDOW_MS = 60 * 60 * 1000;

export interface RateScopes {
  user: string;         // "user:<login>"
  repo: string;         // "repo:<owner/name>"
  installation: string; // "inst:<id>"
}

export type RateResult = { allowed: true } | { allowed: false; scope: keyof typeof RATE_LIMITS };

// NOTE: check-then-insert is not atomic (D1 has no cross-statement
// read-modify-write transaction from a Worker). Two concurrent calls can both
// pass the count check, so caps can overshoot by roughly the concurrency
// level. Accepted: this is a cost-control limiter, not a security boundary,
// and the overshoot is bounded and small.
export async function checkAndRecordRate(
  db: D1Database,
  scopes: RateScopes,
  now: Date
): Promise<RateResult> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  for (const key of ["user", "repo", "installation"] as const) {
    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM rate_events WHERE scope = ? AND created_at >= ?")
      .bind(scopes[key], since)
      .first<{ n: number }>();
    if ((row?.n ?? 0) >= RATE_LIMITS[key]) return { allowed: false, scope: key };
  }
  await db.batch([
    db.prepare("INSERT INTO rate_events (scope, created_at) VALUES (?, ?)").bind(scopes.user, now.toISOString()),
    db.prepare("INSERT INTO rate_events (scope, created_at) VALUES (?, ?)").bind(scopes.repo, now.toISOString()),
    db.prepare("INSERT INTO rate_events (scope, created_at) VALUES (?, ?)").bind(scopes.installation, now.toISOString()),
  ]);
  return { allowed: true };
}
