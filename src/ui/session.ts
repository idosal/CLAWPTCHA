const encoder = new TextEncoder();

async function hmac(key: string, value: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", k, encoder.encode(value));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signSessionCookie(signingKey: string, sessionId: string): Promise<string> {
  return `${sessionId}.${await hmac(signingKey, sessionId)}`;
}

export async function verifySessionCookie(signingKey: string, cookie: string): Promise<string | null> {
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const sessionId = cookie.slice(0, dot);
  const expected = await hmac(signingKey, sessionId);
  const given = cookie.slice(dot + 1);
  if (expected.length !== given.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0 ? sessionId : null;
}
