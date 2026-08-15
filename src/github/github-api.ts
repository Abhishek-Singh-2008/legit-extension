// ─── GitHub API Layer (Phase 1 stub) ─────────────────────────────────────────
// Full implementation in Phase 5+. Defines the interface and throws stubs.

export interface GitHubApiClient {
  getAuthenticatedUser(): Promise<import("@/types/github").GitHubUser>;
  getRepositories(): Promise<import("@/types/github").GitHubRepository[]>;
  getRepository(fullName: string): Promise<import("@/types/github").GitHubRepository>;
  getFile(repo: string, path: string, branch: string): Promise<import("@/types/github").GitHubFileContents | null>;
  createFile(repo: string, path: string, content: string, message: string, branch: string): Promise<import("@/types/github").GitHubCommitResponse>;
  updateFile(repo: string, path: string, content: string, message: string, sha: string, branch: string): Promise<import("@/types/github").GitHubCommitResponse>;
}

// Stub – will be replaced with real HTTP client in Phase 6
export class GitHubApiClientImpl implements GitHubApiClient {
  constructor(private readonly token: string) {}

  async getAuthenticatedUser(): Promise<import("@/types/github").GitHubUser> {
    return this._call<import("@/types/github").GitHubUser>("GET", "/user");
  }

  async getRepositories(): Promise<import("@/types/github").GitHubRepository[]> {
    return this._call<import("@/types/github").GitHubRepository[]>("GET", "/user/repos?per_page=100&sort=updated");
  }

  async getRepository(fullName: string): Promise<import("@/types/github").GitHubRepository> {
    return this._call<import("@/types/github").GitHubRepository>("GET", `/repos/${fullName}`);
  }

  async getFile(repo: string, path: string, branch: string): Promise<import("@/types/github").GitHubFileContents | null> {
    try {
      return await this._call<import("@/types/github").GitHubFileContents>(
        "GET",
        `/repos/${repo}/contents/${path}?ref=${branch}`
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) return null;
      throw err;
    }
  }

  async createFile(
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string
  ): Promise<import("@/types/github").GitHubCommitResponse> {
    return this._call<import("@/types/github").GitHubCommitResponse>(
      "PUT",
      `/repos/${repo}/contents/${path}`,
      { message, content: btoa(unescape(encodeURIComponent(content))), branch }
    );
  }

  async updateFile(
    repo: string,
    path: string,
    content: string,
    message: string,
    sha: string,
    branch: string
  ): Promise<import("@/types/github").GitHubCommitResponse> {
    return this._call<import("@/types/github").GitHubCommitResponse>(
      "PUT",
      `/repos/${repo}/contents/${path}`,
      { message, content: btoa(unescape(encodeURIComponent(content))), sha, branch }
    );
  }

  private async _call<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `https://api.github.com${endpoint}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : null,
    });

    if (!res.ok) {
      const { GitHubApiError } = await import("@/utils/errors");
      throw new GitHubApiError(res.status, await res.text());
    }

    return res.json() as Promise<T>;
  }
}
