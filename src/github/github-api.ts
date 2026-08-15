// ─── GitHub REST API Client ────────────────────────────────────────────────────
// Thin wrapper around fetch() for the GitHub Contents API.
// Token is accepted in the constructor and used only in Authorization headers.

import type {
  GitHubUser,
  GitHubRepository,
  GitHubFileContents,
  GitHubCommitResponse,
} from "@/types/github";
import { GitHubApiError } from "@/utils/errors";

export interface GitHubApiClient {
  getAuthenticatedUser(): Promise<GitHubUser>;
  getRepositories(): Promise<GitHubRepository[]>;
  getRepository(fullName: string): Promise<GitHubRepository>;
  getFile(repo: string, path: string, branch: string): Promise<GitHubFileContents | null>;
  createFile(
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string
  ): Promise<GitHubCommitResponse>;
  updateFile(
    repo: string,
    path: string,
    content: string,
    message: string,
    sha: string,
    branch: string
  ): Promise<GitHubCommitResponse>;
}

export class GitHubApiClientImpl implements GitHubApiClient {
  constructor(private readonly token: string) {}

  async getAuthenticatedUser(): Promise<GitHubUser> {
    return this._call<GitHubUser>("GET", "/user");
  }

  async getRepositories(): Promise<GitHubRepository[]> {
    return this._call<GitHubRepository[]>("GET", "/user/repos?per_page=100&sort=updated");
  }

  async getRepository(fullName: string): Promise<GitHubRepository> {
    return this._call<GitHubRepository>("GET", `/repos/${fullName}`);
  }

  async getFile(
    repo: string,
    path: string,
    branch: string
  ): Promise<GitHubFileContents | null> {
    try {
      return await this._call<GitHubFileContents>(
        "GET",
        `/repos/${repo}/contents/${path}?ref=${branch}`
      );
    } catch (err) {
      // 404 means file does not exist yet — return null for create-or-update logic
      if (err instanceof GitHubApiError && err.statusCode === 404) return null;
      throw err;
    }
  }

  async createFile(
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string
  ): Promise<GitHubCommitResponse> {
    return this._call<GitHubCommitResponse>(
      "PUT",
      `/repos/${repo}/contents/${path}`,
      { message, content: encodeBase64(content), branch }
    );
  }

  async updateFile(
    repo: string,
    path: string,
    content: string,
    message: string,
    sha: string,
    branch: string
  ): Promise<GitHubCommitResponse> {
    return this._call<GitHubCommitResponse>(
      "PUT",
      `/repos/${repo}/contents/${path}`,
      { message, content: encodeBase64(content), sha, branch }
    );
  }

  private async _call<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
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
      throw new GitHubApiError(res.status, await res.text());
    }

    return res.json() as Promise<T>;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Base64-encodes a UTF-8 string for the GitHub Contents API.
 * Using TextEncoder avoids issues with non-Latin characters in code solutions.
 */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
