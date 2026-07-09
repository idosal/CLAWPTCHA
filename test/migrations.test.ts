import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

describe("D1 migrations", () => {
  it("applies all tables to the test database", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const t of ["installations", "challenges", "quizzes", "sessions", "rate_events", "pr_investigations", "prepared_quizzes"]) {
      expect(names).toContain(t);
    }
  });

  it("supports an insert/select round-trip", async () => {
    await env.DB.prepare(
      "INSERT INTO installations (id, account_login) VALUES (1, 'octocat')"
    ).run();
    const row = await env.DB.prepare("SELECT account_login FROM installations WHERE id=1")
      .first<{ account_login: string }>();
    expect(row?.account_login).toBe("octocat");
  });
});
