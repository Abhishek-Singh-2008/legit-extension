// ─── GitHub Authentication — Fine-grained PAT ─────────────────────────────────
// Verifies a fine-grained Personal Access Token by calling the GitHub REST API.
//
// Token containment rules:
//   - Token is accepted as a parameter only.
//   - Token is passed only in the Authorization header of API requests.
//   - Token is NEVER logged, returned in responses, or stored here.
//   - Caller is responsible for secure storage AFTER successful verification.
//
// Expected PAT configuration:
//   Resource owner : Abhishek-Singh-2008
//   Repository     : leetcode-solutions-test (only selected)
//   Permission     : Contents → Read and write

import type { GitHubUser, GitHubRepository } from "@/types/github";
import { loadSettings } from "@/storage/storage";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ConnectedAccount {
  login: string;
  name: string | null;
  avatarUrl: string;
  repoFullName: string;
  repoPrivate: boolean;
}

export class GitHubAuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_TOKEN"
      | "INSUFFICIENT_PERMISSIONS"
      | "REPO_NOT_FOUND"
      | "NETWORK_ERROR"
      | "UNKNOWN"
  ) {
    super(message);
    this.name = "GitHubAuthError";
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com";
const EXPECTED_REPO_FULL_NAME = "Abhishek-Singh-2008/leetcode-solutions-test";

// ── Core Verification ─────────────────────────────────────────────────────────

/**
 * Verifies a fine-grained PAT by:
 *   1. Calling GET /user to confirm the token is valid and get account info.
 *   2. Calling GET /repos/{owner}/{repo} to confirm the repo is accessible.
 *   3. Checking the permissions object for write access (best-effort).
 *
 * Returns sanitized account metadata on success.
 * Throws GitHubAuthError with a specific code on failure.
 *
 * The token is NEVER included in the returned value.
 */
export async function verifyAndConnect(token: string): Promise<ConnectedAccount> {
  // ── Step 1: Verify token and get user identity ────────────────────────────
  let user: GitHubUser;
  try {
    const res = await githubFetch(token, "/user");
    if (res.status === 401) {
      throw new GitHubAuthError(
        "Invalid token. Please check that you copied the full fine-grained PAT.",
        "INVALID_TOKEN"
      );
    }
    if (res.status === 403) {
      throw new GitHubAuthError(
        "Token was recognised but access is forbidden. Ensure the PAT has not expired.",
        "INSUFFICIENT_PERMISSIONS"
      );
    }
    if (!res.ok) {
      throw new GitHubAuthError(
        `GitHub API error: ${res.status} ${res.statusText}`,
        "UNKNOWN"
      );
    }
    user = (await res.json()) as GitHubUser;
  } catch (err) {
    if (err instanceof GitHubAuthError) throw err;
    throw new GitHubAuthError(
      "Network error — could not reach GitHub. Check your connection.",
      "NETWORK_ERROR"
    );
  }

  // ── Step 2: Verify repository is accessible ───────────────────────────────
  let repo: GitHubRepository;
  try {
    const res = await githubFetch(token, `/repos/${EXPECTED_REPO_FULL_NAME}`);
    if (res.status === 404) {
      throw new GitHubAuthError(
        `Repository "${EXPECTED_REPO_FULL_NAME}" was not found. ` +
          "Ensure the PAT is scoped to this repository and the repo exists.",
        "REPO_NOT_FOUND"
      );
    }
    if (res.status === 403) {
      throw new GitHubAuthError(
        `Access to "${EXPECTED_REPO_FULL_NAME}" is forbidden. ` +
          "Ensure the PAT is a fine-grained token scoped to this repository " +
          "with Contents → Read and write permission.",
        "INSUFFICIENT_PERMISSIONS"
      );
    }
    if (!res.ok) {
      throw new GitHubAuthError(
        `Failed to access repository: ${res.status} ${res.statusText}`,
        "UNKNOWN"
      );
    }
    repo = (await res.json()) as GitHubRepository;
  } catch (err) {
    if (err instanceof GitHubAuthError) throw err;
    throw new GitHubAuthError(
      "Network error while verifying repository access.",
      "NETWORK_ERROR"
    );
  }

  // ── Step 3: Best-effort write permission check ────────────────────────────
  // GitHub includes a `permissions` object for authenticated users.
  // Fine-grained tokens with Contents R+W will have push: true.
  const repoWithPerms = repo as GitHubRepository & {
    permissions?: { pull?: boolean; push?: boolean; admin?: boolean };
  };

  if (repoWithPerms.permissions !== undefined) {
    const canPush = repoWithPerms.permissions.push === true;
    if (!canPush) {
      throw new GitHubAuthError(
        `The PAT can read "${EXPECTED_REPO_FULL_NAME}" but does not have write access. ` +
          "Recreate the PAT with Contents → Read and write.",
        "INSUFFICIENT_PERMISSIONS"
      );
    }
  }
  // If permissions field is absent (some fine-grained tokens omit it),
  // we trust the token and let actual write operations surface errors later.

  return {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
    repoFullName: repo.full_name,
    repoPrivate: repo.private,
  };
}

/**
 * Check if the user is currently authenticated.
 */
export async function isAuthenticated(): Promise<boolean> {
  const settings = await loadSettings();
  return Boolean(settings.githubToken);
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Makes an authenticated GET request to the GitHub REST API.
 * The token appears ONLY in the Authorization header and is not logged.
 */
function githubFetch(token: string, endpoint: string): Promise<Response> {
  return fetch(`${GITHUB_API}${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}
