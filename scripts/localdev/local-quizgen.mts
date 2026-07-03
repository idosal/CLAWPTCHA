// Drives the REAL src/quiz/generate.ts against a real diff, through any
// QuizProvider. Providers:
//   claude-cli (default) — shells out to `claude -p`; no API key needed.
//   anthropic            — real API; needs LLM_API_KEY.
//   openai-compat        — any /chat/completions endpoint; needs LLM_BASE_URL (+ LLM_API_KEY).
//   workers-ai           — Workers AI via its OpenAI-compat REST endpoint
//                          (bindings don't exist in Node); needs CF_ACCOUNT_ID + CF_API_TOKEN.
// Usage:
//   node scripts/localdev/local-quizgen.mts <diff-file> <meta.json> [raw-out] \
//     [--provider claude-cli|anthropic|openai-compat|workers-ai] [--model <id>] \
//     [--context <tokens>]
// [raw-out] applies to the claude-cli provider only.
// --context caps the diff context in tokens; omit for uncapped (the default,
// matching production's default max_context_tokens: null).
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
    context: { type: "string" },
  },
});
const maxContextTokens = flags.context ? Number(flags.context) : null;
if (maxContextTokens !== null && (!Number.isInteger(maxContextTokens) || maxContextTokens <= 0)) {
  throw new Error("--context must be a positive integer (tokens)");
}
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
  ["(files from diff)"], maxContextTokens
);

if (!result.ok) {
  console.error("GENERATION FAILED:", result.error);
  process.exit(1);
}
console.log(JSON.stringify(result.quiz, null, 2));
