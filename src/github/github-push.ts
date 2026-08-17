// ─── GitHub Push Orchestrator ─────────────────────────────────────────────────
// Pushes an accepted LeetCode submission (solution file + optional README.md)
// to the user's configured GitHub repository using the GitHub Contents REST API.
//
// Token containment: token received as parameter, passed only to GitHubApiClientImpl
// which puts it in Authorization headers. Never logged.
//
// Repository is read from settings (githubRepoOwner + githubRepoName + githubBranch).
// No repository names are hardcoded here.

import { logger } from "@/utils/logger";
import { GitHubApiClientImpl } from "@/github/github-api";
import { getFilePaths } from "@/github/github-repository";
import { generateReadme, formatCommitMessage } from "@/github/github-file";
import {
  ConfigurationError,
  CodeExtractionError,
  GitHubApiError,
  AuthExpiredError,
} from "@/utils/errors";
import type { LeetCodeSubmission } from "@/types/leetcode";
import type { ExtensionSettings } from "@/types/settings";

export interface PushResult {
  commitUrl: string;
  solutionPath: string;
}

/**
 * Pushes a solution to the user's configured GitHub repository.
 *
 * Steps:
 *   1. Read repo owner/name/branch from settings (never hardcoded)
 *   2. Validate non-empty solution code
 *   3. Resolve file paths from folder format settings
 *   4. Create or update the solution file
 *   5. Optionally create or update README.md
 *   6. Return the commit URL and solution path
 *
 * Throws ConfigurationError if repository is not configured.
 * Throws AuthExpiredError on HTTP 401.
 * Throws GitHubApiError or NetworkError on other API/network failures.
 */
export async function pushSubmissionToGitHub(
  submission: LeetCodeSubmission,
  token: string,
  settings: ExtensionSettings
): Promise<PushResult> {
  // ── Validate code non-empty ───────────────────────────────────────────────
  if (!submission.code || submission.code.trim().length === 0) {
    throw new CodeExtractionError("Extracted solution code is empty.");
  }

  // ── Validate repo configuration ───────────────────────────────────────────
  const owner = settings.githubRepoOwner;
  const name = settings.githubRepoName;
  const branch = settings.githubBranch;

  if (!owner || !name || !branch) {
    throw new ConfigurationError(
      "GitHub repository is not configured. Open Settings and select a repository."
    );
  }

  const repo = `${owner}/${name}`;
  const client = new GitHubApiClientImpl(token);

  // ── Resolve file paths ────────────────────────────────────────────────────
  const { solutionPath, readmePath } = getFilePaths(
    submission,
    settings.baseDirectory ?? "algorithms",
    settings.folderFormat ?? "{slug}"
  );

  logger.info(`[LCSync] Starting GitHub sync for ${submission.title}`);
  logger.info(`[LCSync] Target repository: ${repo} @ ${branch}`);
  logger.info(`[LCSync] Target solution path: ${solutionPath}`);

  // ── Build commit message ──────────────────────────────────────────────────
  const commitMessage = formatCommitMessage(
    settings.commitMessageFormat ?? "feat: add {title} solution",
    submission
  );

  try {
    // ── Push solution file ──────────────────────────────────────────────────
    const existingSolution = await client.getFile(repo, solutionPath, branch);

    let solutionCommit;
    if (existingSolution) {
      logger.info(`[LCSync] Updating existing solution file (sha: ${existingSolution.sha.slice(0, 7)})`);
      solutionCommit = await client.updateFile(
        repo,
        solutionPath,
        submission.code,
        commitMessage,
        existingSolution.sha,
        branch
      );
    } else {
      logger.info("[LCSync] Creating new solution file");
      solutionCommit = await client.createFile(
        repo,
        solutionPath,
        submission.code,
        commitMessage,
        branch
      );
    }

    const commitUrl = solutionCommit.commit.html_url;
    logger.info(`[LCSync] Solution committed: ${commitUrl}`);

    // ── Push README.md (optional) ───────────────────────────────────────────
    if (settings.generateReadme) {
      const readmeContent = generateReadme(submission);
      const readmeMessage = `docs: add README for ${submission.title}`;

      const existingReadme = await client.getFile(repo, readmePath, branch);
      if (existingReadme) {
        logger.info("[LCSync] Updating existing README.md");
        await client.updateFile(
          repo,
          readmePath,
          readmeContent,
          readmeMessage,
          existingReadme.sha,
          branch
        );
      } else {
        logger.info("[LCSync] Creating README.md");
        await client.createFile(repo, readmePath, readmeContent, readmeMessage, branch);
      }
    }

    logger.info("[LCSync] GitHub sync completed successfully");
    return { commitUrl, solutionPath };
  } catch (err) {
    if (err instanceof GitHubApiError) {
      if (err.statusCode === 401) {
        logger.warn("[LCSync] GitHub request failed: 401 Unauthorized");
        throw new AuthExpiredError();
      }
      logger.warn(`[LCSync] GitHub request failed: ${err.statusCode}`);
    }
    throw err;
  }
}
