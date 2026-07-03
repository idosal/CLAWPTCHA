# Pluggable LLM Provider & Cloudflare-Native Hosted Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded Anthropic SDK with a three-backend `QuizProvider` abstraction (workers-ai / anthropic / openai-compat), remove `@anthropic-ai/sdk`, switch config to `LLM_*` env vars with no back-compat, and ship the eval tooling that gates the hosted default (Kimi K2.7 Code on Workers AI).

**Architecture:** One `QuizProvider.complete({system, prompt, schema, maxTokens}) → {ok, text|error}` interface in a new `src/quiz/providers.ts`, three fetch/binding-based implementations plus a `providerFromEnv` factory, selected per-request in `src/index.ts`. `generateQuiz` keeps its build-prompt → parse → Zod-validate → retry loop unchanged; providers never throw, they return `{ok:false}`. Misconfiguration surfaces as a failed generation → check resolves `neutral` (existing fail-open path).

**Tech Stack:** Cloudflare Workers, Hono, Workers AI binding (`Ai`), plain `fetch`, Zod, vitest + `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-07-03-llm-provider-and-hosted-deployment-design.md`

**⚠️ Working-tree note:** this repo has concurrent uncommitted work (linked-issue policy, question-count config, LICENSE, CI). Code snapshots below reflect that tree. In every commit step, `git add` ONLY the files this plan touches — never `git add -A`.

---

## File map

- Create: `src/quiz/providers.ts` — interface, 3 providers, `providerFromEnv`
- Create: `test/providers.test.ts` — request-shape + factory tests
- Modify: `src/quiz/generate.ts` — `LlmClient` → `QuizProvider`; drop `model` param
- Modify: `test/generate.test.ts` — stub becomes a `QuizProvider`
- Modify: `src/types.ts` — Env: remove `CLAUDE_MODEL`/`ANTHROPIC_API_KEY`, add `LLM_*` + `AI?` + `AI_GATEWAY_ID?`
- Modify: `src/index.ts` — remove Anthropic import/construction; use `providerFromEnv`
- Modify: `test/env.d.ts`, `vitest.config.ts` — test bindings for new env
- Modify: `wrangler.jsonc` — `ai` binding, `LLM_PROVIDER`/`LLM_MODEL` vars
- Modify: `package.json` — remove `@anthropic-ai/sdk`
- Modify: `scripts/localdev/local-quizgen.mts` — `--provider`/`--model` flags
- Modify: `README.md` — secrets list, provider docs, E2E checklist wording
- Update: `.dev.vars` (gitignored — local only, not committed)

---

### Task 1: `QuizProvider` interface + `anthropic` provider

**Files:**
- Create: `src/quiz/providers.ts`
- Create: `test/providers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/providers.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { anthropicProvider } from "../src/quiz/providers";

const PARAMS = {
  system: "SYS",
  prompt: "PROMPT",
  schema: { type: "object" },
  maxTokens: 16000,
};

afterEach(() => vi.unstubAllGlobals());

describe("anthropicProvider", () => {
  it("POSTs to /v1/messages with x-api-key and output_config schema", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: "text", text: '{"questions":[]}' }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await anthropicProvider("key-123", "claude-sonnet-5").complete(PARAMS);

    expect(r).toEqual({ ok: true, text: '{"questions":[]}' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("key-123");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.max_tokens).toBe(16000);
    expect(body.system).toBe("SYS");
    expect(body.output_config.format).toEqual({ type: "json_schema", schema: { type: "object" } });
    expect(body.messages).toEqual([{ role: "user", content: "PROMPT" }]);
  });

  it("maps non-2xx to ok:false without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("overloaded", { status: 529 })));
    const r = await anthropicProvider("k", "m").complete(PARAMS);
    expect(r).toEqual({ ok: false, error: "anthropic: HTTP 529" });
  });

  it("maps a missing text block to ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [] }), { status: 200 })));
    const r = await anthropicProvider("k", "m").complete(PARAMS);
    expect(r.ok).toBe(false);
  });

  it("maps a network error to ok:false without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const r = await anthropicProvider("k", "m").complete(PARAMS);
    expect(r).toEqual({ ok: false, error: "anthropic: ECONNRESET" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/providers.test.ts`
Expected: FAIL — `providers.ts` does not exist.

- [ ] **Step 3: Implement the interface and anthropic provider**

```ts
// src/quiz/providers.ts
// Provider-neutral LLM access for quiz generation. Every provider maps ALL
// failure modes (non-2xx, missing content, network, thrown) to { ok: false }
// — a provider error must degrade to a failed generation attempt, which the
// caller resolves as a `neutral` check (fail-open), never a crash.

export interface CompletionParams {
  system: string;
  prompt: string;
  schema: object;
  maxTokens: number;
}

export type CompletionResult = { ok: true; text: string } | { ok: false; error: string };

export interface QuizProvider {
  complete(params: CompletionParams): Promise<CompletionResult>;
}

function errMsg(prefix: string, e: unknown): { ok: false; error: string } {
  return { ok: false, error: `${prefix}: ${e instanceof Error ? e.message : String(e)}` };
}

export function anthropicProvider(apiKey: string, model: string): QuizProvider {
  return {
    async complete({ system, prompt, schema, maxTokens }) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            output_config: { format: { type: "json_schema", schema } },
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) return { ok: false, error: `anthropic: HTTP ${res.status}` };
        const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
        const text = data.content?.find((b) => b.type === "text")?.text;
        if (!text) return { ok: false, error: "anthropic: no text block in response" };
        return { ok: true, text };
      } catch (e) {
        return errMsg("anthropic", e);
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/providers.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/quiz/providers.ts test/providers.test.ts
git commit -m "feat: QuizProvider interface + anthropic provider (direct HTTP, no SDK)"
```

---

### Task 2: `openai-compat` provider

**Files:**
- Modify: `src/quiz/providers.ts` (append)
- Modify: `test/providers.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append to `test/providers.test.ts`; add `openAiCompatProvider` to the existing import from `../src/quiz/providers`)

```ts
import { openAiCompatProvider } from "../src/quiz/providers";

describe("openAiCompatProvider", () => {
  it("POSTs to {base}/chat/completions with Bearer auth and json_schema response_format", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"questions":[]}' } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const p = openAiCompatProvider("https://api.openai.com/v1/", "sk-abc", "gpt-5.5-mini");
    const r = await p.complete(PARAMS);

    expect(r).toEqual({ ok: true, text: '{"questions":[]}' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions"); // trailing slash normalized
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer sk-abc");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("gpt-5.5-mini");
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "PROMPT" },
    ]);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "quiz", schema: { type: "object" }, strict: true },
    });
  });

  it("omits the authorization header when no key is set (local vLLM)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "{}" } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await openAiCompatProvider("http://localhost:8000/v1", undefined, "local").complete(PARAMS);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["authorization"]).toBeUndefined();
  });

  it("maps non-2xx to ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const r = await openAiCompatProvider("https://x.test/v1", "k", "m").complete(PARAMS);
    expect(r).toEqual({ ok: false, error: "openai-compat: HTTP 401" });
  });

  it("maps an empty completion to ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })));
    const r = await openAiCompatProvider("https://x.test/v1", "k", "m").complete(PARAMS);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run test/providers.test.ts`
Expected: Task-1 tests pass; new tests FAIL — `openAiCompatProvider` not exported.

- [ ] **Step 3: Implement** (append to `src/quiz/providers.ts`)

```ts
export function openAiCompatProvider(
  baseUrl: string,
  apiKey: string | undefined,
  model: string
): QuizProvider {
  return {
    async complete({ system, prompt, schema, maxTokens }) {
      try {
        const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: "quiz", schema, strict: true },
            },
          }),
        });
        if (!res.ok) return { ok: false, error: `openai-compat: HTTP ${res.status}` };
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content;
        if (!text) return { ok: false, error: "openai-compat: empty completion" };
        return { ok: true, text };
      } catch (e) {
        return errMsg("openai-compat", e);
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/providers.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/quiz/providers.ts test/providers.test.ts
git commit -m "feat: openai-compat provider (OpenAI, Groq, local vLLM, Workers AI REST)"
```

---

### Task 3: `workers-ai` provider (binding)

**Files:**
- Modify: `src/quiz/providers.ts` (append)
- Modify: `test/providers.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append; add `workersAiProvider` to the import)

```ts
import { workersAiProvider } from "../src/quiz/providers";

function aiStub(result: unknown, opts?: { throws?: boolean }) {
  return {
    run: vi.fn(async () => {
      if (opts?.throws) throw new Error("model unavailable");
      return result;
    }),
  } as unknown as Ai;
}

describe("workersAiProvider", () => {
  it("calls AI.run with messages, max_tokens, and json_schema response_format", async () => {
    const ai = aiStub({ response: '{"questions":[]}' });
    const r = await workersAiProvider(ai, "@cf/moonshotai/kimi-k2.7-code").complete(PARAMS);
    expect(r).toEqual({ ok: true, text: '{"questions":[]}' });
    const [model, inputs, options] = (ai.run as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(model).toBe("@cf/moonshotai/kimi-k2.7-code");
    expect(inputs.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "PROMPT" },
    ]);
    expect(inputs.max_tokens).toBe(16000);
    expect(inputs.response_format).toEqual({ type: "json_schema", json_schema: { type: "object" } });
    expect(options).toBeUndefined();
  });

  it("passes the AI Gateway id when configured", async () => {
    const ai = aiStub({ response: "{}" });
    await workersAiProvider(ai, "m", "clawptcha-gw").complete(PARAMS);
    const [, , options] = (ai.run as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options).toEqual({ gateway: { id: "clawptcha-gw" } });
  });

  it("also accepts OpenAI-shaped binding responses", async () => {
    const ai = aiStub({ choices: [{ message: { content: '{"questions":[]}' } }] });
    const r = await workersAiProvider(ai, "m").complete(PARAMS);
    expect(r).toEqual({ ok: true, text: '{"questions":[]}' });
  });

  it("maps an empty response to ok:false", async () => {
    const ai = aiStub({ response: "" });
    const r = await workersAiProvider(ai, "m").complete(PARAMS);
    expect(r.ok).toBe(false);
  });

  it("maps a thrown binding error to ok:false", async () => {
    const ai = aiStub(null, { throws: true });
    const r = await workersAiProvider(ai, "m").complete(PARAMS);
    expect(r).toEqual({ ok: false, error: "workers-ai: model unavailable" });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run test/providers.test.ts`
Expected: new tests FAIL — `workersAiProvider` not exported.

- [ ] **Step 3: Implement** (append to `src/quiz/providers.ts`)

```ts
// The binding's inference response shape varies by model family: classic text
// models return { response }, newer chat-completions-style large models can
// return OpenAI-shaped { choices }. Accept both; verify the exact shape for
// the chosen default model against the Workers AI model page when deploying.
export function workersAiProvider(ai: Ai, model: string, gatewayId?: string): QuizProvider {
  return {
    async complete({ system, prompt, schema, maxTokens }) {
      try {
        const options = gatewayId ? { gateway: { id: gatewayId } } : undefined;
        const result = (await ai.run(
          model as Parameters<Ai["run"]>[0],
          {
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            max_tokens: maxTokens,
            response_format: { type: "json_schema", json_schema: schema },
          } as Parameters<Ai["run"]>[1],
          options
        )) as { response?: string; choices?: Array<{ message?: { content?: string } }> };
        const text = result?.response ?? result?.choices?.[0]?.message?.content;
        if (!text) return { ok: false, error: "workers-ai: empty response" };
        return { ok: true, text };
      } catch (e) {
        return errMsg("workers-ai", e);
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/providers.test.ts`
Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add src/quiz/providers.ts test/providers.test.ts
git commit -m "feat: workers-ai provider via AI binding with optional AI Gateway"
```

---

### Task 4: Env type changes + `providerFromEnv` factory

**Files:**
- Modify: `src/types.ts:1-14`
- Modify: `src/quiz/providers.ts` (append)
- Modify: `test/providers.test.ts` (append)
- Modify: `test/env.d.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Update `Env` in `src/types.ts`** — replace lines 1–14 with:

```ts
export interface Env {
  DB: D1Database;
  AI?: Ai;
  APP_BASE_URL: string;
  LLM_PROVIDER: "workers-ai" | "anthropic" | "openai-compat";
  LLM_MODEL: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  AI_GATEWAY_ID?: string;
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  SESSION_SIGNING_KEY: string;
}
```

- [ ] **Step 2: Write the failing factory tests** (append; add `providerFromEnv` to the import; also `import type { Env } from "../src/types";`)

```ts
import { providerFromEnv } from "../src/quiz/providers";
import type { Env } from "../src/types";

function envWith(overrides: Record<string, unknown>): Env {
  return { LLM_PROVIDER: "anthropic", LLM_MODEL: "m", LLM_API_KEY: "k", ...overrides } as unknown as Env;
}

describe("providerFromEnv", () => {
  it("selects anthropic when configured with a key", () => {
    const r = providerFromEnv(envWith({ LLM_PROVIDER: "anthropic", LLM_API_KEY: "k" }));
    expect(r.ok).toBe(true);
  });

  it("rejects anthropic without LLM_API_KEY", () => {
    const r = providerFromEnv(envWith({ LLM_PROVIDER: "anthropic", LLM_API_KEY: undefined }));
    expect(r).toEqual({ ok: false, error: 'LLM_PROVIDER "anthropic" requires LLM_API_KEY' });
  });

  it("rejects workers-ai without the AI binding", () => {
    const r = providerFromEnv(envWith({ LLM_PROVIDER: "workers-ai" }));
    expect(r).toEqual({ ok: false, error: 'LLM_PROVIDER "workers-ai" requires the AI binding (wrangler.jsonc `ai`)' });
  });

  it("selects workers-ai when the binding exists", () => {
    const r = providerFromEnv(envWith({ LLM_PROVIDER: "workers-ai", AI: { run: async () => ({}) } as unknown as Ai }));
    expect(r.ok).toBe(true);
  });

  it("rejects openai-compat without LLM_BASE_URL", () => {
    const r = providerFromEnv(envWith({ LLM_PROVIDER: "openai-compat", LLM_BASE_URL: undefined }));
    expect(r).toEqual({ ok: false, error: 'LLM_PROVIDER "openai-compat" requires LLM_BASE_URL' });
  });

  it("rejects an unknown provider value", () => {
    const r = providerFromEnv(envWith({ LLM_PROVIDER: "openai" as Env["LLM_PROVIDER"] }));
    expect(r).toEqual({ ok: false, error: 'unknown LLM_PROVIDER "openai" (expected workers-ai | anthropic | openai-compat)' });
  });
});
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run test/providers.test.ts`
Expected: FAIL — `providerFromEnv` not exported.

- [ ] **Step 4: Implement the factory** (append to `src/quiz/providers.ts`; add `import type { Env } from "../types";` at the top of the file)

```ts
export type ProviderSelection = { ok: true; provider: QuizProvider } | { ok: false; error: string };

// Selected per-request, validated lazily: a misconfigured provider yields a
// failed generation (-> neutral check), because a Worker cannot fail startup.
export function providerFromEnv(env: Env): ProviderSelection {
  switch (env.LLM_PROVIDER) {
    case "workers-ai":
      if (!env.AI) return { ok: false, error: 'LLM_PROVIDER "workers-ai" requires the AI binding (wrangler.jsonc `ai`)' };
      return { ok: true, provider: workersAiProvider(env.AI, env.LLM_MODEL, env.AI_GATEWAY_ID) };
    case "anthropic":
      if (!env.LLM_API_KEY) return { ok: false, error: 'LLM_PROVIDER "anthropic" requires LLM_API_KEY' };
      return { ok: true, provider: anthropicProvider(env.LLM_API_KEY, env.LLM_MODEL) };
    case "openai-compat":
      if (!env.LLM_BASE_URL) return { ok: false, error: 'LLM_PROVIDER "openai-compat" requires LLM_BASE_URL' };
      return { ok: true, provider: openAiCompatProvider(env.LLM_BASE_URL, env.LLM_API_KEY, env.LLM_MODEL) };
    default:
      return { ok: false, error: `unknown LLM_PROVIDER "${env.LLM_PROVIDER}" (expected workers-ai | anthropic | openai-compat)` };
  }
}
```

- [ ] **Step 5: Update test env declarations.** In `test/env.d.ts` replace the `ANTHROPIC_API_KEY: string;` and `CLAUDE_MODEL: string;` lines with:

```ts
    LLM_PROVIDER: string;
    LLM_MODEL: string;
    LLM_API_KEY: string;
```

In `vitest.config.ts` miniflare `bindings`, replace `ANTHROPIC_API_KEY: "test-anthropic-key",` with:

```ts
              LLM_PROVIDER: "anthropic",
              LLM_MODEL: "test-model",
              LLM_API_KEY: "test-llm-key",
```

(`CLAUDE_MODEL` comes from `wrangler.jsonc` vars today; it disappears in Task 7. Route tests never reach a real LLM call — an accidental call fails fetch and degrades to `neutral`, same as today's fake key.)

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run test/providers.test.ts && npm run typecheck`
Expected: providers tests pass. Typecheck FAILS in `src/index.ts` (still references `env.ANTHROPIC_API_KEY`/`env.CLAUDE_MODEL`) — that is expected and fixed in Tasks 5–6. If anything ELSE fails typecheck, stop and investigate.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/quiz/providers.ts test/providers.test.ts test/env.d.ts vitest.config.ts
git commit -m "feat: providerFromEnv factory + LLM_* env config (no back-compat)"
```

---

### Task 5: Switch `generateQuiz` to `QuizProvider`

**Files:**
- Modify: `src/quiz/generate.ts`
- Modify: `test/generate.test.ts`

- [ ] **Step 1: Update the tests first.** In `test/generate.test.ts`, delete the `stubClient` helper and replace with:

```ts
import type { QuizProvider } from "../src/quiz/providers";

function stubProvider(responses: Array<{ ok: true; text: string } | { ok: false; error: string }>) {
  let i = 0;
  const complete = vi.fn(async () => responses[Math.min(i++, responses.length - 1)]);
  return { provider: { complete } as QuizProvider, complete };
}
```

Rewrite the `generateQuiz` describe block (drop the `model` argument everywhere):

```ts
describe("generateQuiz", () => {
  it("returns a validated quiz from the provider", async () => {
    const { provider } = stubProvider([{ ok: true, text: goodQuizJson }]);
    const r = await generateQuiz(provider, "diff", "title", "body", ["a.ts"], null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.quiz.questions).toHaveLength(4);
  });

  it("passes system prompt, user prompt, schema, and maxTokens to the provider", async () => {
    const { provider, complete } = stubProvider([{ ok: true, text: goodQuizJson }]);
    await generateQuiz(provider, "THE_DIFF", "title", null, ["a.ts"], null);
    const params = complete.mock.calls[0][0];
    expect(params.system).toContain("SHORT questions");
    expect(params.prompt).toContain("THE_DIFF");
    expect(params.schema).toBeDefined();
    expect(params.maxTokens).toBe(16000);
  });

  it("retries once on invalid output, then succeeds", async () => {
    const { provider, complete } = stubProvider([
      { ok: true, text: "not json at all" },
      { ok: true, text: goodQuizJson },
    ]);
    const r = await generateQuiz(provider, "diff", "t", null, [], null);
    expect(r.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("retries once on a provider error, then succeeds", async () => {
    const { provider, complete } = stubProvider([
      { ok: false, error: "anthropic: HTTP 529" },
      { ok: true, text: goodQuizJson },
    ]);
    const r = await generateQuiz(provider, "diff", "t", null, [], null);
    expect(r.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("fails after two invalid outputs", async () => {
    const { provider, complete } = stubProvider([{ ok: true, text: '{"questions": []}' }]);
    const r = await generateQuiz(provider, "diff", "t", null, [], null);
    expect(r.ok).toBe(false);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("passes configured question count to validation", async () => {
    const twoQuestionQuiz = JSON.stringify({
      questions: JSON.parse(goodQuizJson).questions.slice(0, 2),
    });
    const { provider } = stubProvider([{ ok: true, text: twoQuestionQuiz }]);
    const r = await generateQuiz(provider, "diff", "title", "body", ["a.ts"], null, 2);
    expect(r.ok).toBe(true);
  });
});
```

(`capContext` and `buildGenerationPrompt` describe blocks are unchanged.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/generate.test.ts`
Expected: FAIL — signature mismatch.

- [ ] **Step 3: Update `src/quiz/generate.ts`.** Delete the `LlmClient` interface (lines 3–11) and replace the import block + `generateQuiz` body:

```ts
import { validateQuiz, QUIZ_JSON_SCHEMA, type Quiz } from "./schema";
import type { QuizProvider } from "./providers";
```

`SYSTEM_PROMPT`, `capContext`, `buildGenerationPrompt`, and `GenerateResult` stay exactly as they are. New `generateQuiz`:

```ts
export async function generateQuiz(
  provider: QuizProvider,
  diff: string,
  title: string,
  body: string | null,
  files: string[],
  maxContextTokens: number | null,
  questionCount = 4
): Promise<GenerateResult> {
  const prompt = buildGenerationPrompt(diff, title, body, files, maxContextTokens, questionCount);
  let lastError = "unknown";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await provider.complete({
      system: SYSTEM_PROMPT,
      prompt,
      schema: QUIZ_JSON_SCHEMA,
      maxTokens: 16000,
    });
    if (!result.ok) { lastError = result.error; continue; }
    let raw: unknown;
    try { raw = JSON.parse(result.text); } catch { lastError = "invalid JSON"; continue; }
    const validated = validateQuiz(raw, questionCount);
    if (validated.ok) return { ok: true, quiz: validated.quiz };
    lastError = validated.error;
  }
  return { ok: false, error: lastError };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/generate.test.ts test/providers.test.ts`
Expected: PASS (typecheck still fails on index.ts + local-quizgen — next tasks).

- [ ] **Step 5: Commit**

```bash
git add src/quiz/generate.ts test/generate.test.ts
git commit -m "refactor: generateQuiz takes a QuizProvider instead of an Anthropic-shaped client"
```

---

### Task 6: Wire `src/index.ts`, remove the SDK

**Files:**
- Modify: `src/index.ts:3,13,77-97`
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Rewire `challengeDeps`.** In `src/index.ts`:

Delete line 3 (`import Anthropic from "@anthropic-ai/sdk";`).
Change line 13 to: `import { generateQuiz } from "./quiz/generate";`
Add: `import { providerFromEnv } from "./quiz/providers";`

In `challengeDeps(env)`: delete the `const anthropic = new Anthropic(...)` line and replace the `generateQuiz` dep with:

```ts
    async generateQuiz(ctx, cfg) {
      const quizGate = getMultipleChoiceGate(cfg);
      const selected = providerFromEnv(env);
      if (!selected.ok) {
        // Misconfiguration degrades exactly like an LLM outage: failed
        // generation -> neutral check. Log loudly for the operator.
        console.error("LLM provider misconfigured:", selected.error);
        return { ok: false as const, error: selected.error };
      }
      return generateQuiz(
        selected.provider,
        ctx.diff, ctx.title, ctx.body, ctx.files, cfg.max_context_tokens,
        quizGate.questions
      );
    },
```

- [ ] **Step 2: Remove the dependency**

Run: `npm uninstall @anthropic-ai/sdk`
Expected: `package.json` dependencies are now only `hono`, `yaml`, `zod`.

- [ ] **Step 3: Verify nothing references the SDK or old env vars**

Run: `grep -rn "anthropic-ai/sdk\|ANTHROPIC_API_KEY\|CLAUDE_MODEL\|LlmClient" src/ test/ && echo "STALE REFS FOUND" || echo "clean"`
Expected: `clean` — except `scripts/localdev/local-quizgen.mts` (Task 8) and comments. Fix any src/test stragglers now (e.g. the `// JSON Schema for Anthropic structured outputs` comment in `src/quiz/schema.ts` — reword to "JSON Schema for provider structured outputs").

- [ ] **Step 4: Full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: typecheck clean except possibly `scripts/localdev/local-quizgen.mts` if included in tsconfig (it is driven by `tsx`/`node --strip-types`, check `tsconfig.json` `include`); all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/quiz/schema.ts package.json package-lock.json
git commit -m "feat: wire provider selection into challenge deps; drop @anthropic-ai/sdk"
```

---

### Task 7: `wrangler.jsonc` + local dev vars

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `.dev.vars` (gitignored — do NOT commit)

- [ ] **Step 1: Confirm the exact Workers AI model ID**

Run: `npx wrangler ai models 2>/dev/null | grep -i "kimi"`
Expected: a line containing the Kimi K2.7 Code model ID (spec assumes `@cf/moonshotai/kimi-k2.7-code`). If the ID differs, use the listed one everywhere below and update the spec.

- [ ] **Step 2: Update `wrangler.jsonc`** — add the `ai` binding and replace `CLAUDE_MODEL`:

```jsonc
{
  "name": "clawptcha",
  "main": "src/index.ts",
  "compatibility_date": "2025-09-06", // bump alongside wrangler upgrades
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    { "binding": "DB", "database_name": "clawptcha", "database_id": "REPLACE_AFTER_wrangler_d1_create" }
  ],
  "ai": { "binding": "AI" },
  "triggers": { "crons": ["*/15 * * * *"] },
  "vars": {
    "APP_BASE_URL": "https://clawptcha.example.workers.dev",
    "LLM_PROVIDER": "workers-ai",
    "LLM_MODEL": "@cf/moonshotai/kimi-k2.7-code"
    // AI_GATEWAY_ID: set after creating an AI Gateway (spend caps + analytics)
  }
  // Secrets (set via `wrangler secret put`):
  //   GITHUB_APP_ID, GITHUB_PRIVATE_KEY (PKCS#8 PEM), GITHUB_WEBHOOK_SECRET,
  //   GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET,
  //   TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY,
  //   SESSION_SIGNING_KEY (random 32+ bytes, hex)
  //   LLM_API_KEY — only for LLM_PROVIDER=anthropic|openai-compat
}
```

- [ ] **Step 3: Update `.dev.vars` locally** (gitignored): replace `ANTHROPIC_API_KEY=...` with

```
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-5
LLM_API_KEY=sk-ant-local-none
```

(Local `wrangler dev` with `workers-ai` would hit the real account; the local-dev harness path stays keyless per the run-clawptcha-locally skill.)

- [ ] **Step 4: Verify config loads + tests still pass**

Run: `npx wrangler deploy --dry-run 2>&1 | head -20 && npm test`
Expected: dry-run bundles without config errors (AI binding listed); 124+ tests pass (vitest reads `wrangler.jsonc` — the removed `CLAUDE_MODEL` var must break nothing).

- [ ] **Step 5: Commit**

```bash
git add wrangler.jsonc
git commit -m "feat: Workers AI binding + Kimi K2.7 Code as hosted default vars"
```

---

### Task 8: Eval tooling — `local-quizgen.mts` `--provider`/`--model`

**Files:**
- Modify: `scripts/localdev/local-quizgen.mts` (full rewrite below)

- [ ] **Step 1: Rewrite the script**

```ts
// Drives the REAL src/quiz/generate.ts against a real diff, through any
// QuizProvider. Providers:
//   claude-cli (default) — shells out to `claude -p`; no API key needed.
//   anthropic            — real API; needs LLM_API_KEY.
//   openai-compat        — any /chat/completions endpoint; needs LLM_BASE_URL (+ LLM_API_KEY).
//   workers-ai           — Workers AI via its OpenAI-compat REST endpoint
//                          (bindings don't exist in Node); needs CF_ACCOUNT_ID + CF_API_TOKEN.
// Usage:
//   node scripts/localdev/local-quizgen.mts <diff-file> <meta.json> [raw-out] \
//     [--provider claude-cli|anthropic|openai-compat|workers-ai] [--model <id>]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { generateQuiz } from "../../src/quiz/generate.ts";
import { QUIZ_JSON_SCHEMA } from "../../src/quiz/schema.ts";
import {
  anthropicProvider, openAiCompatProvider, type QuizProvider,
} from "../../src/quiz/providers.ts";

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    provider: { type: "string", default: "claude-cli" },
    model: { type: "string", default: "claude-sonnet-5" },
  },
});
const [diffPath, metaPath, rawOut] = positionals;
const diff = readFileSync(diffPath, "utf8");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));

const claudeCli: QuizProvider = {
  async complete({ system, prompt }) {
    // `claude -p` has no structured-output channel, so inline the schema —
    // the fair local equivalent of schema enforcement.
    const combined =
      system + "\n\n" + prompt +
      "\n\nYour output MUST be a single JSON object conforming EXACTLY to this JSON Schema " +
      "(note the exact field names `prompt`, `options`, `correct`; `correct` is an ARRAY of integer indices):\n" +
      JSON.stringify(QUIZ_JSON_SCHEMA) +
      "\n\nReturn ONLY that JSON object — no markdown, no code fences, no commentary.";
    let out = execFileSync("claude", ["-p", combined], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    out = out.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (rawOut) writeFileSync(rawOut, out);
    return { ok: true, text: out };
  },
};

function pickProvider(): QuizProvider {
  switch (flags.provider) {
    case "claude-cli":
      return claudeCli;
    case "anthropic":
      if (!process.env.LLM_API_KEY) throw new Error("anthropic provider needs LLM_API_KEY");
      return anthropicProvider(process.env.LLM_API_KEY, flags.model!);
    case "openai-compat":
      if (!process.env.LLM_BASE_URL) throw new Error("openai-compat provider needs LLM_BASE_URL");
      return openAiCompatProvider(process.env.LLM_BASE_URL, process.env.LLM_API_KEY, flags.model!);
    case "workers-ai": {
      const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
      if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error("workers-ai provider needs CF_ACCOUNT_ID + CF_API_TOKEN");
      return openAiCompatProvider(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1`,
        CF_API_TOKEN,
        flags.model!
      );
    }
    default:
      throw new Error(`unknown --provider "${flags.provider}"`);
  }
}

const result = await generateQuiz(
  pickProvider(), diff, meta.title ?? "Local test PR", meta.body ?? null,
  ["(files from diff)"], 1500
);

if (!result.ok) {
  console.error("GENERATION FAILED:", result.error);
  process.exit(1);
}
console.log(JSON.stringify(result.quiz, null, 2));
```

- [ ] **Step 2: Smoke-test the default (claude-cli) path** — same harness the run-clawptcha-locally skill uses:

Run: `git show HEAD~5..HEAD --patch > /tmp/eval-diff.patch 2>/dev/null || git diff HEAD~1 > /tmp/eval-diff.patch; echo '{"title":"test PR"}' > /tmp/eval-meta.json; node scripts/localdev/local-quizgen.mts /tmp/eval-diff.patch /tmp/eval-meta.json`
Expected: a 4-question quiz JSON on stdout (requires `claude` CLI installed; if unavailable, verify `--provider anthropic` with a real key instead, or skip smoke and rely on Step 3).

- [ ] **Step 3: Verify flag validation**

Run: `node scripts/localdev/local-quizgen.mts /tmp/eval-diff.patch /tmp/eval-meta.json --provider workers-ai 2>&1 | head -2`
Expected: error `workers-ai provider needs CF_ACCOUNT_ID + CF_API_TOKEN` (unless those are set, in which case a real Kimi-generated quiz).

- [ ] **Step 4: Commit**

```bash
git add scripts/localdev/local-quizgen.mts
git commit -m "feat: local-quizgen takes --provider/--model for quality-gate evals"
```

---

### Task 9: README + docs updates

**Files:**
- Modify: `README.md` (deploy runbook steps 4–5, security section untouched, E2E checklist last item)

- [ ] **Step 1: Update the secrets step.** Replace README step 4 ("Set all 9 secrets...") with:

```markdown
4. **Configure the LLM provider** (`vars` in `wrangler.jsonc`) and **set the
   secrets** (`wrangler secret put <NAME>`), matching `Env` in `src/types.ts`:

   Providers (`LLM_PROVIDER`):
   - `workers-ai` (default) — runs on your Cloudflare account's Workers AI.
     No LLM secret needed. `LLM_MODEL` defaults to Kimi K2.7 Code
     (`@cf/moonshotai/kimi-k2.7-code`). Optionally set `AI_GATEWAY_ID` to an
     AI Gateway for spend caps and analytics.
   - `anthropic` — direct Anthropic API. Set `LLM_MODEL` (e.g.
     `claude-sonnet-5`) and secret `LLM_API_KEY`.
   - `openai-compat` — any `/chat/completions` endpoint (OpenAI, Groq, local
     vLLM). Set `LLM_BASE_URL` (e.g. `https://api.openai.com/v1`),
     `LLM_MODEL`, and secret `LLM_API_KEY` if the endpoint needs one.

   Secrets (8, or 9 with `LLM_API_KEY`):
   - `GITHUB_APP_ID`
   - `GITHUB_PRIVATE_KEY` (PKCS#8 PEM from step 2)
   - `GITHUB_WEBHOOK_SECRET`
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - `TURNSTILE_SITE_KEY`
   - `TURNSTILE_SECRET_KEY`
   - `SESSION_SIGNING_KEY` (random 32+ bytes, hex — signs the session cookie)
   - `LLM_API_KEY` (only for `anthropic` / keyed `openai-compat`)

   Also confirm `APP_BASE_URL` in `wrangler.jsonc` matches your Worker's URL.
```

- [ ] **Step 2: Update the E2E checklist item** (last line of README). Replace:

```markdown
- [ ] Temporarily set an invalid `ANTHROPIC_API_KEY` and start a quiz →
      check goes `neutral`, merge is not blocked.
```

with:

```markdown
- [ ] Temporarily break the LLM config (e.g. set `LLM_MODEL` to a nonexistent
      model, or an invalid `LLM_API_KEY`) and start a quiz → check goes
      `neutral`, merge is not blocked.
```

- [ ] **Step 3: Grep for stragglers**

Run: `grep -n "ANTHROPIC\|CLAUDE_MODEL\|Anthropic API" README.md docs/superpowers/specs/2026-07-02-clawptcha-design.md`
Expected: README clean. The 2026-07-02 spec is a historical document — leave it, but if it has a "current architecture" diagram line reading "Anthropic API (quiz generation)", annotate it with "(superseded by the 2026-07-03 provider spec)".

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-07-02-clawptcha-design.md
git commit -m "docs: README provider configuration + updated runbook and E2E checklist"
```

---

### Task 10: Quality-gate eval (operator step — gates flipping the hosted default)

**Files:** none (uses Task 8 tooling). This task produces a decision, not code.

- [ ] **Step 1: Collect ~10 real PR diffs** of varied size/type (small fix, medium feature, large refactor, docs+code mix). E.g. from public repos: `gh pr diff <n> -R <owner/repo> > evals/diff-<n>.patch` with a matching `evals/meta-<n>.json` (`{"title": "...", "body": "..."}`). Keep them out of git (`evals/` in scratch or gitignored).

- [ ] **Step 2: Generate three quizzes per diff**

```bash
export CF_ACCOUNT_ID=... CF_API_TOKEN=...   # Workers AI REST
export LLM_API_KEY=sk-ant-...               # Anthropic
for i in $(seq 1 10); do
  node scripts/localdev/local-quizgen.mts evals/diff-$i.patch evals/meta-$i.json \
    --provider workers-ai --model "@cf/moonshotai/kimi-k2.7-code" > evals/kimi-$i.json
  node scripts/localdev/local-quizgen.mts evals/diff-$i.patch evals/meta-$i.json \
    --provider workers-ai --model "@cf/zai-org/glm-5.2" > evals/glm-$i.json
  node scripts/localdev/local-quizgen.mts evals/diff-$i.patch evals/meta-$i.json \
    --provider anthropic --model claude-sonnet-5 > evals/sonnet-$i.json
done
```

- [ ] **Step 3: Judge by hand, blind if possible.** Per question, three criteria from the spec: **grounded** (answerable from the diff's purpose/effect), **unambiguous** (exactly one defensible correct answer set), **fair** (no implementation-detail trivia). Score each model: questions failing any criterion / total.

- [ ] **Step 4: Apply the decision rule** (spec §4): hosted default = cheapest model indistinguishable from claude-sonnet-5 on fairness, in order Kimi K2.7 Code → GLM-5.2 → fall back to `anthropic`/claude-sonnet-5. If the winner is not Kimi, update `LLM_MODEL` (or `LLM_PROVIDER`) in `wrangler.jsonc` and the README default, and note the result in the spec.

- [ ] **Step 5: Record the outcome** — commit a short `docs/superpowers/specs/2026-07-03-llm-provider-and-hosted-deployment-design.md` addendum ("Quality gate result: <model> passed/failed, N/40 questions flagged, date").

---

## Self-review notes

- **Spec coverage:** §1 providers → Tasks 1–3; §1 generateQuiz contract → Task 5; §2 config/env/wrangler/README → Tasks 4, 7, 9; §3 deployment/sponsorship → Task 7 (config) + README (Task 9); operational steps (Alexandria application, AI Gateway creation, hosted policy statement) are operator actions outside the codebase — tracked in the spec, not this plan; §4 quality gate → Tasks 8, 10; §5 testing → Tasks 1–6.
- **Types:** `QuizProvider`/`CompletionParams`/`CompletionResult`/`ProviderSelection` defined in Task 1/4 and used consistently in Tasks 5, 6, 8.
- **Known verify-at-implementation points:** exact Workers AI model ID (Task 7 Step 1), binding response shape for Kimi (Task 3 comment + Task 10 exercises the real path via REST).
