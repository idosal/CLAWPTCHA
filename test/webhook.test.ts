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
