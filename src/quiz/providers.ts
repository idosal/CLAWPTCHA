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
