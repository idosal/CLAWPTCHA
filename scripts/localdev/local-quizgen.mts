// Drives the REAL src/quiz/generate.ts against a real diff, using `claude -p`
// as the LlmClient backend (no ANTHROPIC_API_KEY). The production path uses
// output_config.format (structured outputs) to constrain the model to
// QUIZ_JSON_SCHEMA; `claude -p` has no such channel, so we inline that same
// schema into the prompt — the fair local equivalent of schema enforcement.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { generateQuiz, type LlmClient } from "../../src/quiz/generate.ts";
import { QUIZ_JSON_SCHEMA } from "../../src/quiz/schema.ts";

const diff = readFileSync(process.argv[2], "utf8");
const meta = JSON.parse(readFileSync(process.argv[3], "utf8"));
const rawOut = process.argv[4]; // where to dump the raw model text

const claude: LlmClient = {
  messages: {
    async create(params: Record<string, unknown>) {
      const system = params.system as string;
      const userPrompt = (params.messages as Array<{ content: string }>)[0].content;
      const combined =
        system +
        "\n\n" +
        userPrompt +
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
      return { content: [{ type: "text", text: out }], stop_reason: "end_turn" };
    },
  },
};

const result = await generateQuiz(
  claude,
  "claude-sonnet-5",
  diff,
  meta.title ?? "Local test PR",
  meta.body ?? null,
  ["(files from diff)"],
  1500
);

if (!result.ok) {
  console.error("GENERATION FAILED:", result.error);
  process.exit(1);
}
console.log(JSON.stringify(result.quiz, null, 2));
