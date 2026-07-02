# Clawptcha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GitHub App + Cloudflare Workers service that gates PRs behind an LLM-generated comprehension quiz, posts an attestation on pass, and gives maintainers a behavioral risk report.

**Architecture:** One Cloudflare Worker (Hono router) handles GitHub webhooks, quiz generation (Anthropic API, lazy — only when the authenticated PR author starts the quiz), a server-rendered quiz UI, and grading. State lives in D1. Checks/comments go through the GitHub REST API using GitHub App auth. Spec: `docs/superpowers/specs/2026-07-02-clawptcha-design.md`.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, D1, `@anthropic-ai/sdk` (model `claude-sonnet-5`, structured outputs), `zod`, `yaml`, Vitest + `@cloudflare/vitest-pool-workers`, Cloudflare Turnstile.

**Conventions for every task:**
- Run tests with `npx vitest run <file>` from the repo root.
- Run `npx tsc --noEmit` before every commit.
- Commit messages: conventional commits (`feat:`, `test:`, `chore:`).
- All timestamps stored in D1 are ISO 8601 UTC strings; all "now" values are passed in as `Date` parameters so logic is testable (never call `Date.now()` inside pure logic modules).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.jsonc`, `vitest.config.ts`, `.gitignore`, `migrations/0001_init.sql`, `src/types.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "clawptcha",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:migrate:local": "wrangler d1 migrations apply clawptcha --local",
    "db:migrate": "wrangler d1 migrations apply clawptcha --remote"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "hono": "^4.6.0",
    "yaml": "^2.6.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.8.0",
    "@cloudflare/workers-types": "^4.20250620.0",
    "typescript": "^5.7.0",
    "vitest": "~3.0.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create wrangler.jsonc**

```jsonc
{
  "name": "clawptcha",
  "main": "src/index.ts",
  "compatibility_date": "2025-09-06", // latest supported by installed runtime; bump alongside wrangler upgrades
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    { "binding": "DB", "database_name": "clawptcha", "database_id": "REPLACE_AFTER_wrangler_d1_create" }
  ],
  "triggers": { "crons": ["*/15 * * * *"] },
  "vars": {
    "APP_BASE_URL": "https://clawptcha.example.workers.dev",
    "CLAUDE_MODEL": "claude-sonnet-5"
  }
  // Secrets (set via `wrangler secret put`):
  //   GITHUB_APP_ID, GITHUB_PRIVATE_KEY (PKCS#8 PEM), GITHUB_WEBHOOK_SECRET,
  //   GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET,
  //   ANTHROPIC_API_KEY, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY,
  //   SESSION_SIGNING_KEY (random 32+ bytes, hex)
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            GITHUB_APP_ID: "12345",
            GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
            GITHUB_OAUTH_CLIENT_ID: "test-client-id",
            GITHUB_OAUTH_CLIENT_SECRET: "test-client-secret",
            ANTHROPIC_API_KEY: "test-anthropic-key",
            TURNSTILE_SITE_KEY: "test-site-key",
            TURNSTILE_SECRET_KEY: "test-turnstile-secret",
            SESSION_SIGNING_KEY: "0123456789abcdef0123456789abcdef",
            GITHUB_PRIVATE_KEY: ""
          }
        }
      }
    }
  }
});
```

Note: `vitest-pool-workers` does NOT apply migrations automatically. The config uses an async `defineWorkersConfig` callback with `readD1Migrations`, a `TEST_MIGRATIONS` miniflare binding, and `test/apply-migrations.ts` in `setupFiles` calling `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`. See `test/migrations.test.ts` for the smoke test proving tables exist.

- [ ] **Step 5: Create .gitignore**

```
node_modules/
.wrangler/
dist/
.dev.vars
```

- [ ] **Step 6: Create migrations/0001_init.sql**

```sql
CREATE TABLE installations (
  id INTEGER PRIMARY KEY,           -- GitHub installation id
  account_login TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One challenge per (repo, PR, head_sha). Holds gate state + attempt counters.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,              -- unguessable token (crypto random, hex)
  installation_id INTEGER NOT NULL,
  repo_full_name TEXT NOT NULL,     -- "owner/name"
  pr_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  author_login TEXT NOT NULL,
  check_run_id INTEGER,
  status TEXT NOT NULL DEFAULT 'awaiting_approval',
    -- awaiting_approval | ready | passed | failed_final | neutral | superseded
  approved_by TEXT,
  attempts_used INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  config_json TEXT NOT NULL,        -- resolved ClawptchaConfig snapshot
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (repo_full_name, pr_number, head_sha)
);

-- One quiz per attempt. questions_json includes correct answers: server-side only.
CREATE TABLE quizzes (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  attempt_number INTEGER NOT NULL,
  questions_json TEXT NOT NULL,
  current_question INTEGER NOT NULL DEFAULT 0,
  question_served_at TEXT,
  answers_json TEXT NOT NULL DEFAULT '[]',   -- Answer[] (see quiz/schema.ts)
  telemetry_json TEXT NOT NULL DEFAULT '{}',
  turnstile_ok INTEGER,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  score INTEGER
);

-- Quiz-taking browser sessions, bound to a GitHub login after OAuth.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  gh_login TEXT,                    -- null until OAuth completes
  oauth_state TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Sliding-window rate limiting events.
CREATE TABLE rate_events (
  scope TEXT NOT NULL,              -- 'user:<login>' | 'repo:<full>' | 'inst:<id>'
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_rate_events ON rate_events(scope, created_at);
CREATE INDEX idx_challenges_pr ON challenges(repo_full_name, pr_number);
```

- [ ] **Step 7: Create src/types.ts**

```typescript
export interface Env {
  DB: D1Database;
  APP_BASE_URL: string;
  CLAUDE_MODEL: string;
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  ANTHROPIC_API_KEY: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  SESSION_SIGNING_KEY: string;
}

export type ChallengeStatus =
  | "awaiting_approval"
  | "ready"
  | "passed"
  | "failed_final"
  | "neutral"
  | "superseded";

export interface Challenge {
  id: string;
  installation_id: number;
  repo_full_name: string;
  pr_number: number;
  head_sha: string;
  author_login: string;
  check_run_id: number | null;
  status: ChallengeStatus;
  approved_by: string | null;
  attempts_used: number;
  cooldown_until: string | null;
  config_json: string;
  created_at: string;
}
```

- [ ] **Step 8: Install and verify**

Run: `npm install && npx tsc --noEmit`
Expected: install succeeds; typecheck passes (no source errors — there are no other source files yet).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: scaffold Workers project (Hono, D1, vitest-pool-workers)"
```

---

### Task 2: Config parsing and defaults

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/config.test.ts
import { describe, it, expect } from "vitest";
import { parseConfig, DEFAULT_CONFIG } from "../src/config";

describe("parseConfig", () => {
  it("returns defaults for null/empty input", () => {
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig("")).toEqual(DEFAULT_CONFIG);
  });

  it("merges partial YAML over defaults", () => {
    const cfg = parseConfig("pass_threshold: 4\nmax_attempts: 5\n");
    expect(cfg.pass_threshold).toBe(4);
    expect(cfg.max_attempts).toBe(5);
    expect(cfg.cooldown_minutes).toBe(15); // default preserved
  });

  it("parses require_approval enum and rejects bad values", () => {
    expect(parseConfig("require_approval: always").require_approval).toBe("always");
    // invalid value falls back to default rather than crashing webhook handling
    expect(parseConfig("require_approval: sometimes").require_approval).toBe("first_time");
  });

  it("parses skip lists and max_context_tokens", () => {
    const cfg = parseConfig(
      "skip_authors: [octocat]\nskip_paths: ['*.md']\nmax_context_tokens: 20000\n"
    );
    expect(cfg.skip_authors).toEqual(["octocat"]);
    expect(cfg.skip_paths).toEqual(["*.md"]);
    expect(cfg.max_context_tokens).toBe(20000);
  });

  it("returns defaults on malformed YAML", () => {
    expect(parseConfig(":: not yaml ::[")).toEqual(DEFAULT_CONFIG);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL — cannot resolve `../src/config`.

- [ ] **Step 3: Implement src/config.ts**

```typescript
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const configSchema = z.object({
  pass_threshold: z.number().int().min(1).max(4).catch(3),
  max_attempts: z.number().int().min(1).max(10).catch(3),
  cooldown_minutes: z.number().int().min(0).catch(15),
  require_approval: z.enum(["first_time", "always", "never"]).catch("first_time"),
  rechallenge_on_push: z.boolean().catch(false),
  skip_authors: z.array(z.string()).catch([]),
  skip_bots: z.boolean().catch(true),
  min_changed_lines: z.number().int().min(0).catch(10),
  skip_paths: z.array(z.string()).catch(["docs/**", "*.md"]),
  max_context_tokens: z.number().int().positive().nullable().catch(null),
});

export type ClawptchaConfig = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: ClawptchaConfig = configSchema.parse({});

export function parseConfig(yamlText: string | null): ClawptchaConfig {
  if (!yamlText) return DEFAULT_CONFIG;
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch {
    return DEFAULT_CONFIG;
  }
  if (raw === null || typeof raw !== "object") return DEFAULT_CONFIG;
  return configSchema.parse(raw);
}
```

Note: `.catch(default)` on each field means a single bad field degrades to its default instead of failing the whole config — a maintainer typo must never break merge gating. `configSchema.parse({})` works because every field has `.catch`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: clawptcha.yml config parsing with per-field fallback defaults"
```

---

### Task 3: Exemption rules

**Files:**
- Create: `src/policy/exemptions.ts`
- Test: `test/exemptions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/exemptions.test.ts
import { describe, it, expect } from "vitest";
import { evaluateExemption, matchesGlob } from "../src/policy/exemptions";
import { DEFAULT_CONFIG } from "../src/config";

const basePr = {
  authorLogin: "contributor",
  authorType: "User" as const,
  authorAssociation: "FIRST_TIME_CONTRIBUTOR",
  changedLines: 120,
  changedFiles: ["src/app.ts", "test/app.test.ts"],
};

describe("matchesGlob", () => {
  it("matches * within a segment and ** across segments", () => {
    expect(matchesGlob("*.md", "README.md")).toBe(true);
    expect(matchesGlob("*.md", "docs/README.md")).toBe(false);
    expect(matchesGlob("docs/**", "docs/a/b.txt")).toBe(true);
    expect(matchesGlob("docs/**", "src/a.ts")).toBe(false);
  });
});

describe("evaluateExemption", () => {
  it("challenges a normal contributor PR", () => {
    expect(evaluateExemption(basePr, DEFAULT_CONFIG)).toEqual({ exempt: false });
  });

  it("exempts bots when skip_bots", () => {
    const r = evaluateExemption({ ...basePr, authorType: "Bot" }, DEFAULT_CONFIG);
    expect(r).toEqual({ exempt: true, reason: "bot author" });
  });

  it("exempts allowlisted authors", () => {
    const cfg = { ...DEFAULT_CONFIG, skip_authors: ["contributor"] };
    expect(evaluateExemption(basePr, cfg).exempt).toBe(true);
  });

  it("exempts maintainers (OWNER/MEMBER/COLLABORATOR)", () => {
    for (const assoc of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      const r = evaluateExemption({ ...basePr, authorAssociation: assoc }, DEFAULT_CONFIG);
      expect(r.exempt).toBe(true);
    }
  });

  it("exempts tiny diffs", () => {
    const r = evaluateExemption({ ...basePr, changedLines: 5 }, DEFAULT_CONFIG);
    expect(r).toEqual({ exempt: true, reason: "diff below min_changed_lines" });
  });

  it("exempts docs-only diffs via skip_paths", () => {
    const r = evaluateExemption(
      { ...basePr, changedFiles: ["docs/guide.md", "CHANGELOG.md"] },
      DEFAULT_CONFIG
    );
    expect(r).toEqual({ exempt: true, reason: "all changed files match skip_paths" });
  });

  it("does not exempt when only some files match skip_paths", () => {
    const r = evaluateExemption(
      { ...basePr, changedFiles: ["docs/guide.md", "src/app.ts"] },
      DEFAULT_CONFIG
    );
    expect(r.exempt).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/exemptions.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement src/policy/exemptions.ts**

```typescript
import type { ClawptchaConfig } from "../config";

export interface PrFacts {
  authorLogin: string;
  authorType: "User" | "Bot";
  authorAssociation: string; // GitHub author_association enum
  changedLines: number;      // additions + deletions
  changedFiles: string[];
}

export type ExemptionResult = { exempt: false } | { exempt: true; reason: string };

const MAINTAINER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

// Minimal glob: '**' spans path segments, '*' matches within one segment.
export function matchesGlob(pattern: string, path: string): boolean {
  const regex = pattern
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*")
    )
    .join(".*");
  return new RegExp(`^${regex}$`).test(path);
}

export function evaluateExemption(pr: PrFacts, cfg: ClawptchaConfig): ExemptionResult {
  if (cfg.skip_bots && pr.authorType === "Bot") {
    return { exempt: true, reason: "bot author" };
  }
  if (cfg.skip_authors.includes(pr.authorLogin)) {
    return { exempt: true, reason: "author in skip_authors" };
  }
  if (MAINTAINER_ASSOCIATIONS.has(pr.authorAssociation)) {
    return { exempt: true, reason: `maintainer (${pr.authorAssociation})` };
  }
  if (pr.changedLines < cfg.min_changed_lines) {
    return { exempt: true, reason: "diff below min_changed_lines" };
  }
  if (
    pr.changedFiles.length > 0 &&
    pr.changedFiles.every((f) => cfg.skip_paths.some((p) => matchesGlob(p, f)))
  ) {
    return { exempt: true, reason: "all changed files match skip_paths" };
  }
  return { exempt: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/exemptions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/policy/exemptions.ts test/exemptions.test.ts
git commit -m "feat: PR exemption rules (bots, maintainers, size, skip_paths)"
```

---

### Task 4: Quiz schema and validation

**Files:**
- Create: `src/quiz/schema.ts`
- Test: `test/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/schema.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/schema.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement src/quiz/schema.ts**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/quiz/schema.ts test/schema.test.ts
git commit -m "feat: quiz schema, zod validation, client redaction"
```

---

### Task 5: Grading and attempt/cooldown state machine

**Files:**
- Create: `src/quiz/grade.ts`
- Test: `test/grade.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/grade.test.ts
import { describe, it, expect } from "vitest";
import { gradeAnswer, scoreQuiz, canStartAttempt, nextCooldown } from "../src/quiz/grade";
import type { Question } from "../src/quiz/schema";
import { DEFAULT_CONFIG } from "../src/config";

const mcq: Question = {
  type: "consequence_mcq",
  prompt: "x?",
  options: ["a", "b", "c", "d"],
  correct: [2],
};
const multi: Question = {
  type: "blast_radius_multi",
  prompt: "y?",
  options: ["a", "b", "c", "d"],
  correct: [0, 3],
};

describe("gradeAnswer", () => {
  it("grades single-choice exactly", () => {
    expect(gradeAnswer(mcq, [2])).toBe(true);
    expect(gradeAnswer(mcq, [1])).toBe(false);
    expect(gradeAnswer(mcq, [])).toBe(false);
  });

  it("grades multi-select as exact set match", () => {
    expect(gradeAnswer(multi, [3, 0])).toBe(true);   // order-insensitive
    expect(gradeAnswer(multi, [0])).toBe(false);      // subset fails
    expect(gradeAnswer(multi, [0, 3, 1])).toBe(false); // superset fails
  });

  it("treats timed-out answers (null) as wrong", () => {
    expect(gradeAnswer(mcq, null)).toBe(false);
  });
});

describe("scoreQuiz", () => {
  it("counts correct answers and applies threshold", () => {
    const questions = [mcq, multi, mcq, mcq];
    const answers = [[2], [0, 3], [1], [2]]; // 3 of 4 correct
    const r = scoreQuiz(questions, answers, 3);
    expect(r).toEqual({ score: 3, passed: true });
    expect(scoreQuiz(questions, answers, 4).passed).toBe(false);
  });
});

describe("canStartAttempt", () => {
  const now = new Date("2026-07-02T12:00:00Z");
  const base = {
    status: "ready" as const,
    attempts_used: 0,
    cooldown_until: null as string | null,
  };

  it("allows a fresh challenge", () => {
    expect(canStartAttempt(base, DEFAULT_CONFIG, now)).toEqual({ allowed: true });
  });

  it("blocks during cooldown", () => {
    const r = canStartAttempt(
      { ...base, attempts_used: 1, cooldown_until: "2026-07-02T12:10:00Z" },
      DEFAULT_CONFIG,
      now
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("cooldown");
  });

  it("allows after cooldown expires", () => {
    const r = canStartAttempt(
      { ...base, attempts_used: 1, cooldown_until: "2026-07-02T11:59:00Z" },
      DEFAULT_CONFIG,
      now
    );
    expect(r.allowed).toBe(true);
  });

  it("blocks when attempts exhausted", () => {
    const r = canStartAttempt({ ...base, attempts_used: 3 }, DEFAULT_CONFIG, now);
    expect(r).toEqual({ allowed: false, reason: "attempts_exhausted" });
  });

  it("blocks when not in ready state", () => {
    for (const status of ["awaiting_approval", "passed", "failed_final", "neutral", "superseded"] as const) {
      const r = canStartAttempt({ ...base, status }, DEFAULT_CONFIG, now);
      expect(r.allowed).toBe(false);
    }
  });
});

describe("nextCooldown", () => {
  it("returns ISO time cooldown_minutes after now", () => {
    const now = new Date("2026-07-02T12:00:00.000Z");
    expect(nextCooldown(DEFAULT_CONFIG, now)).toBe("2026-07-02T12:15:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/grade.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement src/quiz/grade.ts**

```typescript
import type { Question } from "./schema";
import type { ClawptchaConfig } from "../config";
import type { ChallengeStatus } from "../types";

// answers: selected option indices; null = question timed out unanswered.
export type Answer = number[] | null;

export function gradeAnswer(q: Question, answer: Answer): boolean {
  if (answer === null || answer.length === 0) return false;
  const got = [...new Set(answer)].sort((a, b) => a - b);
  const want = [...q.correct].sort((a, b) => a - b);
  return got.length === want.length && got.every((v, i) => v === want[i]);
}

export function scoreQuiz(
  questions: Question[],
  answers: Answer[],
  passThreshold: number
): { score: number; passed: boolean } {
  const score = questions.reduce(
    (acc, q, i) => acc + (gradeAnswer(q, answers[i] ?? null) ? 1 : 0),
    0
  );
  return { score, passed: score >= passThreshold };
}

export interface AttemptState {
  status: ChallengeStatus;
  attempts_used: number;
  cooldown_until: string | null;
}

export type AttemptGate =
  | { allowed: true }
  | { allowed: false; reason: "not_ready" | "attempts_exhausted" | "cooldown" };

export function canStartAttempt(
  state: AttemptState,
  cfg: ClawptchaConfig,
  now: Date
): AttemptGate {
  if (state.status !== "ready") return { allowed: false, reason: "not_ready" };
  if (state.attempts_used >= cfg.max_attempts) {
    return { allowed: false, reason: "attempts_exhausted" };
  }
  if (state.cooldown_until && new Date(state.cooldown_until) > now) {
    return { allowed: false, reason: "cooldown" };
  }
  return { allowed: true };
}

export function nextCooldown(cfg: ClawptchaConfig, now: Date): string {
  return new Date(now.getTime() + cfg.cooldown_minutes * 60_000).toISOString();
}

// Server-side per-question time limit: 90s + 15s grace for network latency.
export const QUESTION_TIME_LIMIT_MS = 90_000;
export const QUESTION_GRACE_MS = 15_000;

export function answerWithinTimeLimit(servedAt: string, now: Date): boolean {
  return now.getTime() - new Date(servedAt).getTime() <= QUESTION_TIME_LIMIT_MS + QUESTION_GRACE_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/grade.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/quiz/grade.ts test/grade.test.ts
git commit -m "feat: grading, pass threshold, attempt/cooldown state machine"
```

---

### Task 6: Risk report assembly

**Files:**
- Create: `src/risk/report.ts`
- Test: `test/report.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/report.test.ts
import { describe, it, expect } from "vitest";
import { buildRiskReport, renderRiskReportMarkdown, type Telemetry } from "../src/risk/report";

const humanTelemetry: Telemetry = {
  perQuestionMs: [42000, 61000, 35000, 55000],
  answerChanges: 3,
  pointerDistancePx: 8400,
  pointerSamples: 412,
  focusLossCount: 1,
  webdriver: false,
  turnstileOk: true,
};

const botTelemetry: Telemetry = {
  perQuestionMs: [4000, 5000, 3500, 4200],
  answerChanges: 0,
  pointerDistancePx: 30,
  pointerSamples: 4,
  focusLossCount: 0,
  webdriver: true,
  turnstileOk: false,
};

describe("buildRiskReport", () => {
  it("scores a human-looking pass as low risk", () => {
    const r = buildRiskReport(humanTelemetry);
    expect(r.automationLikely).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it("flags automation fingerprints and fast uniform answers", () => {
    const r = buildRiskReport(botTelemetry);
    expect(r.automationLikely).toBe(true);
    expect(r.signals).toContain("webdriver flag present");
    expect(r.signals).toContain("turnstile failed or missing");
    expect(r.signals).toContain("all answers under 10s");
    expect(r.signals).toContain("negligible pointer movement");
  });

  it("handles missing telemetry gracefully (reports unknown, not low-risk)", () => {
    const r = buildRiskReport(null);
    expect(r.automationLikely).toBe(false);
    expect(r.signals).toContain("no telemetry received");
  });
});

describe("renderRiskReportMarkdown", () => {
  it("includes timings, verdict and signals", () => {
    const md = renderRiskReportMarkdown(buildRiskReport(botTelemetry), botTelemetry);
    expect(md).toContain("automation-likely");
    expect(md).toContain("Q1: 4s");
    expect(md).toContain("Turnstile");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/report.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement src/risk/report.ts**

```typescript
import { z } from "zod";

export const telemetrySchema = z.object({
  perQuestionMs: z.array(z.number().nonnegative()).catch([]),
  answerChanges: z.number().int().nonnegative().catch(0),
  pointerDistancePx: z.number().nonnegative().catch(0),
  pointerSamples: z.number().int().nonnegative().catch(0),
  focusLossCount: z.number().int().nonnegative().catch(0),
  webdriver: z.boolean().catch(false),
  turnstileOk: z.boolean().catch(false),
});

export type Telemetry = z.infer<typeof telemetrySchema>;

export interface RiskReport {
  automationLikely: boolean;
  signals: string[];
}

// Simple heuristics only in v1 (spec: telemetry informs, never auto-fails).
export function buildRiskReport(t: Telemetry | null): RiskReport {
  if (t === null) {
    return { automationLikely: false, signals: ["no telemetry received"] };
  }
  const signals: string[] = [];
  if (t.webdriver) signals.push("webdriver flag present");
  if (!t.turnstileOk) signals.push("turnstile failed or missing");
  if (t.perQuestionMs.length > 0 && t.perQuestionMs.every((ms) => ms < 10_000)) {
    signals.push("all answers under 10s");
  }
  if (t.pointerDistancePx < 200 || t.pointerSamples < 10) {
    signals.push("negligible pointer movement");
  }
  // "automation-likely" needs 2+ independent signals — any single one can be
  // an accessibility setup (keyboard-only users have low pointer movement).
  return { automationLikely: signals.length >= 2, signals };
}

export function renderRiskReportMarkdown(report: RiskReport, t: Telemetry | null): string {
  const lines: string[] = ["### Risk report", ""];
  lines.push(
    report.automationLikely
      ? "**Verdict: automation-likely** — review this pass manually."
      : report.signals.length > 0
        ? "**Verdict: inconclusive** — some signals present."
        : "**Verdict: no automation signals.**"
  );
  lines.push("");
  if (t) {
    const total = t.perQuestionMs.reduce((a, b) => a + b, 0);
    lines.push(`- Total time: ${Math.round(total / 1000)}s`);
    lines.push(
      `- Per question: ${t.perQuestionMs.map((ms, i) => `Q${i + 1}: ${Math.round(ms / 1000)}s`).join(", ")}`
    );
    lines.push(`- Turnstile: ${t.turnstileOk ? "passed" : "failed/missing"}`);
    lines.push(`- Answer changes: ${t.answerChanges}, focus losses: ${t.focusLossCount}`);
    lines.push(`- Pointer: ${Math.round(t.pointerDistancePx)}px over ${t.pointerSamples} samples`);
  }
  if (report.signals.length > 0) {
    lines.push("", "Signals:");
    for (const s of report.signals) lines.push(`- ${s}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/risk/report.ts test/report.test.ts
git commit -m "feat: behavioral risk report with simple heuristics"
```

---

### Task 7: Rate limiter (D1-backed)

**Files:**
- Create: `src/policy/ratelimit.ts`
- Test: `test/ratelimit.test.ts`

- [ ] **Step 1: Write the failing test**

Uses the real test D1 from `vitest-pool-workers` (`env` import comes from `cloudflare:test`).

```typescript
// test/ratelimit.test.ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { checkAndRecordRate, RATE_LIMITS } from "../src/policy/ratelimit";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

describe("checkAndRecordRate", () => {
  it("allows generations up to the per-user cap, then blocks", async () => {
    const scopes = { user: "user:alice", repo: "repo:o/r", installation: "inst:1" };
    for (let i = 0; i < RATE_LIMITS.user; i++) {
      const r = await checkAndRecordRate(testEnv.DB, scopes, new Date());
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkAndRecordRate(testEnv.DB, scopes, new Date());
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.scope).toBe("user");
  });

  it("does not record an event when blocked", async () => {
    const scopes = { user: "user:bob", repo: "repo:o/r2", installation: "inst:2" };
    for (let i = 0; i < RATE_LIMITS.user + 3; i++) {
      await checkAndRecordRate(testEnv.DB, scopes, new Date());
    }
    const { results } = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS n FROM rate_events WHERE scope = ?"
    ).bind("user:bob").all<{ n: number }>();
    expect(results[0].n).toBe(RATE_LIMITS.user);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ratelimit.test.ts`
Expected: FAIL — cannot resolve module. (If it instead fails with "no such table: rate_events", apply the note from Task 1 Step 4.)

- [ ] **Step 3: Implement src/policy/ratelimit.ts**

```typescript
// Sliding 1-hour window caps on quiz *generations* (the expensive LLM call).
export const RATE_LIMITS = { user: 6, repo: 20, installation: 60 } as const;
const WINDOW_MS = 60 * 60 * 1000;

export interface RateScopes {
  user: string;         // "user:<login>"
  repo: string;         // "repo:<owner/name>"
  installation: string; // "inst:<id>"
}

export type RateResult = { allowed: true } | { allowed: false; scope: keyof typeof RATE_LIMITS };

export async function checkAndRecordRate(
  db: D1Database,
  scopes: RateScopes,
  now: Date
): Promise<RateResult> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  for (const key of ["user", "repo", "installation"] as const) {
    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM rate_events WHERE scope = ? AND created_at >= ?")
      .bind(scopes[key], since)
      .first<{ n: number }>();
    if ((row?.n ?? 0) >= RATE_LIMITS[key]) return { allowed: false, scope: key };
  }
  await db.batch([
    db.prepare("INSERT INTO rate_events (scope, created_at) VALUES (?, ?)").bind(scopes.user, now.toISOString()),
    db.prepare("INSERT INTO rate_events (scope, created_at) VALUES (?, ?)").bind(scopes.repo, now.toISOString()),
    db.prepare("INSERT INTO rate_events (scope, created_at) VALUES (?, ?)").bind(scopes.installation, now.toISOString()),
  ]);
  return { allowed: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ratelimit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/policy/ratelimit.ts test/ratelimit.test.ts
git commit -m "feat: per-user/repo/installation rate limits on quiz generation"
```

---

### Task 8: Webhook signature verification

**Files:**
- Create: `src/github/webhook.ts`
- Test: `test/webhook.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/webhook.test.ts
import { describe, it, expect } from "vitest";
import { verifyWebhookSignature, signBody } from "../src/github/webhook";

const SECRET = "test-webhook-secret";

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed body", async () => {
    const body = JSON.stringify({ action: "opened" });
    const sig = await signBody(SECRET, body);
    expect(await verifyWebhookSignature(SECRET, body, sig)).toBe(true);
  });

  it("rejects wrong signature, wrong secret, and missing header", async () => {
    const body = "{}";
    const sig = await signBody(SECRET, body);
    expect(await verifyWebhookSignature(SECRET, body + "x", sig)).toBe(false);
    expect(await verifyWebhookSignature("other-secret", body, sig)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, null)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, "sha256=deadbeef")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/webhook.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement src/github/webhook.ts**

```typescript
const encoder = new TextEncoder();

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Exposed for tests: produce the header value GitHub would send.
export async function signBody(secret: string, body: string): Promise<string> {
  return `sha256=${await hmacHex(secret, body)}`;
}

export async function verifyWebhookSignature(
  secret: string,
  body: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = await signBody(secret, body);
  // constant-time compare
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/webhook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/github/webhook.ts test/webhook.test.ts
git commit -m "feat: GitHub webhook HMAC signature verification"
```

---

### Task 9: GitHub App auth (JWT + installation tokens)

**Files:**
- Create: `src/github/auth.ts`
- Test: `test/auth.test.ts`

GitHub App private keys download as PKCS#1 (`BEGIN RSA PRIVATE KEY`). Web Crypto only imports PKCS#8. The deploy docs (Task 15) instruct converting once with:
`openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app-pkcs8.pem`

- [ ] **Step 1: Write the failing test**

The test generates its own RSA key via Web Crypto, exports it as PKCS#8 PEM, and verifies the JWT it produces — no fixtures needed.

```typescript
// test/auth.test.ts
import { describe, it, expect } from "vitest";
import { createAppJwt } from "../src/github/auth";

async function generateTestKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  // workers-types can't narrow generateKey's union; algorithm dict guarantees a key pair
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  // workers-types can't narrow exportKey's union either; "pkcs8" format always yields an ArrayBuffer
  const pkcs8 = (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer;
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  const lines = b64.match(/.{1,64}/g)!.join("\n");
  const pem = `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
  return { pem, publicKey: pair.publicKey };
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

describe("createAppJwt", () => {
  it("produces a verifiable RS256 JWT with iss/iat/exp", async () => {
    const { pem, publicKey } = await generateTestKey();
    const now = new Date("2026-07-02T12:00:00Z");
    const jwt = await createAppJwt("12345", pem, now);
    const [h, p, s] = jwt.split(".");
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(payload.iss).toBe("12345");
    expect(payload.iat).toBe(Math.floor(now.getTime() / 1000) - 60);
    expect(payload.exp).toBe(Math.floor(now.getTime() / 1000) + 540);
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`)
    );
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/auth.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement src/github/auth.ts**

```typescript
const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(encoder.encode(JSON.stringify(obj)));
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

export async function createAppJwt(appId: string, pkcs8Pem: string, now: Date): Promise<string> {
  const epoch = Math.floor(now.getTime() / 1000);
  const header = b64urlJson({ alg: "RS256", typ: "JWT" });
  // iat 60s in the past guards against clock drift; exp max 10min (GitHub limit).
  const payload = b64urlJson({ iat: epoch - 60, exp: epoch + 540, iss: appId });
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToBytes(pkcs8Pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

// Installation tokens are cached per installation for ~55 minutes.
const tokenCache = new Map<number, { token: string; expiresAtMs: number }>();

export async function getInstallationToken(
  appId: string,
  pkcs8Pem: string,
  installationId: number,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) return cached.token;

  const jwt = await createAppJwt(appId, pkcs8Pem, new Date());
  const res = await fetchFn(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "user-agent": "clawptcha",
      },
    }
  );
  if (!res.ok) throw new Error(`installation token failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { token: string; expires_at: string };
  tokenCache.set(installationId, {
    token: data.token,
    expiresAtMs: new Date(data.expires_at).getTime(),
  });
  return data.token;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/github/auth.ts test/auth.test.ts
git commit -m "feat: GitHub App JWT signing and installation token fetch"
```

---

### Task 10: GitHub REST helpers

**Files:**
- Create: `src/github/api.ts`
- Test: `test/api.test.ts`

A thin typed client. Constructor takes a token and an injectable `fetch` so tests stub the network.

- [ ] **Step 1: Write the failing test**

```typescript
// test/api.test.ts
import { describe, it, expect, vi } from "vitest";
import { GitHubApi } from "../src/github/api";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": typeof body === "string" ? "text/plain" : "application/json" },
    });
  });
}

describe("GitHubApi", () => {
  it("creates a check run with auth headers", async () => {
    const f = mockFetch(201, { id: 42 });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    const id = await api.createCheckRun("o/r", {
      name: "clawptcha", head_sha: "abc", status: "queued",
      output: { title: "t", summary: "s" },
    });
    expect(id).toBe(42);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/o/r/check-runs");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("fetches a PR diff with the diff media type", async () => {
    const f = mockFetch(200, "diff --git a/x b/x");
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    const diff = await api.getPrDiff("o/r", 7);
    expect(diff).toContain("diff --git");
    const [, init] = f.mock.calls[0];
    expect((init!.headers as Record<string, string>).accept).toBe("application/vnd.github.diff");
  });

  it("returns null for a missing config file (404)", async () => {
    const f = mockFetch(404, { message: "Not Found" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    expect(await api.getFileContent("o/r", ".github/clawptcha.yml", "main")).toBeNull();
  });

  it("decodes base64 file content", async () => {
    const f = mockFetch(200, { content: btoa("pass_threshold: 4\n"), encoding: "base64" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    expect(await api.getFileContent("o/r", ".github/clawptcha.yml", "main")).toBe("pass_threshold: 4\n");
  });

  it("upserts the clawptcha PR comment (updates when marker found)", async () => {
    const existing = [{ id: 9, body: "<!-- clawptcha --> old" }];
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify(existing), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 9 }), { status: 200 });
    });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    await api.upsertPrComment("o/r", 7, "new body");
    const patchCall = f.mock.calls.find(([, i]) => i?.method === "PATCH");
    expect(patchCall).toBeDefined();
    expect(String(patchCall![0])).toContain("/issues/comments/9");
    expect(JSON.parse(String(patchCall![1]!.body)).body).toContain("<!-- clawptcha -->");
  });

  it("throws on 5xx", async () => {
    const f = mockFetch(500, { message: "boom" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    await expect(api.getPrDiff("o/r", 7)).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/api.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement src/github/api.ts**

```typescript
const API = "https://api.github.com";
export const COMMENT_MARKER = "<!-- clawptcha -->";

export interface CheckRunCreate {
  name: string;
  head_sha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral";
  output?: { title: string; summary: string };
}

export interface PrDetails {
  number: number;
  head_sha: string;
  author_login: string;
  author_type: "User" | "Bot";
  author_association: string;
  additions: number;
  deletions: number;
  title: string;
  body: string | null;
}

export class GitHubApi {
  constructor(
    private token: string,
    private fetchFn: typeof fetch = fetch
  ) {}

  private headers(accept = "application/vnd.github+json"): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      accept,
      "user-agent": "clawptcha",
      "x-github-api-version": "2022-11-28",
    };
  }

  private async req(path: string, init: RequestInit = {}, accept?: string): Promise<Response> {
    const res = await this.fetchFn(`${API}${path}`, {
      ...init,
      headers: { ...this.headers(accept), ...(init.body ? { "content-type": "application/json" } : {}) },
    });
    if (res.status >= 500) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    return res;
  }

  async createCheckRun(repo: string, check: CheckRunCreate): Promise<number> {
    const res = await this.req(`/repos/${repo}/check-runs`, {
      method: "POST",
      body: JSON.stringify(check),
    });
    if (!res.ok) throw new Error(`createCheckRun ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { id: number }).id;
  }

  async updateCheckRun(repo: string, checkRunId: number, patch: Partial<CheckRunCreate>): Promise<void> {
    const res = await this.req(`/repos/${repo}/check-runs/${checkRunId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`updateCheckRun ${res.status}: ${await res.text()}`);
  }

  async getPrDiff(repo: string, prNumber: number): Promise<string> {
    const res = await this.req(`/repos/${repo}/pulls/${prNumber}`, {}, "application/vnd.github.diff");
    if (!res.ok) throw new Error(`getPrDiff ${res.status}`);
    return res.text();
  }

  async getPr(repo: string, prNumber: number): Promise<PrDetails> {
    const res = await this.req(`/repos/${repo}/pulls/${prNumber}`);
    if (!res.ok) throw new Error(`getPr ${res.status}`);
    const p = (await res.json()) as any;
    return {
      number: p.number,
      head_sha: p.head.sha,
      author_login: p.user.login,
      author_type: p.user.type === "Bot" ? "Bot" : "User",
      author_association: p.author_association,
      additions: p.additions,
      deletions: p.deletions,
      title: p.title,
      body: p.body ?? null,
    };
  }

  async listPrFiles(repo: string, prNumber: number): Promise<string[]> {
    const res = await this.req(`/repos/${repo}/pulls/${prNumber}/files?per_page=100`);
    if (!res.ok) throw new Error(`listPrFiles ${res.status}`);
    return ((await res.json()) as Array<{ filename: string }>).map((f) => f.filename);
  }

  async getFileContent(repo: string, path: string, ref: string): Promise<string | null> {
    const res = await this.req(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getFileContent ${res.status}`);
    const data = (await res.json()) as { content: string };
    return atob(data.content.replace(/\n/g, ""));
  }

  // One managed comment per PR, identified by COMMENT_MARKER.
  async upsertPrComment(repo: string, prNumber: number, body: string): Promise<void> {
    const full = `${COMMENT_MARKER}\n${body}`;
    const listRes = await this.req(`/repos/${repo}/issues/${prNumber}/comments?per_page=100`);
    if (listRes.ok) {
      const comments = (await listRes.json()) as Array<{ id: number; body: string }>;
      const mine = comments.find((c) => c.body.includes(COMMENT_MARKER));
      if (mine) {
        const res = await this.req(`/repos/${repo}/issues/comments/${mine.id}`, {
          method: "PATCH",
          body: JSON.stringify({ body: full }),
        });
        if (!res.ok) throw new Error(`upsertPrComment PATCH ${res.status}`);
        return;
      }
    }
    const res = await this.req(`/repos/${repo}/issues/${prNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: full }),
    });
    if (!res.ok) throw new Error(`upsertPrComment POST ${res.status}`);
  }

  // Permission of a user on a repo ("admin" | "write" | "read" | "none").
  async getUserPermission(repo: string, username: string): Promise<string> {
    const res = await this.req(`/repos/${repo}/collaborators/${encodeURIComponent(username)}/permission`);
    if (!res.ok) return "none";
    return ((await res.json()) as { permission: string }).permission;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/github/api.ts test/api.test.ts
git commit -m "feat: typed GitHub REST helpers (checks, comments, diff, config)"
```

---

### Task 11: Challenge store + webhook event handling

**Files:**
- Create: `src/store.ts`, `src/github/events.ts`
- Test: `test/events.test.ts`

`store.ts` is the D1 access layer for challenges. `events.ts` contains the pure-ish event orchestration, taking a `GitHubApi` instance so tests inject a stub.

- [ ] **Step 1: Write the failing test**

```typescript
// test/events.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handlePullRequestEvent, handleIssueCommentEvent } from "../src/github/events";
import { getChallengeByPr } from "../src/store";
import type { Env } from "../src/types";
import type { GitHubApi, PrDetails } from "../src/github/api";

const testEnv = env as unknown as Env;

function stubApi(overrides: Partial<Record<keyof GitHubApi, any>> = {}): GitHubApi {
  return {
    createCheckRun: vi.fn(async () => 42),
    updateCheckRun: vi.fn(async () => {}),
    getPrDiff: vi.fn(async () => "diff --git a/src/app.ts b/src/app.ts\n+code"),
    getPr: vi.fn(async (): Promise<PrDetails> => pr),
    listPrFiles: vi.fn(async () => ["src/app.ts"]),
    getFileContent: vi.fn(async () => null), // no clawptcha.yml → defaults
    upsertPrComment: vi.fn(async () => {}),
    getUserPermission: vi.fn(async () => "none"),
    ...overrides,
  } as unknown as GitHubApi;
}

const pr: PrDetails = {
  number: 7, head_sha: "abc123", author_login: "contributor",
  author_type: "User", author_association: "FIRST_TIME_CONTRIBUTOR",
  additions: 100, deletions: 30, title: "Add feature", body: "Does a thing",
};

const prPayload = {
  action: "opened",
  installation: { id: 1 },
  repository: { full_name: "o/r" },
  pull_request: {
    number: 7, head: { sha: "abc123" }, base: { sha: "base000" },
    user: { login: "contributor", type: "User" },
    author_association: "FIRST_TIME_CONTRIBUTOR",
    additions: 100, deletions: 30, title: "Add feature", body: "Does a thing",
  },
};

let uniq = 0;
function payloadFor(prNumber: number, sha = "abc123") {
  const p = structuredClone(prPayload);
  p.pull_request.number = prNumber;
  p.pull_request.head.sha = sha;
  return p;
}

beforeEach(() => { uniq += 100; });

describe("handlePullRequestEvent", () => {
  it("creates a pending check, comment, and awaiting_approval challenge for first-timers", async () => {
    const api = stubApi();
    const n = uniq + 1;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      name: "clawptcha", head_sha: "abc123", status: "queued",
    }));
    expect(api.upsertPrComment).toHaveBeenCalled();
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("awaiting_approval");
    expect(ch?.check_run_id).toBe(42);
  });

  it("skips approval gate for known contributors under first_time policy", async () => {
    const api = stubApi({
      getPr: vi.fn(async () => ({ ...pr, author_association: "CONTRIBUTOR" })),
    });
    const n = uniq + 2;
    const p = payloadFor(n);
    p.pull_request.author_association = "CONTRIBUTOR";
    await handlePullRequestEvent(testEnv, api, p);
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("ready");
  });

  it("auto-passes exempt PRs (docs-only) with a success check and no challenge row", async () => {
    const api = stubApi({ listPrFiles: vi.fn(async () => ["docs/x.md", "README.md"]) });
    const n = uniq + 3;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      status: "completed", conclusion: "success",
    }));
    expect(await getChallengeByPr(testEnv.DB, "o/r", n, "abc123")).toBeNull();
  });

  it("is idempotent for the same head sha (webhook redelivery)", async () => {
    const api = stubApi();
    const n = uniq + 4;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(api.createCheckRun).toHaveBeenCalledTimes(1);
  });

  it("keeps a pass on synchronize by default; supersedes old challenge on new sha", async () => {
    const api = stubApi();
    const n = uniq + 5;
    await handlePullRequestEvent(testEnv, api, payloadFor(n, "sha1"));
    // simulate the sha1 challenge having been passed
    await testEnv.DB.prepare(
      "UPDATE challenges SET status='passed' WHERE repo_full_name='o/r' AND pr_number=? AND head_sha='sha1'"
    ).bind(n).run();
    const p2 = payloadFor(n, "sha2");
    p2.action = "synchronize";
    const api2 = stubApi({ getPr: vi.fn(async () => ({ ...pr, number: n, head_sha: "sha2" })) });
    await handlePullRequestEvent(testEnv, api2, p2);
    // rechallenge_on_push=false → new sha auto-passes because prior pass exists
    expect(api2.createCheckRun).toHaveBeenCalledWith("o/r", expect.objectContaining({
      head_sha: "sha2", status: "completed", conclusion: "success",
    }));
  });

  it("reads clawptcha.yml from the base SHA, not the PR head", async () => {
    const getFileContent = vi.fn(async () => null);
    const api = stubApi({ getFileContent });
    const n = uniq + 8;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    expect(getFileContent).toHaveBeenCalledWith("o/r", ".github/clawptcha.yml", "base000");
  });
});

describe("handleIssueCommentEvent", () => {
  it("approves the newest challenge on '/clawptcha approve' from a maintainer", async () => {
    const api = stubApi();
    const n = uniq + 6;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    const approver = stubApi({ getUserPermission: vi.fn(async () => "write") });
    await handleIssueCommentEvent(testEnv, approver, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: { body: "/clawptcha approve", user: { login: "maintainer" } },
    });
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("ready");
    expect(ch?.approved_by).toBe("maintainer");
  });

  it("ignores approval from users without write access", async () => {
    const api = stubApi();
    const n = uniq + 7;
    await handlePullRequestEvent(testEnv, api, payloadFor(n));
    await handleIssueCommentEvent(testEnv, api, {
      action: "created",
      installation: { id: 1 },
      repository: { full_name: "o/r" },
      issue: { number: n, pull_request: {} },
      comment: { body: "/clawptcha approve", user: { login: "rando" } },
    });
    const ch = await getChallengeByPr(testEnv.DB, "o/r", n, "abc123");
    expect(ch?.status).toBe("awaiting_approval");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/events.test.ts`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Implement src/store.ts**

```typescript
import type { Challenge, ChallengeStatus } from "./types";

export function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getChallengeByPr(
  db: D1Database, repo: string, prNumber: number, headSha: string
): Promise<Challenge | null> {
  return db
    .prepare("SELECT * FROM challenges WHERE repo_full_name=? AND pr_number=? AND head_sha=?")
    .bind(repo, prNumber, headSha)
    .first<Challenge>();
}

export async function getChallenge(db: D1Database, id: string): Promise<Challenge | null> {
  return db.prepare("SELECT * FROM challenges WHERE id=?").bind(id).first<Challenge>();
}

export async function getLatestChallengeForPr(
  db: D1Database, repo: string, prNumber: number
): Promise<Challenge | null> {
  return db
    .prepare(
      "SELECT * FROM challenges WHERE repo_full_name=? AND pr_number=? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(repo, prNumber)
    .first<Challenge>();
}

export async function hasPassedChallenge(
  db: D1Database, repo: string, prNumber: number
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS x FROM challenges WHERE repo_full_name=? AND pr_number=? AND status='passed' LIMIT 1"
    )
    .bind(repo, prNumber)
    .first();
  return row !== null;
}

export async function insertChallenge(db: D1Database, c: Omit<Challenge, "created_at">): Promise<void> {
  await db
    .prepare(
      `INSERT INTO challenges
       (id, installation_id, repo_full_name, pr_number, head_sha, author_login,
        check_run_id, status, approved_by, attempts_used, cooldown_until, config_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      c.id, c.installation_id, c.repo_full_name, c.pr_number, c.head_sha, c.author_login,
      c.check_run_id, c.status, c.approved_by, c.attempts_used, c.cooldown_until, c.config_json
    )
    .run();
}

export async function setChallengeStatus(
  db: D1Database, id: string, status: ChallengeStatus, approvedBy?: string
): Promise<void> {
  if (approvedBy !== undefined) {
    await db.prepare("UPDATE challenges SET status=?, approved_by=? WHERE id=?")
      .bind(status, approvedBy, id).run();
  } else {
    await db.prepare("UPDATE challenges SET status=? WHERE id=?").bind(status, id).run();
  }
}

export async function supersedeOldChallenges(
  db: D1Database, repo: string, prNumber: number, keepHeadSha: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE challenges SET status='superseded'
       WHERE repo_full_name=? AND pr_number=? AND head_sha != ?
         AND status IN ('awaiting_approval','ready')`
    )
    .bind(repo, prNumber, keepHeadSha)
    .run();
}
```

- [ ] **Step 4: Implement src/github/events.ts**

```typescript
import type { Env } from "../types";
import type { GitHubApi } from "./api";
import { parseConfig, type ClawptchaConfig } from "../config";
import { evaluateExemption } from "../policy/exemptions";
import {
  getChallengeByPr, getLatestChallengeForPr, hasPassedChallenge,
  insertChallenge, setChallengeStatus, supersedeOldChallenges, randomToken,
} from "../store";

export const CHECK_NAME = "clawptcha";

function challengeUrl(env: Env, challengeId: string): string {
  return `${env.APP_BASE_URL}/challenge/${challengeId}`;
}

function commentBody(env: Env, challengeId: string, status: string, cfg: ClawptchaConfig, authorLogin: string): string {
  const url = challengeUrl(env, challengeId);
  if (status === "awaiting_approval") {
    return [
      "## 🦞 Clawptcha",
      "",
      "This PR requires a comprehension check before merge. A maintainer must approve the challenge first:",
      "",
      "> Maintainers: comment `/clawptcha approve` to unlock the challenge.",
      "",
      `Once approved, the author takes a short quiz about this change: ${url}`,
      "",
      "_Passing posts a public attestation that the author personally understands this change._",
    ].join("\n");
  }
  return [
    "## 🦞 Clawptcha",
    "",
    `@${authorLogin}: take a short comprehension quiz about this change to turn the check green (${cfg.max_attempts} attempts max):`,
    "",
    `➡️ **[Start the challenge](${url})**`,
    "",
    "_Passing posts a public attestation that you personally understand this change. The quiz is generated from the diff; answers are graded automatically._",
  ].join("\n");
}

export async function handlePullRequestEvent(
  env: Env, api: GitHubApi, payload: any
): Promise<void> {
  const action = payload.action as string;
  if (!["opened", "synchronize", "reopened"].includes(action)) return;

  const repo = payload.repository.full_name as string;
  const installationId = payload.installation.id as number;
  const prNumber = payload.pull_request.number as number;
  const headSha = payload.pull_request.head.sha as string;
  const baseSha = payload.pull_request.base.sha as string;

  // Idempotency: webhook redeliveries for a known (pr, sha) are no-ops.
  if (await getChallengeByPr(env.DB, repo, prNumber, headSha)) return;

  const pr = await api.getPr(repo, prNumber);
  // Config comes from the merge target, never the PR branch — a PR must not be able to weaken its own gate.
  const configYaml = await api.getFileContent(repo, ".github/clawptcha.yml", baseSha);
  const cfg = parseConfig(configYaml);

  const changedFiles = await api.listPrFiles(repo, prNumber);
  const exemption = evaluateExemption(
    {
      authorLogin: pr.author_login,
      authorType: pr.author_type,
      authorAssociation: pr.author_association,
      changedLines: pr.additions + pr.deletions,
      changedFiles,
    },
    cfg
  );

  if (exemption.exempt) {
    await api.createCheckRun(repo, {
      name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "success",
      output: { title: "Exempt", summary: `Auto-passed: ${exemption.reason}.` },
    });
    return;
  }

  // synchronize with an existing pass and rechallenge_on_push=false → keep the pass.
  if (action === "synchronize" && !cfg.rechallenge_on_push) {
    if (await hasPassedChallenge(env.DB, repo, prNumber)) {
      await api.createCheckRun(repo, {
        name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "success",
        output: { title: "Passed", summary: "Author previously passed the challenge for this PR." },
      });
      return;
    }
  }

  await supersedeOldChallenges(env.DB, repo, prNumber, headSha);

  const needsApproval =
    cfg.require_approval === "always" ||
    (cfg.require_approval === "first_time" &&
      ["FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "NONE"].includes(pr.author_association));
  const status = needsApproval ? "awaiting_approval" : "ready";

  const challengeId = randomToken();
  const checkRunId = await api.createCheckRun(repo, {
    name: CHECK_NAME, head_sha: headSha, status: "queued",
    output: {
      title: needsApproval ? "Awaiting maintainer approval" : "Awaiting challenge",
      summary: needsApproval
        ? "A maintainer must approve the challenge (`/clawptcha approve`) before the author can take it."
        : "The PR author must pass a comprehension quiz. Link in the PR comment.",
    },
  });

  await insertChallenge(env.DB, {
    id: challengeId,
    installation_id: installationId,
    repo_full_name: repo,
    pr_number: prNumber,
    head_sha: headSha,
    author_login: pr.author_login,
    check_run_id: checkRunId,
    status,
    approved_by: null,
    attempts_used: 0,
    cooldown_until: null,
    config_json: JSON.stringify(cfg),
  });

  await api.upsertPrComment(repo, prNumber, commentBody(env, challengeId, status, cfg, pr.author_login));
}

export async function handleIssueCommentEvent(
  env: Env, api: GitHubApi, payload: any
): Promise<void> {
  if (payload.action !== "created") return;
  if (!payload.issue?.pull_request) return; // not a PR comment
  const body = (payload.comment.body as string).trim();
  if (!body.startsWith("/clawptcha approve")) return;

  const repo = payload.repository.full_name as string;
  const prNumber = payload.issue.number as number;
  const commenter = payload.comment.user.login as string;

  const permission = await api.getUserPermission(repo, commenter);
  if (!["admin", "write"].includes(permission)) return;

  const challenge = await getLatestChallengeForPr(env.DB, repo, prNumber);
  if (!challenge || challenge.status !== "awaiting_approval") return;

  await setChallengeStatus(env.DB, challenge.id, "ready", commenter);
  const storedCfg = resolveConfig(challenge.config_json);
  if (challenge.check_run_id) {
    await api.updateCheckRun(repo, challenge.check_run_id, {
      output: {
        title: "Awaiting challenge",
        summary: `Approved by @${commenter}. The PR author can now take the quiz.`,
      },
    });
  }
  await api.upsertPrComment(repo, prNumber, commentBody(env, challenge.id, "ready", storedCfg, challenge.author_login));
}
```

`resolveConfig` is a new export added to `src/config.ts` in this task (used again in Task 13). Append it there:

```typescript
// Parse a stored config_json snapshot back into a validated config.
export function resolveConfig(json: string): ClawptchaConfig {
  try {
    return configSchema.parse(JSON.parse(json));
  } catch {
    return DEFAULT_CONFIG;
  }
}
```

(`configSchema` is already defined in `config.ts`; it stays module-private — only `resolveConfig` is exported. Import it in `events.ts` via `import { parseConfig, resolveConfig, type ClawptchaConfig } from "../config";`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/events.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store.ts src/github/events.ts test/events.test.ts
git commit -m "feat: webhook orchestration - checks, comments, approval gate, idempotency"
```

**Post-review deltas (applied in code, authoritative over the blocks above):**
- `supersedeOldChallenges` runs BEFORE the exempt and keep-pass early returns, so stale open challenges are always invalidated on a new SHA.
- `insertChallenge` is wrapped in try/catch: on a UNIQUE-constraint race (concurrent duplicate delivery), the handler calls `updateChallengeCheckRun` (new store helper) to point the existing row at the newest check run, then returns without commenting.
- Approve matching uses `/^\/clawptcha\s+approve\b/` instead of `startsWith`.
- `getLatestChallengeForPr` orders by `created_at DESC, rowid DESC` (tie-break).
- The queued check run's summary includes the challenge link (belt-and-braces if the PR comment fails).
- Tests: the keep-pass test is renamed (it never exercised supersede); two added tests cover the supersede path and the `rechallenge_on_push: true` branch (10 tests total).

---

### Task 12: Anthropic quiz generation (lazy)

**Files:**
- Create: `src/quiz/generate.ts`
- Test: `test/generate.test.ts`

- [ ] **Step 1: Write the failing test**

The Anthropic client is injected as a minimal interface so tests stub it without network.

```typescript
// test/generate.test.ts
import { describe, it, expect, vi } from "vitest";
import { generateQuiz, buildGenerationPrompt, capContext } from "../src/quiz/generate";

const goodQuizJson = JSON.stringify({
  questions: [
    { type: "consequence_mcq", prompt: "What happens when X after this change?", options: ["a", "b", "c", "d"], correct: [0] },
    { type: "blast_radius_multi", prompt: "Which behaviors are affected by this PR?", options: ["a", "b", "c", "d"], correct: [1, 2] },
    { type: "false_claim", prompt: "Which statement about this PR is false?", options: ["a", "b", "c", "d"], correct: [3] },
    { type: "consequence_mcq", prompt: "What happens on cold start after this change?", options: ["a", "b", "c", "d"], correct: [2] },
  ],
});

function stubClient(responses: string[]) {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: "text", text: responses[Math.min(i++, responses.length - 1)] }],
        stop_reason: "end_turn",
      })),
    },
  };
}

describe("capContext", () => {
  it("passes small diffs through untouched", () => {
    expect(capContext("small diff", ["a.ts"], null)).toBe("small diff");
  });
  it("truncates and appends a file list when over the cap", () => {
    const big = "x".repeat(400);
    const out = capContext(big, ["a.ts", "b.ts"], 50); // 50 tokens ≈ 200 chars
    expect(out.length).toBeLessThan(big.length);
    expect(out).toContain("[diff truncated]");
    expect(out).toContain("a.ts");
  });
});

describe("generateQuiz", () => {
  it("returns a validated quiz from the model", async () => {
    const client = stubClient([goodQuizJson]);
    const r = await generateQuiz(client as any, "claude-sonnet-5", "diff", "title", "body", ["a.ts"], null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.quiz.questions).toHaveLength(4);
  });

  it("retries once on invalid output, then succeeds", async () => {
    const client = stubClient(["not json at all", goodQuizJson]);
    const r = await generateQuiz(client as any, "claude-sonnet-5", "diff", "t", null, [], null);
    expect(r.ok).toBe(true);
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it("fails after two invalid outputs", async () => {
    const client = stubClient(['{"questions": []}']);
    const r = await generateQuiz(client as any, "claude-sonnet-5", "diff", "t", null, [], null);
    expect(r.ok).toBe(false);
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it("fails gracefully when the API throws", async () => {
    const client = { messages: { create: vi.fn(async () => { throw new Error("529"); }) } };
    const r = await generateQuiz(client as any, "claude-sonnet-5", "diff", "t", null, [], null);
    expect(r.ok).toBe(false);
  });
});

describe("buildGenerationPrompt", () => {
  it("includes diff, title, and question-type instructions", () => {
    const p = buildGenerationPrompt("THE_DIFF", "My title", "My body", ["a.ts"], null);
    expect(p).toContain("THE_DIFF");
    expect(p).toContain("My title");
    expect(p).toContain("blast_radius_multi");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/generate.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement src/quiz/generate.ts**

```typescript
import { validateQuiz, QUIZ_JSON_SCHEMA, type Quiz } from "./schema";

// Minimal client interface — satisfied by @anthropic-ai/sdk's Anthropic instance.
export interface LlmClient {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      content: Array<{ type: string; text?: string }>;
      stop_reason: string | null;
    }>;
  };
}

const SYSTEM_PROMPT = `You generate comprehension quizzes about GitHub pull requests.
The quiz tests whether the PR AUTHOR understands the INTENT, ARCHITECTURE, and EFFECTS
of their own change — not line-level recall. AI-written code is fine; not understanding
it is not.

Rules:
- Exactly 4 questions, each with exactly 4 options.
- Question types: "consequence_mcq" (what happens when...; exactly 1 correct),
  "blast_radius_multi" (which behaviors/areas are affected; 2-3 correct),
  "false_claim" (four plausible statements about the PR, exactly one subtly FALSE;
  the correct answer is the false statement's index).
- Include at least one of each type.
- Every question must be answerable from understanding this specific diff's intent
  and effects — not from generic software knowledge alone.
- Distractors must be plausible to someone who has NOT read the diff.
- Do not quote line numbers or ask about variable names.`;

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
  diff: string, title: string, body: string | null, files: string[], maxContextTokens: number | null
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
    "Generate the quiz now.",
  ].join("\n");
}

export type GenerateResult = { ok: true; quiz: Quiz } | { ok: false; error: string };

export async function generateQuiz(
  client: LlmClient,
  model: string,
  diff: string,
  title: string,
  body: string | null,
  files: string[],
  maxContextTokens: number | null
): Promise<GenerateResult> {
  const prompt = buildGenerationPrompt(diff, title, body, files, maxContextTokens);
  let lastError = "unknown";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: QUIZ_JSON_SCHEMA } },
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content.find((b) => b.type === "text")?.text;
      if (!text) { lastError = "no text block in response"; continue; }
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { lastError = "invalid JSON"; continue; }
      const validated = validateQuiz(raw);
      if (validated.ok) return { ok: true, quiz: validated.quiz };
      lastError = validated.error;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, error: lastError };
}
```

Production call site (Task 13) constructs the real client:
`new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })` from `@anthropic-ai/sdk` — it satisfies `LlmClient` structurally. Model comes from `env.CLAUDE_MODEL` (`claude-sonnet-5`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/quiz/generate.ts test/generate.test.ts
git commit -m "feat: LLM quiz generation with structured outputs and one retry"
```

---

### Task 13: Challenge flow — OAuth, Turnstile, quiz session, UI, grading, completion

**Files:**
- Create: `src/ui/session.ts`, `src/ui/pages.ts`, `src/challenge.ts`
- Modify: (none yet — routes wired in Task 14)
- Test: `test/challenge.test.ts`

This is the largest task: the end-to-end contributor flow. Split into sub-steps; commit after each green test run.

**Flow recap:** `GET /challenge/:id` → (no session cookie) redirect to GitHub OAuth → callback binds session to `gh_login` → login must equal `challenge.author_login` → start page with Turnstile → `POST /challenge/:id/start` verifies Turnstile + rate limits + attempt gate, generates quiz (LLM), creates quiz row → `GET .../question` serves current question (records `question_served_at`) → `POST .../answer` grades server-side, enforces time limit, advances → after Q4, finalize: score, update challenge status, update check run with risk report, post attestation or cooldown comment.

- [ ] **Step 1: Write failing tests for session signing**

```typescript
// test/challenge.test.ts (part 1)
import { describe, it, expect } from "vitest";
import { signSessionCookie, verifySessionCookie } from "../src/ui/session";

const KEY = "0123456789abcdef0123456789abcdef";

describe("session cookie", () => {
  it("round-trips a session id", async () => {
    const cookie = await signSessionCookie(KEY, "sess-123");
    expect(await verifySessionCookie(KEY, cookie)).toBe("sess-123");
  });
  it("rejects tampered values and wrong keys", async () => {
    const cookie = await signSessionCookie(KEY, "sess-123");
    expect(await verifySessionCookie(KEY, cookie.replace("sess-123", "sess-999"))).toBeNull();
    expect(await verifySessionCookie("f".repeat(32), cookie)).toBeNull();
    expect(await verifySessionCookie(KEY, "garbage")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement src/ui/session.ts, run tests**

```typescript
const encoder = new TextEncoder();

async function hmac(key: string, value: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", k, encoder.encode(value));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signSessionCookie(signingKey: string, sessionId: string): Promise<string> {
  return `${sessionId}.${await hmac(signingKey, sessionId)}`;
}

export async function verifySessionCookie(signingKey: string, cookie: string): Promise<string | null> {
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const sessionId = cookie.slice(0, dot);
  const expected = await hmac(signingKey, sessionId);
  const given = cookie.slice(dot + 1);
  if (expected.length !== given.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0 ? sessionId : null;
}
```

Run: `npx vitest run test/challenge.test.ts` → PASS. Commit: `git add -A && git commit -m "feat: signed quiz session cookies"`.

- [ ] **Step 3: Implement src/ui/pages.ts (server-rendered HTML)**

No test (markup); typecheck only. Key requirements baked into the markup:

```typescript
import type { ClientQuestion } from "../quiz/schema";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Clawptcha</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:3rem auto;padding:0 1rem;color:#222}
  .card{border:1px solid #ddd;border-radius:8px;padding:1.5rem}
  .timer{float:right;font-variant-numeric:tabular-nums;color:#b00}
  button{font-size:1rem;padding:.5rem 1.25rem;border-radius:6px;border:1px solid #888;cursor:pointer}
  label{display:block;padding:.5rem;border:1px solid #eee;border-radius:6px;margin:.4rem 0}
  .muted{color:#777;font-size:.9rem}
</style></head><body>${body}</body></html>`;
}

export function startPage(prRef: string, turnstileSiteKey: string, challengeId: string): string {
  return layout("Challenge", `
<div class="card">
  <h1>🦞 Comprehension check</h1>
  <p>You're about to take a 4-question quiz about <strong>${esc(prRef)}</strong>.</p>
  <ul>
    <li>One question at a time, <strong>90 seconds each</strong>, no going back.</li>
    <li>Questions are about the <em>intent, architecture, and effects</em> of your change.</li>
    <li>Passing posts a public attestation that you personally understand this change.</li>
  </ul>
  <p class="muted">We record summary timing and interaction statistics (no keystrokes or content)
  and include them in a report to the maintainers.</p>
  <form method="POST" action="/challenge/${esc(challengeId)}/start">
    <div class="cf-turnstile" data-sitekey="${esc(turnstileSiteKey)}"></div>
    <button type="submit">Start the quiz</button>
  </form>
</div>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`);
}

export function questionPage(
  challengeId: string, index: number, total: number, q: ClientQuestion, timeLimitMs: number
): string {
  const inputType = q.multiSelect ? "checkbox" : "radio";
  const options = q.options
    .map((opt, i) =>
      `<label><input type="${inputType}" name="answer" value="${i}"> ${esc(opt)}</label>`)
    .join("");
  return layout(`Question ${index + 1}`, `
<div class="card">
  <span class="timer" id="timer"></span>
  <h2>Question ${index + 1} of ${total}</h2>
  <p>${esc(q.prompt)}</p>
  ${q.multiSelect ? '<p class="muted">Select all that apply.</p>' : ""}
  <form method="POST" action="/challenge/${esc(challengeId)}/answer" id="f">
    ${options}
    <input type="hidden" name="telemetry" id="telemetry">
    <button type="submit">Submit answer</button>
  </form>
</div>
<script>
(function () {
  var deadline = Date.now() + ${timeLimitMs};
  var t = { start: Date.now(), changes: 0, dist: 0, samples: 0, focusLoss: 0,
            webdriver: !!navigator.webdriver, lx: null, ly: null };
  document.addEventListener("pointermove", function (e) {
    if (t.lx !== null) t.dist += Math.hypot(e.clientX - t.lx, e.clientY - t.ly);
    t.lx = e.clientX; t.ly = e.clientY; t.samples++;
  });
  document.querySelectorAll("input[name=answer]").forEach(function (el) {
    el.addEventListener("change", function () { t.changes++; });
  });
  window.addEventListener("blur", function () { t.focusLoss++; });
  var form = document.getElementById("f");
  form.addEventListener("submit", function () {
    document.getElementById("telemetry").value = JSON.stringify({
      elapsedMs: Date.now() - t.start, answerChanges: t.changes,
      pointerDistancePx: Math.round(t.dist), pointerSamples: t.samples,
      focusLossCount: t.focusLoss, webdriver: t.webdriver
    });
  });
  var timer = document.getElementById("timer");
  (function tick() {
    var left = Math.max(0, deadline - Date.now());
    timer.textContent = Math.ceil(left / 1000) + "s";
    if (left <= 0) { form.requestSubmit(); return; }
    setTimeout(tick, 250);
  })();
})();
</script>`);
}

export function resultPage(passed: boolean, score: number, total: number, message: string): string {
  return layout(passed ? "Passed!" : "Not passed", `
<div class="card">
  <h1>${passed ? "🎉 Passed!" : "❌ Not this time"}</h1>
  <p>Score: <strong>${score}/${total}</strong>.</p>
  <p>${esc(message)}</p>
</div>`);
}

export function errorPage(title: string, message: string): string {
  return layout(title, `<div class="card"><h1>${esc(title)}</h1><p>${esc(message)}</p></div>`);
}
```

Run: `npx tsc --noEmit` → passes. Commit: `git add -A && git commit -m "feat: quiz UI pages with timer and telemetry capture"`.

- [ ] **Step 4: Write failing tests for the challenge service**

Append to `test/challenge.test.ts`:

```typescript
import { env } from "cloudflare:test";
import { vi } from "vitest";
import {
  startQuizAttempt, submitAnswer, type ChallengeDeps,
} from "../src/challenge";
import { insertChallenge, randomToken, getChallenge } from "../src/store";
import { DEFAULT_CONFIG } from "../src/config";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

const quiz = {
  questions: [
    { type: "consequence_mcq" as const, prompt: "q1 prompt is long enough", options: ["a","b","c","d"], correct: [0] },
    { type: "blast_radius_multi" as const, prompt: "q2 prompt is long enough", options: ["a","b","c","d"], correct: [1,2] },
    { type: "false_claim" as const, prompt: "q3 prompt is long enough", options: ["a","b","c","d"], correct: [3] },
    { type: "consequence_mcq" as const, prompt: "q4 prompt is long enough", options: ["a","b","c","d"], correct: [2] },
  ],
};

function deps(overrides: Partial<ChallengeDeps> = {}): ChallengeDeps {
  return {
    generateQuiz: vi.fn(async () => ({ ok: true as const, quiz })),
    verifyTurnstile: vi.fn(async () => true),
    fetchPrContext: vi.fn(async () => ({ diff: "d", title: "t", body: null, files: ["a.ts"] })),
    onChallengeResolved: vi.fn(async () => {}),
    now: () => new Date("2026-07-02T12:00:00Z"),
    ...overrides,
  };
}

async function makeChallenge(status = "ready"): Promise<string> {
  const id = randomToken();
  await insertChallenge(testEnv.DB, {
    id, installation_id: 1, repo_full_name: "o/r", pr_number: 1,
    head_sha: randomToken(8), author_login: "alice", check_run_id: 42,
    status: status as any, approved_by: null, attempts_used: 0,
    cooldown_until: null, config_json: JSON.stringify(DEFAULT_CONFIG),
  });
  return id;
}

describe("startQuizAttempt", () => {
  it("creates a quiz for the author when ready + turnstile ok", async () => {
    const id = await makeChallenge();
    const d = deps();
    const r = await startQuizAttempt(testEnv, d, id, "alice", "turnstile-token");
    expect(r.ok).toBe(true);
    expect(d.generateQuiz).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-author even with a valid session", async () => {
    const id = await makeChallenge();
    const r = await startQuizAttempt(testEnv, deps(), id, "mallory", "tok");
    expect(r).toEqual({ ok: false, error: "not_author" });
  });

  it("rejects when awaiting approval", async () => {
    const id = await makeChallenge("awaiting_approval");
    const r = await startQuizAttempt(testEnv, deps(), id, "alice", "tok");
    expect(r).toEqual({ ok: false, error: "not_ready" });
  });

  it("records turnstile failure but still allows the attempt (informs, never blocks)", async () => {
    const id = await makeChallenge();
    const d = deps({ verifyTurnstile: vi.fn(async () => false) });
    const r = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    expect(r.ok).toBe(true);
  });

  it("neutralizes the check when LLM generation fails twice", async () => {
    const id = await makeChallenge();
    const d = deps({ generateQuiz: vi.fn(async () => ({ ok: false as const, error: "boom" })) });
    const r = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    expect(r).toEqual({ ok: false, error: "generation_failed" });
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "neutral" })
    );
    expect((await getChallenge(testEnv.DB, id))?.status).toBe("neutral");
  });
});

describe("submitAnswer", () => {
  async function startedQuiz(passOverrides: Partial<ChallengeDeps> = {}) {
    const id = await makeChallenge();
    const d = deps(passOverrides);
    const started = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    if (!started.ok) throw new Error("setup failed");
    return { challengeId: id, quizId: started.quizId, d };
  }

  const telemetry = JSON.stringify({
    elapsedMs: 30000, answerChanges: 1, pointerDistancePx: 900,
    pointerSamples: 50, focusLossCount: 0, webdriver: false,
  });

  it("passes with 3+ correct answers, resolves challenge as passed", async () => {
    const { challengeId, quizId, d } = await startedQuiz();
    await submitAnswer(testEnv, d, quizId, [0], telemetry);  // correct
    await submitAnswer(testEnv, d, quizId, [1, 2], telemetry); // correct
    await submitAnswer(testEnv, d, quizId, [0], telemetry);  // wrong (correct is 3)
    const final = await submitAnswer(testEnv, d, quizId, [2], telemetry); // correct
    expect(final.done).toBe(true);
    if (final.done) expect(final.passed).toBe(true);
    expect((await getChallenge(testEnv.DB, challengeId))?.status).toBe("passed");
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "passed", score: 3 })
    );
  });

  it("fails below threshold, sets cooldown, increments attempts", async () => {
    const { challengeId, quizId, d } = await startedQuiz();
    for (const ans of [[1], [0], [0], [0]]) await submitAnswer(testEnv, d, quizId, ans, telemetry);
    const ch = await getChallenge(testEnv.DB, challengeId);
    expect(ch?.status).toBe("ready"); // retryable
    expect(ch?.attempts_used).toBe(1);
    expect(ch?.cooldown_until).toBe("2026-07-02T12:15:00.000Z");
  });

  it("marks failed_final when max attempts exhausted", async () => {
    const id = await makeChallenge();
    await testEnv.DB.prepare("UPDATE challenges SET attempts_used=2 WHERE id=?").bind(id).run();
    const d = deps();
    const started = await startQuizAttempt(testEnv, d, id, "alice", "tok");
    if (!started.ok) throw new Error("setup failed");
    for (const ans of [[1], [0], [0], [0]]) await submitAnswer(testEnv, d, started.quizId, ans, telemetry);
    expect((await getChallenge(testEnv.DB, id))?.status).toBe("failed_final");
    expect(d.onChallengeResolved).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed_final" })
    );
  });

  it("counts an over-time answer as wrong", async () => {
    const { quizId, d } = await startedQuiz();
    // pretend the question was served 3 minutes ago
    await testEnv.DB.prepare("UPDATE quizzes SET question_served_at=? WHERE id=?")
      .bind("2026-07-02T11:57:00Z", quizId).run();
    const r = await submitAnswer(testEnv, d, quizId, [0], telemetry);
    expect(r.done).toBe(false);
    const row = await testEnv.DB.prepare("SELECT answers_json FROM quizzes WHERE id=?")
      .bind(quizId).first<{ answers_json: string }>();
    expect(JSON.parse(row!.answers_json)[0]).toBeNull(); // recorded as timeout
  });
});
```

Run: `npx vitest run test/challenge.test.ts` → FAIL (module missing).

- [ ] **Step 5: Implement src/challenge.ts**

```typescript
import type { Env, Challenge } from "./types";
import { getChallenge, setChallengeStatus, randomToken } from "./store";
import { resolveConfig, type ClawptchaConfig } from "./config";
import { validateQuiz, type Quiz, type Question } from "./quiz/schema";
import {
  canStartAttempt, scoreQuiz, nextCooldown, answerWithinTimeLimit, type Answer,
} from "./quiz/grade";
import { checkAndRecordRate } from "./policy/ratelimit";
import { telemetrySchema, type Telemetry } from "./risk/report";
import type { GenerateResult } from "./quiz/generate";

export interface PrContext { diff: string; title: string; body: string | null; files: string[] }

export interface ResolvedChallenge {
  challenge: Challenge;
  outcome: "passed" | "failed_retry" | "failed_final" | "neutral";
  score?: number;
  total?: number;
  telemetry: Telemetry | null;
  cfg: ClawptchaConfig;
}

// All side-effectful collaborators are injected for testability.
export interface ChallengeDeps {
  generateQuiz(ctx: PrContext, cfg: ClawptchaConfig): Promise<GenerateResult>;
  verifyTurnstile(token: string): Promise<boolean>;
  fetchPrContext(challenge: Challenge): Promise<PrContext>;
  onChallengeResolved(resolved: ResolvedChallenge): Promise<void>;
  now(): Date;
}

export type StartResult =
  | { ok: true; quizId: string }
  | { ok: false; error: "not_found" | "not_author" | "not_ready" | "cooldown" | "attempts_exhausted" | "rate_limited" | "generation_failed" };

export async function startQuizAttempt(
  env: Env, deps: ChallengeDeps, challengeId: string, ghLogin: string, turnstileToken: string
): Promise<StartResult> {
  const challenge = await getChallenge(env.DB, challengeId);
  if (!challenge) return { ok: false, error: "not_found" };
  if (challenge.author_login !== ghLogin) return { ok: false, error: "not_author" };

  const cfg = resolveConfig(challenge.config_json);
  const gate = canStartAttempt(challenge, cfg, deps.now());
  if (!gate.allowed) {
    return { ok: false, error: gate.reason === "not_ready" ? "not_ready" : gate.reason };
  }

  const rate = await checkAndRecordRate(env.DB, {
    user: `user:${ghLogin}`,
    repo: `repo:${challenge.repo_full_name}`,
    installation: `inst:${challenge.installation_id}`,
  }, deps.now());
  if (!rate.allowed) return { ok: false, error: "rate_limited" };

  // Turnstile informs the risk report; it never blocks (spec).
  const turnstileOk = await deps.verifyTurnstile(turnstileToken);

  const ctx = await deps.fetchPrContext(challenge);
  const generated = await deps.generateQuiz(ctx, cfg);
  if (!generated.ok) {
    // Never block merges on our own failure: neutralize.
    await setChallengeStatus(env.DB, challenge.id, "neutral");
    await deps.onChallengeResolved({
      challenge, outcome: "neutral", telemetry: null, cfg,
    });
    return { ok: false, error: "generation_failed" };
  }

  const quizId = randomToken();
  await env.DB.prepare(
    `INSERT INTO quizzes (id, challenge_id, attempt_number, questions_json, question_served_at, turnstile_ok)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    quizId, challenge.id, challenge.attempts_used + 1,
    JSON.stringify(generated.quiz), deps.now().toISOString(), turnstileOk ? 1 : 0
  ).run();
  return { ok: true, quizId };
}

interface QuizRow {
  id: string; challenge_id: string; questions_json: string; current_question: number;
  question_served_at: string | null; answers_json: string; telemetry_json: string;
  turnstile_ok: number | null; finished_at: string | null;
}

export type SubmitResult =
  | { done: false; nextQuestion: number }
  | { done: true; passed: boolean; score: number; total: number }
  | { done: true; error: "not_found" | "already_finished" };

interface PerQuestionTelemetry {
  elapsedMs: number; answerChanges: number; pointerDistancePx: number;
  pointerSamples: number; focusLossCount: number; webdriver: boolean;
}

export async function submitAnswer(
  env: Env, deps: ChallengeDeps, quizId: string, answer: number[], telemetryJson: string
): Promise<SubmitResult> {
  const quiz = await env.DB.prepare("SELECT * FROM quizzes WHERE id=?").bind(quizId).first<QuizRow>();
  if (!quiz) return { done: true, error: "not_found" };
  if (quiz.finished_at) return { done: true, error: "already_finished" };

  const questions = (JSON.parse(quiz.questions_json) as Quiz).questions;
  const answers = JSON.parse(quiz.answers_json) as Answer[];
  const now = deps.now();

  const withinTime = quiz.question_served_at !== null &&
    answerWithinTimeLimit(quiz.question_served_at, now);
  answers.push(withinTime ? answer : null);

  // accumulate per-question telemetry (best-effort; malformed input → skipped)
  const stored = JSON.parse(quiz.telemetry_json || "{}") as { perQuestion?: PerQuestionTelemetry[] };
  const perQuestion = stored.perQuestion ?? [];
  try {
    perQuestion.push(JSON.parse(telemetryJson) as PerQuestionTelemetry);
  } catch { /* missing telemetry is itself a signal, handled at report time */ }

  const nextIndex = quiz.current_question + 1;
  const isLast = nextIndex >= questions.length;

  await env.DB.prepare(
    `UPDATE quizzes SET answers_json=?, telemetry_json=?, current_question=?,
       question_served_at=?, finished_at=? WHERE id=?`
  ).bind(
    JSON.stringify(answers),
    JSON.stringify({ perQuestion }),
    nextIndex,
    isLast ? null : now.toISOString(),
    isLast ? now.toISOString() : null,
    quizId
  ).run();

  if (!isLast) return { done: false, nextQuestion: nextIndex };
  return finalizeQuiz(env, deps, quiz, questions, answers, perQuestion, now);
}

async function finalizeQuiz(
  env: Env, deps: ChallengeDeps, quiz: QuizRow, questions: Question[],
  answers: Answer[], perQuestion: PerQuestionTelemetry[], now: Date
): Promise<SubmitResult> {
  const challenge = (await getChallenge(env.DB, quiz.challenge_id))!;
  const cfg = resolveConfig(challenge.config_json);
  const { score, passed } = scoreQuiz(questions, answers, cfg.pass_threshold);

  await env.DB.prepare("UPDATE quizzes SET score=? WHERE id=?").bind(score, quiz.id).run();

  const telemetry: Telemetry | null = perQuestion.length === 0 ? null : telemetrySchema.parse({
    perQuestionMs: perQuestion.map((t) => t.elapsedMs),
    answerChanges: perQuestion.reduce((a, t) => a + t.answerChanges, 0),
    pointerDistancePx: perQuestion.reduce((a, t) => a + t.pointerDistancePx, 0),
    pointerSamples: perQuestion.reduce((a, t) => a + t.pointerSamples, 0),
    focusLossCount: perQuestion.reduce((a, t) => a + t.focusLossCount, 0),
    webdriver: perQuestion.some((t) => t.webdriver),
    turnstileOk: quiz.turnstile_ok === 1,
  });

  let outcome: ResolvedChallenge["outcome"];
  if (passed) {
    outcome = "passed";
    await setChallengeStatus(env.DB, challenge.id, "passed");
  } else {
    const attemptsUsed = challenge.attempts_used + 1;
    if (attemptsUsed >= cfg.max_attempts) {
      outcome = "failed_final";
      await env.DB.prepare("UPDATE challenges SET status='failed_final', attempts_used=? WHERE id=?")
        .bind(attemptsUsed, challenge.id).run();
    } else {
      outcome = "failed_retry";
      await env.DB.prepare("UPDATE challenges SET attempts_used=?, cooldown_until=? WHERE id=?")
        .bind(attemptsUsed, nextCooldown(cfg, now), challenge.id).run();
    }
  }

  const fresh = (await getChallenge(env.DB, challenge.id))!;
  await deps.onChallengeResolved({
    challenge: fresh, outcome, score, total: questions.length, telemetry, cfg,
  });
  return { done: true, passed, score, total: questions.length };
}

```

Stored `config_json` snapshots are parsed with `resolveConfig` from `src/config.ts` (added in Task 11), as shown in the two call sites above.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/challenge.test.ts`
Expected: PASS (all session + start + submit tests).

- [ ] **Step 7: Commit**

```bash
git add src/challenge.ts src/ui/session.ts src/ui/pages.ts test/challenge.test.ts
git commit -m "feat: challenge service - start gate, grading flow, finalize outcomes"
```

---

### Task 14: Wire everything — Hono app, OAuth routes, resolution side effects, cron sweep

**Files:**
- Create: `src/index.ts`, `src/github/oauth.ts`, `src/resolve.ts`
- Test: `test/routes.test.ts`

- [ ] **Step 1: Implement src/github/oauth.ts**

```typescript
import type { Env } from "../types";

export function authorizeUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_CLIENT_ID,
    redirect_uri: `${env.APP_BASE_URL}/oauth/callback`,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeCodeForLogin(
  env: Env, code: string, fetchFn: typeof fetch = fetch
): Promise<string | null> {
  const tokenRes = await fetchFn("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  if (!tokenRes.ok) return null;
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return null;

  const userRes = await fetchFn("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${access_token}`,
      accept: "application/vnd.github+json",
      "user-agent": "clawptcha",
    },
  });
  if (!userRes.ok) return null;
  return ((await userRes.json()) as { login: string }).login;
}
```

- [ ] **Step 2: Implement src/resolve.ts (check + comment side effects on resolution)**

```typescript
import type { Env } from "./types";
import type { ResolvedChallenge } from "./challenge";
import { GitHubApi } from "./github/api";
import { getInstallationToken } from "./github/auth";
import { buildRiskReport, renderRiskReportMarkdown } from "./risk/report";

export async function apiForInstallation(env: Env, installationId: number): Promise<GitHubApi> {
  const token = await getInstallationToken(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY, installationId);
  return new GitHubApi(token);
}

export async function onChallengeResolved(env: Env, r: ResolvedChallenge): Promise<void> {
  const api = await apiForInstallation(env, r.challenge.installation_id);
  const repo = r.challenge.repo_full_name;
  const pr = r.challenge.pr_number;
  const checkId = r.challenge.check_run_id;

  const report = buildRiskReport(r.telemetry);
  const riskMd = renderRiskReportMarkdown(report, r.telemetry);

  switch (r.outcome) {
    case "passed": {
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "success",
        output: {
          title: report.automationLikely ? "Passed (automation-likely)" : "Passed",
          summary: `Score ${r.score}/${r.total}.\n\n${riskMd}`,
        },
      });
      await api.upsertPrComment(repo, pr, [
        "## 🦞 Clawptcha — passed ✅",
        "",
        `@${r.challenge.author_login} certified under challenge that they personally understand this change (score ${r.score}/${r.total}).`,
        "",
        report.automationLikely
          ? "> ⚠️ The behavioral risk report flagged this pass as **automation-likely**. Maintainers: see the check run details."
          : "_Behavioral risk report attached to the check run for maintainers._",
      ].join("\n"));
      break;
    }
    case "failed_retry": {
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "failure",
        output: {
          title: `Failed (attempt ${r.challenge.attempts_used}/${r.cfg.max_attempts})`,
          summary: `Score ${r.score}/${r.total}. Retry available after cooldown (${r.cfg.cooldown_minutes} min) with a freshly generated quiz.\n\n${riskMd}`,
        },
      });
      break;
    }
    case "failed_final": {
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "failure",
        output: {
          title: "Failed — attempts exhausted",
          summary: `Score ${r.score}/${r.total}. Max attempts reached.\n\n${riskMd}`,
        },
      });
      await api.upsertPrComment(repo, pr, [
        "## 🦞 Clawptcha — challenge failed ❌",
        "",
        `@${r.challenge.author_login} did not pass the comprehension check after ${r.cfg.max_attempts} attempts.`,
        "",
        "Maintainers: please review this PR manually before merging.",
      ].join("\n"));
      break;
    }
    case "neutral": {
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "neutral",
        output: {
          title: "Clawptcha unavailable",
          summary: "Quiz generation failed (LLM/service issue). Not blocking the merge — this is a Clawptcha-side problem, not a verdict on the PR.",
        },
      });
      break;
    }
  }
}

// Cron: any check left pending >30 min gets neutralized so we never block on our own outage.
export async function sweepStaleChallenges(env: Env, now: Date): Promise<void> {
  // Rate-limit events older than the sliding window are dead weight — purge them
  // (2h cutoff = WINDOW_MS + margin) so the table doesn't grow unboundedly.
  await env.DB.prepare("DELETE FROM rate_events WHERE created_at < ?")
    .bind(new Date(now.getTime() - 2 * 60 * 60_000).toISOString())
    .run();

  const cutoff = new Date(now.getTime() - 30 * 60_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT * FROM challenges
     WHERE status IN ('awaiting_approval','ready') AND created_at < ?
       AND check_run_id IS NOT NULL
       AND id NOT IN (SELECT challenge_id FROM quizzes)`
  ).bind(cutoff).all<import("./types").Challenge>();

  for (const ch of results) {
    // Stale but structurally fine challenges stay open — only neutralize ones
    // whose check was never moved past 'queued' AND that predate the cutoff by
    // a lot (service failed mid-setup). Heuristic: awaiting/ready with no quiz
    // after 24h → mark neutral so the check doesn't dangle forever.
    const dayCutoff = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    if (ch.created_at >= dayCutoff) continue;
    try {
      const api = await apiForInstallation(env, ch.installation_id);
      await api.updateCheckRun(ch.repo_full_name, ch.check_run_id!, {
        status: "completed", conclusion: "neutral",
        output: {
          title: "Challenge expired",
          summary: "No quiz attempt within 24h. Not blocking the merge. Push a new commit to re-trigger.",
        },
      });
      await env.DB.prepare("UPDATE challenges SET status='neutral' WHERE id=?").bind(ch.id).run();
    } catch { /* try again next cron tick */ }
  }
}
```

Note: the spec's "stale pending checks neutral after 30 minutes" is for checks stuck because the *service* failed mid-webhook. A challenge legitimately waiting for the contributor is not an outage — so the sweep neutralizes only after 24h of no attempt. Adjust `dayCutoff` if the spec owner prefers strict 30-minute semantics (ask during review).

- [ ] **Step 3: Implement src/index.ts (Hono app)**

```typescript
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import Anthropic from "@anthropic-ai/sdk";
import type { Env, Challenge } from "./types";
import { verifyWebhookSignature } from "./github/webhook";
import { handlePullRequestEvent, handleIssueCommentEvent } from "./github/events";
import { apiForInstallation, onChallengeResolved, sweepStaleChallenges } from "./resolve";
import { getChallenge, randomToken } from "./store";
import { signSessionCookie, verifySessionCookie } from "./ui/session";
import { authorizeUrl, exchangeCodeForLogin } from "./github/oauth";
import { startPage, questionPage, resultPage, errorPage } from "./ui/pages";
import { startQuizAttempt, submitAnswer, type ChallengeDeps } from "./challenge";
import { generateQuiz } from "./quiz/generate";
import { redactForClient, type Quiz } from "./quiz/schema";
import { QUESTION_TIME_LIMIT_MS } from "./quiz/grade";

const app = new Hono<{ Bindings: Env }>();

// ---------- webhooks ----------
app.post("/webhook", async (c) => {
  const body = await c.req.text();
  const ok = await verifyWebhookSignature(
    c.env.GITHUB_WEBHOOK_SECRET, body, c.req.header("x-hub-signature-256") ?? null
  );
  if (!ok) return c.text("bad signature", 401);

  const event = c.req.header("x-github-event");
  const payload = JSON.parse(body);
  // Respond 200 fast; do the work via waitUntil so GitHub doesn't time out.
  c.executionCtx.waitUntil((async () => {
    try {
      const api = await apiForInstallation(c.env, payload.installation.id);
      if (event === "pull_request") await handlePullRequestEvent(c.env, api, payload);
      else if (event === "issue_comment") await handleIssueCommentEvent(c.env, api, payload);
      else if (event === "installation" && payload.action === "created") {
        await c.env.DB.prepare("INSERT OR IGNORE INTO installations (id, account_login) VALUES (?, ?)")
          .bind(payload.installation.id, payload.installation.account.login).run();
      }
    } catch (e) {
      console.error("webhook handling failed", event, e);
    }
  })());
  return c.text("ok");
});

// ---------- session helpers ----------
async function currentSession(c: any): Promise<{ id: string; gh_login: string | null } | null> {
  const cookie = getCookie(c, "clawptcha_session");
  if (!cookie) return null;
  const sessionId = await verifySessionCookie(c.env.SESSION_SIGNING_KEY, cookie);
  if (!sessionId) return null;
  return c.env.DB.prepare("SELECT id, gh_login FROM sessions WHERE id=?").bind(sessionId).first();
}

function challengeDeps(env: Env): ChallengeDeps {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return {
    now: () => new Date(),
    async fetchPrContext(ch: Challenge) {
      const api = await apiForInstallation(env, ch.installation_id);
      const [diff, pr, files] = await Promise.all([
        api.getPrDiff(ch.repo_full_name, ch.pr_number),
        api.getPr(ch.repo_full_name, ch.pr_number),
        api.listPrFiles(ch.repo_full_name, ch.pr_number),
      ]);
      return { diff, title: pr.title, body: pr.body, files };
    },
    async generateQuiz(ctx, cfg) {
      return generateQuiz(
        anthropic as any, env.CLAUDE_MODEL,
        ctx.diff, ctx.title, ctx.body, ctx.files, cfg.max_context_tokens
      );
    },
    async verifyTurnstile(token: string) {
      if (!token) return false;
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      });
      if (!res.ok) return false;
      return ((await res.json()) as { success: boolean }).success;
    },
    async onChallengeResolved(r) {
      await onChallengeResolved(env, r);
    },
  };
}

// ---------- OAuth ----------
app.get("/oauth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.html(errorPage("OAuth error", "Missing code or state."), 400);
  const session = await c.env.DB.prepare("SELECT * FROM sessions WHERE oauth_state=?")
    .bind(state).first<{ id: string; challenge_id: string }>();
  if (!session) return c.html(errorPage("OAuth error", "Unknown or expired state."), 400);
  const login = await exchangeCodeForLogin(c.env, code);
  if (!login) return c.html(errorPage("OAuth error", "GitHub login failed. Try again."), 400);
  await c.env.DB.prepare("UPDATE sessions SET gh_login=?, oauth_state=NULL WHERE id=?")
    .bind(login, session.id).run();
  return c.redirect(`/challenge/${session.challenge_id}`);
});

// ---------- challenge pages ----------
app.get("/challenge/:id", async (c) => {
  const challenge = await getChallenge(c.env.DB, c.req.param("id"));
  if (!challenge) return c.html(errorPage("Not found", "This challenge link is invalid or expired."), 404);

  const session = await currentSession(c);
  if (!session || !session.gh_login) {
    const sessionId = randomToken();
    const state = randomToken();
    await c.env.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, oauth_state) VALUES (?, ?, ?)"
    ).bind(sessionId, challenge.id, state).run();
    setCookie(c, "clawptcha_session", await signSessionCookie(c.env.SESSION_SIGNING_KEY, sessionId), {
      httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 3600,
    });
    return c.redirect(authorizeUrl(c.env, state));
  }

  if (session.gh_login !== challenge.author_login) {
    return c.html(errorPage("Not your challenge",
      `This challenge belongs to @${challenge.author_login}. You are signed in as @${session.gh_login}.`), 403);
  }
  if (challenge.status === "awaiting_approval") {
    return c.html(errorPage("Awaiting approval",
      "A maintainer must approve this challenge first (`/clawptcha approve` on the PR)."));
  }
  if (challenge.status === "passed") {
    return c.html(resultPage(true, 0, 0, "You already passed this challenge. The check is green."));
  }
  return c.html(startPage(
    `${challenge.repo_full_name}#${challenge.pr_number}`, c.env.TURNSTILE_SITE_KEY, challenge.id
  ));
});

app.post("/challenge/:id/start", async (c) => {
  const session = await currentSession(c);
  if (!session?.gh_login) return c.redirect(`/challenge/${c.req.param("id")}`);
  const form = await c.req.parseBody();
  const result = await startQuizAttempt(
    c.env, challengeDeps(c.env), c.req.param("id"),
    session.gh_login, String(form["cf-turnstile-response"] ?? "")
  );
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_ready: "This challenge isn't ready (awaiting approval or already resolved).",
      cooldown: "Cooldown in effect — try again in a few minutes. You'll get a fresh quiz.",
      attempts_exhausted: "No attempts remain. A maintainer has been asked to review manually.",
      rate_limited: "Rate limit reached. Try again later.",
      generation_failed: "We couldn't generate the quiz. The check has been marked neutral — you're not blocked.",
      not_author: "Only the PR author can take this challenge.",
      not_found: "Challenge not found.",
    };
    return c.html(errorPage("Cannot start", messages[result.error] ?? result.error), 409);
  }
  // Store active quiz id on the session row to route question/answer requests.
  await c.env.DB.prepare("UPDATE sessions SET challenge_id=? WHERE id=?")
    .bind(c.req.param("id"), session.id).run();
  setCookie(c, "clawptcha_quiz", result.quizId, {
    httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 3600,
  });
  return c.redirect(`/challenge/${c.req.param("id")}/question`);
});

app.get("/challenge/:id/question", async (c) => {
  const session = await currentSession(c);
  const quizId = getCookie(c, "clawptcha_quiz");
  if (!session?.gh_login || !quizId) return c.redirect(`/challenge/${c.req.param("id")}`);
  const quiz = await c.env.DB.prepare("SELECT * FROM quizzes WHERE id=?").bind(quizId)
    .first<{ questions_json: string; current_question: number; finished_at: string | null }>();
  if (!quiz || quiz.finished_at) return c.redirect(`/challenge/${c.req.param("id")}`);
  const questions = (JSON.parse(quiz.questions_json) as Quiz).questions;
  const q = questions[quiz.current_question];
  // Re-stamp served_at when the question page renders (covers refresh-before-first-render).
  await c.env.DB.prepare(
    "UPDATE quizzes SET question_served_at=COALESCE(question_served_at, ?) WHERE id=?"
  ).bind(new Date().toISOString(), quizId).run();
  return c.html(questionPage(
    c.req.param("id"), quiz.current_question, questions.length,
    redactForClient(q), QUESTION_TIME_LIMIT_MS
  ));
});

app.post("/challenge/:id/answer", async (c) => {
  const session = await currentSession(c);
  const quizId = getCookie(c, "clawptcha_quiz");
  if (!session?.gh_login || !quizId) return c.redirect(`/challenge/${c.req.param("id")}`);
  const form = await c.req.parseBody({ all: true });
  const raw = form["answer"];
  const answer = (Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [])
    .map((v) => parseInt(String(v), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 3);
  const result = await submitAnswer(
    c.env, challengeDeps(c.env), quizId, answer, String(form["telemetry"] ?? "")
  );
  if ("error" in result) return c.redirect(`/challenge/${c.req.param("id")}`);
  if (!result.done) return c.redirect(`/challenge/${c.req.param("id")}/question`);
  return c.html(resultPage(
    result.passed, result.score, result.total,
    result.passed
      ? "The check is now green and an attestation was posted to the PR."
      : "Check the PR for retry availability (cooldown applies; retries get a fresh quiz)."
  ));
});

app.get("/", (c) => c.text("clawptcha: a captcha for GitHub contributions"));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sweepStaleChallenges(env, new Date()));
  },
};
```

- [ ] **Step 4: Write integration tests for routes**

```typescript
// test/routes.test.ts
import { describe, it, expect } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/index";
import { signBody } from "../src/github/webhook";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

describe("POST /webhook", () => {
  it("rejects unsigned payloads", async () => {
    const req = new Request("https://x/webhook", { method: "POST", body: "{}" });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, testEnv, ctx);
    expect(res.status).toBe(401);
  });

  it("accepts a signed payload", async () => {
    const body = JSON.stringify({ action: "labeled", installation: { id: 1 } }); // ignored action
    const sig = await signBody(testEnv.GITHUB_WEBHOOK_SECRET, body);
    const req = new Request("https://x/webhook", {
      method: "POST", body,
      headers: { "x-hub-signature-256": sig, "x-github-event": "pull_request" },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
  });
});

describe("GET /challenge/:id", () => {
  it("404s for unknown challenge ids", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/challenge/nope"), testEnv, ctx);
    expect(res.status).toBe(404);
  });

  it("redirects anonymous visitors to GitHub OAuth", async () => {
    await testEnv.DB.prepare(
      `INSERT INTO challenges (id, installation_id, repo_full_name, pr_number, head_sha,
        author_login, status, config_json) VALUES ('ch1', 1, 'o/r', 1, 's', 'alice', 'ready', '{}')`
    ).run();
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/challenge/ch1"), testEnv, ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("github.com/login/oauth/authorize");
    expect(res.headers.get("set-cookie")).toContain("clawptcha_session");
  });
});
```

Note: `worker.fetch` here calls the default export's fetch; if TypeScript complains about the `ExecutionContext` param shape, cast via `worker.fetch(req as any, testEnv as any, ctx as any)` — the miniflare runtime types differ slightly from `@cloudflare/workers-types`.

- [ ] **Step 5: Run all tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: full suite PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/github/oauth.ts src/resolve.ts test/routes.test.ts
git commit -m "feat: wire Hono routes, OAuth flow, resolution side effects, cron sweep"
```

---

### Task 15: README, deploy runbook, and E2E verification checklist

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

Contents (write the actual file with these sections filled in):

```markdown
# 🦞 Clawptcha

A captcha for GitHub contributions: gates PRs behind a short comprehension quiz
about the change itself. AI-written code is fine — not understanding it is not.
Passing posts a public attestation; maintainers get a behavioral risk report.

## How it works
1. Install the GitHub App on a repo.
2. When a PR opens, a `clawptcha` check + comment appear. First-time contributors
   need a maintainer to comment `/clawptcha approve` (configurable).
3. The PR author opens the challenge link, signs in with GitHub, and takes a
   4-question quiz generated from the diff (intent / blast radius / spot-the-false-claim).
4. Pass (3/4 by default) → green check + attestation comment. Fail → cooldown,
   fresh quiz, up to 3 attempts.
5. The check run summary includes a risk report (timings, Turnstile verdict,
   automation fingerprints). Clawptcha never blocks merges on its own outages —
   failures report `neutral`.

## Configure per repo: .github/clawptcha.yml
(document every field of DEFAULT_CONFIG with defaults, from src/config.ts)

## Deploy (operator runbook)
1. `wrangler d1 create clawptcha` → paste id into wrangler.jsonc; `npm run db:migrate`.
2. Create a GitHub App:
   - Webhook URL: https://<worker>/webhook, secret = GITHUB_WEBHOOK_SECRET.
   - Permissions: Checks RW, Pull requests RW, Contents R, Metadata R.
   - Events: Pull request, Issue comment, Installation.
   - Enable "Request user authorization (OAuth) during installation" OFF; instead
     set OAuth callback URL: https://<worker>/oauth/callback.
   - Generate a private key; convert to PKCS#8:
     `openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app-pkcs8.pem`
3. Create a Turnstile widget (Cloudflare dashboard) for the worker's domain.
4. Secrets: `wrangler secret put` each of GITHUB_APP_ID, GITHUB_PRIVATE_KEY,
   GITHUB_WEBHOOK_SECRET, GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET,
   ANTHROPIC_API_KEY, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, SESSION_SIGNING_KEY.
5. `npm run deploy`.
```

- [ ] **Step 2: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with operator runbook and config reference"
```

- [ ] **Step 4: Manual E2E verification (requires deployed worker + demo repo)**

This step needs real credentials and cannot run in CI. Walk the scenario list from the spec against a demo repo with the app installed:

1. Open a PR from a non-maintainer account → check `queued`, comment appears, status `awaiting_approval`.
2. Comment `/clawptcha approve` from the maintainer account → comment updates with the challenge link.
3. Open the link, OAuth as the PR author, pass Turnstile, answer the quiz → green check, attestation comment, risk report visible in check details.
4. Push a new commit → new head SHA auto-passes (default `rechallenge_on_push: false`).
5. Open a docs-only PR → auto-pass with "Exempt".
6. Fail a quiz deliberately → red check, cooldown message; retry after cooldown gets different questions.
7. Temporarily set an invalid `ANTHROPIC_API_KEY` and start a quiz → check goes `neutral`, merge not blocked.

Record outcomes in the PR description of the demo repo or a `docs/verification.md` note.

---

## Post-plan notes for the implementer

- **Data retention (spec: Data custody):** when a challenge reaches a terminal
  state (`passed`, `failed_final`, `neutral`), delete its quiz question content:
  in `finalizeQuiz` (Task 13) and the neutral path of `startQuizAttempt`, after
  `onChallengeResolved`, run
  `UPDATE quizzes SET questions_json='{"questions":[]}' WHERE challenge_id=?`
  — keep `score`, `answers_json`, and `telemetry_json` (audit trail), drop the
  question text derived from repo code. Diffs are never persisted anywhere.
  Add a test in `test/challenge.test.ts`: after a pass, the quiz row's
  `questions_json` no longer contains any prompt text.
- **Model:** quiz generation uses `claude-sonnet-5` (spec choice, set via `CLAUDE_MODEL` var). Do not add `temperature` — Sonnet 5 rejects non-default sampling params.
- **Adaptive thinking is on by default on Sonnet 5** and counts toward `max_tokens` — that's why generation uses `max_tokens: 16000` even though the quiz JSON is small.
- **Never send `correct` indices to the browser.** Only `redactForClient` output may reach HTML. Grep the UI code for `correct` before finishing.
- **Spec traceability:** approval gate → Task 11; lazy generation + rate limits → Tasks 7/12/13; risk report + Turnstile + telemetry → Tasks 6/13/14; attestation → Task 14; neutral-on-failure + sweep → Tasks 13/14; config + exemptions → Tasks 2/3; cost cap off by default → Task 2 (`max_context_tokens: null`) + Task 12 (`capContext`).




