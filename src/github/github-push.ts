// ─── GitHub Push Orchestrator ─────────────────────────────────────────────────
// Pushes an accepted LeetCode submission (solution file + optional README.md)
// to the configured GitHub repository using the GitHub Contents REST API.
//
// Token containment: token received as parameter, passed only to GitHubApiClientImpl
// which puts it in Authorization headers. Never logged.

import { logger } from "@/utils/logger";
import { GitHubApiClientImpl } from "@/github/github-api";
import { getFilePaths } from "@/github/github-repository";
import { generateReadme, formatCommitMessage } from "@/github/github-file";
import type { LeetCodeSubmission } from "@/types/leetcode";
import type { ExtensionSettings } from "@/types/settings";

export interface PushResult {
  commitUrl: string;
  solutionPath: string;
}

/**
 * Pushes a solution to GitHub.
 *
 * Steps:
 *   1. Resolve file paths from settings
 *   2. Create or update the solution file
 *   3. Optionally create or update README.md
 *   4. Return the commit URL for the solution file
 *
 * Throws on any GitHub API error — caller handles notifications.
 */
export async function pushSubmissionToGitHub(
  submission: LeetCodeSubmission,
  token: string,
  settings: ExtensionSettings
): Promise<PushResult> {
  const repo = "Abhishek-Singh-2008/leetcode-solutions-test";
  const branch = settings.branch ?? "main";
  const client = new GitHubApiClientImpl(token);

  // ── Resolve paths ─────────────────────────────────────────────────────────
  const { solutionPath, readmePath } = getFilePaths(
    submission,
    settings.baseDirectory ?? "algorithms",
    settings.folderFormat ?? "{slug}"
  );

  logger.info(`[Push] Target: ${repo} @ ${branch}`);
  logger.info(`[Push] Solution path: ${solutionPath}`);

  // ── Build commit message ──────────────────────────────────────────────────
  const commitMessage = formatCommitMessage(
    settings.commitMessageFormat ?? "feat: add {title} solution",
    submission
  );

  // ── Push solution file ────────────────────────────────────────────────────
  const existingSolution = await client.getFile(repo, solutionPath, branch);

  let solutionCommit;
  if (existingSolution) {
    logger.info(`[Push] Updating existing solution file (sha: ${existingSolution.sha.slice(0, 7)})`);
    solutionCommit = await client.updateFile(
      repo,
      solutionPath,
      submission.code,
      commitMessage,
      existingSolution.sha,
      branch
    );
  } else {
    logger.info("[Push] Creating new solution file");
    solutionCommit = await client.createFile(
      repo,
      solutionPath,
      submission.code,
      commitMessage,
      branch
    );
  }

  const commitUrl = solutionCommit.commit.html_url;
  logger.info(`[Push] Solution committed: ${commitUrl}`);

  // ── Push README.md (optional) ─────────────────────────────────────────────
  if (settings.generateReadme) {
    const readmeContent = generateReadme(submission);
    const readmeMessage = `docs: add README for ${submission.title}`;

    const existingReadme = await client.getFile(repo, readmePath, branch);
    if (existingReadme) {
      logger.info("[Push] Updating existing README.md");
      await client.updateFile(
        repo,
        readmePath,
        readmeContent,
        readmeMessage,
        existingReadme.sha,
        branch
      );
    } else {
      logger.info("[Push] Creating README.md");
      await client.createFile(repo, readmePath, readmeContent, readmeMessage, branch);
    }
  }

  return { commitUrl, solutionPath };
}
