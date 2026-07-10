import { describe, it, expect, vi } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker, { challengeDeps } from "../src/index";
import { signBody } from "../src/github/webhook";
import { signSessionCookie } from "../src/ui/session";
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
  it("serves the public VOUCHA website", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://voucha.example.com/"), testEnv, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("VOUCHA");
    expect(html).toContain("Deploy to Cloudflare");
    expect(html).toContain("Install on GitHub");
    expect(html).toContain("Privacy, permissions, configuration, and verification details live in the docs.");
    expect(html).toContain('<link rel="canonical" href="https://voucha.example.com">');
  });
});

describe("GET /docs", () => {
  it("redirects the bare docs path to the Starlight root", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://voucha.example.com/docs"), testEnv, ctx);

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
    const res = await worker.fetch(new Request("https://voucha.example.com/docs/"), docsEnv, ctx);

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

  it("shows anonymous visitors a GitHub comment verification command", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('ch1', 1, 'o/r', 1, 's', 'alice', 'ready', '{}')`
    ).run();
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/challenge/ch1"), testEnv, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("voucha_session");
    const html = await res.text();
    expect(html).toContain("Verify from the PR.");
    expect(html).toContain("/voucha verify ");
    expect(html).toContain("https://github.com/o/r/pull/1#issuecomment-new");
    expect(html).toContain('id="openPrLink"');
    expect(html).toContain("Open PR");
    expect(html).toContain("/challenge/ch1/verify/status");
    expect(html).toContain("cannot comment, approve, or answer on your behalf");
    const row = await testEnv.DB.prepare(
      "SELECT gh_login, verify_code FROM sessions WHERE challenge_id='ch1'"
    ).first<{ gh_login: string | null; verify_code: string | null }>();
    expect(row?.gh_login).toBeNull();
    expect(row?.verify_code).toMatch(/^[a-f0-9]{12}$/);
  });

  it("does not create a verification session before maintainer approval", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('chAwaiting', 1, 'o/r', 2, 's2', 'alice', 'awaiting_approval', '{}')`
    ).run();
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/challenge/chAwaiting"), testEnv, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toContain("Awaiting approval");
    const row = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM sessions WHERE challenge_id='chAwaiting'"
    ).first<{ count: number }>();
    expect(row?.count).toBe(0);
  });

  it("reports verification status for the current browser session", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('chVerifyStatus', 1, 'o/r', 4, 's4', 'alice', 'ready', '{}')`
    ).run();
    await testEnv.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, gh_login, verify_code) VALUES ('sessVerifyStatus', 'chVerifyStatus', NULL, 'abc123')"
    ).run();
    const cookie = await signSessionCookie(testEnv.SESSION_SIGNING_KEY, "sessVerifyStatus");

    const before = await worker.fetch(new Request("https://x/challenge/chVerifyStatus/verify/status", {
      headers: { cookie: `voucha_session=${cookie}` },
    }), testEnv, createExecutionContext());
    expect(await before.json()).toEqual({ verified: false });

    await testEnv.DB.prepare("UPDATE sessions SET gh_login='alice', verify_code=NULL WHERE id='sessVerifyStatus'").run();
    const after = await worker.fetch(new Request("https://x/challenge/chVerifyStatus/verify/status", {
      headers: { cookie: `voucha_session=${cookie}` },
    }), testEnv, createExecutionContext());
    expect(await after.json()).toEqual({ verified: true });
  });

  it("renders terminal challenge pages as a celebratory PR receipt", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('chPassedActions', 1, 'o/r', 5, 's5', 'alice', 'passed', '{}')`
    ).run();

    const res = await worker.fetch(
      new Request("https://x/challenge/chPassedActions"),
      testEnv,
      createExecutionContext()
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1 id=\"result-title\">Attestation recorded</h1>");
    expect(html).toContain("View PR record");
    expect(html).toContain('href="https://github.com/o/r/pull/5"');
    expect(html).toContain('class="attestation-receipt"');
    expect(html).not.toContain("Refresh challenge");
  });

  it("renders assisted failures as failed results instead of stale challenges", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('chAssistedFailure', 1, 'o/r', 7, 's7', 'alice', 'failed_assisted', '{}')`
    ).run();
    await testEnv.DB.prepare(
      `INSERT INTO quizzes (id, challenge_id, attempt_number, questions_json, score, turnstile_ok, telemetry_json)
       VALUES ('quizAssistedFailure', 'chAssistedFailure', 1, '{"questions":[]}', 0, 0,
         '{"botFailureReason":"Turnstile did not validate this browser session."}')`
    ).run();

    const res = await worker.fetch(
      new Request("https://x/challenge/chAssistedFailure"),
      testEnv,
      createExecutionContext()
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<h1 id="result-title">Challenge needs review</h1>');
    expect(html).toContain("The challenge could not be verified: Turnstile did not validate this browser session.");
    expect(html).not.toContain("Challenge no longer active");
  });

  it("renders the latest maintainer retry cycle result", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json, retry_cycle)
       VALUES ('chRetryResult', 1, 'o/r', 8, 's8', 'alice', 'passed', '{}', 1)`
    ).run();
    await testEnv.DB.prepare(
      `INSERT INTO quizzes (id, challenge_id, attempt_number, retry_cycle, questions_json, answers_json, score)
       VALUES ('quizOldCycle', 'chRetryResult', 3, 0, '{"questions":[]}', '[0,0,0,0]', 0),
              ('quizNewCycle', 'chRetryResult', 1, 1, '{"questions":[]}', '[0,1,2,3]', 4)`
    ).run();

    const res = await worker.fetch(
      new Request("https://x/challenge/chRetryResult"),
      testEnv,
      createExecutionContext()
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<h1 id="result-title">Attestation recorded</h1>');
    expect(html).toContain('<strong>4/4</strong>');
  });

  it("keeps the rendered countdown on the original server deadline after refresh", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('chTimer', 1, 'o/r', 9, 's9', 'alice', 'ready', '{}')`
    ).run();
    await testEnv.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, gh_login) VALUES ('sessTimer', 'chTimer', 'alice')"
    ).run();
    await testEnv.DB.prepare(
      `INSERT INTO quizzes (id, challenge_id, attempt_number, questions_json, time_limit_ms)
       VALUES ('quizTimer', 'chTimer', 1,
         '{"questions":[{"type":"consequence_mcq","prompt":"What does the change do?","options":["a","b","c","d"],"correct":[0]}]}',
         60000)`
    ).run();
    const sessionCookie = await signSessionCookie(testEnv.SESSION_SIGNING_KEY, "sessTimer");
    const headers = { cookie: `voucha_session=${sessionCookie}; voucha_quiz=quizTimer` };

    const first = await worker.fetch(
      new Request("https://x/challenge/chTimer/question", { headers }),
      testEnv,
      createExecutionContext()
    );
    expect(first.status).toBe(200);
    expect(await first.text()).toContain('<span id="tnum">60</span>');

    await testEnv.DB.prepare("UPDATE quizzes SET question_served_at=? WHERE id='quizTimer'")
      .bind(new Date(Date.now() - 30_000).toISOString()).run();
    const refreshed = await worker.fetch(
      new Request("https://x/challenge/chTimer/question", { headers }),
      testEnv,
      createExecutionContext()
    );
    const refreshedHtml = await refreshed.text();
    const seconds = Number(/<span id="tnum">(\d+)<\/span>/.exec(refreshedHtml)?.[1]);
    expect(seconds).toBeGreaterThanOrEqual(29);
    expect(seconds).toBeLessThanOrEqual(30);
    expect(refreshedHtml).toContain("https://github.com/o/r/pull/9/files");
  });

  it("does not render Cloudflare testing site keys on production challenge pages", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('chProdTestKey', 1, 'o/r', 6, 's6', 'alice', 'ready', '{}')`
    ).run();
    await testEnv.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, gh_login) VALUES ('sessProdTestKey', 'chProdTestKey', 'alice')"
    ).run();
    const cookie = await signSessionCookie(testEnv.SESSION_SIGNING_KEY, "sessProdTestKey");
    const prodEnv = {
      ...testEnv,
      APP_BASE_URL: "https://voucha.dev",
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    } as unknown as Env;

    const res = await worker.fetch(new Request("https://voucha.dev/challenge/chProdTestKey", {
      headers: { cookie: `voucha_session=${cookie}` },
    }), prodEnv, createExecutionContext());

    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain("Cloudflare testing site key");
    expect(html).not.toContain("data-sitekey");
    expect(html).not.toContain("1x00000000000000000000AA");
  });
});

describe("POST /challenge/:id/start", () => {
  it("requires challenge terms acceptance before creating a quiz attempt", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('chTerms', 1, 'o/r', 3, 's3', 'alice', 'ready', '{}')`
    ).run();
    await testEnv.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, gh_login) VALUES ('sessTerms', 'chTerms', 'alice')"
    ).run();
    const cookie = await signSessionCookie(testEnv.SESSION_SIGNING_KEY, "sessTerms");
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/challenge/chTerms/start", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `voucha_session=${cookie}`,
      },
      body: new URLSearchParams({ "cf-turnstile-response": "tok" }),
    }), testEnv, ctx);

    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Accept the challenge terms to begin.");
    expect(html).toContain('name="terms_acceptance"');
    const row = await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM quizzes WHERE challenge_id='chTerms'")
      .first<{ count: number }>();
    expect(row?.count).toBe(0);
  });

  it("keeps the challenge ready when browser verification has not produced a token", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('chMissingTurnstile', 1, 'o/r', 4, 's4', 'alice', 'ready', '{}')`
    ).run();
    await testEnv.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, gh_login) VALUES ('sessMissingTurnstile', 'chMissingTurnstile', 'alice')"
    ).run();
    const cookie = await signSessionCookie(testEnv.SESSION_SIGNING_KEY, "sessMissingTurnstile");
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/challenge/chMissingTurnstile/start", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `voucha_session=${cookie}`,
      },
      body: new URLSearchParams({ terms_acceptance: "accepted" }),
    }), testEnv, ctx);

    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Complete browser verification before starting the challenge.");
    const challenge = await testEnv.DB.prepare(
      "SELECT status, attempts_used FROM challenges WHERE id='chMissingTurnstile'"
    ).first<{ status: string; attempts_used: number }>();
    expect(challenge).toEqual({ status: "ready", attempts_used: 0 });
    const row = await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM quizzes WHERE challenge_id='chMissingTurnstile'")
      .first<{ count: number }>();
    expect(row?.count).toBe(0);
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
    const fetchCalls: string[] = [];
    const serviceFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      return new Response(JSON.stringify({
        result: { ok: false, error: "agent could not inspect PR" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const envWithFlue = {
      ...testEnv,
      LLM_PROVIDER: "openai-compat",
      LLM_BASE_URL: "https://llm.example/v1",
      FLUE_INVESTIGATOR: { fetch: serviceFetch } as unknown as Fetcher,
    } as unknown as Env;
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
      expect(fetchCalls).toEqual(["https://voucha-flue-investigator/workflows/investigate-pr?wait=result"]);
      const row = await testEnv.DB.prepare(
        "SELECT source, status FROM pr_investigations WHERE repo_full_name='o/r' AND pr_number=9991 AND head_sha='flue-fail-sha'"
      ).first<{ source: string; status: string }>();
      expect(row).toEqual({ source: "flue", status: "failed" });
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("challengeDeps.verifyTurnstile", () => {
  it("treats an invalid secret as a VOUCHA outage", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      "error-codes": ["invalid-input-secret"],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(challengeDeps(testEnv).verifyTurnstile("token")).resolves.toBe("unavailable");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps a rejected browser token as a failed verification", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      "error-codes": ["invalid-input-response"],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(challengeDeps(testEnv).verifyTurnstile("token")).resolves.toBe("failed");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
