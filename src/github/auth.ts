const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(encoder.encode(JSON.stringify(obj)));
}

function pemToBytes(pem: string): Uint8Array {
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    throw new Error(
      "GITHUB_PRIVATE_KEY is PKCS#1; convert to PKCS#8 first: " +
      "openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app-pkcs8.pem"
    );
  }
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

export type InstallationTokenPermission = "read" | "write";

export interface InstallationTokenOptions {
  permissions?: Partial<Record<"contents" | "pull_requests" | "metadata" | "members", InstallationTokenPermission>>;
  repositoryIds?: number[];
}

// Installation tokens are cached per installation/scope for ~55 minutes.
const tokenCache = new Map<string, { token: string; expiresAtMs: number }>();

function tokenCacheKey(installationId: number, options?: InstallationTokenOptions): string {
  const permissions = options?.permissions
    ? Object.entries(options.permissions).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const repositoryIds = [...(options?.repositoryIds ?? [])].sort((a, b) => a - b);
  return JSON.stringify({ installationId, permissions, repositoryIds });
}

export async function getInstallationToken(
  appId: string,
  pkcs8Pem: string,
  installationId: number,
  fetchFn: typeof fetch = fetch,
  options?: InstallationTokenOptions
): Promise<string> {
  const cacheKey = tokenCacheKey(installationId, options);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) return cached.token;

  const jwt = await createAppJwt(appId, pkcs8Pem, new Date());
  const body: Record<string, unknown> = {};
  if (options?.permissions) body.permissions = options.permissions;
  if (options?.repositoryIds) body.repository_ids = options.repositoryIds;
  const hasBody = Object.keys(body).length > 0;
  const res = await fetchFn(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "user-agent": "clawptcha",
        ...(hasBody ? { "content-type": "application/json" } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    }
  );
  if (!res.ok) throw new Error(`installation token failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { token: string; expires_at: string };
  tokenCache.set(cacheKey, {
    token: data.token,
    expiresAtMs: new Date(data.expires_at).getTime(),
  });
  return data.token;
}
