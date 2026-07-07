import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/config";
import {
  chooseInvestigatorSource,
  investigatePrWithFlue,
} from "../src/flue/investigator";

const artifact = {
  summary: "Adds safer archive download handling.",
  intent: "Prevent oversized archive downloads from exhausting memory.",
  behavior_changes: ["Archive downloads stop after a bounded response size."],
  affected_surfaces: ["Clawhub archive import"],
  risk_areas: ["Large downloads could still time out."],
  evidence: [{ path: "src/infra/clawhub.ts", why_it_matters: "It wraps archive response reading." }],
  unknowns: [],
  quiz_anchors: ["Why archive downloads are now bounded"],
  confidence: "high" as const,
  mode: "normal" as const,
};

const largeCtx = {
  diff: "diff",
  title: "fix downloads",
  body: "bounds archive reads",
  files: ["src/infra/clawhub.ts"],
  repoFullName: "o/r",
  prNumber: 42,
  headSha: "abc123",
  changedLines: DEFAULT_CONFIG.context.large_pr.changed_lines,
  filePatches: [{
    filename: "src/infra/clawhub.ts",
    status: "modified",
    additions: 20,
    deletions: 2,
    changes: 22,
    patch: "+bound archive response bodies",
  }],
};

describe("chooseInvestigatorSource", () => {
  it("uses Flue automatically for large PRs when configured", () => {
    expect(chooseInvestigatorSource({
      FLUE_INVESTIGATOR_URL: "https://flue.example.com",
      FLUE_INVESTIGATOR_SECRET: "secret",
    }, DEFAULT_CONFIG, largeCtx)).toEqual({
      ok: true,
      source: "flue",
      mode: "large_pr",
    });
  });

  it("uses Flue automatically with a service binding and no public URL", () => {
    expect(chooseInvestigatorSource({
      FLUE_INVESTIGATOR: { fetch: vi.fn() } as unknown as Fetcher,
      FLUE_INVESTIGATOR_SECRET: "secret",
    }, DEFAULT_CONFIG, largeCtx)).toEqual({
      ok: true,
      source: "flue",
      mode: "large_pr",
    });
  });

  it("falls back to the worker investigator when auto mode has no Flue config", () => {
    expect(chooseInvestigatorSource({}, DEFAULT_CONFIG, largeCtx)).toEqual({
      ok: true,
      source: "worker",
      mode: "large_pr",
    });
  });
});

describe("investigatePrWithFlue", () => {
  it("posts the bounded PR payload to the Flue workflow and validates its artifact", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      result: { artifact },
      runId: "run_123",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await investigatePrWithFlue({
      FLUE_INVESTIGATOR_URL: "https://flue.example.com/root/",
      FLUE_INVESTIGATOR_SECRET: "secret",
    }, largeCtx, DEFAULT_CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.artifact.mode).toBe("large_pr");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calls = fetchFn.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>;
    const [url, init] = calls[0]!;
    expect(String(url)).toBe("https://flue.example.com/root/workflows/investigate-pr?wait=result");
    expect(init.headers).toMatchObject({
      authorization: "Bearer secret",
      "content-type": "application/json",
    });
    const body = JSON.parse(String(init.body)) as {
      repo: { full_name: string; pr_number: number; head_sha: string };
      pr: { mode: string };
      github?: unknown;
    };
    expect(body.repo).toEqual({ full_name: "o/r", pr_number: 42, head_sha: "abc123" });
    expect(body.pr.mode).toBe("large_pr");
    expect(body.github).toBeUndefined();
    expect(String(init.body)).not.toContain("ghs_");
  });

  it("prefers the Flue service binding over the public URL fallback", async () => {
    const serviceFetch = vi.fn(async () => new Response(JSON.stringify({
      result: { artifact },
      runId: "run_123",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const fallbackFetch = vi.fn();

    const result = await investigatePrWithFlue({
      FLUE_INVESTIGATOR: { fetch: serviceFetch } as unknown as Fetcher,
      FLUE_INVESTIGATOR_URL: "https://flue.example.com/root/",
      FLUE_INVESTIGATOR_SECRET: "secret",
    }, largeCtx, DEFAULT_CONFIG, {
      fetchFn: fallbackFetch as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(serviceFetch).toHaveBeenCalledTimes(1);
    expect(fallbackFetch).not.toHaveBeenCalled();
    const calls = serviceFetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>;
    const [url, init] = calls[0]!;
    expect(String(url)).toBe("https://clawptcha-flue-investigator/workflows/investigate-pr?wait=result");
    expect(init.headers).toMatchObject({
      authorization: "Bearer secret",
      "content-type": "application/json",
    });
  });

  it("reports workflow failures without producing an artifact", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      result: { ok: false, error: "agent could not inspect PR" },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await investigatePrWithFlue({
      FLUE_INVESTIGATOR_URL: "https://flue.example.com",
      FLUE_INVESTIGATOR_SECRET: "secret",
    }, largeCtx, DEFAULT_CONFIG, { fetchFn: fetchFn as unknown as typeof fetch });

    expect(result).toEqual({ ok: false, error: "agent could not inspect PR" });
  });
});
