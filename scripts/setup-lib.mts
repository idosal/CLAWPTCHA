// Pure helpers for scripts/setup.mts — no I/O, no prompts, unit-tested in
// test/setup-lib.test.ts. Keep side effects in setup.mts.

import { createPrivateKey } from "node:crypto";

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
      members: "read",
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

export function parseDeployedUrl(wranglerOutput: string): string | null {
  // Last match: deploy output prints the production URL after any
  // preview/alias URLs, and a wrong-but-plausible URL here would flow
  // into the GitHub App manifest.
  const matches = wranglerOutput.match(/https:\/\/[a-z0-9][a-z0-9.-]*\.workers\.dev/gi);
  return matches ? matches[matches.length - 1] : null;
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
