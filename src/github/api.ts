import type { RepositoryAccessDetails } from "./permissions";

const API = "https://api.github.com";
const COMMENT_MARKER = "<!-- voucha -->";

export interface CheckRunCreate {
  name: string;
  head_sha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral";
  details_url?: string;
  output?: { title: string; summary: string };
}

export interface PrDetails {
  number: number;
  head_sha: string;
  author_login: string;
  author_type: "User" | "Bot";
  author_association: string;
  draft: boolean;
  additions: number;
  deletions: number;
  title: string;
  body: string | null;
}

export interface IssueDetails {
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

export interface TeamMembershipDetails {
  state: string;
  role: string;
}

export interface PrFileDetails {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
}

export class GitHubApi {
  constructor(
    private token: string,
    private fetchFn: typeof fetch = fetch
  ) {}

  private headers(accept = "application/vnd.github+json"): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      accept,
      "user-agent": "voucha",
      "x-github-api-version": "2022-11-28",
    };
  }

  // Encode each segment of an "owner/name" identifier before it goes into a
  // path. Repo names from webhook payloads are already well-formed, but a repo
  // parsed from untrusted input (e.g. a linked-issue reference in a PR body)
  // could otherwise smuggle extra path segments ("../") into the API URL.
  private repoPath(repo: string): string {
    return repo.split("/").map(encodeURIComponent).join("/");
  }

  private async req(path: string, init: RequestInit = {}, accept?: string): Promise<Response> {
    // Detach fetchFn from `this` before calling. The Workers runtime rejects the
    // global `fetch` invoked as a method (`this.fetchFn(...)`) with "Illegal
    // invocation"; a local binding calls it unbound. (Injected mocks don't care,
    // which is why unit tests didn't surface this — only the real runtime does.)
    const doFetch = this.fetchFn;
    const res = await doFetch(`${API}${path}`, {
      ...init,
      headers: { ...this.headers(accept), ...(init.body ? { "content-type": "application/json" } : {}) },
    });
    if (res.status >= 500) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    return res;
  }

  async createCheckRun(repo: string, check: CheckRunCreate): Promise<number> {
    const res = await this.req(`/repos/${this.repoPath(repo)}/check-runs`, {
      method: "POST",
      body: JSON.stringify(check),
    });
    if (!res.ok) throw new Error(`createCheckRun ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { id: number }).id;
  }

  async updateCheckRun(repo: string, checkRunId: number, patch: Partial<CheckRunCreate>): Promise<void> {
    const res = await this.req(`/repos/${this.repoPath(repo)}/check-runs/${checkRunId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`updateCheckRun ${res.status}: ${await res.text()}`);
  }

  async closePullRequest(repo: string, prNumber: number): Promise<void> {
    const res = await this.req(`/repos/${this.repoPath(repo)}/pulls/${prNumber}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" }),
    });
    if (!res.ok) throw new Error(`closePullRequest ${res.status}: ${await res.text()}`);
  }

  async getCheckRun(repo: string, checkRunId: number): Promise<{ status: string; conclusion: string | null }> {
    const res = await this.req(`/repos/${this.repoPath(repo)}/check-runs/${checkRunId}`);
    if (!res.ok) throw new Error(`getCheckRun ${res.status}`);
    const data = (await res.json()) as { status: string; conclusion: string | null };
    return { status: data.status, conclusion: data.conclusion };
  }

  async getPrDiff(repo: string, prNumber: number): Promise<string> {
    const res = await this.req(`/repos/${this.repoPath(repo)}/pulls/${prNumber}`, {}, "application/vnd.github.diff");
    if (!res.ok) throw new Error(`getPrDiff ${res.status}`);
    return res.text();
  }

  async getPr(repo: string, prNumber: number): Promise<PrDetails> {
    const res = await this.req(`/repos/${this.repoPath(repo)}/pulls/${prNumber}`);
    if (!res.ok) throw new Error(`getPr ${res.status}`);
    const p = (await res.json()) as any;
    return {
      number: p.number,
      head_sha: p.head.sha,
      author_login: p.user.login,
      author_type: p.user.type === "Bot" ? "Bot" : "User",
      author_association: p.author_association,
      draft: Boolean(p.draft),
      additions: p.additions,
      deletions: p.deletions,
      title: p.title,
      body: p.body ?? null,
    };
  }

  async listPrFiles(repo: string, prNumber: number): Promise<string[]> {
    return (await this.listPrFileDetails(repo, prNumber)).map((f) => f.filename);
  }

  async listPrFileDetails(repo: string, prNumber: number): Promise<PrFileDetails[]> {
    const files: PrFileDetails[] = [];
    for (let page = 1; ; page++) {
      const res = await this.req(`/repos/${this.repoPath(repo)}/pulls/${prNumber}/files?per_page=100&page=${page}`);
      if (!res.ok) throw new Error(`listPrFiles ${res.status}`);
      const batch = (await res.json()) as Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        changes: number;
        patch?: string;
      }>;
      files.push(...batch.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch ?? null,
      })));
      if (batch.length < 100) return files;
    }
  }

  async getIssue(repo: string, issueNumber: number): Promise<IssueDetails | null> {
    const res = await this.req(`/repos/${this.repoPath(repo)}/issues/${issueNumber}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getIssue ${res.status}`);
    const issue = (await res.json()) as any;
    return {
      repo,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? null,
      authorLogin: issue.user.login,
      authorAssociation: issue.author_association,
      assignees: (issue.assignees ?? []).map((u: { login: string }) => u.login),
      labels: (issue.labels ?? []).map((label: string | { name: string }) =>
        typeof label === "string" ? label : label.name
      ),
      isPullRequest: Boolean(issue.pull_request),
    };
  }

  async getFileContent(repo: string, path: string, ref: string): Promise<string | null> {
    const res = await this.req(`/repos/${this.repoPath(repo)}/contents/${path}?ref=${encodeURIComponent(ref)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getFileContent ${res.status}`);
    const data = (await res.json()) as { content: string };
    const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  // One managed comment per PR, identified by COMMENT_MARKER.
  async upsertPrComment(repo: string, prNumber: number, body: string): Promise<void> {
    const full = `${COMMENT_MARKER}\n${body}`;
    const listRes = await this.req(`/repos/${this.repoPath(repo)}/issues/${prNumber}/comments?per_page=100`);
    if (listRes.ok) {
      const comments = (await listRes.json()) as Array<{ id: number; body: string }>;
      const mine = comments.find((c) => c.body.includes(COMMENT_MARKER));
      if (mine) {
        const res = await this.req(`/repos/${this.repoPath(repo)}/issues/comments/${mine.id}`, {
          method: "PATCH",
          body: JSON.stringify({ body: full }),
        });
        if (!res.ok) throw new Error(`upsertPrComment PATCH ${res.status}`);
        return;
      }
    }
    const res = await this.req(`/repos/${this.repoPath(repo)}/issues/${prNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: full }),
    });
    if (!res.ok) throw new Error(`upsertPrComment POST ${res.status}`);
  }

  async addLabels(repo: string, issueNumber: number, labels: string[]): Promise<void> {
    const res = await this.req(`/repos/${this.repoPath(repo)}/issues/${issueNumber}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels }),
    });
    if (!res.ok) throw new Error(`addLabels ${res.status}: ${await res.text()}`);
  }

  async ensureLabel(repo: string, name: string, color: string, description: string): Promise<void> {
    const encodedName = encodeURIComponent(name);
    const existing = await this.req(`/repos/${this.repoPath(repo)}/labels/${encodedName}`);
    if (existing.ok) return;
    if (existing.status !== 404) throw new Error(`ensureLabel GET ${existing.status}: ${await existing.text()}`);

    const created = await this.req(`/repos/${this.repoPath(repo)}/labels`, {
      method: "POST",
      body: JSON.stringify({ name, color, description }),
    });
    if (created.ok || created.status === 422) return;
    throw new Error(`ensureLabel POST ${created.status}: ${await created.text()}`);
  }

  async getUserPermission(repo: string, username: string): Promise<RepositoryAccessDetails> {
    const res = await this.req(`/repos/${this.repoPath(repo)}/collaborators/${encodeURIComponent(username)}/permission`);
    if (!res.ok) return { permission: "none", role_name: "none" };
    const data = (await res.json()) as { permission?: string; role_name?: string | null };
    return {
      permission: data.permission ?? "none",
      role_name: data.role_name ?? data.permission ?? "none",
    };
  }

  async getTeamMembership(org: string, teamSlug: string, username: string): Promise<TeamMembershipDetails | null> {
    const res = await this.req(
      `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { state?: string; role?: string };
    return {
      state: data.state ?? "unknown",
      role: data.role ?? "member",
    };
  }

  async countMergedPullRequestsByAuthor(repo: string, username: string): Promise<number> {
    const q = `repo:${repo} is:pr is:merged author:${username}`;
    const res = await this.req(`/search/issues?q=${encodeURIComponent(q)}&per_page=1`);
    if (!res.ok) return 0;
    const data = (await res.json()) as { total_count?: number };
    return Math.max(0, data.total_count ?? 0);
  }
}
