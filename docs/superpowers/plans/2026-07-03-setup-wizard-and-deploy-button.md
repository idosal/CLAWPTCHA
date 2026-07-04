# Setup Wizard & Deploy-to-Cloudflare Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse self-hosted deployment to `npx wrangler login && npm run setup` (plus a README Deploy-to-Cloudflare button), by automating D1 provisioning, GitHub App creation via the manifest flow, PKCS#8 conversion, Turnstile, and bulk secret writes.

**Architecture:** Pure, unit-tested helpers in `scripts/setup-lib.mts` (manifest builder, form HTML, deploy-URL parser, JSONC patcher, key converter, secrets assembler); a thin interactive wizard in `scripts/setup.mts` that shells to `npx wrangler` and runs a one-shot localhost HTTP server for the GitHub manifest callback. `wrangler.jsonc` drops the D1 `database_id` so Wrangler/the deploy button auto-provision the database.

**Tech Stack:** Node built-ins only (`node:http`, `node:crypto`, `node:readline/promises`, `node:child_process`), tsx runner (already a devDependency), vitest (workerd pool) for the pure helpers.

**Spec:** `docs/superpowers/specs/2026-07-03-setup-wizard-and-deploy-button-design.md`

**⚠️ Working-tree note:** the repo has concurrent uncommitted work (linked-issue feature in src/ and test/). `git add` ONLY the files each task lists — never `-A`/`.`/`-a`. Check `git diff <file>` before editing any file you touch and report ride-alongs.

---

## File map

- Modify: `wrangler.jsonc` — remove D1 `database_id` (auto-provisioning)
- Modify: `package.json` — `deploy` runs migrations by binding name; add `setup` script; retarget `db:migrate*` to binding name
- Possibly modify: `vitest.config.ts` — only if the pool needs a D1 fallback after the id removal (contingency in Task 1)
- Create: `scripts/setup-lib.mts` — pure helpers (no I/O, no prompts)
- Create: `test/setup-lib.test.ts` — unit tests for every helper
- Create: `scripts/setup.mts` — interactive wizard (phases, shelling to wrangler)
- Modify: `README.md` — deploy button + runbook restructure

---

### Task 1: Auto-provisioning groundwork (wrangler.jsonc + package.json)

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `package.json`
- Contingency: `vitest.config.ts`

- [ ] **Step 1: Remove the D1 placeholder id.** In `wrangler.jsonc` change:

```jsonc
  "d1_databases": [
    { "binding": "DB", "database_name": "clawptcha", "database_id": "REPLACE_AFTER_wrangler_d1_create" }
  ],
```
to:
```jsonc
  "d1_databases": [
    // no database_id: Wrangler auto-provisions the database on first deploy
    // (also lets the Deploy-to-Cloudflare button provision it).
    { "binding": "DB", "database_name": "clawptcha" }
  ],
```

- [ ] **Step 2: Update package.json scripts.** Replace the `scripts` block with:

```json
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy && wrangler d1 migrations apply DB --remote",
    "setup": "tsx scripts/setup.mts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:migrate:local": "wrangler d1 migrations apply DB --local",
    "db:migrate": "wrangler d1 migrations apply DB --remote"
  },
```

Notes: migrations now reference the **binding** name `DB` (works whatever the operator names the database — required for the deploy button). Order in `deploy` is deploy-then-migrate because auto-provisioning happens at deploy; **verify-at-implementation**: if `wrangler d1 migrations apply DB --remote` turns out to auto-provision too (run `npx wrangler d1 migrations apply DB --dry-run --remote 2>&1 | head -5` to probe behavior without auth if possible), the spec's preferred order (migrate-then-deploy) may be restored — either order is acceptable; report which you shipped and why. (`scripts.setup` references `scripts/setup.mts`, created in Task 5 — that's fine; nothing executes it until then.)

- [ ] **Step 3: Verify config still parses and tests pass**

Run: `npx wrangler deploy --dry-run 2>&1 | head -25 && npm test`
Expected: dry-run bundles, D1 binding listed (possibly flagged "will be provisioned"); full suite passes.
**Contingency:** if `@cloudflare/vitest-pool-workers` errors on a D1 binding without `database_id`, do NOT restore the id in wrangler.jsonc — instead override in `vitest.config.ts` miniflare config by adding
```ts
            d1Databases: { DB: "test-db" },
```
inside the `miniflare: { ... }` object (alongside `bindings`), and report that the contingency was needed.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add wrangler.jsonc package.json
# plus vitest.config.ts ONLY if the contingency was needed
git commit -m "feat: D1 auto-provisioning (no database_id); migrations via binding name"
```

---

### Task 2: setup-lib — manifest builder + form HTML

**Files:**
- Create: `scripts/setup-lib.mts`
- Create: `test/setup-lib.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/setup-lib.test.ts
import { describe, it, expect } from "vitest";
import { buildManifest, manifestFormHtml } from "../scripts/setup-lib.mts";

describe("buildManifest", () => {
  const m = buildManifest({
    appName: "clawptcha-test",
    baseUrl: "https://clawptcha.example.workers.dev",
    redirectUrl: "http://localhost:8976/callback",
  });

  it("sets urls derived from the base url", () => {
    expect(m.url).toBe("https://clawptcha.example.workers.dev");
    expect(m.hook_attributes).toEqual({ url: "https://clawptcha.example.workers.dev/webhook" });
    expect(m.callback_urls).toEqual(["https://clawptcha.example.workers.dev/oauth/callback"]);
    expect(m.redirect_url).toBe("http://localhost:8976/callback");
  });

  it("requests exactly the permissions and events the Worker needs", () => {
    expect(m.default_permissions).toEqual({
      checks: "write",
      pull_requests: "write",
      contents: "read",
      metadata: "read",
    });
    expect(m.default_events).toEqual(["pull_request", "issue_comment", "installation"]);
    expect(m.public).toBe(false);
  });
});

describe("manifestFormHtml", () => {
  it("embeds the manifest JSON escaped and posts to github with the state", () => {
    const html = manifestFormHtml({ name: 'a"b<c&d' }, "state-123");
    expect(html).toContain('action="https://github.com/settings/apps/new?state=state-123"');
    expect(html).toContain('name="manifest"');
    // JSON is attribute-escaped: no raw quotes/angle brackets from values
    expect(html).toContain("&quot;a\\&quot;b&lt;c&amp;d&quot;");
    expect(html).toContain("method=\"post\"");
    expect(html).toContain("submit()");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/setup-lib.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// scripts/setup-lib.mts
// Pure helpers for scripts/setup.mts — no I/O, no prompts, unit-tested in
// test/setup-lib.test.ts. Keep side effects in setup.mts.

export interface ManifestInput {
  appName: string;
  baseUrl: string;      // deployed Worker origin, no trailing slash
  redirectUrl: string;  // localhost callback that receives ?code=
}

export function buildManifest(i: ManifestInput) {
  return {
    name: i.appName,
    url: i.baseUrl,
    hook_attributes: { url: `${i.baseUrl}/webhook` },
    redirect_url: i.redirectUrl,
    callback_urls: [`${i.baseUrl}/oauth/callback`],
    public: false,
    default_permissions: {
      checks: "write",
      pull_requests: "write",
      contents: "read",
      metadata: "read",
    },
    default_events: ["pull_request", "issue_comment", "installation"],
  };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Auto-submitting form: the GitHub manifest flow requires POSTing a `manifest`
// form field to github.com/settings/apps/new (a plain link can't do it).
export function manifestFormHtml(manifest: object, state: string): string {
  const json = escapeAttr(JSON.stringify(manifest));
  return `<!doctype html>
<html><body>
  <p>Redirecting to GitHub to create the Clawptcha app…</p>
  <form id="f" action="https://github.com/settings/apps/new?state=${encodeURIComponent(state)}" method="post">
    <input type="hidden" name="manifest" value="${json}">
    <noscript><button type="submit">Continue to GitHub</button></noscript>
  </form>
  <script>document.getElementById("f").submit()</script>
</body></html>`;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/setup-lib.test.ts && npm run typecheck`
Expected: 3 passed; typecheck clean (the test import pulls setup-lib into the checked graph — if TS complains about the `.mts` import specifier, match how `scripts/localdev/local-quizgen.mts` imports `.ts` files and adjust the extension/config minimally; report what was needed).

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-lib.mts test/setup-lib.test.ts
git commit -m "feat: setup-lib manifest builder + auto-submitting form html"
```

---

### Task 3: setup-lib — deploy-URL parser + wrangler.jsonc patcher

**Files:**
- Modify: `scripts/setup-lib.mts` (append)
- Modify: `test/setup-lib.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append; extend the import line)

```ts
import { parseDeployedUrl, patchAppBaseUrl } from "../scripts/setup-lib.mts";

describe("parseDeployedUrl", () => {
  it("finds the workers.dev url in wrangler deploy output", () => {
    const out = "Uploaded clawptcha (3.2 sec)\nDeployed clawptcha triggers (1.1 sec)\n  https://clawptcha.someone.workers.dev\nCurrent Version ID: abc";
    expect(parseDeployedUrl(out)).toBe("https://clawptcha.someone.workers.dev");
  });
  it("returns null when absent", () => {
    expect(parseDeployedUrl("nothing here")).toBeNull();
  });
});

describe("patchAppBaseUrl", () => {
  const jsonc = `{
  // comment survives
  "vars": {
    "APP_BASE_URL": "https://clawptcha.example.workers.dev",
    "LLM_PROVIDER": "workers-ai"
  }
}`;
  it("replaces only the APP_BASE_URL value, preserving formatting", () => {
    const r = patchAppBaseUrl(jsonc, "https://real.workers.dev");
    expect(r.changed).toBe(true);
    expect(r.text).toContain('"APP_BASE_URL": "https://real.workers.dev"');
    expect(r.text).toContain("// comment survives");
    expect(r.text).toContain('"LLM_PROVIDER": "workers-ai"');
  });
  it("reports unchanged when the value already matches", () => {
    const r = patchAppBaseUrl(jsonc, "https://clawptcha.example.workers.dev");
    expect(r.changed).toBe(false);
    expect(r.text).toBe(jsonc);
  });
  it("throws when the key is missing", () => {
    expect(() => patchAppBaseUrl("{}", "https://x")).toThrow(/APP_BASE_URL/);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run test/setup-lib.test.ts`
Expected: prior tests pass; new ones FAIL (not exported).

- [ ] **Step 3: Implement** (append to `scripts/setup-lib.mts`)

```ts
export function parseDeployedUrl(wranglerOutput: string): string | null {
  const m = wranglerOutput.match(/https:\/\/[a-z0-9][a-z0-9.-]*\.workers\.dev/i);
  return m ? m[0] : null;
}

// Targeted string edit so JSONC comments and formatting survive (a JSON
// parse/re-stringify would destroy them).
export function patchAppBaseUrl(jsonc: string, newUrl: string): { text: string; changed: boolean } {
  const re = /("APP_BASE_URL"\s*:\s*")([^"]*)(")/;
  const m = jsonc.match(re);
  if (!m) throw new Error("APP_BASE_URL not found in wrangler.jsonc");
  if (m[2] === newUrl) return { text: jsonc, changed: false };
  return { text: jsonc.replace(re, `$1${newUrl}$3`), changed: true };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/setup-lib.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-lib.mts test/setup-lib.test.ts
git commit -m "feat: setup-lib deploy-url parser + APP_BASE_URL jsonc patcher"
```

---

### Task 4: setup-lib — PKCS#8 conversion + secrets assembler

**Files:**
- Modify: `scripts/setup-lib.mts` (append)
- Modify: `test/setup-lib.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append; extend import). The PKCS#1 PEM below is a throwaway fixture generated for this test — it protects nothing and must never be used as a real key.

```ts
import { pkcs1ToPkcs8, buildSecretsJson } from "../scripts/setup-lib.mts";

// Throwaway 2048-bit key generated for this test only. NOT a secret.
const TEST_PKCS1_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAr+uSBNBjclKEaB5gd9U5RFLi4VIHQtx5bvuf0bIGn92VbdAA
SI69WITlzERS27IQyhOtBfGbTSA3PtKX7G9+2Q9OeAQCoo/+gV43kEf0vi9j6WLJ
InH7K/MlAvzNpX8kZme3/zuIDL7Kxxa+yr0sUusmlXEN++L6IEQhgawUu6sPNT1F
o36TMqTouCvj1h9RY4lp0j9dhJDBzP/etS85u3ZESnirkx3IJhtnl2XDHIApNgKI
ybtAbCMDgCdyEJy0ArtfqcpnLwoRWZjAtwyeouncWBKGNxTsszJU/pHqxlxa+Wwk
2SKVtisdXFkbkK6CaE86/mQJlrykp68o8qnlAwIDAQABAoIBAA8CPXOlBncAd0TI
Iq7WmuDWDtPubal/VJTqvtiNzxGLPsPJqocw4RKmSVIYxNZIO4p3YfGkiqgVMYwY
kixH2ZNR7P3sSaqY4mZ4eqvCl9eKBNoqkBfHkF2ljD4prK82nmJmQu/G98qD6e+m
ZHdjlbPVVXYL2TI+S9y+M1BJitNKlnpkbmnQD+tB90+QALp14XPB5P/jR5ITWVHt
GWpaQC1etv9rfF4NK6vbZRT6vbw1k6FKgv+EbrnKNCwmZg+rjm0eIaP0jxM6XyBC
VEbcE8kBQdDpAyacQKnzcazker24g/y2bEVHrPlzFVUw8XxQ++OSmISN8cTY91lR
5BBiu5ECgYEA6J+447IZS1PzscDsGq90/Yobu4+zyFOdnqFRe4yyv2z653PCfZ7u
Dom4BfNNPQ2EQDGnT4aQL2ksMl8JIqkQ7hhK2gcNsZmc/0veql6bSdIhAUJtTiqF
nGjAR+rz5HyjMKa0HjXwA/9w2iVrLU5UI1WItBlrMeU+PqF/HwuAOt8CgYEAwZkj
Zz4rudCBDaDOxlJY1X+4Lyub/6frIyxdMdOtSn5ksorWuitNaBD4K7Bf0v6/HWqi
RNwlruYrIsNqdNqDxYTFX3o5Mp4PGmsvHr78NsLwtltx79E/5PYLFQcgSOlVdWpi
4a/tormQSZymv+XBAyRN5Oo7Pyl6a+bvmfX9vl0CgYEApBjgHUdqjnfnZdIY++4f
0ibVz2bcxQkvHFLiHwyun1jqWdGQNnuhpQHDnfb22oWpcHtWckQTfE5tzg66bAfl
mH/sdYcaQtmBJZrItVhNpTKk87V/U++tFxvR4Cm+6MR/ffdrAhC8gqV0X36b73bc
5ZwV9i4kLytu0FGuUiET0PMCgYBHMS1XtgEWX5pVjKD9RSLtv/3XOs4vAWzyjknn
HNRI5JnbHjtAUtQwRK0+Q6m5SXy2MJRjhiFFY9bQ/dOUDRcP93ctWSDXgFBFgszd
HZZZ/O3P4WjQq743UFNa9DfnGAcZGnoqTCuy/1IT/8tCHhcQNLWATLJk07f1HgNW
NqOM8QKBgQCSAViN+OJlyPFM6rkUnrwR2lVTZ2lmpJ0fB6amPRTwXstH5bqahZ6U
u9RT5BZ3YW5CZTOqr7ZGLhN51OVBlcqu2R/2igbZ/ewtj+JbNzy1+3qbgU11ZLu/
2/B/i+Yjk15U3K4kJf/1oC/DeKG4aubpf0tRB+kAGbF1CQgYNxCGKg==
-----END RSA PRIVATE KEY-----`;

describe("pkcs1ToPkcs8", () => {
  it("converts a PKCS#1 RSA key to PKCS#8 PEM", () => {
    const out = pkcs1ToPkcs8(TEST_PKCS1_PEM);
    expect(out).toContain("-----BEGIN PRIVATE KEY-----");
    expect(out).not.toContain("BEGIN RSA PRIVATE KEY");
  });
  it("passes an already-PKCS#8 key through unchanged in kind", () => {
    const once = pkcs1ToPkcs8(TEST_PKCS1_PEM);
    const twice = pkcs1ToPkcs8(once);
    expect(twice).toContain("-----BEGIN PRIVATE KEY-----");
  });
});

describe("buildSecretsJson", () => {
  it("assembles exactly the 8 workers-ai-path secrets", () => {
    const s = buildSecretsJson({
      appId: 123,
      privateKeyPkcs8: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----",
      webhookSecret: "wh",
      clientId: "Iv1.abc",
      clientSecret: "cs",
      turnstileSiteKey: "0xSITE",
      turnstileSecretKey: "0xSECRET",
      sessionSigningKey: "a".repeat(64),
    });
    expect(Object.keys(s).sort()).toEqual([
      "GITHUB_APP_ID",
      "GITHUB_OAUTH_CLIENT_ID",
      "GITHUB_OAUTH_CLIENT_SECRET",
      "GITHUB_PRIVATE_KEY",
      "GITHUB_WEBHOOK_SECRET",
      "SESSION_SIGNING_KEY",
      "TURNSTILE_SECRET_KEY",
      "TURNSTILE_SITE_KEY",
    ]);
    expect(s.GITHUB_APP_ID).toBe("123");
    expect(s.GITHUB_PRIVATE_KEY).toContain("BEGIN PRIVATE KEY");
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run test/setup-lib.test.ts`
Expected: new tests FAIL (not exported).

- [ ] **Step 3: Implement** (append to `scripts/setup-lib.mts`)

```ts
import { createPrivateKey } from "node:crypto";

// The GitHub manifest exchange returns a PKCS#1 key ("BEGIN RSA PRIVATE
// KEY"); Web Crypto in the Worker only imports PKCS#8. Convert in-process —
// this replaces the runbook's manual openssl step.
export function pkcs1ToPkcs8(pem: string): string {
  return createPrivateKey(pem).export({ type: "pkcs8", format: "pem" }).toString();
}

export interface SecretsInput {
  appId: number | string;
  privateKeyPkcs8: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  sessionSigningKey: string;
}

export function buildSecretsJson(s: SecretsInput): Record<string, string> {
  return {
    GITHUB_APP_ID: String(s.appId),
    GITHUB_PRIVATE_KEY: s.privateKeyPkcs8,
    GITHUB_WEBHOOK_SECRET: s.webhookSecret,
    GITHUB_OAUTH_CLIENT_ID: s.clientId,
    GITHUB_OAUTH_CLIENT_SECRET: s.clientSecret,
    TURNSTILE_SITE_KEY: s.turnstileSiteKey,
    TURNSTILE_SECRET_KEY: s.turnstileSecretKey,
    SESSION_SIGNING_KEY: s.sessionSigningKey,
  };
}
```

(Put the `import { createPrivateKey }` line at the top of the file with the other code, not mid-file.)

- [ ] **Step 4: Run tests — with the workerd caveat**

Run: `npx vitest run test/setup-lib.test.ts && npm run typecheck && npm test`
Expected: all pass. **Verify-at-implementation:** the pool runs tests in workerd with `nodejs_compat`; if `createPrivateKey(...).export({type:"pkcs8"})` is unsupported there, move ONLY the two `pkcs1ToPkcs8` tests into a comment block noting they're covered by the Task 5 node-side smoke, add that exact check to Task 5's smoke step, and report the substitution. Do not delete the helper.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-lib.mts test/setup-lib.test.ts
git commit -m "feat: setup-lib pkcs8 conversion + secrets assembler"
```

---

### Task 5: The wizard — `scripts/setup.mts`

**Files:**
- Create: `scripts/setup.mts`

- [ ] **Step 1: Implement the wizard**

```ts
// scripts/setup.mts — interactive one-command deployment for Clawptcha.
//   npx wrangler login && npm run setup
// Phases: preflight → deploy+URL → GitHub App (manifest flow) → Turnstile →
// session key → secrets (bulk over stdin; never argv, never disk) → finalize.
// Every phase prints its manual fallback on failure; the README "Manual
// setup" section documents the same steps.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import * as readline from "node:readline/promises";
import {
  buildManifest, manifestFormHtml, parseDeployedUrl, patchAppBaseUrl,
  pkcs1ToPkcs8, buildSecretsJson,
} from "./setup-lib.mts";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q: string, def?: string): Promise<string> => {
  const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
  return a || def || "";
};
const banner = (s: string) => console.log(`\n=== ${s} ===`);
const die = (msg: string): never => { console.error(`\n✗ ${msg}`); process.exit(1); };

function wrangler(args: string[], opts: { input?: string; quiet?: boolean } = {}): string {
  const res = spawnSync("npx", ["wrangler", ...args], {
    encoding: "utf8", input: opts.input,
    stdio: ["pipe", "pipe", opts.quiet ? "pipe" : "inherit"],
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`wrangler ${args.join(" ")} failed (exit ${res.status})`);
  return res.stdout ?? "";
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  const res = spawnSync(cmd, [url], { stdio: "ignore" });
  if (res.status !== 0) console.log(`Open this URL in your browser:\n  ${url}`);
}

// ---------- Phase 1: preflight ----------
banner("Preflight");
let whoami = "";
try {
  whoami = wrangler(["whoami"], { quiet: true });
} catch {
  die("Not logged in to Cloudflare. Run: npx wrangler login  — then re-run npm run setup");
}
const accountId = (whoami.match(/([0-9a-f]{32})/) ?? [])[1];
console.log(`✓ Cloudflare auth OK${accountId ? ` (account ${accountId.slice(0, 8)}…)` : ""}`);

// ---------- Phase 2: deploy + discover URL ----------
banner("Deploy (provisions D1 automatically, runs migrations)");
let deployOut = "";
try {
  deployOut = wrangler(["deploy"]);
  wrangler(["d1", "migrations", "apply", "DB", "--remote"]);
} catch {
  die("Deploy failed. Fix the error above, or follow the Manual setup section in README.md, then re-run.");
}
let baseUrl = parseDeployedUrl(deployOut) ?? "";
if (!baseUrl) baseUrl = await ask("Could not detect the Worker URL — paste it (https://…workers.dev)");
baseUrl = baseUrl.replace(/\/+$/, "");
console.log(`✓ Worker at ${baseUrl}`);

const WRANGLER_JSONC = new URL("../wrangler.jsonc", import.meta.url).pathname;
const jsonc = readFileSync(WRANGLER_JSONC, "utf8");
const patched = patchAppBaseUrl(jsonc, baseUrl);
let needsRedeploy = false;
if (patched.changed) {
  writeFileSync(WRANGLER_JSONC, patched.text);
  needsRedeploy = true;
  console.log("✓ APP_BASE_URL updated in wrangler.jsonc (will redeploy at the end)");
}

// ---------- Phase 3: GitHub App via manifest flow ----------
banner("GitHub App");
const appName = await ask("GitHub App name", `clawptcha-${(accountId ?? randomBytes(3).toString("hex")).slice(0, 6)}`);
const state = randomBytes(16).toString("hex");

const appConfig = await new Promise<{
  id: number; pem: string; webhook_secret: string;
  client_id: string; client_secret: string; html_url: string; slug: string;
}>((resolve, reject) => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/") {
      const port = (server.address() as { port: number }).port;
      const manifest = buildManifest({ appName, baseUrl, redirectUrl: `http://localhost:${port}/callback` });
      res.writeHead(200, { "content-type": "text/html" }).end(manifestFormHtml(manifest, state));
      return;
    }
    if (url.pathname === "/callback") {
      if (url.searchParams.get("state") !== state) {
        res.writeHead(400).end("state mismatch — re-run npm run setup");
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) { res.writeHead(400).end("missing code"); return; }
      try {
        const r = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
          method: "POST",
          headers: { accept: "application/vnd.github+json" },
        });
        if (!r.ok) throw new Error(`conversion failed: HTTP ${r.status}`);
        const cfg = (await r.json()) as Parameters<typeof resolve>[0];
        res.writeHead(200, { "content-type": "text/html" })
          .end("<h2>✓ Clawptcha GitHub App created.</h2>You can close this tab and return to the terminal.");
        server.close();
        resolve(cfg);
      } catch (e) {
        res.writeHead(500).end("exchange failed — see terminal");
        server.close();
        reject(e);
      }
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1", () => {
    const port = (server.address() as { port: number }).port;
    console.log("A browser tab will open; review the app and click “Create GitHub App”.");
    openBrowser(`http://localhost:${port}/`);
  });
}).catch((e) => die(
  `GitHub App creation failed (${e instanceof Error ? e.message : e}).\n` +
  "Manual fallback: README.md → Manual setup → step 2 (dashboard app creation)."
));

const privateKeyPkcs8 = pkcs1ToPkcs8(appConfig.pem);
console.log(`✓ App “${appConfig.slug}” created (id ${appConfig.id}); private key converted to PKCS#8`);

// ---------- Phase 4: Turnstile ----------
banner("Turnstile");
let turnstileSiteKey = "";
let turnstileSecretKey = "";
const host = new URL(baseUrl).hostname;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (apiToken && accountId) {
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/challenges/widgets`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "clawptcha", domains: [host], mode: "managed" }),
    });
    const data = (await r.json()) as { success: boolean; result?: { sitekey: string; secret: string } };
    if (!r.ok || !data.success || !data.result) throw new Error(`turnstile API: HTTP ${r.status}`);
    turnstileSiteKey = data.result.sitekey;
    turnstileSecretKey = data.result.secret;
    console.log("✓ Turnstile widget created via API");
  } catch (e) {
    console.log(`Turnstile API failed (${e instanceof Error ? e.message : e}); falling back to manual entry.`);
  }
}
if (!turnstileSiteKey) {
  console.log(`Create a widget at https://dash.cloudflare.com/?to=/:account/turnstile for domain: ${host}`);
  console.log("(Tip: set CLOUDFLARE_API_TOKEN with “Turnstile Sites Write” to automate this next time.)");
  turnstileSiteKey = await ask("Turnstile site key");
  turnstileSecretKey = await ask("Turnstile secret key");
}

// ---------- Phase 5+6: session key + write all secrets ----------
banner("Secrets");
const secrets = buildSecretsJson({
  appId: appConfig.id,
  privateKeyPkcs8,
  webhookSecret: appConfig.webhook_secret,
  clientId: appConfig.client_id,
  clientSecret: appConfig.client_secret,
  turnstileSiteKey,
  turnstileSecretKey,
  sessionSigningKey: randomBytes(32).toString("hex"),
});
try {
  // Bulk over stdin: secrets never touch argv or disk.
  wrangler(["secret", "bulk"], { input: JSON.stringify(secrets) });
} catch {
  console.log("Bulk write failed; falling back to per-secret writes…");
  for (const [name, value] of Object.entries(secrets)) {
    wrangler(["secret", "put", name], { input: value });
  }
}
console.log(`✓ ${Object.keys(secrets).length} secrets written`);

// ---------- Phase 7: finalize ----------
if (needsRedeploy) {
  banner("Redeploy (APP_BASE_URL changed)");
  wrangler(["deploy"]);
}
banner("Done");
console.log(`Worker:      ${baseUrl}
GitHub App:  ${appConfig.html_url}
Next steps:
  1. Install the app on a repo:  ${appConfig.html_url}/installations/new
  2. Open a test PR from a non-maintainer account → the clawptcha check appears.
  3. Walk the E2E checklist at the bottom of README.md.`);
rl.close();
```

- [ ] **Step 2: Typecheck the script compiles under tsx' semantics**

Run: `npx tsx --eval "import('./scripts/setup.mts').catch(e => { console.error('IMPORT FAILED', e); process.exit(1); })" < /dev/null; echo "exit: $?"`
Note: importing RUNS the wizard top-level — preflight fires. On this machine wrangler may be logged in, so the wizard could proceed to a REAL deploy. **Do NOT let it.** Instead smoke-test phases in isolation as below.

- [ ] **Step 3: Isolated smokes (no real resources).** Run each and record output:

(a) **Preflight failure path** — force a wrangler failure by pointing npx at an empty prefix:
```bash
cd /Users/idosal/clawptcha && PATH="/usr/bin:/bin" npx tsx scripts/setup.mts < /dev/null; echo "exit: $?"
```
Expected: the "Not logged in to Cloudflare" (or a clean wrangler-failed) message and exit 1 — no crash, no stack trace. (Any clean single-line failure naming wrangler login is acceptable; report the exact message.)

(b) **Manifest server behavior** — exercise the server logic without GitHub, via a scratch driver (write to the scratchpad, not the repo):
```ts
// $SCRATCH/server-smoke.mts — replicates the Phase 3 server wiring
import { createServer } from "node:http";
import { buildManifest, manifestFormHtml } from "/Users/idosal/clawptcha/scripts/setup-lib.mts";
const state = "smoke-state";
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/") {
    const manifest = buildManifest({ appName: "t", baseUrl: "https://x.workers.dev", redirectUrl: "http://localhost:9/callback" });
    res.writeHead(200, { "content-type": "text/html" }).end(manifestFormHtml(manifest, state));
  } else if (url.pathname === "/callback") {
    res.writeHead(url.searchParams.get("state") === state ? 200 : 400).end();
  } else res.writeHead(404).end();
});
server.listen(0, "127.0.0.1", async () => {
  const port = (server.address() as { port: number }).port;
  const home = await fetch(`http://127.0.0.1:${port}/`);
  const html = await home.text();
  console.log("form ok:", home.status === 200 && html.includes("settings/apps/new?state=smoke-state") && html.includes('name="manifest"'));
  console.log("bad state rejected:", (await fetch(`http://127.0.0.1:${port}/callback?code=x&state=WRONG`)).status === 400);
  console.log("good state accepted:", (await fetch(`http://127.0.0.1:${port}/callback?code=x&state=smoke-state`)).status === 200);
  server.close();
});
```
Run: `npx tsx $SCRATCH/server-smoke.mts`
Expected: `form ok: true`, `bad state rejected: true`, `good state accepted: true`.

(c) **Full suite + typecheck still green:** `npm test && npm run typecheck` (scripts/ is outside tsconfig include; if the Task 2 import-extension resolution pulled scripts into the checked graph, confirm setup.mts also typechecks — report either way).

- [ ] **Step 4: Commit**

```bash
git add scripts/setup.mts
git commit -m "feat: npm run setup — one-command deploy wizard (manifest flow, turnstile, bulk secrets)"
```

---

### Task 6: README — deploy button + runbook restructure

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite the top of the Deploy section.** Replace the heading line `## Deploy (operator runbook)` and insert the quick paths BEFORE the current step 1, so the section starts:

```markdown
## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=REPLACE_WITH_PUBLIC_GITHUB_URL)
<!-- TODO(publish): replace REPLACE_WITH_PUBLIC_GITHUB_URL with this repo's public GitHub URL when it's pushed. -->

Two easy paths — both end with the same wizard:

- **Deploy button (no local tooling to start):** click the button — Cloudflare
  forks the repo and provisions the Worker, D1 database, and Workers AI
  binding. Then clone **your fork** and run the wizard for the GitHub-side
  setup:
  ```bash
  npx wrangler login && npm run setup
  ```
- **CLI:** clone this repo, then:
  ```bash
  npx wrangler login && npm run setup
  ```
  The wizard's first deploy auto-provisions D1 and applies migrations; it then
  creates the GitHub App in one click (manifest flow — app ID, webhook secret,
  private key, and OAuth credentials all come back from a single exchange, and
  the key is converted to PKCS#8 for you), sets up Turnstile (automatic if
  `CLOUDFLARE_API_TOKEN` with **Turnstile Sites Write** is set; guided
  copy-paste otherwise), generates the session signing key, and writes all 8
  secrets in one bulk call — they never touch disk or argv.

When the wizard finishes: install the GitHub App on a repo, open a test PR,
and walk the E2E checklist at the bottom of this file.

### Manual setup (what the wizard does)

If you prefer doing it by hand, or a wizard phase fails and points you here:
```

Then the existing steps 1–5 follow unchanged EXCEPT step 1, which must reflect auto-provisioning — replace the current step 1 code block + text:

```markdown
1. **Deploy (D1 is auto-provisioned) and apply migrations.**
   ```bash
   npm run deploy            # deploys and applies migrations/ to the remote D1
   npm run db:migrate:local  # optional, for local `wrangler dev`
   ```
   The D1 binding in `wrangler.jsonc` has no `database_id` — Wrangler creates
   the database on first deploy.
```

(Keep steps 2–5 as they are — they already describe the GitHub App fields, Turnstile, provider config/secrets, and deploy, which is exactly "what the wizard does". In step 5, remove any now-duplicated "Deploy" instruction if it reads redundantly after step 1's change; use judgment and report.)

- [ ] **Step 2: Coherence pass.** Read the whole Deploy section top to bottom as a first-time operator: quick paths → manual fallback. Check the E2E checklist section still flows. Fix only incoherences introduced by this edit.

- [ ] **Step 3: Verify no broken references**

Run: `grep -n "REPLACE_AFTER_wrangler_d1_create\|wrangler d1 create clawptcha" README.md`
Expected: no hits (the old create-and-paste flow is gone from README).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: Deploy to Cloudflare button + one-command setup runbook"
```

---

## Self-review notes

- **Spec coverage:** §1 (config changes) → Task 1; §2 wizard phases 1–7 → Task 5 (helpers in Tasks 2–4); §3 button + README → Task 6; §4 testing → Tasks 2–4 unit tests + Task 5 smokes. Security notes (stdin-only secrets, state nonce, one-shot server) are implemented in Task 5's code.
- **Verify-at-implementation points:** deploy-vs-migrate ordering (Task 1); `.mts` import extension under this tsconfig (Task 2); workerd `node:crypto` PKCS#8 export (Task 4); `wrangler secret bulk` stdin support (Task 5 has a per-secret `put` fallback in-code).
- **Type consistency:** `buildManifest`/`manifestFormHtml`/`parseDeployedUrl`/`patchAppBaseUrl`/`pkcs1ToPkcs8`/`buildSecretsJson` signatures match across Tasks 2–5.
- **Not in this plan (per spec out-of-scope):** Worker `/setup` page, Turnstile-optional, `npm run doctor`.
