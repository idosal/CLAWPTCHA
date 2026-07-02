import { describe, it, expect } from "vitest";
import { createAppJwt } from "../src/github/auth";

async function generateTestKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
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
