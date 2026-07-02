import type { ClawptchaConfig } from "../config";

export interface PrFacts {
  authorLogin: string;
  authorType: "User" | "Bot";
  authorAssociation: string; // GitHub author_association enum
  changedLines: number;      // additions + deletions
  changedFiles: string[];
}

export type ExemptionResult = { exempt: false } | { exempt: true; reason: string };

const MAINTAINER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

// Minimal glob: '**' spans path segments, '*' matches within one segment.
export function matchesGlob(pattern: string, path: string): boolean {
  const regex = pattern
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*")
    )
    .join(".*");
  return new RegExp(`^${regex}$`).test(path);
}

export function evaluateExemption(pr: PrFacts, cfg: ClawptchaConfig): ExemptionResult {
  if (cfg.skip_bots && pr.authorType === "Bot") {
    return { exempt: true, reason: "bot author" };
  }
  if (cfg.skip_authors.includes(pr.authorLogin)) {
    return { exempt: true, reason: "author in skip_authors" };
  }
  if (MAINTAINER_ASSOCIATIONS.has(pr.authorAssociation)) {
    return { exempt: true, reason: `maintainer (${pr.authorAssociation})` };
  }
  if (pr.changedLines < cfg.min_changed_lines) {
    return { exempt: true, reason: "diff below min_changed_lines" };
  }
  if (
    pr.changedFiles.length > 0 &&
    pr.changedFiles.every((f) => cfg.skip_paths.some((p) => matchesGlob(p, f)))
  ) {
    return { exempt: true, reason: "all changed files match skip_paths" };
  }
  return { exempt: false };
}
