import { describe, it, expect } from "vitest";
import { signSessionCookie, verifySessionCookie } from "../src/ui/session";

const KEY = "0123456789abcdef0123456789abcdef";

describe("session cookie", () => {
  it("round-trips a session id", async () => {
    const cookie = await signSessionCookie(KEY, "sess-123");
    expect(await verifySessionCookie(KEY, cookie)).toBe("sess-123");
  });
  it("rejects tampered values and wrong keys", async () => {
    const cookie = await signSessionCookie(KEY, "sess-123");
    expect(await verifySessionCookie(KEY, cookie.replace("sess-123", "sess-999"))).toBeNull();
    expect(await verifySessionCookie("f".repeat(32), cookie)).toBeNull();
    expect(await verifySessionCookie(KEY, "garbage")).toBeNull();
  });
});
