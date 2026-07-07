// test/api.test.ts
import { describe, it, expect, vi } from "vitest";
import { GitHubApi } from "../src/github/api";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": typeof body === "string" ? "text/plain" : "application/json" },
    });
  });
}

describe("GitHubApi", () => {
  it("invokes fetch unbound (Workers rejects the global fetch called as a method)", async () => {
    // A `this`-sensitive fetch, like the real Workers global: throws if called
    // as `this.fetchFn(...)`. Reproduces the "Illegal invocation" runtime bug.
    const strictFetch = function (this: unknown) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response("diff --git a/x b/x", { status: 200 }));
    };
    const api = new GitHubApi("tok", strictFetch as unknown as typeof fetch);
    await expect(api.getPrDiff("o/r", 1)).resolves.toContain("diff --git");
  });

  it("creates a check run with auth headers", async () => {
    const f = mockFetch(201, { id: 42 });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    const id = await api.createCheckRun("o/r", {
      name: "clawptcha", head_sha: "abc", status: "queued",
      output: { title: "t", summary: "s" },
    });
    expect(id).toBe(42);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/o/r/check-runs");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("fetches a PR diff with the diff media type", async () => {
    const f = mockFetch(200, "diff --git a/x b/x");
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    const diff = await api.getPrDiff("o/r", 7);
    expect(diff).toContain("diff --git");
    const [, init] = f.mock.calls[0];
    expect((init!.headers as Record<string, string>).accept).toBe("application/vnd.github.diff");
  });

  it("paginates PR file details", async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => ({
      filename: `src/${i}.ts`,
      status: "modified",
      additions: 1,
      deletions: 0,
      changes: 1,
      patch: `+${i}`,
    }));
    const secondPage = [{
      filename: "src/final.ts",
      status: "added",
      additions: 3,
      deletions: 0,
      changes: 3,
    }];
    const f = vi.fn(async (url: RequestInfo | URL) => {
      const page = new URL(String(url)).searchParams.get("page");
      return new Response(JSON.stringify(page === "2" ? secondPage : firstPage), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    const files = await api.listPrFileDetails("o/r", 7);

    expect(files).toHaveLength(101);
    expect(files.at(-1)).toEqual({
      filename: "src/final.ts",
      status: "added",
      additions: 3,
      deletions: 0,
      changes: 3,
      patch: null,
    });
    expect(String(f.mock.calls[0][0])).toContain("page=1");
    expect(String(f.mock.calls[1][0])).toContain("page=2");
  });

  it("returns null for a missing config file (404)", async () => {
    const f = mockFetch(404, { message: "Not Found" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    expect(await api.getFileContent("o/r", ".github/clawptcha.yml", "main")).toBeNull();
  });

  it("decodes base64 file content", async () => {
    const f = mockFetch(200, { content: btoa("pass_threshold: 4\n"), encoding: "base64" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    expect(await api.getFileContent("o/r", ".github/clawptcha.yml", "main")).toBe("pass_threshold: 4\n");
  });

  it("returns both legacy permission and GitHub role name for collaborators", async () => {
    const f = mockFetch(200, { permission: "write", role_name: "maintain" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    expect(await api.getUserPermission("o/r", "octocat")).toEqual({
      permission: "write",
      role_name: "maintain",
    });
  });

  it("falls back to none when collaborator permission lookup is unavailable", async () => {
    const f = mockFetch(404, { message: "Not Found" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    expect(await api.getUserPermission("o/r", "octocat")).toEqual({
      permission: "none",
      role_name: "none",
    });
  });

  it("checks GitHub team membership", async () => {
    const f = mockFetch(200, { state: "active", role: "maintainer" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    expect(await api.getTeamMembership("octo-org", "maintainers", "octocat")).toEqual({
      state: "active",
      role: "maintainer",
    });
    expect(String(f.mock.calls[0][0])).toBe(
      "https://api.github.com/orgs/octo-org/teams/maintainers/memberships/octocat"
    );
  });

  it("counts merged PRs by author through search", async () => {
    const f = mockFetch(200, { total_count: 4, items: [] });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    expect(await api.countMergedPullRequestsByAuthor("o/r", "octocat")).toBe(4);
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.pathname).toBe("/search/issues");
    expect(url.searchParams.get("q")).toBe("repo:o/r is:pr is:merged author:octocat");
    expect(url.searchParams.get("per_page")).toBe("1");
  });

  it("upserts the clawptcha PR comment (updates when marker found)", async () => {
    const existing = [{ id: 9, body: "<!-- clawptcha --> old" }];
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify(existing), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 9 }), { status: 200 });
    });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    await api.upsertPrComment("o/r", 7, "new body");
    const patchCall = f.mock.calls.find(([, i]) => i?.method === "PATCH");
    expect(patchCall).toBeDefined();
    expect(String(patchCall![0])).toContain("/issues/comments/9");
    expect(JSON.parse(String(patchCall![1]!.body)).body).toContain("<!-- clawptcha -->");
  });

  it("adds labels to a PR via the issues labels endpoint", async () => {
    const f = mockFetch(200, [{ name: "clawptcha:flagged" }]);
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    await api.addLabels("o/r", 5, ["clawptcha:flagged"]);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/o/r/issues/5/labels");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({ labels: ["clawptcha:flagged"] });
  });

  it("creates a missing label before it is used", async () => {
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      }
      return new Response(JSON.stringify({ name: "clawptcha:flagged" }), { status: 201 });
    });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    await api.ensureLabel("o/r", "clawptcha:flagged", "b60205", "Flagged by Clawptcha");

    expect(String(f.mock.calls[0][0])).toBe("https://api.github.com/repos/o/r/labels/clawptcha%3Aflagged");
    expect(String(f.mock.calls[1][0])).toBe("https://api.github.com/repos/o/r/labels");
    expect(JSON.parse(f.mock.calls[1][1]!.body as string)).toEqual({
      name: "clawptcha:flagged",
      color: "b60205",
      description: "Flagged by Clawptcha",
    });
  });

  it("does not recreate an existing label", async () => {
    const f = mockFetch(200, { name: "clawptcha:flagged" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    await api.ensureLabel("o/r", "clawptcha:flagged", "b60205", "Flagged by Clawptcha");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("tolerates a concurrent label creation race", async () => {
    const f = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      }
      return new Response(JSON.stringify({ message: "already_exists" }), { status: 422 });
    });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    await expect(api.ensureLabel("o/r", "clawptcha:flagged", "b60205", "Flagged by Clawptcha"))
      .resolves.toBeUndefined();
  });

  it("gets a check run's status and conclusion", async () => {
    const f = mockFetch(200, { status: "completed", conclusion: "success", id: 55 });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    const result = await api.getCheckRun("o/r", 55);
    expect(result).toEqual({ status: "completed", conclusion: "success" });
    const [url] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/o/r/check-runs/55");
  });

  it("throws on 5xx", async () => {
    const f = mockFetch(500, { message: "boom" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    await expect(api.getPrDiff("o/r", 7)).rejects.toThrow(/500/);
  });

  it("creates the clawptcha PR comment when none exists (POST branch)", async () => {
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify([{ id: 1, body: "unrelated comment" }]), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 10 }), { status: 201 });
    });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    await api.upsertPrComment("o/r", 7, "hello");
    const postCall = f.mock.calls.find(([, i]) => i?.method === "POST");
    expect(postCall).toBeDefined();
    expect(String(postCall![0])).toContain("/issues/7/comments");
    expect(JSON.parse(String(postCall![1]!.body)).body).toContain("<!-- clawptcha -->");
  });

  it("decodes UTF-8 config content correctly", async () => {
    const utf8 = new TextEncoder().encode("# maintained by café\npass_threshold: 4\n");
    const b64 = btoa(String.fromCharCode(...utf8));
    const f = mockFetch(200, { content: b64, encoding: "base64" });
    const api = new GitHubApi("tok", f as unknown as typeof fetch);
    const content = await api.getFileContent("o/r", ".github/clawptcha.yml", "main");
    expect(content).toContain("café");
  });
});
