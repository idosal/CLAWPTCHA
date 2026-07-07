import type { ClawptchaConfig } from "../config";
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
  FLUE_INVESTIGATOR_URL?: string;
  FLUE_INVESTIGATOR_SECRET?: string;
  FLUE_INVESTIGATOR_TIMEOUT_MS?: string;
}

interface FlueInvestigatorOptions {
  fetchFn?: typeof fetch;
}

export interface InvestigatorSelection {
  ok: true;
  source: InvestigationSource;
  mode: InvestigationArtifact["mode"];
}

export type InvestigatorSelectionResult =
  | InvestigatorSelection
  | { ok: false; error: string; mode: InvestigationArtifact["mode"] };

function cleanSecret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function hasFlueInvestigator(env: FlueEnv): boolean {
  return Boolean(cleanSecret(env.FLUE_INVESTIGATOR_SECRET) && (env.FLUE_INVESTIGATOR || cleanSecret(env.FLUE_INVESTIGATOR_URL)));
}

export function chooseInvestigatorSource(
  env: FlueEnv,
  cfg: ClawptchaConfig,
  ctx: PrContext
): InvestigatorSelectionResult {
  const mode = investigationMode(ctx, cfg);
  if (cfg.context.investigator === "worker") return { ok: true, source: "worker", mode };
  if (cfg.context.investigator === "flue") {
    if (!hasFlueInvestigator(env)) {
      return { ok: false, mode, error: "context.investigator is flue but FLUE_INVESTIGATOR binding or FLUE_INVESTIGATOR_URL plus FLUE_INVESTIGATOR_SECRET is not configured" };
    }
    return { ok: true, source: "flue", mode };
  }
  if (mode === "large_pr" && hasFlueInvestigator(env)) return { ok: true, source: "flue", mode };
  return { ok: true, source: "worker", mode };
}

function workflowUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (!url.pathname.replace(/\/+$/, "").endsWith("/workflows/investigate-pr")) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/workflows/investigate-pr`;
  }
  url.searchParams.set("wait", "result");
  return url.toString();
}

function boundWorkflowUrl(): string {
  return "https://clawptcha-flue-investigator/workflows/investigate-pr?wait=result";
}

function timeoutMs(env: FlueEnv): number {
  const parsed = Number.parseInt(env.FLUE_INVESTIGATOR_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 300_000) return parsed;
  return 120_000;
}

function safeDiffExcerpt(diff: string, cfg: ClawptchaConfig): string {
  const maxChars = cfg.context.detail_tokens * 4;
  if (diff.length <= maxChars) return diff;
  return `${diff.slice(0, maxChars)}\n[diff excerpt truncated by CLAWPTCHA]`;
}

function lowSignalPath(path: string): boolean {
  return /(^|\/)(dist|build|coverage|vendor|generated)\//.test(path) ||
    /\.(png|jpe?g|gif|webp|ico|lock|map)$/i.test(path) ||
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path);
}

function filePayload(files: PrFilePatch[] | undefined, cfg: ClawptchaConfig): PrFilePatch[] {
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
        return { __clawptcha_error: resultRecord.error };
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
  cfg: ClawptchaConfig,
  options: FlueInvestigatorOptions = {}
): Promise<InvestigationResult> {
  const endpoint = cleanSecret(env.FLUE_INVESTIGATOR_URL);
  const secret = cleanSecret(env.FLUE_INVESTIGATOR_SECRET);
  if (!secret || (!env.FLUE_INVESTIGATOR && !endpoint)) return { ok: false, error: "Flue investigator is not configured" };
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
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    };
    const res = env.FLUE_INVESTIGATOR
      ? await env.FLUE_INVESTIGATOR.fetch(boundWorkflowUrl(), init)
      : await (options.fetchFn ?? fetch)(workflowUrl(endpoint!), init);
    if (!res.ok) return { ok: false, error: `flue investigator HTTP ${res.status}: ${await responseText(res)}` };

    const envelope = await res.json();
    const candidate = artifactCandidate(envelope);
    if (
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      typeof (candidate as Record<string, unknown>).__clawptcha_error === "string"
    ) {
      return { ok: false, error: String((candidate as Record<string, unknown>).__clawptcha_error) };
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
  "FLUE_INVESTIGATOR" | "FLUE_INVESTIGATOR_URL" | "FLUE_INVESTIGATOR_SECRET" | "FLUE_INVESTIGATOR_TIMEOUT_MS"
>;
