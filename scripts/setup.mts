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
// If whoami lists multiple accounts, first match silently picks the first —
// acceptable for a wizard: deploy uses wrangler's own account resolution, and
// accountId only feeds the app-name suffix and the Turnstile API call.
const accountId = (whoami.match(/([0-9a-f]{32})/) ?? [])[1];
// wrangler whoami exits 0 even when unauthenticated, so the try/catch above
// only catches hard failures — detect the logged-out case by the missing id.
if (!accountId) {
  die("Not logged in to Cloudflare (wrangler whoami shows no account). Run: npx wrangler login  — then re-run npm run setup");
}
console.log(`✓ Cloudflare auth OK (account ${accountId.slice(0, 8)}…)`);

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
if (!baseUrl) baseUrl = await ask("Could not detect the Worker URL — paste your Worker's public origin (e.g. https://clawptcha.<your-subdomain>.workers.dev or your custom domain)");
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
const appName = await ask("GitHub App name", `clawptcha-${accountId.slice(0, 6)}`);
const state = randomBytes(16).toString("hex");

interface AppConfig {
  id: number; pem: string; webhook_secret: string;
  client_id: string; client_secret: string; html_url: string; slug: string;
}

const appConfig = await new Promise<AppConfig>((resolve, reject) => {
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
        const cfg = (await r.json()) as AppConfig;
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
if (apiToken) {
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
