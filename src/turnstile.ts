const TURNSTILE_TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "3x00000000000000000000FF",
]);

export function isTurnstileTestSiteKey(siteKey: string): boolean {
  return TURNSTILE_TEST_SITE_KEYS.has(siteKey.trim());
}

function isLocalUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const { hostname } = new URL(rawUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function turnstileProductionConfigError(
  siteKey: string,
  requestUrl: string,
  appBaseUrl: string
): string | null {
  if (!isTurnstileTestSiteKey(siteKey)) return null;
  if (isLocalUrl(requestUrl) || isLocalUrl(appBaseUrl)) return null;
  return "Browser verification is configured with a Cloudflare testing site key. The operator needs to replace the production Turnstile widget credentials before this challenge can be taken.";
}
