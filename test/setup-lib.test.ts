import { describe, it, expect } from "vitest";
import { buildManifest, buildSecretsJson, manifestFormHtml, parseDeployedUrl, patchAppBaseUrl, pkcs1ToPkcs8 } from "../scripts/setup-lib.mts";

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
    const out = "Uploaded clawptcha (3.2 sec)\nDeployed clawptcha triggers (1.1 sec)\n  https://clawptcha.someone.workers.dev\nCurrent Version ID: abc";
    expect(parseDeployedUrl(out)).toBe("https://clawptcha.someone.workers.dev");
  });
  it("returns null when absent", () => {
    expect(parseDeployedUrl("nothing here")).toBeNull();
  });
  it("prefers the last workers.dev url when several appear", () => {
    const out = "preview: https://abc-preview.someone.workers.dev\nDeployed\n  https://clawptcha.someone.workers.dev";
    expect(parseDeployedUrl(out)).toBe("https://clawptcha.someone.workers.dev");
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
