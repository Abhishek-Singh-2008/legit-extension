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
  isDuplicate?: boolean;
}

/**
 * Base64 decoder with UTF-8 support for comparing existing GitHub files.
 */
function decodeBase64(b64: string): string {
  try {
    const cleanB64 = b64.replace(/[\r\n\s]/g, "");
    const binary = atob(cleanB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/**
 * Normalizes code by standardizing newlines and trimming whitespace for comparison.
 */
function normalizeCode(code: string): string {
  return code.replace(/\r\n/g, "\n").trim();
}

/**
 * Pushes a solution to the user's configured GitHub repository.
 *
 * Steps:
 *   1. Read repo owner/name/branch from settings (never hardcoded)
 *   2. Validate non-empty solution code
 *   3. Resolve file paths with Multi-Solution versioning (solution.py, solution_2.py...)
 *   4. Check if exact same code already exists in repo -> return isDuplicate
 *   5. Create the solution file (or versioned file)
 *   6. Optionally create or update README.md
 *   7. Return the commit URL and solution path
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
  const baseDir = settings.baseDirectory ?? "algorithms";
  const folderFormat = settings.folderFormat ?? "{slug}";
  const normalizedNewCode = normalizeCode(submission.code);

  // ── Target Solution Path Resolution (Option A: Clean update per language) ───
  const targetPaths = getFilePaths(submission, baseDir, folderFormat);
  const targetPath = targetPaths.solutionPath;
  const readmePath = targetPaths.readmePath;
  let isUpdate = false;

  try {
    const existingFile = await client.getFile(repo, targetPath, branch);
    if (existingFile) {
      const existingCode = normalizeCode(decodeBase64(existingFile.content));
      if (existingCode === normalizedNewCode) {
        logger.info(`[LCSync] Submission code identical to existing ${targetPath} — skipping push.`);
        return {
          commitUrl: `https://github.com/${repo}/blob/${branch}/${targetPath}`,
          solutionPath: targetPath,
          isDuplicate: true,
        };
      }
      isUpdate = true;
      logger.info(`[LCSync] Code modified for existing ${targetPath} (updating with latest comments/refactorings).`);
    }
  } catch (err) {
    logger.warn("[LCSync] Error checking existing file, proceeding with normal push:", err);
  }

  logger.info(`[LCSync] Starting GitHub sync for ${submission.title} (${submission.language})`);
  logger.info(`[LCSync] Target repository: ${repo} @ ${branch}`);
  logger.info(`[LCSync] Target solution path: ${targetPath}`);

  // ── Build commit message ──────────────────────────────────────────────────
  const defaultTemplate = isUpdate
    ? "refactor: update {title} ({language}) solution"
    : (settings.commitMessageFormat ?? "feat: add {title} solution");
  const commitMessage = formatCommitMessage(defaultTemplate, submission);

  try {
    // ── Launch AI complexity analysis concurrently with solution upload ─────
    const aiPromise =
      settings.generateReadme &&
      settings.aiEnabled &&
      settings.aiApiKey &&
      settings.aiApiKey.trim().length > 0
        ? analyzeComplexity({
            provider: settings.aiProvider,
            apiKey: settings.aiApiKey,
            model: settings.aiModel,
            customEndpoint: settings.aiCustomEndpoint,
            title: submission.title,
            language: submission.language,
            code: submission.code,
          }).catch((aiErr) => {
            logger.warn("[LCSync] AI analysis failed with error:", aiErr);
            return {
              approach: "",
              timeComplexity: "",
              timeReason: "",
              spaceComplexity: "",
              spaceReason: "",
              error: aiErr instanceof Error ? aiErr.message : "AI analysis unavailable",
            };
          })
        : Promise.resolve(undefined);

    // ── Push solution file with conflict retry ──────────────────────────────
    const solutionCommit = await safePutFile(
      client,
      repo,
      targetPath,
      submission.code,
      commitMessage,
      branch
    );

    const commitUrl = solutionCommit.commit.html_url;
    logger.info(`[LCSync] Solution committed: ${commitUrl}`);

    // ── Push README.md (optional) ───────────────────────────────────────────
    if (settings.generateReadme) {
      const aiResult = await aiPromise;
      if (aiResult?.timeComplexity) {
        logger.info(
          `[LCSync] AI complexity resolved: Time ${aiResult.timeComplexity}, Space ${aiResult.spaceComplexity}`
        );
      } else if (aiResult?.error) {
        logger.warn(`[LCSync] AI analysis notice: ${aiResult.error}`);
      }

      const readmeContent = generateReadme(submission, aiResult);
      const readmeMessage = `docs: add README for ${submission.title}`;

      // Push README with fresh SHA and conflict retry
      await safePutFile(client, repo, readmePath, readmeContent, readmeMessage, branch);
      logger.info(`[LCSync] README committed: ${readmePath}`);
    }

    logger.info("[LCSync] GitHub sync completed successfully");
    return { commitUrl, solutionPath: targetPath, isDuplicate: false };
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
