// ─── Error Utilities ─────────────────────────────────────────────────────────

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

export class GitHubAuthError extends ExtensionError {
  constructor(detail?: string) {
    super(
      `GitHub authentication failed${detail ? `: ${detail}` : ""}`,
      "GITHUB_AUTH_ERROR",
      "GitHub authentication failed. Please reconnect your account.",
      "Click 'Connect GitHub' in the popup to re-authenticate."
    );
    this.name = "GitHubAuthError";
  }
}

export class GitHubApiError extends ExtensionError {
  constructor(
    public readonly statusCode: number,
    detail?: string
  ) {
    const userMessage =
      statusCode === 401
        ? "Your GitHub token is invalid or expired."
        : statusCode === 403
          ? "Rate limit reached or insufficient permissions."
          : statusCode === 404
            ? "Repository or file not found on GitHub."
            : `GitHub API error (HTTP ${statusCode}).`;

    super(
      `GitHub API returned ${statusCode}${detail ? `: ${detail}` : ""}`,
      "GITHUB_API_ERROR",
      userMessage,
      statusCode === 401
        ? "Reconnect your GitHub account in settings."
        : statusCode === 403
          ? "Check that the GitHub App is installed on this repository with Contents: Read & Write permission."
          : undefined
    );
    this.name = "GitHubApiError";
  }
}

export class CodeExtractionError extends ExtensionError {
  constructor(detail?: string) {
    super(
      `Code extraction failed${detail ? `: ${detail}` : ""}`,
      "CODE_EXTRACTION_ERROR",
      "Could not safely extract submitted code.",
      "LeetCode may have updated its editor. Check for an extension update."
    );
    this.name = "CodeExtractionError";
  }
}

export class ConfigurationError extends ExtensionError {
  constructor(field: string) {
    super(
      `Missing required configuration: ${field}`,
      "CONFIGURATION_ERROR",
      `Please configure "${field}" in the extension settings.`,
      "Open the extension popup and complete your GitHub settings."
    );
    this.name = "ConfigurationError";
  }
}

/** Safely extract a human-readable message from an unknown thrown value. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ExtensionError) return err.userMessage;
  if (err instanceof Error) return err.message;
  return String(err);
}
