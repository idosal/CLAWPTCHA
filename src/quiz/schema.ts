import { z } from "zod";

export const QUESTION_TYPES = ["consequence_mcq", "blast_radius_multi", "false_claim"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correct: z.array(z.number().int().min(0).max(3)).min(1).max(4),
});

const quizSchema = z.object({
  questions: z.array(questionSchema).length(4),
});

export type Question = z.infer<typeof questionSchema>;
export type Quiz = z.infer<typeof quizSchema>;

export type ValidateResult = { ok: true; quiz: Quiz } | { ok: false; error: string };

export function validateQuiz(raw: unknown): ValidateResult {
  const parsed = quizSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  for (const [i, q] of parsed.data.questions.entries()) {
    const unique = new Set(q.correct);
    if (unique.size !== q.correct.length) {
      return { ok: false, error: `question ${i}: duplicate correct indices` };
    }
    if (q.type !== "blast_radius_multi" && q.correct.length !== 1) {
      return { ok: false, error: `question ${i}: ${q.type} must have exactly one correct answer` };
    }
  }
  return { ok: true, quiz: parsed.data };
}

export interface ClientQuestion {
  type: QuestionType;
  prompt: string;
  options: string[];
  multiSelect: boolean;
}

// Never send `correct` to the browser.
export function redactForClient(q: Question): ClientQuestion {
  return {
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    multiSelect: q.type === "blast_radius_multi",
  };
}

// JSON Schema for Anthropic structured outputs (output_config.format).
// Keep it simple: no minItems/maxItems (unsupported constraints) — zod
// validation above enforces counts after parsing.
export const QUIZ_JSON_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...QUESTION_TYPES] },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct: { type: "array", items: { type: "integer" } },
        },
        required: ["type", "prompt", "options", "correct"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;
