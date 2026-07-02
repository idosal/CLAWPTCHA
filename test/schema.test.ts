import { describe, it, expect } from "vitest";
import { validateQuiz, QUIZ_JSON_SCHEMA, redactForClient } from "../src/quiz/schema";

const validQuiz = {
  questions: [
    {
      type: "consequence_mcq",
      prompt: "After this change, what happens when a request has an expired token?",
      options: ["401 returned", "Token refreshed", "Request queued", "500 returned"],
      correct: [0],
    },
    {
      type: "blast_radius_multi",
      prompt: "Which behaviors does this PR affect?",
      options: ["Login flow", "Billing", "Search indexing", "Rate limiting"],
      correct: [0, 3],
    },
    {
      type: "false_claim",
      prompt: "One of these statements about the PR is FALSE. Which?",
      options: ["Adds retry logic", "Changes the public API", "Touches auth middleware", "Adds a test"],
      correct: [1],
    },
    {
      type: "consequence_mcq",
      prompt: "What happens if the cache is cold after deploy?",
      options: ["First request slow", "Crash", "Data loss", "No change"],
      correct: [0],
    },
  ],
};

describe("validateQuiz", () => {
  it("accepts a valid 4-question quiz", () => {
    expect(validateQuiz(validQuiz).ok).toBe(true);
  });

  it("rejects wrong question count", () => {
    const r = validateQuiz({ questions: validQuiz.questions.slice(0, 2) });
    expect(r.ok).toBe(false);
  });

  it("rejects single-answer types with multiple correct indices", () => {
    const bad = structuredClone(validQuiz);
    bad.questions[0].correct = [0, 1];
    expect(validateQuiz(bad).ok).toBe(false);
  });

  it("rejects out-of-range correct indices", () => {
    const bad = structuredClone(validQuiz);
    bad.questions[0].correct = [7];
    expect(validateQuiz(bad).ok).toBe(false);
  });

  it("rejects fewer than 4 options", () => {
    const bad = structuredClone(validQuiz);
    bad.questions[0].options = ["a", "b"];
    expect(validateQuiz(bad).ok).toBe(false);
  });
});

describe("redactForClient", () => {
  it("strips correct answers", () => {
    const r = validateQuiz(validQuiz);
    if (!r.ok) throw new Error("fixture invalid");
    const clientQ = redactForClient(r.quiz.questions[1]);
    expect(clientQ).not.toHaveProperty("correct");
    expect(clientQ.options).toHaveLength(4);
    expect(clientQ.multiSelect).toBe(true);
  });
});

describe("QUIZ_JSON_SCHEMA", () => {
  it("is a closed object schema (structured-outputs compatible)", () => {
    expect(QUIZ_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(QUIZ_JSON_SCHEMA.required).toEqual(["questions"]);
  });
});
