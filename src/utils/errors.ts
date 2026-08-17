// ─── Error Utilities ─────────────────────────────────────────────────────────
// Typed error hierarchy for the extension.
// All errors that cross service-worker ↔ UI boundaries use userMessage (safe,
// never contains tokens or raw API responses).

/** Base class for all extension errors. */
export class ExtensionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly userMessage: string,
    public readonly fix?: string
  ) {
    super(message);
    this.name = "ExtensionError";
  }
}

// ── GitHub Auth Errors ────────────────────────────────────────────────────────

export class GitHubAuthError extends ExtensionError {
  constructor(
    message: string,
    public readonly authCode:
      | "INVALID_TOKEN"
      | "INSUFFICIENT_PERMISSIONS"
      | "REPO_NOT_FOUND"
      | "NETWORK_ERROR"
      | "UNKNOWN"
  ) {
    super(
      message,
      "GITHUB_AUTH_ERROR",
      message,
      "Reconnect your GitHub account in Settings."
    );
    this.name = "GitHubAuthError";
  }
}

// ── GitHub API Errors ─────────────────────────────────────────────────────────

/**
 * Represents a non-2xx HTTP response from the GitHub API.
 * Message and userMessage are safe — no tokens, no raw response bodies.
 */
export class GitHubApiError extends ExtensionError {
  public readonly isRetryable: boolean;

  constructor(
    public readonly statusCode: number,
    detail?: string
  ) {
    const { userMessage, fix, retryable } = classifyHttpStatus(statusCode, detail);

    super(
      `GitHub API returned ${statusCode}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      "GITHUB_API_ERROR",
      userMessage,
      fix
    );
    this.name = "GitHubApiError";
    this.isRetryable = retryable;
  }
}

/** True if this status should be retried with exponential backoff. */
function classifyHttpStatus(
  status: number,
  detail?: string
): { userMessage: string; fix?: string; retryable: boolean } {
  switch (status) {
    case 401:
      return {
        userMessage: "GitHub authentication expired or is invalid.",
        fix: "Reconnect your GitHub account in Settings.",
        retryable: false,
      };
    case 403: {
      // Rate limit: GitHub sets X-RateLimit-Remaining: 0 and may include "rate limit" in body
      const isRateLimit = detail?.toLowerCase().includes("rate limit") ?? false;
      return isRateLimit
        ? {
            userMessage: "GitHub rate limit exceeded. Please wait before syncing again.",
            retryable: true, // rate limit is transient
          }
        : {
            userMessage: "Insufficient permissions to push to this repository.",
            fix: "Ensure the PAT has Contents → Read and write permission.",
            retryable: false,
          };
    }
    case 404:
      return {
        userMessage: "Repository, branch, or file not found on GitHub.",
        fix: "Verify your repository configuration in Settings.",
        retryable: false,
      };
    case 409:
      return {
        userMessage: "GitHub reported a conflict while updating the file.",
        retryable: false,
      };
    case 422:
      return {
        userMessage: "GitHub rejected the request (validation error).",
        retryable: false,
      };
    case 429:
      return {
        userMessage: "GitHub rate limit exceeded. Please try again later.",
        retryable: true,
      };
    case 502:
    case 503:
    case 504:
      return {
        userMessage: "GitHub is temporarily unavailable. Please try again.",
        retryable: true,
      };
    default:
      if (status >= 500) {
        return {
          userMessage: `GitHub server error (${status}). Please try again.`,
          retryable: true,
        };
      }
      return {
        userMessage: `GitHub API error (HTTP ${status}).`,
        retryable: false,
      };
  }
}

// ── Network Error ─────────────────────────────────────────────────────────────

/**
 * Represents a fetch() failure (offline, DNS, timeout, etc.).
 * Distinct from GitHubApiError — this is a layer-below failure.
 */
export class NetworkError extends ExtensionError {
  constructor(detail?: string) {
    super(
      `Network request failed${detail ? `: ${detail}` : ""}`,
      "NETWORK_ERROR",
      "Unable to connect to GitHub. Check your internet connection.",
    );
    this.name = "NetworkError";
  }
}

// ── Code Extraction Error ─────────────────────────────────────────────────────

export class CodeExtractionError extends ExtensionError {
  constructor(detail?: string) {
    super(
      `Code extraction failed${detail ? `: ${detail}` : ""}`,
      "CODE_EXTRACTION_ERROR",
      "Could not extract your submitted code.",
      "LeetCode may have updated its editor. Check for an extension update."
    );
    this.name = "CodeExtractionError";
  }
}

// ── Configuration Error ───────────────────────────────────────────────────────

export class ConfigurationError extends ExtensionError {
  constructor(message: string) {
    super(
      message,
      "CONFIGURATION_ERROR",
      message,
      "Open Settings and complete your GitHub configuration."
    );
    this.name = "ConfigurationError";
  }
}

// ── Auth Invalidation Sentinel ────────────────────────────────────────────────

/**
 * Thrown when a 401 is received during a push.
 * Signals to the service worker to clear auth state and notify the user.
 * The token must NEVER appear in this error's properties.
 */
export class AuthExpiredError extends ExtensionError {
  constructor() {
    super(
      "GitHub push returned 401 — authentication expired",
      "AUTH_EXPIRED",
      "GitHub authentication expired. Please reconnect your account in Settings.",
      "Open Settings and reconnect your GitHub account."
    );
    this.name = "AuthExpiredError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Safely extract a human-readable message from an unknown thrown value. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ExtensionError) return err.userMessage;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** True if the error is a transient failure that can be retried. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof GitHubApiError) return err.isRetryable;
  if (err instanceof NetworkError) return true;
  return false;
}
