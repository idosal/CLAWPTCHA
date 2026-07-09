import type { Env } from "../types";

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

function jsonSchemaResponseFormat(name: string, schema: object) {
  return {
    type: "json_schema",
    json_schema: { name, schema, strict: true },
  };
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
            response_format: jsonSchemaResponseFormat("quiz", schema),
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
            response_format: jsonSchemaResponseFormat("quiz", schema),
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
