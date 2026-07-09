import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { buildManifest, buildSecretsJson, manifestFormHtml, parseDeployedUrl, patchAppBaseUrl, patchTurnstileSiteKey, pkcs1ToPkcs8 } from "../scripts/setup-lib.mts";

describe("buildManifest", () => {
  const m = buildManifest({
    appName: "voucha-test",
    baseUrl: "https://voucha.example.workers.dev",
    redirectUrl: "http://localhost:8976/callback",
  });

  it("sets urls derived from the base url", () => {
    expect(m.url).toBe("https://voucha.example.workers.dev");
    expect(m.hook_attributes).toEqual({ url: "https://voucha.example.workers.dev/webhook" });
    expect(m).not.toHaveProperty("callback_urls");
    expect(m.redirect_url).toBe("http://localhost:8976/callback");
  });

  it("requests exactly the permissions and events the Worker needs", () => {
    expect(m.default_permissions).toEqual({
      checks: "write",
      pull_requests: "write",
      contents: "read",
      metadata: "read",
      members: "read",
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

describe("parseDeployedUrl", () => {
  it("finds the workers.dev url in wrangler deploy output", () => {
    const out = "Uploaded voucha (3.2 sec)\nDeployed voucha triggers (1.1 sec)\n  https://voucha.someone.workers.dev\nCurrent Version ID: abc";
    expect(parseDeployedUrl(out)).toBe("https://voucha.someone.workers.dev");
  });
  it("returns null when absent", () => {
    expect(parseDeployedUrl("nothing here")).toBeNull();
  });
  it("prefers the last workers.dev url when several appear", () => {
    const out = "preview: https://abc-preview.someone.workers.dev\nDeployed\n  https://voucha.someone.workers.dev";
    expect(parseDeployedUrl(out)).toBe("https://voucha.someone.workers.dev");
  });
});

describe("patchAppBaseUrl", () => {
  const jsonc = `{
  // comment survives
  "vars": {
    "APP_BASE_URL": "https://voucha.example.workers.dev",
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
    const r = patchAppBaseUrl(jsonc, "https://voucha.example.workers.dev");
    expect(r.changed).toBe(false);
    expect(r.text).toBe(jsonc);
  });
  it("throws when the key is missing", () => {
    expect(() => patchAppBaseUrl("{}", "https://x")).toThrow(/APP_BASE_URL/);
  });
});

describe("patchTurnstileSiteKey", () => {
  const jsonc = `{
  "vars": {
    "APP_BASE_URL": "https://voucha.example.workers.dev",
    "LLM_PROVIDER": "workers-ai"
  }
}`;

  it("adds the public site key next to APP_BASE_URL", () => {
    const r = patchTurnstileSiteKey(jsonc, "0xSITE");
    expect(r.changed).toBe(true);
    expect(r.text).toContain('"APP_BASE_URL": "https://voucha.example.workers.dev",');
    expect(r.text).toContain('"TURNSTILE_SITE_KEY": "0xSITE",');
    expect(r.text).toContain('"LLM_PROVIDER": "workers-ai"');
  });

  it("updates an existing public site key", () => {
    const withKey = patchTurnstileSiteKey(jsonc, "0xOLD").text;
    const r = patchTurnstileSiteKey(withKey, "0xNEW");
    expect(r.changed).toBe(true);
    expect(r.text).toContain('"TURNSTILE_SITE_KEY": "0xNEW"');
    expect(r.text).not.toContain("0xOLD");
  });

  it("reports unchanged when the public site key already matches", () => {
    const withKey = patchTurnstileSiteKey(jsonc, "0xSITE").text;
    const r = patchTurnstileSiteKey(withKey, "0xSITE");
    expect(r.changed).toBe(false);
    expect(r.text).toBe(withKey);
  });
});

function testPkcs1Pem(): string {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  return privateKey.export({ type: "pkcs1", format: "pem" }).toString();
}

const pkcs8Begin = "-----BEGIN " + "PRIVATE KEY-----";
const pkcs8End = "-----END " + "PRIVATE KEY-----";
const pkcs8Marker = "BEGIN " + "PRIVATE KEY";

describe("pkcs1ToPkcs8", () => {
  it("converts a PKCS#1 RSA key to PKCS#8 PEM", () => {
    const out = pkcs1ToPkcs8(testPkcs1Pem());
    expect(out).toContain(pkcs8Begin);
    expect(out).not.toContain("BEGIN RSA PRIVATE KEY");
  });
  it("passes an already-PKCS#8 key through unchanged in kind", () => {
    const once = pkcs1ToPkcs8(testPkcs1Pem());
    const twice = pkcs1ToPkcs8(once);
    expect(twice).toContain(pkcs8Begin);
  });
});

describe("buildSecretsJson", () => {
  it("assembles exactly the 5 workers-ai-path secrets", () => {
    const s = buildSecretsJson({
      appId: 123,
      privateKeyPkcs8: `${pkcs8Begin}\nx\n${pkcs8End}`,
      webhookSecret: "wh",
      turnstileSecretKey: "0xSECRET",
      sessionSigningKey: "a".repeat(64),
    });
    expect(Object.keys(s).sort()).toEqual([
      "GITHUB_APP_ID",
      "GITHUB_PRIVATE_KEY",
      "GITHUB_WEBHOOK_SECRET",
      "SESSION_SIGNING_KEY",
      "TURNSTILE_SECRET_KEY",
    ]);
    expect(s.GITHUB_APP_ID).toBe("123");
    expect(s.GITHUB_PRIVATE_KEY).toContain(pkcs8Marker);
  });
});
