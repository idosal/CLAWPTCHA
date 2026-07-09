import { describe, it, expect, vi } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/index";
import { signBody } from "../src/github/webhook";
import { parseAllowlist, isRepoAllowed } from "../src/github/allowlist";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

describe("parseAllowlist", () => {
  it("returns [] for empty/unset input", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist(null)).toEqual([]);
    expect(parseAllowlist("")).toEqual([]);
    expect(parseAllowlist("  \n , ")).toEqual([]);
  });

  it("splits on commas and whitespace and lowercases entries", () => {
    expect(parseAllowlist("idosal/VOUCHA, Foo/Bar\n baz")).toEqual([
      "idosal/voucha",
      "foo/bar",
      "baz",
    ]);
  });
});

describe("isRepoAllowed", () => {
  it("allows everything when the allowlist is empty/unset", () => {
    expect(isRepoAllowed(undefined, "anyone/anything")).toBe(true);
    expect(isRepoAllowed("", "anyone/anything")).toBe(true);
  });

  it("matches a full owner/repo entry case-insensitively", () => {
    expect(isRepoAllowed("idosal/voucha", "idosal/voucha")).toBe(true);
    expect(isRepoAllowed("idosal/voucha", "IdoSal/VOUCHA")).toBe(true);
    expect(isRepoAllowed("idosal/voucha", "idosal/other")).toBe(false);
    expect(isRepoAllowed("idosal/voucha", "someone/voucha")).toBe(false);
  });

  it("treats a bare owner entry as a whole-account allow", () => {
    expect(isRepoAllowed("idosal", "idosal/voucha")).toBe(true);
    expect(isRepoAllowed("idosal", "idosal/anything-else")).toBe(true);
    expect(isRepoAllowed("idosal", "someoneelse/repo")).toBe(false);
  });

  it("accepts a repo matching any entry in a multi-entry list", () => {
    const list = "idosal/voucha, acme, foo/bar";
    expect(isRepoAllowed(list, "idosal/voucha")).toBe(true);
    expect(isRepoAllowed(list, "acme/widgets")).toBe(true);
    expect(isRepoAllowed(list, "foo/bar")).toBe(true);
    expect(isRepoAllowed(list, "foo/baz")).toBe(false);
    expect(isRepoAllowed(list, "unknown/repo")).toBe(false);
  });
});

// The gate lives in the /webhook handler and must short-circuit *before*
// apiForInstallation runs. In the test env GITHUB_PRIVATE_KEY is empty, so
// reaching apiForInstallation throws and logs "webhook handling failed" — a
// reliable observable for whether the handler proceeded past the gate.
describe("POST /webhook allowlist gate", () => {
  function prBody(repoFullName: string): string {
    return JSON.stringify({
      action: "opened",
      installation: { id: 1 },
      repository: { full_name: repoFullName },
      pull_request: {
        number: 1, head: { sha: "sha1" }, base: { ref: "main", sha: "base1" },
        user: { login: "someone", type: "User" },
        author_association: "NONE", additions: 1, deletions: 0, title: "x", body: "y",
      },
    });
  }

  async function post(body: string, overrideEnv: Env) {
    const sig = await signBody(overrideEnv.GITHUB_WEBHOOK_SECRET, body);
    const req = new Request("https://x/webhook", {
      method: "POST", body,
      headers: { "x-hub-signature-256": sig, "x-github-event": "pull_request" },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, overrideEnv, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }

  it("skips a repo outside the allowlist (never reaches installation auth)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const gatedEnv = { ...testEnv, REPO_ALLOWLIST: "idosal/voucha" } as unknown as Env;
      const res = await post(prBody("someone/other"), gatedEnv);
      expect(res.status).toBe(200);
      expect(errorSpy).not.toHaveBeenCalledWith("webhook handling failed", expect.anything(), expect.anything());
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("proceeds past the gate for an allowlisted repo", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const gatedEnv = { ...testEnv, REPO_ALLOWLIST: "idosal/voucha" } as unknown as Env;
      const res = await post(prBody("idosal/voucha"), gatedEnv);
      expect(res.status).toBe(200);
      // Reached apiForInstallation, which throws on the empty test private key.
      expect(errorSpy).toHaveBeenCalledWith("webhook handling failed", "pull_request", expect.anything());
    } finally {
      errorSpy.mockRestore();
    }
  });
});
