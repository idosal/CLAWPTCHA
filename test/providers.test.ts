import { describe, it, expect, vi, afterEach } from "vitest";
import { anthropicProvider, openAiCompatProvider, workersAiProvider, providerFromEnv } from "../src/quiz/providers";
import type { Env } from "../src/types";

const PARAMS = {
  system: "SYS",
  prompt: "PROMPT",
  schema: { type: "object" },
  maxTokens: 16000,
};

afterEach(() => vi.unstubAllGlobals());

describe("anthropicProvider", () => {
  it("POSTs to /v1/messages with x-api-key and output_config schema", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response(JSON.stringify({
      content: [{ type: "text", text: '{"questions":[]}' }],
    }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    const r = await anthropicProvider("key-123", "claude-sonnet-5").complete(PARAMS);

    expect(r).toEqual({ ok: true, text: '{"questions":[]}' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init!.headers as Record<string, string>)["x-api-key"]).toBe("key-123");
    const body = JSON.parse(String(init!.body));
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

describe("openAiCompatProvider", () => {
  it("POSTs to {base}/chat/completions with Bearer auth and json_schema response_format", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: '{"questions":[]}' } }],
    }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    const p = openAiCompatProvider("https://api.openai.com/v1/", "sk-abc", "gpt-5.5-mini");
    const r = await p.complete(PARAMS);

    expect(r).toEqual({ ok: true, text: '{"questions":[]}' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions"); // trailing slash normalized
    expect((init!.headers as Record<string, string>)["authorization"]).toBe("Bearer sk-abc");
    const body = JSON.parse(String(init!.body));
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
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: "{}" } }],
    }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    await openAiCompatProvider("http://localhost:8000/v1", undefined, "local").complete(PARAMS);
    const [, init] = fetchMock.mock.calls[0];
    expect((init!.headers as Record<string, string>)["authorization"]).toBeUndefined();
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
    expect(inputs.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "quiz", schema: { type: "object" }, strict: true },
    });
    expect(options).toBeUndefined();
  });

  it("passes the AI Gateway id when configured", async () => {
    const ai = aiStub({ response: "{}" });
    await workersAiProvider(ai, "m", "voucha-gw").complete(PARAMS);
    const [, , options] = (ai.run as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options).toEqual({ gateway: { id: "voucha-gw" } });
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
