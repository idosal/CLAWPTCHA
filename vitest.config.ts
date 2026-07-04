import fs from "node:fs";
import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);
  // Raw configs injected for test/wrangler-config.test.ts, which polices drift
  // between the real config and its test-only twin (see wrangler.test.jsonc).
  const wranglerJsonc = fs.readFileSync(path.join(__dirname, "wrangler.jsonc"), "utf8");
  const wranglerTestJsonc = fs.readFileSync(path.join(__dirname, "wrangler.test.jsonc"), "utf8");

  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          // wrangler.test.jsonc, not wrangler.jsonc: the pool's bundled wrangler
          // rejects a D1 binding without database_id, but the deployable config
          // must omit it so Cloudflare auto-provisions the database.
          wrangler: { configPath: "./wrangler.test.jsonc" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              WRANGLER_JSONC_RAW: wranglerJsonc,
              WRANGLER_TEST_JSONC_RAW: wranglerTestJsonc,
              GITHUB_APP_ID: "12345",
              GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
              GITHUB_OAUTH_CLIENT_ID: "test-client-id",
              GITHUB_OAUTH_CLIENT_SECRET: "test-client-secret",
              LLM_PROVIDER: "anthropic",
              LLM_MODEL: "test-model",
              LLM_API_KEY: "test-llm-key",
              TURNSTILE_SITE_KEY: "test-site-key",
              TURNSTILE_SECRET_KEY: "test-turnstile-secret",
              SESSION_SIGNING_KEY: "0123456789abcdef0123456789abcdef",
              GITHUB_PRIVATE_KEY: ""
            }
          }
        }
      }
    }
  };
});
