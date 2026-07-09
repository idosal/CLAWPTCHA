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

// Per-IP cap on anonymous challenge-session creation. Every cookie-less visit
// to a (public) challenge URL mints a `sessions` row; without a cap, a known
// challenge id could be requested in a loop to grow that table. This bounds new
// sessions per client IP within the same sliding window (reusing rate_events,
// which the cron sweep already purges). Cloudflare edge limits sit in front of
// this; it is a storage-amplification guard, not a hard security boundary, so
// the same non-atomic check-then-insert caveat as above applies.
export const SESSION_CREATE_LIMIT = 60;

export async function allowSessionCreation(
  db: D1Database,
  clientIp: string,
  now: Date
): Promise<boolean> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const scope = `sess:${clientIp}`;
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM rate_events WHERE scope = ? AND created_at >= ?")
    .bind(scope, since)
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= SESSION_CREATE_LIMIT) return false;
  await db
    .prepare("INSERT INTO rate_events (scope, created_at) VALUES (?, ?)")
    .bind(scope, now.toISOString())
    .run();
  return true;
}
