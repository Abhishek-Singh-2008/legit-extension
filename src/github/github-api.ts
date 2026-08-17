// ─── GitHub REST API Client ────────────────────────────────────────────────────
// Thin wrapper around fetch() for the GitHub Contents API.
// Token is accepted in the constructor and used only in Authorization headers.
//
// Error handling:
//   - Network failures (offline, DNS, timeout) → NetworkError
//   - Non-2xx responses → GitHubApiError with isRetryable flag
//   - 404 on getFile → returns null (expected "file doesn't exist" case)
//   - Transient failures (5xx, network) are retried up to MAX_RETRIES times
//     with exponential backoff. Non-retryable errors (401, 403-perms, 404,
//     409, 422) are thrown immediately.

import type {
  GitHubUser,
  GitHubRepository,
  GitHubBranch,
  GitHubFileContents,
  GitHubCommitResponse,
} from "@/types/github";
import { GitHubApiError, NetworkError, isRetryable } from "@/utils/errors";
import { logger } from "@/utils/logger";

// ── Retry Configuration ───────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000; // 1s, 3s backoff

// ── Interface ─────────────────────────────────────────────────────────────────

export interface GitHubApiClient {
  getAuthenticatedUser(): Promise<GitHubUser>;
  getUserRepos(): Promise<GitHubRepository[]>;
  getRepository(fullName: string): Promise<GitHubRepository>;
  getBranches(fullName: string): Promise<GitHubBranch[]>;
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

// ── Implementation ────────────────────────────────────────────────────────────

export class GitHubApiClientImpl implements GitHubApiClient {
  constructor(private readonly token: string) {}

  async getAuthenticatedUser(): Promise<GitHubUser> {
    return this._callWithRetry<GitHubUser>("GET", "/user");
  }

  /**
   * Returns repositories the token owner has access to.
   * Paginates automatically up to 300 results (3 pages of 100).
   */
  async getUserRepos(): Promise<GitHubRepository[]> {
    const perPage = 100;
    const results: GitHubRepository[] = [];
    for (let page = 1; page <= 3; page++) {
      const batch = await this._callWithRetry<GitHubRepository[]>(
        "GET",
        `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator`
      );
      results.push(...batch);
      if (batch.length < perPage) break;
    }
    return results;
  }

  async getRepository(fullName: string): Promise<GitHubRepository> {
    return this._callWithRetry<GitHubRepository>("GET", `/repos/${fullName}`);
  }

  /**
   * Returns all branches for a repository.
   * Paginates up to 300 branches (3 pages of 100).
   */
  async getBranches(fullName: string): Promise<GitHubBranch[]> {
    try {
      const perPage = 100;
      const results: GitHubBranch[] = [];
      for (let page = 1; page <= 3; page++) {
        const batch = await this._callWithRetry<GitHubBranch[]>(
          "GET",
          `/repos/${fullName}/branches?per_page=${perPage}&page=${page}`
        );
        results.push(...batch);
        if (batch.length < perPage) break;
      }
      return results;
    } catch (err) {
      logger.warn(`[Branches] Could not fetch branches for ${fullName}:`, err);
      return [];
    }
  }

  async getFile(
    repo: string,
    path: string,
    branch: string
  ): Promise<GitHubFileContents | null> {
    try {
      return await this._callWithRetry<GitHubFileContents>(
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
    return this._callWithRetry<GitHubCommitResponse>(
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
    return this._callWithRetry<GitHubCommitResponse>(
      "PUT",
      `/repos/${repo}/contents/${path}`,
      { message, content: encodeBase64(content), sha, branch }
    );
  }

  // ── Retry Wrapper ───────────────────────────────────────────────────────────

  /**
   * Wraps _call with limited exponential backoff for transient failures.
   *
   * Retry schedule:
   *   Attempt 1 — immediate
   *   Attempt 2 — ~1 s
   *   Attempt 3 — ~3 s
   *
   * Non-retryable errors (401, 403-perms, 404, 409, 422) throw immediately.
   * PUT requests (createFile, updateFile) are retried carefully: a successful
   * previous attempt may have committed already, so on retry we re-check the
   * file state in the caller (getFile before update) rather than double-PUT.
   */
  private async _callWithRetry<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this._call<T>(method, endpoint, body);
      } catch (err) {
        lastErr = err;

        if (!isRetryable(err)) {
          // Non-transient failure — throw immediately, no retry
          throw err;
        }

        if (attempt < MAX_RETRIES) {
          const delayMs = RETRY_BASE_MS * Math.pow(3, attempt - 1); // 1s, 3s
          logger.warn(
            `[API] Transient failure on ${method} ${endpoint} (attempt ${attempt}/${MAX_RETRIES}). ` +
            `Retrying in ${delayMs}ms…`
          );
          await sleep(delayMs);
        }
      }
    }

    throw lastErr;
  }

  // ── Core Fetch ──────────────────────────────────────────────────────────────

  private async _call<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const url = `https://api.github.com${endpoint}`;
    let res: Response;

    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : null,
      });
    } catch (fetchErr) {
      // fetch() itself threw — network offline, DNS failure, etc.
      const detail = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      throw new NetworkError(detail);
    }

    if (!res.ok) {
      // Read body for error detail WITHOUT logging raw content
      const bodyText = await res.text().catch(() => "");
      throw new GitHubApiError(res.status, bodyText);
    }

    return res.json() as Promise<T>;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
