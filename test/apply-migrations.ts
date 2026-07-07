import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM quizzes"),
    env.DB.prepare("DELETE FROM pr_investigations"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM challenges"),
    env.DB.prepare("DELETE FROM installations"),
    env.DB.prepare("DELETE FROM rate_events"),
  ]);
});
