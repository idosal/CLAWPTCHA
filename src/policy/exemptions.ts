import type { ClawptchaConfig } from "../config";
import type { RepositoryAccess } from "../github/permissions";
import { matchRepositoryAccess } from "../github/permissions";

export interface PrFacts {
  authorLogin: string;
  authorType: "User" | "Bot";
  authorAssociation: string; // GitHub author_association enum
  changedLines: number;      // additions + deletions
  changedFiles: string[];
}

export type ExemptionResult = { exempt: false } | { exempt: true; reason: string };

const MAINTAINER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

function normalizeAssociation(association: string): string {
  return association.trim().toUpperCase();
}

function configuredAuthorAssociations(cfg: ClawptchaConfig): Set<string> {
  const associations = new Set<string>();
  for (const exemption of cfg.exemptions) {
    if (exemption.type !== "author_association") continue;
    for (const association of exemption.associations) {
      associations.add(normalizeAssociation(association));
    }
  }
  return associations;
}

function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

function configuredAuthorLogins(cfg: ClawptchaConfig): Set<string> {
  const logins = new Set<string>();
  for (const exemption of cfg.exemptions) {
    if (exemption.type !== "author_login") continue;
    for (const login of exemption.logins) {
      logins.add(normalizeLogin(login));
    }
  }
  return logins;
}

function normalizePermission(permission: string): string {
  return permission.trim().toLowerCase();
}

function configuredRepositoryPermissions(cfg: ClawptchaConfig): Set<string> {
  const permissions = new Set<string>();
  for (const exemption of cfg.exemptions) {
    if (exemption.type !== "repository_permission") continue;
    for (const permission of exemption.permissions) {
      permissions.add(normalizePermission(permission));
    }
  }
  return permissions;
}

function trustedBotLogins(cfg: ClawptchaConfig): Set<string> {
  return new Set(cfg.bot_policy.trusted_logins.map(normalizeLogin));
}

function pathMatchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesGlob(pattern, path));
}

function pathsMatchEvery(files: string[], patterns: string[]): boolean {
  return files.length > 0 && files.every((file) => pathMatchesAny(file, patterns));
}

function pathsMatchSome(files: string[], patterns: string[]): boolean {
  return files.length > 0 && files.some((file) => pathMatchesAny(file, patterns));
}

function cloneConfigWithOverrides(
  cfg: ClawptchaConfig,
  overrides: Partial<Pick<
    ClawptchaConfig,
    "gates" | "require_approval" | "max_attempts" | "cooldown_minutes" |
    "min_changed_lines" | "skip_paths" | "include_paths"
  >>
): ClawptchaConfig {
  return {
    ...cfg,
    gates: overrides.gates ? overrides.gates.map((gate) => ({ ...gate })) : cfg.gates.map((gate) => ({ ...gate })),
    require_approval: overrides.require_approval ?? cfg.require_approval,
    max_attempts: overrides.max_attempts ?? cfg.max_attempts,
    cooldown_minutes: overrides.cooldown_minutes ?? cfg.cooldown_minutes,
    min_changed_lines: overrides.min_changed_lines ?? cfg.min_changed_lines,
    skip_paths: overrides.skip_paths ? [...overrides.skip_paths] : [...cfg.skip_paths],
    include_paths: overrides.include_paths ? [...overrides.include_paths] : [...cfg.include_paths],
  };
}

export function applyPathRules(cfg: ClawptchaConfig, changedFiles: string[]): ClawptchaConfig {
  if (changedFiles.length === 0) return cfg;
  const rule = cfg.path_rules.find((candidate) => pathsMatchSome(changedFiles, candidate.paths));
  if (!rule) return cfg;
  return cloneConfigWithOverrides(cfg, {
    gates: rule.gates,
    require_approval: rule.require_approval,
    max_attempts: rule.max_attempts,
    cooldown_minutes: rule.cooldown_minutes,
    min_changed_lines: rule.min_changed_lines,
    skip_paths: rule.skip_paths,
    include_paths: rule.include_paths,
  });
}

export function shouldRechallengeOnPush(cfg: ClawptchaConfig, changedFiles: string[]): boolean {
  if (pathsMatchEvery(changedFiles, cfg.rechallenge.ignore_paths)) return false;
  if (cfg.rechallenge.on_push === "never") return false;
  if (cfg.rechallenge.on_push === "always") return true;
  if (cfg.include_paths.length === 0) return true;
  return pathsMatchSome(changedFiles, cfg.include_paths);
}

// Minimal glob subset: '**' matches zero or more whole path segments,
// '*' matches within a single segment. Everything else — including '?',
// '.', '(' — is a literal character. Implemented without regexes so
// maintainer-authored patterns can never trigger catastrophic backtracking.
export function matchesGlob(pattern: string, path: string): boolean {
  const pSegs = pattern.split("/");
  const fSegs = path.split("/");
  const memo = new Map<string, boolean>();
  const seg = (i: number, j: number): boolean => {
    const key = `${i},${j}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let res: boolean;
    if (i === pSegs.length) {
      res = j === fSegs.length;
    } else if (pSegs[i] === "**") {
      res = seg(i + 1, j) || (j < fSegs.length && seg(i, j + 1));
    } else {
      res = j < fSegs.length && segmentMatch(pSegs[i], fSegs[j]) && seg(i + 1, j + 1);
    }
    memo.set(key, res);
    return res;
  };
  return seg(0, 0);
}

// '*' wildcard within one segment; iterative two-pointer, linear time.
function segmentMatch(pat: string, s: string): boolean {
  let p = 0, i = 0, star = -1, mark = 0;
  while (i < s.length) {
    if (p < pat.length && pat[p] === s[i]) { p++; i++; }
    else if (p < pat.length && pat[p] === "*") { star = p; p++; mark = i; }
    else if (star >= 0) { p = star + 1; mark++; i = mark; }
    else return false;
  }
  while (p < pat.length && pat[p] === "*") p++;
  return p === pat.length;
}

export function evaluateExemption(pr: PrFacts, cfg: ClawptchaConfig): ExemptionResult {
  const authorAssociation = normalizeAssociation(pr.authorAssociation);
  if (cfg.skip_bots && pr.authorType === "Bot") {
    return { exempt: true, reason: "bot author" };
  }
  if (pr.authorType === "Bot" && trustedBotLogins(cfg).has(normalizeLogin(pr.authorLogin))) {
    return { exempt: true, reason: "trusted bot author" };
  }
  // GitHub logins are case-insensitive, so compare without regard to case.
  if (cfg.skip_authors.some((a) => a.toLowerCase() === pr.authorLogin.toLowerCase())) {
    return { exempt: true, reason: "author in skip_authors" };
  }
  if (configuredAuthorLogins(cfg).has(normalizeLogin(pr.authorLogin))) {
    return { exempt: true, reason: "author in author_login exemption" };
  }
  if (MAINTAINER_ASSOCIATIONS.has(authorAssociation)) {
    return { exempt: true, reason: `maintainer (${authorAssociation})` };
  }
  if (configuredAuthorAssociations(cfg).has(authorAssociation)) {
    return { exempt: true, reason: `trusted author association (${authorAssociation})` };
  }
  if (pr.changedLines < cfg.min_changed_lines) {
    return { exempt: true, reason: "diff below min_changed_lines" };
  }
  if (
    pr.changedFiles.length > 0 &&
    cfg.include_paths.length > 0 &&
    !pr.changedFiles.some((f) => cfg.include_paths.some((p) => matchesGlob(p, f)))
  ) {
    return { exempt: true, reason: "no changed files match include_paths" };
  }
  // Guard changedFiles.length > 0: .every() on an empty array is vacuously
  // true, which would otherwise auto-exempt PRs with no reported files.
  if (
    pr.changedFiles.length > 0 &&
    pr.changedFiles.every((f) => cfg.skip_paths.some((p) => matchesGlob(p, f)))
  ) {
    return { exempt: true, reason: "all changed files match skip_paths" };
  }
  return { exempt: false };
}

export interface RepositoryPermissionExemptionFacts {
  repo: string;
  authorLogin: string;
}

export interface RepositoryPermissionExemptionDeps {
  getUserPermission(repo: string, username: string): Promise<RepositoryAccess>;
}

export interface GitHubTeamExemptionDeps {
  getTeamMembership(
    org: string,
    teamSlug: string,
    username: string
  ): Promise<{ state: string; role: string } | null>;
}

export interface PriorMergedPrsExemptionDeps {
  countMergedPullRequestsByAuthor(repo: string, username: string): Promise<number>;
}

export async function evaluateRepositoryPermissionExemption(
  pr: RepositoryPermissionExemptionFacts,
  cfg: ClawptchaConfig,
  deps: RepositoryPermissionExemptionDeps
): Promise<ExemptionResult> {
  const configuredPermissions = configuredRepositoryPermissions(cfg);
  if (configuredPermissions.size === 0) return { exempt: false };

  let matchedPermission: string | null;
  try {
    matchedPermission = matchRepositoryAccess(
      await deps.getUserPermission(pr.repo, pr.authorLogin),
      configuredPermissions
    );
  } catch {
    return { exempt: false };
  }

  if (matchedPermission) {
    return { exempt: true, reason: `trusted repository permission (${matchedPermission})` };
  }
  return { exempt: false };
}

function teamReference(repo: string, team: string): { org: string; slug: string; label: string } | null {
  const [repoOwner] = repo.split("/");
  if (!repoOwner) return null;
  const parts = team.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) {
    return { org: repoOwner, slug: parts[0], label: `${repoOwner}/${parts[0]}` };
  }
  if (parts.length === 2) {
    return { org: parts[0], slug: parts[1], label: `${parts[0]}/${parts[1]}` };
  }
  return null;
}

export async function evaluateGitHubTeamExemption(
  pr: RepositoryPermissionExemptionFacts,
  cfg: ClawptchaConfig,
  deps: GitHubTeamExemptionDeps
): Promise<ExemptionResult> {
  for (const exemption of cfg.exemptions) {
    if (exemption.type !== "github_team") continue;
    const trustedRoles = new Set(exemption.roles ?? ["member", "maintainer"]);
    for (const team of exemption.teams) {
      const ref = teamReference(pr.repo, team);
      if (!ref) continue;
      try {
        const membership = await deps.getTeamMembership(ref.org, ref.slug, pr.authorLogin);
        if (
          membership?.state === "active" &&
          trustedRoles.has(membership.role.trim().toLowerCase() as "member" | "maintainer")
        ) {
          return { exempt: true, reason: `trusted GitHub team (${ref.label})` };
        }
      } catch {
        continue;
      }
    }
  }
  return { exempt: false };
}

export async function evaluatePriorMergedPrsExemption(
  pr: RepositoryPermissionExemptionFacts,
  cfg: ClawptchaConfig,
  deps: PriorMergedPrsExemptionDeps
): Promise<ExemptionResult> {
  const thresholds = cfg.exemptions
    .filter((exemption) => exemption.type === "prior_merged_prs")
    .map((exemption) => exemption.min_count);
  if (thresholds.length === 0) return { exempt: false };

  const minCount = Math.min(...thresholds);
  let count: number;
  try {
    count = await deps.countMergedPullRequestsByAuthor(pr.repo, pr.authorLogin);
  } catch {
    return { exempt: false };
  }
  if (count >= minCount) {
    return { exempt: true, reason: `author has ${count} prior merged PRs` };
  }
  return { exempt: false };
}
