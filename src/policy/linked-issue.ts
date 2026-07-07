import type { LinkedIssueMatchExemption } from "../config";
import type { RepositoryAccess } from "../github/permissions";
import { matchRepositoryAccess } from "../github/permissions";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const TRUSTED_PERMISSIONS = new Set(["admin", "maintain", "write"]);

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "and", "are", "before", "being", "between",
  "can", "change", "changes", "code", "does", "for", "from", "has", "have", "into", "issue",
  "its", "new", "not", "now", "our", "out", "pull", "request", "should", "that", "the", "their",
  "this", "through", "use", "uses", "when", "with", "without", "your",
]);

export interface LinkedIssueReference {
  repo: string;
  number: number;
}

export interface IssueFacts {
  repo: string;
  number: number;
  title: string;
  body: string | null;
  authorLogin: string;
  authorAssociation: string;
  assignees: string[];
  labels: string[];
  isPullRequest: boolean;
}

export interface LinkedIssuePrFacts {
  repo: string;
  title: string;
  body: string | null;
  changedFiles: string[];
}

export interface LinkedIssueDeps {
  getIssue(repo: string, issueNumber: number): Promise<IssueFacts | null>;
  getUserPermission(repo: string, username: string): Promise<RepositoryAccess>;
}

export type LinkedIssueExemptionResult =
  | { exempt: false }
  | { exempt: true; reason: string };

function uniqueRefs(refs: LinkedIssueReference[]): LinkedIssueReference[] {
  const seen = new Set<string>();
  const out: LinkedIssueReference[] = [];
  for (const ref of refs) {
    const key = `${ref.repo.toLowerCase()}#${ref.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

export function extractLinkedIssueReferences(
  text: string | null,
  defaultRepo: string,
  requireSameRepo: boolean
): LinkedIssueReference[] {
  if (!text) return [];
  const refs: LinkedIssueReference[] = [];
  const repoPattern = String.raw`[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+`;
  const closer = String.raw`(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)`;
  const refPattern = String.raw`(?:#(\d+)|(${repoPattern})#(\d+)|https:\/\/github\.com\/(${repoPattern})\/issues\/(\d+))`;
  const re = new RegExp(String.raw`\b${closer}\s+${refPattern}`, "gi");
  for (const match of text.matchAll(re)) {
    const repo = match[2] ?? match[4] ?? defaultRepo;
    const number = Number(match[1] ?? match[3] ?? match[5]);
    if (!Number.isInteger(number) || number <= 0) continue;
    if (requireSameRepo && repo.toLowerCase() !== defaultRepo.toLowerCase()) continue;
    refs.push({ repo, number });
  }
  return uniqueRefs(refs);
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

async function hasTrustedSignal(
  issue: IssueFacts,
  cfg: LinkedIssueMatchExemption,
  deps: LinkedIssueDeps
): Promise<boolean> {
  if (!cfg.require_trusted_signal) return true;
  if (TRUSTED_ASSOCIATIONS.has(issue.authorAssociation)) return true;

  const trustedLabels = new Set(cfg.trusted_labels.map(normalizeLabel).filter(Boolean));
  if (trustedLabels.size > 0 && issue.labels.some((label) => trustedLabels.has(normalizeLabel(label)))) {
    return true;
  }

  for (const login of issue.assignees.slice(0, 5)) {
    const permission = await deps.getUserPermission(issue.repo, login);
    if (matchRepositoryAccess(permission, TRUSTED_PERMISSIONS)) return true;
  }
  return false;
}

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP_WORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

function containment(needle: Set<string>, haystack: Set<string>): number {
  if (needle.size === 0 || haystack.size === 0) return 0;
  let hits = 0;
  for (const token of needle) if (haystack.has(token)) hits++;
  return hits / needle.size;
}

export function linkedIssueMatchScore(issue: IssueFacts, pr: LinkedIssuePrFacts): number {
  const prText = [
    pr.title,
    pr.body ?? "",
    pr.changedFiles.map((file) => file.replace(/[./_-]/g, " ")).join(" "),
  ].join("\n");
  const prTokens = tokens(prText);
  const issueTitleScore = containment(tokens(issue.title), prTokens);
  const issueFullScore = containment(tokens(`${issue.title}\n${issue.body ?? ""}`), prTokens);
  return Math.max(issueTitleScore, issueFullScore);
}

export async function evaluateLinkedIssueExemption(
  pr: LinkedIssuePrFacts,
  cfg: LinkedIssueMatchExemption,
  deps: LinkedIssueDeps
): Promise<LinkedIssueExemptionResult> {
  const refs = extractLinkedIssueReferences(pr.body, pr.repo, cfg.require_same_repo).slice(0, cfg.max_issues);
  for (const ref of refs) {
    let issue: IssueFacts | null;
    try {
      issue = await deps.getIssue(ref.repo, ref.number);
    } catch {
      continue;
    }
    if (!issue || issue.isPullRequest) continue;
    if (cfg.require_same_repo && issue.repo.toLowerCase() !== pr.repo.toLowerCase()) continue;
    if (!(await hasTrustedSignal(issue, cfg, deps))) continue;

    const score = linkedIssueMatchScore(issue, pr);
    if (score >= cfg.min_match_score) {
      return {
        exempt: true,
        reason: `linked issue ${issue.repo}#${issue.number} matches this PR (score ${score.toFixed(2)})`,
      };
    }
  }
  return { exempt: false };
}
