import type { Env } from "../types";

export function authorizeUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_CLIENT_ID,
    redirect_uri: `${env.APP_BASE_URL}/oauth/callback`,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeCodeForLogin(
  env: Env, code: string, fetchFn: typeof fetch = fetch
): Promise<string | null> {
  const tokenRes = await fetchFn("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  if (!tokenRes.ok) return null;
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return null;

  const userRes = await fetchFn("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${access_token}`,
      accept: "application/vnd.github+json",
      "user-agent": "clawptcha",
    },
  });
  if (!userRes.ok) return null;
  return ((await userRes.json()) as { login: string }).login;
}
