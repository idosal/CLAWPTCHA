import { validateQuiz, QUIZ_JSON_SCHEMA, type Quiz } from "./schema";
import type { QuizProvider } from "./providers";

const SYSTEM_PROMPT = `You generate SHORT questions that check whether the PR author understands
WHAT their change accomplishes — its purpose and its effect — NOT how the code works.

Treat the code as irrelevant. Every question must be answerable by someone who understands
why the change was made and what it does, even if they never saw a single line of code.
Infer the purpose from the diff plus the PR title and description, then ask about THAT.

Write like a product manager, not an engineer. Ask only about:
- PURPOSE: what is this change trying to achieve? what problem does it solve or prevent?
- EFFECT: what is observably different for a user or the system after it ships?

NEVER mention or require knowledge of: function/variable/file names, return values or data
shapes, status codes, operators or comparisons, "the caller"/"the module", control flow, or
any implementation detail. If a question could only be answered by reading the code, it is wrong.

Keep it SHORT: each question one plain-English sentence; each option a short phrase. No jargon.

For a change that rejects expired auth tokens:
- GOOD: "What happens now to someone whose login has expired?" -> "They are turned away and must sign in again."
- GOOD: "What problem is this meant to prevent?" -> "Expired logins still being accepted."
- BAD: anything naming a function, a status code, a return value, an operator, or a file.

Rules:
- Generate the requested number of questions, each with exactly 4 short options.
- Types: "consequence_mcq" (one plain consequence for a user or the system; exactly 1 correct),
  "blast_radius_multi" ("which of these does this change affect?" in plain user/behavior terms; 2-3 correct),
  "false_claim" (four short statements about the change's purpose/effect, exactly one subtly FALSE;
  the correct answer is the false statement's index).
- If generating 3 or more questions, include at least one of each type.
- Distractors must be plausible to someone who has NOT grasped the change's purpose.`;

// crude token estimate: ~4 chars/token
export function capContext(diff: string, files: string[], maxContextTokens: number | null): string {
  if (maxContextTokens === null) return diff;
  const maxChars = maxContextTokens * 4;
  if (diff.length <= maxChars) return diff;
  return (
    diff.slice(0, maxChars) +
    `\n\n[diff truncated]\nFull list of changed files:\n${files.map((f) => `- ${f}`).join("\n")}`
  );
}

export function buildGenerationPrompt(
  diff: string, title: string, body: string | null, files: string[],
  maxContextTokens: number | null, questionCount = 4
): string {
  return [
    `PR title: ${title}`,
    `PR description:\n${body ?? "(none)"}`,
    `Changed files: ${files.join(", ")}`,
    "",
    "Diff:",
    "```diff",
    capContext(diff, files, maxContextTokens),
    "```",
    "",
    `Question count: ${questionCount}`,
    "Question types: consequence_mcq, blast_radius_multi, false_claim.",
    "Generate the quiz now.",
  ].join("\n");
}

export type GenerateResult = { ok: true; quiz: Quiz } | { ok: false; error: string };

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
