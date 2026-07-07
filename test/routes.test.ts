import { describe, it, expect, vi } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker, { challengeDeps } from "../src/index";
import { signBody } from "../src/github/webhook";
import { DEFAULT_CONFIG } from "../src/config";
import type { Env } from "../src/types";
import type { PrContext } from "../src/challenge";

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

describe("GET /", () => {
  it("serves the public CLAWPTCHA website", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://clawptcha.example.com/"), testEnv, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("CLAWPTCHA");
    expect(html).toContain("Deploy to Cloudflare");
    expect(html).toContain("clawptcha.example.com");
  });
});

describe("GET /docs", () => {
  it("redirects the bare docs path to the Starlight root", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://clawptcha.example.com/docs"), testEnv, ctx);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/docs/");
  });

  it("serves Starlight docs through the assets binding", async () => {
    const docsEnv = {
      ...testEnv,
      ASSETS: {
        fetch: async (request: Request) => {
          const url = new URL(request.url);
          return new Response(`docs asset ${url.pathname}`, {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        },
      },
    } as unknown as Env;
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://clawptcha.example.com/docs/"), docsEnv, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("docs asset /docs/");
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

describe("challengeDeps.generateQuiz fail-open seam", () => {
  // End-to-end proof (real challengeDeps, no mocked generateQuiz) that a broken
  // LLM env degrades to a failed generation instead of throwing. The unit that
  // needs coverage is the `if (!selected.ok)` branch inside challengeDeps —
  // providerFromEnv is exercised in isolation elsewhere, and the mocked
  // {ok:false} -> neutral path is covered in challenge.test.ts.
  const fakeCtx: PrContext = { diff: "d", title: "t", body: null, files: ["a.ts"] };

  it("resolves to {ok:false} (never rejects) when the provider is misconfigured", async () => {
    // anthropic provider with LLM_API_KEY unset — the realistic misconfig.
    const brokenEnv = { ...testEnv, LLM_PROVIDER: "anthropic", LLM_API_KEY: undefined } as unknown as Env;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const deps = challengeDeps(brokenEnv);
      const result = await deps.generateQuiz(fakeCtx, DEFAULT_CONFIG);
      expect(result).toEqual({
        ok: false,
        error: 'LLM_PROVIDER "anthropic" requires LLM_API_KEY',
      });
      expect(errorSpy).toHaveBeenCalledWith(
        "LLM provider misconfigured:",
        'LLM_PROVIDER "anthropic" requires LLM_API_KEY'
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("does not fall back to direct diff generation when a large Flue investigation fails", async () => {
    const envWithFlue = {
      ...testEnv,
      LLM_PROVIDER: "openai-compat",
      LLM_BASE_URL: "https://llm.example/v1",
      FLUE_INVESTIGATOR_URL: "https://flue.example",
      FLUE_INVESTIGATOR_SECRET: "secret",
    } as unknown as Env;
    const fetchCalls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.startsWith("https://flue.example/")) {
        return new Response(JSON.stringify({
          result: { ok: false, error: "agent could not inspect PR" },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const deps = challengeDeps(envWithFlue);
      const result = await deps.generateQuiz({
        ...fakeCtx,
        repoFullName: "o/r",
        prNumber: 9991,
        headSha: "flue-fail-sha",
        changedLines: DEFAULT_CONFIG.context.large_pr.changed_lines,
      }, DEFAULT_CONFIG);

      expect(result).toEqual({ ok: false, error: "agent could not inspect PR" });
      expect(fetchCalls).toEqual(["https://flue.example/workflows/investigate-pr?wait=result"]);
      const row = await testEnv.DB.prepare(
        "SELECT source, status FROM pr_investigations WHERE repo_full_name='o/r' AND pr_number=9991 AND head_sha='flue-fail-sha'"
      ).first<{ source: string; status: string }>();
      expect(row).toEqual({ source: "flue", status: "failed" });
    } finally {
      errorSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe("GET /oauth/callback (login-CSRF guard)", () => {
  it("rejects a callback whose state matches a session but whose request has no matching cookie", async () => {
    // A session + state exists (created by some browser), but the request
    // completing OAuth carries no clawptcha_session cookie for that session —
    // the login-CSRF scenario. gh_login must NOT be written.
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('chCsrf', 1, 'o/r', 2, 's2', 'alice', 'ready', '{}')`
    ).run();
    await testEnv.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, oauth_state) VALUES ('sessCsrf', 'chCsrf', 'stateCsrf')"
    ).run();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/oauth/callback?code=abc&state=stateCsrf"),
      testEnv,
      ctx
    );
    expect(res.status).toBe(400);
    const row = await testEnv.DB.prepare("SELECT gh_login, oauth_state FROM sessions WHERE id='sessCsrf'")
      .first<{ gh_login: string | null; oauth_state: string | null }>();
    expect(row?.gh_login).toBeNull();       // identity was not bound
    expect(row?.oauth_state).toBe("stateCsrf"); // state not consumed
  });

  it("shows a canceled-sign-in page when GitHub returns error=access_denied", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/oauth/callback?error=access_denied&state=whatever"),
      testEnv,
      ctx
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("canceled");
  });
});
