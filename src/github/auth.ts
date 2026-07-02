const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(encoder.encode(JSON.stringify(obj)));
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

export async function createAppJwt(appId: string, pkcs8Pem: string, now: Date): Promise<string> {
  const epoch = Math.floor(now.getTime() / 1000);
  const header = b64urlJson({ alg: "RS256", typ: "JWT" });
  // iat 60s in the past guards against clock drift; exp max 10min (GitHub limit).
  const payload = b64urlJson({ iat: epoch - 60, exp: epoch + 540, iss: appId });
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToBytes(pkcs8Pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

// Installation tokens are cached per installation for ~55 minutes.
const tokenCache = new Map<number, { token: string; expiresAtMs: number }>();

export async function getInstallationToken(
  appId: string,
  pkcs8Pem: string,
  installationId: number,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) return cached.token;

  const jwt = await createAppJwt(appId, pkcs8Pem, new Date());
  const res = await fetchFn(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "user-agent": "clawptcha",
      },
    }
  );
  if (!res.ok) throw new Error(`installation token failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { token: string; expires_at: string };
  tokenCache.set(installationId, {
    token: data.token,
    expiresAtMs: new Date(data.expires_at).getTime(),
  });
  return data.token;
}
