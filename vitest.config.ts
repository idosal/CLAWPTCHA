import fs from "node:fs";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Strip // and slash-star comments from JSONC without touching string contents.
 * Note: does not handle trailing commas — JSON.parse fails loudly on those.
 */
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

export default defineConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  // The pool's bundled wrangler refuses to parse a D1 binding without a
  // database_id, but the deployable wrangler.jsonc must omit it so Cloudflare
  // auto-provisions the database (and the Deploy-to-Cloudflare button can
  // provision it). Generate a test-only config from the real one at config
  // time — dummy id injected — so wrangler.jsonc stays the single source of
  // truth and the test config can never drift from it.
  const config = JSON.parse(
    stripJsonComments(fs.readFileSync(path.join(__dirname, "wrangler.jsonc"), "utf8"))
  ) as { main: string; d1_databases: Array<Record<string, unknown>>; services?: unknown };
  config.d1_databases[0].database_id = "00000000-0000-0000-0000-000000000000";
  // The deployed Worker binds the optional Flue investigator service, but the
  // local test pool does not spin up that sibling Worker. Tests that need Flue
  // exercise the integration directly with mocked fetchers.
  delete config.services;
  // Relative paths in a wrangler config resolve against the config file's
  // directory; the generated file lives in .wrangler/tmp/, so make main absolute.
  config.main = path.resolve(__dirname, config.main);
  const generatedDir = path.join(__dirname, ".wrangler", "tmp");
  fs.mkdirSync(generatedDir, { recursive: true });
  const generatedConfigPath = path.join(generatedDir, "wrangler.test.generated.jsonc");
  fs.writeFileSync(generatedConfigPath, JSON.stringify(config, null, 2) + "\n");

  return {
    plugins: [
      cloudflareTest({
        remoteBindings: false,
        wrangler: { configPath: generatedConfigPath },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            GITHUB_APP_ID: "12345",
            GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
            LLM_PROVIDER: "anthropic",
            LLM_MODEL: "test-model",
            LLM_API_KEY: "test-llm-key",
            TURNSTILE_SITE_KEY: "test-site-key",
            TURNSTILE_SECRET_KEY: "test-turnstile-secret",
            SESSION_SIGNING_KEY: "0123456789abcdef0123456789abcdef",
            GITHUB_PRIVATE_KEY: ""
          }
        }
      })
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"]
    }
  };
});
