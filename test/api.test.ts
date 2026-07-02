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
