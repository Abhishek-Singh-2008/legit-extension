// ─── GitHub Authentication — Fine-grained PAT ─────────────────────────────────
// Verifies a fine-grained Personal Access Token by calling the GitHub REST API.
//
// Token containment rules:
//   - Token is accepted as a parameter only.
//   - Token is passed only in the Authorization header of API requests.
//   - Token is NEVER logged, returned in responses, or stored here.
//   - Caller is responsible for secure storage AFTER successful verification.
//
// PAT required permissions:
//   - Contents → Read and write (on the selected repository)

import type { GitHubUser, GitHubRepository } from "@/types/github";
import { loadSettings } from "@/storage/storage";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VerifiedUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface VerifiedRepo {
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  canPush: boolean;
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

// ── Constants ─────────────────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com";

// ── Step 1: Verify Token ───────────────────────────────────────────────────────

/**
 * Verifies a fine-grained PAT by calling GET /user.
 * Returns authenticated user identity.
 * Does NOT verify any specific repository — that is a separate step.
 * Token is NEVER included in the returned value.
 */
export async function verifyToken(token: string): Promise<VerifiedUser> {
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

  return {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
  };
}

// ── Step 2: Verify Repository Access (separate from auth) ─────────────────────

/**
 * Verifies that the stored token can access the given repository.
 * This is called when the user selects a repository from the dropdown,
 * NOT during initial token verification.
 *
 * Returns sanitized repo metadata including defaultBranch and canPush flag.
 * Token is NEVER included in the returned value.
 */
export async function verifyRepoAccess(
  token: string,
  owner: string,
  repoName: string
): Promise<VerifiedRepo> {
  const fullName = `${owner}/${repoName}`;

  let repo: GitHubRepository;
  try {
    const res = await githubFetch(token, `/repos/${fullName}`);
    if (res.status === 404) {
      throw new GitHubAuthError(
        `Repository "${fullName}" was not found or is not accessible with this token.`,
        "REPO_NOT_FOUND"
      );
    }
    if (res.status === 403) {
      throw new GitHubAuthError(
        `Access to "${fullName}" is forbidden. Ensure the PAT has Contents → Read and write permission on this repository.`,
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

  // Best-effort permission check — GitHub includes `permissions` for authenticated users
  const repoWithPerms = repo as GitHubRepository & {
    permissions?: { pull?: boolean; push?: boolean; admin?: boolean };
  };

  const canPush =
    repoWithPerms.permissions === undefined
      ? true // permissions absent — trust and surface errors later on actual write
      : repoWithPerms.permissions.push === true;

  return {
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    isPrivate: repo.private,
    canPush,
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
