import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

// wrangler.test.jsonc is a test-only twin of wrangler.jsonc: the vitest pool's
// bundled wrangler requires d1_databases[0].database_id, while the deployable
// config must omit it so Cloudflare auto-provisions the database. This test
// keeps the twin honest — the ONLY allowed difference is that database_id.
// Raw file contents are injected as bindings in vitest.config.ts (tests run in
// workerd, which has no filesystem access).

const raw = env as unknown as {
  WRANGLER_JSONC_RAW: string;
  WRANGLER_TEST_JSONC_RAW: string;
};

/** Strip // and /* *\/ comments from JSONC without touching string contents. */
function stripJsonComments(input: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < input.length) {
    const ch = input[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += input[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && input[i + 1] === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && input[i + 1] === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

describe("wrangler.test.jsonc stays in sync with wrangler.jsonc", () => {
  it("differs only by d1_databases[0].database_id", () => {
    const real = JSON.parse(stripJsonComments(raw.WRANGLER_JSONC_RAW)) as {
      d1_databases?: Array<Record<string, unknown>>;
    };
    const twin = JSON.parse(stripJsonComments(raw.WRANGLER_TEST_JSONC_RAW)) as {
      d1_databases?: Array<Record<string, unknown>>;
    };

    expect(
      real.d1_databases?.[0]?.database_id,
      "wrangler.jsonc must NOT set d1_databases[0].database_id — Cloudflare auto-provisions D1 only when it is absent"
    ).toBeUndefined();
    expect(
      twin.d1_databases?.[0]?.database_id,
      "wrangler.test.jsonc must set a dummy d1_databases[0].database_id — the vitest pool requires one"
    ).toBeDefined();

    delete twin.d1_databases![0].database_id;
    expect(
      twin,
      "wrangler.test.jsonc has drifted from wrangler.jsonc — keep them identical except for d1_databases[0].database_id"
    ).toEqual(real);
  });
});
