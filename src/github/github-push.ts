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
import { analyzeComplexity } from "@/ai/ai-client";
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
    // ── Push solution file with conflict retry ──────────────────────────────
    const solutionCommit = await safePutFile(
      client,
      repo,
      solutionPath,
      submission.code,
      commitMessage,
      branch
    );

    const commitUrl = solutionCommit.commit.html_url;
    logger.info(`[LCSync] Solution committed: ${commitUrl}`);

    // ── Push README.md (optional) ───────────────────────────────────────────
    if (settings.generateReadme) {
      let aiResult = undefined;

      if (settings.aiEnabled && settings.aiApiKey && settings.aiApiKey.trim().length > 0) {
        logger.info(`[LCSync] Running AI complexity analysis via ${settings.aiProvider}...`);
        try {
          aiResult = await analyzeComplexity({
            provider: settings.aiProvider,
            apiKey: settings.aiApiKey,
            model: settings.aiModel,
            customEndpoint: settings.aiCustomEndpoint,
            title: submission.title,
            language: submission.language,
            code: submission.code,
          });
        } catch (aiErr) {
          logger.warn("[LCSync] AI analysis failed with error:", aiErr);
          aiResult = {
            approach: "",
            timeComplexity: "",
            timeReason: "",
            spaceComplexity: "",
            spaceReason: "",
            error: aiErr instanceof Error ? aiErr.message : "AI analysis unavailable",
          };
        }
      }

      const readmeContent = generateReadme(submission, aiResult);
      const readmeMessage = `docs: add README for ${submission.title}`;

      // Push README with fresh SHA and conflict retry
      await safePutFile(client, repo, readmePath, readmeContent, readmeMessage, branch);
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

/**
 * Puts a file into GitHub repository with fresh SHA lookup and automatic retry on 409 Conflict.
 */
async function safePutFile(
  client: GitHubApiClientImpl,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string
): Promise<import("@/types/github").GitHubCommitResponse> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const existing = await client.getFile(repo, path, branch);
      if (existing) {
        logger.info(`[LCSync] Updating existing ${path} (sha: ${existing.sha.slice(0, 7)})`);
        return await client.updateFile(repo, path, content, message, existing.sha, branch);
      } else {
        logger.info(`[LCSync] Creating new ${path}`);
        return await client.createFile(repo, path, content, message, branch);
      }
    } catch (err) {
      lastErr = err;
      if (err instanceof GitHubApiError && err.statusCode === 409 && attempt < 3) {
        logger.warn(`[LCSync] GitHub 409 Conflict on ${path}, retrying with fresh SHA in ${attempt}s...`);
        await new Promise((res) => setTimeout(res, 1000 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
