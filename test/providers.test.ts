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
