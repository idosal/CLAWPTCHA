// Temporary access control: restrict which repositories this GitHub App acts on.
//
// Set REPO_ALLOWLIST (a Cloudflare Worker variable — editable in the dashboard
// under Workers & Pages > voucha > Settings > Variables, or in wrangler.jsonc)
// to a comma/whitespace/newline-separated list of entries. Each entry is either
// a full `owner/repo` (allow just that repo) or a bare `owner` (allow every repo
// under that account). Matching is case-insensitive, matching GitHub's own
// treatment of account and repo names.
//
// An unset or empty allowlist means "no restriction" — the app acts on every
// repo it is installed on, preserving the default open behavior. This is
// intended as a temporary gate while access is limited.

export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isRepoAllowed(raw: string | undefined | null, repoFullName: string): boolean {
  const entries = parseAllowlist(raw);
  if (entries.length === 0) return true; // no allowlist configured -> allow all
  const full = repoFullName.toLowerCase();
  const owner = full.split("/")[0];
  return entries.some((entry) => entry === full || entry === owner);
}
