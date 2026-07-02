import { describe, it, expect } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/index";
import { signBody } from "../src/github/webhook";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

describe("POST /webhook", () => {
  it("rejects unsigned payloads", async () => {
    const req = new Request("https://x/webhook", { method: "POST", body: "{}" });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, testEnv, ctx);
    expect(res.status).toBe(401);
  });

  it("accepts a signed payload", async () => {
    const body = JSON.stringify({ action: "labeled", installation: { id: 1 } }); // ignored action
    const sig = await signBody(testEnv.GITHUB_WEBHOOK_SECRET, body);
    const req = new Request("https://x/webhook", {
      method: "POST", body,
      headers: { "x-hub-signature-256": sig, "x-github-event": "pull_request" },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
  });
});

describe("GET /challenge/:id", () => {
  it("404s for unknown challenge ids", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/challenge/nope"), testEnv, ctx);
    expect(res.status).toBe(404);
  });

  it("redirects anonymous visitors to GitHub OAuth", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('ch1', 1, 'o/r', 1, 's', 'alice', 'ready', '{}')`
    ).run();
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/challenge/ch1"), testEnv, ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("github.com/login/oauth/authorize");
    expect(res.headers.get("set-cookie")).toContain("clawptcha_session");
  });
});
