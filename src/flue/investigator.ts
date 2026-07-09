import type { VouchaConfig } from "../config";
import type { PrContext, PrFilePatch } from "../challenge";
import type { Env } from "../types";
import {
  investigationMode,
  validateInvestigationArtifact,
  type InvestigationArtifact,
  type InvestigationResult,
} from "../quiz/investigate";

export type InvestigationSource = "worker" | "flue";

interface FlueEnv {
  FLUE_INVESTIGATOR?: Fetcher;
  FLUE_INVESTIGATOR_TIMEOUT_MS?: string;
}

export interface InvestigatorSelection {
  ok: true;
  source: InvestigationSource;
  mode: InvestigationArtifact["mode"];
}

export type InvestigatorSelectionResult =
  | InvestigatorSelection
  | { ok: false; error: string; mode: InvestigationArtifact["mode"] };

export function hasFlueInvestigator(env: FlueEnv): boolean {
  return Boolean(env.FLUE_INVESTIGATOR);
}

export function chooseInvestigatorSource(
  env: FlueEnv,
  cfg: VouchaConfig,
  ctx: PrContext
): InvestigatorSelectionResult {
  const mode = investigationMode(ctx, cfg);
  if (cfg.context.investigator === "worker") return { ok: true, source: "worker", mode };
  if (cfg.context.investigator === "flue") {
    if (!hasFlueInvestigator(env)) {
      return { ok: false, mode, error: "context.investigator is flue but FLUE_INVESTIGATOR service binding is not configured" };
    }
    return { ok: true, source: "flue", mode };
  }
  if (mode === "large_pr" && hasFlueInvestigator(env)) return { ok: true, source: "flue", mode };
  return { ok: true, source: "worker", mode };
}

function boundWorkflowUrl(): string {
  return "https://voucha-flue-investigator/workflows/investigate-pr?wait=result";
}

function timeoutMs(env: FlueEnv): number {
  const parsed = Number.parseInt(env.FLUE_INVESTIGATOR_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 300_000) return parsed;
  return 120_000;
}

function safeDiffExcerpt(diff: string, cfg: VouchaConfig): string {
  const maxChars = cfg.context.detail_tokens * 4;
  if (diff.length <= maxChars) return diff;
  return `${diff.slice(0, maxChars)}\n[diff excerpt truncated by VOUCHA]`;
}

function lowSignalPath(path: string): boolean {
  return /(^|\/)(dist|build|coverage|vendor|generated)\//.test(path) ||
    /\.(png|jpe?g|gif|webp|ico|lock|map)$/i.test(path) ||
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path);
}

function filePayload(files: PrFilePatch[] | undefined, cfg: VouchaConfig): PrFilePatch[] {
  const rankedPatchFiles = new Set(
    [...(files ?? [])]
      .filter((file) => file.patch)
      .sort((a, b) => {
        const aLow = lowSignalPath(a.filename) ? 1 : 0;
        const bLow = lowSignalPath(b.filename) ? 1 : 0;
        if (aLow !== bLow) return aLow - bLow;
        return b.changes - a.changes;
      })
      .slice(0, cfg.context.max_files)
      .map((file) => file.filename)
  );
  return (files ?? []).map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: rankedPatchFiles.has(file.filename) ? file.patch : null,
  }));
}

function artifactCandidate(envelope: unknown): unknown {
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) return envelope;
  const record = envelope as Record<string, unknown>;
  if ("artifact" in record) return record.artifact;
  if ("result" in record) {
    const result = record.result;
    if (result !== null && typeof result === "object" && !Array.isArray(result)) {
      const resultRecord = result as Record<string, unknown>;
      if (resultRecord.ok === false && typeof resultRecord.error === "string") {
        return { __voucha_error: resultRecord.error };
      }
      if ("artifact" in resultRecord) return resultRecord.artifact;
    }
    return result;
  }
  return envelope;
}

async function responseText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

export async function investigatePrWithFlue(
  env: FlueEnv,
  ctx: PrContext,
  cfg: VouchaConfig
): Promise<InvestigationResult> {
  if (!env.FLUE_INVESTIGATOR) return { ok: false, error: "Flue investigator service binding is not configured" };
  if (!ctx.repoFullName || !ctx.prNumber || !ctx.headSha) {
    return { ok: false, error: "missing PR identity for Flue investigator" };
  }

  const mode = investigationMode(ctx, cfg);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("flue investigator timeout"), timeoutMs(env));
  try {
    const body = {
      repo: {
        full_name: ctx.repoFullName,
        pr_number: ctx.prNumber,
        head_sha: ctx.headSha,
      },
      pr: {
        title: ctx.title,
        body: ctx.body,
        changed_files: ctx.filePatches?.length ?? ctx.files.length,
        changed_lines: ctx.changedLines ?? null,
        mode,
      },
      files: filePayload(ctx.filePatches, cfg),
      fallback_files: ctx.files,
      diff_excerpt: safeDiffExcerpt(ctx.diff, cfg),
      limits: {
        map_tokens: cfg.context.map_tokens,
        detail_tokens: cfg.context.detail_tokens,
        max_files: cfg.context.max_files,
        max_model_calls: cfg.context.max_model_calls,
      },
    };
    const init: RequestInit = {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    };
    const res = await env.FLUE_INVESTIGATOR.fetch(boundWorkflowUrl(), init);
    if (!res.ok) return { ok: false, error: `flue investigator HTTP ${res.status}: ${await responseText(res)}` };

    const envelope = await res.json();
    const candidate = artifactCandidate(envelope);
    if (
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      typeof (candidate as Record<string, unknown>).__voucha_error === "string"
    ) {
      return { ok: false, error: String((candidate as Record<string, unknown>).__voucha_error) };
    }
    return validateInvestigationArtifact(candidate, mode);
  } catch (e) {
    return { ok: false, error: `flue investigator: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}

export type FlueInvestigatorEnv = Pick<
  Env,
  "FLUE_INVESTIGATOR" | "FLUE_INVESTIGATOR_TIMEOUT_MS"
>;
