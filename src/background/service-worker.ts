// ─── Background Service Worker ───────────────────────────────────────────────
// Central coordinator: receives messages from content script/popup/options,
// drives GitHub authentication (Phase 5), repo selection (Phase 8),
// file push & error recovery (Phase 9), sync history & stats (Phase 10).

import { logger } from "@/utils/logger";
import {
  loadSettings,
  saveSettings,
  saveCurrentProblem,
  loadCurrentProblem,
  saveAuthCredentials,
  clearAuthCredentials,
  saveRepoConfig,
  loadConnectionStatus,
  loadAuthToken,
  recordSubmissionHash,
  isSubmissionDuplicate,
  updateLastSync,
  loadSyncHistory,
  addSyncHistoryRecord,
  clearSyncHistory,
  loadSyncStats,
} from "@/storage/storage";
import { verifyToken, verifyRepoAccess, GitHubAuthError } from "@/github/github-auth";
import { GitHubApiClientImpl } from "@/github/github-api";
import { pushSubmissionToGitHub } from "@/github/github-push";
import { sha256 } from "@/utils/hash";
import {
  getErrorMessage,
  ConfigurationError,
  AuthExpiredError,
  NetworkError,
  GitHubApiError,
} from "@/utils/errors";
import { analyzeComplexity } from "@/complexity";
import type { LeetCodeProblem } from "@/types/leetcode";

// ── Message Types ─────────────────────────────────────────────────────────────

export type BackgroundMessage =
  | { type: "SUBMISSION_ACCEPTED"; submission: import("@/types/leetcode").LeetCodeSubmission }
  | { type: "PROBLEM_DETECTED"; problem: LeetCodeProblem | null }
  | { type: "GET_CURRENT_PROBLEM" }
  | { type: "GET_SETTINGS" }
  | { type: "GET_CONNECTION_STATUS" }
  | { type: "SAVE_SETTINGS"; settings: Partial<import("@/types/settings").ExtensionSettings> }
  | { type: "CONNECT_GITHUB"; token: string }
  | { type: "DISCONNECT_GITHUB" }
  | { type: "GET_USER_REPOS" }
  | { type: "GET_REPO_BRANCHES"; repo: string }
  | { type: "SAVE_REPO_CONFIG"; owner: string; name: string; branch: string }
  | { type: "GET_SYNC_HISTORY"; limit?: number }
  | { type: "GET_SYNC_STATS" }
  | { type: "CLEAR_SYNC_HISTORY" }
  | { type: "PING" };

export type BackgroundResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

// In-flight push tracker to suppress concurrent duplicate push executions
const inFlightPushes = new Set<string>();

// ── Listener ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: BackgroundMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: BackgroundResponse) => void
  ) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err: unknown) => {
        logger.error("Background message handler error:", err);
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return true; // keep channel open for async response
  }
);

async function handleMessage(
  message: BackgroundMessage
): Promise<BackgroundResponse> {
  switch (message.type) {
    case "PING":
      logger.debug("PING received");
      return { ok: true, data: "PONG" };

    // ── Phase 2: Problem Detection ────────────────────────────────────────────

    case "PROBLEM_DETECTED": {
      const { problem } = message;
      await saveCurrentProblem(problem);
      if (problem) {
        logger.info(`Problem stored: ${problem.title} (${problem.difficulty}) — ${problem.slug}`);
      } else {
        logger.info("Problem cleared (left problem page).");
      }
      return { ok: true };
    }

    case "GET_CURRENT_PROBLEM": {
      const problem = await loadCurrentProblem();
      return { ok: true, data: problem };
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    case "GET_SETTINGS": {
      const settings = await loadSettings();
      // Strip token — must never leave the service worker
      const { githubToken: _token, ...safe } = settings;
      return { ok: true, data: safe };
    }

    case "GET_CONNECTION_STATUS": {
      const status = await loadConnectionStatus();
      return { ok: true, data: status };
    }

    case "SAVE_SETTINGS": {
      // Strip any token field — token only saved via CONNECT_GITHUB
      const { githubToken: _stripped, ...safeSettings } = message.settings as {
        githubToken?: string;
        [key: string]: unknown;
      };
      await saveSettings(safeSettings as Partial<import("@/types/settings").ExtensionSettings>);
      return { ok: true };
    }

    // ── Phase 5 / Phase 8: GitHub Authentication ──────────────────────────────

    case "CONNECT_GITHUB": {
      const { token } = message;

      if (!token || token.trim().length === 0) {
        return { ok: false, error: "Please enter your fine-grained PAT before connecting." };
      }

      logger.info("[Auth] Verifying fine-grained PAT...");

      let user;
      try {
        user = await verifyToken(token);
      } catch (err) {
        if (err instanceof GitHubAuthError) {
          logger.warn(`[Auth] Verification failed: ${err.code}`);
          return { ok: false, error: err.message };
        }
        logger.error("[Auth] Unexpected error during verification.");
        return { ok: false, error: "An unexpected error occurred during verification." };
      }

      // Save token + user identity ONLY — repo selection is a separate step
      await saveAuthCredentials(token, user.login, user.avatarUrl);
      logger.info(`[Auth] Connected: @${user.login}`);

      return {
        ok: true,
        data: {
          login: user.login,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
      };
    }

    case "DISCONNECT_GITHUB": {
      // Clears token, username, avatarUrl, AND repo owner/name/branch
      await clearAuthCredentials();
      logger.info("[Auth] Disconnected from GitHub. All auth and repo config cleared.");
      return { ok: true };
    }

    // ── Phase 8: Repository & Branch Listing ──────────────────────────────────

    case "GET_USER_REPOS": {
      const token = await loadAuthToken();
      if (!token) {
        return { ok: false, error: "Not connected to GitHub. Please connect first." };
      }

      logger.info("[Repos] Fetching user repositories...");
      try {
        const client = new GitHubApiClientImpl(token);
        const repos = await client.getUserRepos();
        const safeRepos = repos.map((r) => ({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          private: r.private,
          default_branch: r.default_branch,
          description: r.description,
        }));
        logger.info(`[Repos] Found ${safeRepos.length} repositories.`);
        return { ok: true, data: safeRepos };
      } catch (err) {
        logger.error("[Repos] Failed to fetch repositories:", getErrorMessage(err));
        return { ok: false, error: getErrorMessage(err) };
      }
    }

    case "GET_REPO_BRANCHES": {
      const { repo } = message;
      const token = await loadAuthToken();
      if (!token) {
        return { ok: false, error: "Not connected to GitHub. Please connect first." };
      }

      logger.info(`[Branches] Fetching branches for ${repo}...`);
      try {
        const client = new GitHubApiClientImpl(token);
        const branches = await client.getBranches(repo);
        const safeBranches = branches.map((b) => ({ name: b.name, protected: b.protected }));
        logger.info(`[Branches] Found ${safeBranches.length} branches for ${repo}.`);
        return { ok: true, data: safeBranches };
      } catch (err) {
        logger.error("[Branches] Failed to fetch branches:", getErrorMessage(err));
        return { ok: false, error: getErrorMessage(err) };
      }
    }

    case "SAVE_REPO_CONFIG": {
      const { owner, name, branch } = message;
      const token = await loadAuthToken();
      if (!token) {
        return { ok: false, error: "Not connected to GitHub. Please connect first." };
      }

      if (!owner || !name || !branch) {
        return { ok: false, error: "Repository owner, name, and branch are all required." };
      }

      logger.info(`[RepoConfig] Validating ${owner}/${name}...`);
      try {
        const repoInfo = await verifyRepoAccess(token, owner, name);
        if (!repoInfo.canPush) {
          return {
            ok: false,
            error: `Repository "${owner}/${name}" cannot be accessed with write permission. Recreate the PAT with Contents → Read and write.`,
          };
        }
        await saveRepoConfig(owner, name, branch);
        logger.info(`[RepoConfig] Saved: ${owner}/${name} @ ${branch}`);
        return {
          ok: true,
          data: {
            fullName: repoInfo.fullName,
            defaultBranch: repoInfo.defaultBranch,
            isPrivate: repoInfo.isPrivate,
          },
        };
      } catch (err) {
        if (err instanceof GitHubAuthError) {
          return { ok: false, error: err.message };
        }
        logger.error("[RepoConfig] Validation failed:", getErrorMessage(err));
        return { ok: false, error: getErrorMessage(err) };
      }
    }

    // ── Phase 10: Sync History & Dashboard Handlers ────────────────────────────

    case "GET_SYNC_HISTORY": {
      const history = await loadSyncHistory(message.limit);
      return { ok: true, data: history };
    }

    case "GET_SYNC_STATS": {
      const stats = await loadSyncStats();
      return { ok: true, data: stats };
    }

    case "CLEAR_SYNC_HISTORY": {
      await clearSyncHistory();
      return { ok: true };
    }

    // ── Phase 6 / 8 / 9 / 10: GitHub Push Pipeline ────────────────────────────

    case "SUBMISSION_ACCEPTED": {
      const { submission } = message;
      logger.info(`[LCSync] Submission accepted: ${submission.title} (${submission.language})`);

      const repoStr = (settings: import("@/types/settings").ExtensionSettings) =>
        settings.githubRepoOwner && settings.githubRepoName
          ? `${settings.githubRepoOwner}/${settings.githubRepoName}`
          : undefined;

      // ── 0. Guard: Empty code ────────────────────────────────────────────────
      if (!submission.code || submission.code.trim().length === 0) {
        const errMsg = "Could not extract your submitted code.";
        logger.error(`[LCSync] ${errMsg}`);
        showNotification("Code extraction failed", errMsg);
        
        await updateLastSync({
          title: submission.title,
          slug: submission.slug,
          timestamp: new Date().toISOString(),
          status: "failed",
          errorMessage: errMsg,
        });

        await addSyncHistoryRecord({
          title: submission.title,
          slug: submission.slug,
          difficulty: submission.difficulty as "Easy" | "Medium" | "Hard",
          language: submission.language,
          timestamp: new Date().toISOString(),
          status: "failed",
          errorMessage: errMsg,
        });

        return { ok: false, error: errMsg };
      }

      // ── Ensure complexity analysis is present and preserved ─────────────────
      if (!submission.complexity) {
        try {
          submission.complexity = analyzeComplexity(submission.code, submission.language);
        } catch (err) {
          logger.error("[ServiceWorker] Complexity analysis exception:", err);
          submission.complexity = {
            time: "O(?)",
            space: "O(?)",
            confidence: "low",
            explanation: ["Static analysis error fallback"],
            detectedPatterns: ["Analysis error fallback"],
          };
        }
      }
      submission.timeComplexity = submission.complexity.time;
      submission.spaceComplexity = submission.complexity.space;
      submission.complexityExplanation = submission.complexity.explanation.join("; ");

      // ── 1. Load settings ────────────────────────────────────────────────────
      const settings = await loadSettings();

      // ── 2. Guard: token present ─────────────────────────────────────────────
      const token = await loadAuthToken();
      if (!token) {
        const errMsg = "GitHub authentication expired.";
        logger.warn("[Push] No GitHub token stored — skipping push. Connect in Options.");
        showNotification(
          "GitHub authentication expired",
          "Please reconnect your GitHub account in Settings."
        );

        await updateLastSync({
          title: submission.title,
          slug: submission.slug,
          timestamp: new Date().toISOString(),
          status: "auth",
          errorMessage: errMsg,
        });

        await addSyncHistoryRecord({
          title: submission.title,
          slug: submission.slug,
          difficulty: submission.difficulty as "Easy" | "Medium" | "Hard",
          language: submission.language,
          repository: repoStr(settings),
          branch: settings.githubBranch,
          timestamp: new Date().toISOString(),
          status: "auth",
          errorMessage: errMsg,
        });

        return { ok: true };
      }

      // ── 3. Guard: repo configured ───────────────────────────────────────────
      if (!settings.githubRepoOwner || !settings.githubRepoName || !settings.githubBranch) {
        const errMsg = "GitHub repository is not configured.";
        logger.warn("[Push] No repository configured — skipping push.");
        showNotification(
          "GitHub repository is not configured",
          "Open Settings and select a repository."
        );

        await updateLastSync({
          title: submission.title,
          slug: submission.slug,
          timestamp: new Date().toISOString(),
          status: "failed",
          errorMessage: errMsg,
        });

        await addSyncHistoryRecord({
          title: submission.title,
          slug: submission.slug,
          difficulty: submission.difficulty as "Easy" | "Medium" | "Hard",
          language: submission.language,
          timestamp: new Date().toISOString(),
          status: "failed",
          errorMessage: errMsg,
        });

        return { ok: true };
      }

      // ── 4. Guard: autoSync enabled ──────────────────────────────────────────
      if (!settings.autoSync) {
        logger.info("[Push] autoSync is disabled — skipping push.");
        await updateLastSync({
          title: submission.title,
          slug: submission.slug,
          timestamp: new Date().toISOString(),
          status: "skipped",
          errorMessage: "Auto Sync disabled.",
        });

        await addSyncHistoryRecord({
          title: submission.title,
          slug: submission.slug,
          difficulty: submission.difficulty as "Easy" | "Medium" | "Hard",
          language: submission.language,
          repository: repoStr(settings),
          branch: settings.githubBranch,
          timestamp: new Date().toISOString(),
          status: "skipped",
          errorMessage: "Auto Sync disabled.",
        });

        return { ok: true };
      }

      // ── 5. Deduplication ────────────────────────────────────────────────────
      const hash = await sha256(`${submission.slug}:${submission.language}:${submission.code}`);

      // Suppress concurrent in-flight submissions of identical payload
      if (inFlightPushes.has(hash)) {
        logger.info(`[Push] In-flight sync already in progress for ${submission.slug} — skipping concurrent duplicate.`);
        return { ok: true };
      }

      const isDuplicate = await isSubmissionDuplicate(hash);
      if (isDuplicate) {
        logger.info(`[Push] Duplicate submission detected (${submission.slug}) — skipping.`);
        showNotification(
          "Already synced",
          `Already synced — ${submission.title}`
        );

        await updateLastSync({
          title: submission.title,
          slug: submission.slug,
          timestamp: new Date().toISOString(),
          status: "duplicate",
        });

        await addSyncHistoryRecord({
          title: submission.title,
          slug: submission.slug,
          difficulty: submission.difficulty as "Easy" | "Medium" | "Hard",
          language: submission.language,
          repository: repoStr(settings),
          branch: settings.githubBranch,
          timestamp: new Date().toISOString(),
          status: "duplicate",
        });

        return { ok: true };
      }

      // ── 6. Push to GitHub ───────────────────────────────────────────────────
      logger.info(`[LCSync] Starting GitHub sync for ${submission.slug}...`);
      inFlightPushes.add(hash);
      let pushResult;
      try {
        pushResult = await pushSubmissionToGitHub(submission, token, settings);
      } catch (err) {
        const msg = getErrorMessage(err);

        let status: import("@/types/settings").SyncStatus = "failed";
        let notifyTitle = "GitHub sync failed";
        let notifyMsg = msg;

        if (err instanceof AuthExpiredError) {
          status = "auth";
          logger.error("[Push] Authentication expired (401). Clearing credentials.");
          await clearAuthCredentials();
          notifyTitle = "GitHub authentication expired";
          notifyMsg = "Please reconnect your GitHub account in Settings.";
        } else if (err instanceof ConfigurationError) {
          logger.error("[Push] Repository configuration error:", msg);
          notifyTitle = "GitHub repository is unavailable";
        } else if (err instanceof NetworkError) {
          logger.error("[Push] Network failure during sync:", msg);
          notifyMsg = "GitHub sync failed — check your internet connection.";
        } else if (err instanceof GitHubApiError) {
          logger.error(`[Push] GitHub API failure (HTTP ${err.statusCode}):`, msg);
          if (err.statusCode === 404) {
            notifyTitle = "Repository or branch unavailable";
          }
        }

        showNotification(notifyTitle, notifyMsg);

        await updateLastSync({
          title: submission.title,
          slug: submission.slug,
          timestamp: new Date().toISOString(),
          status,
          errorMessage: msg,
        });

        await addSyncHistoryRecord({
          title: submission.title,
          slug: submission.slug,
          difficulty: submission.difficulty as "Easy" | "Medium" | "Hard",
          language: submission.language,
          repository: repoStr(settings),
          branch: settings.githubBranch,
          timestamp: new Date().toISOString(),
          status,
          errorMessage: msg,
        });

        return { ok: false, error: msg };
      } finally {
        inFlightPushes.delete(hash);
      }

      // ── 7. Record deduplication hash ────────────────────────────────────────
      await recordSubmissionHash(hash);

      // ── 8. Update last sync record & add to history ─────────────────────────
      const nowIso = new Date().toISOString();

      await updateLastSync({
        title: submission.title,
        slug: submission.slug,
        timestamp: nowIso,
        status: "success",
        commitUrl: pushResult.commitUrl,
      });

      await addSyncHistoryRecord({
        title: submission.title,
        slug: submission.slug,
        difficulty: submission.difficulty as "Easy" | "Medium" | "Hard",
        language: submission.language,
        repository: repoStr(settings),
        branch: settings.githubBranch,
        filePath: pushResult.solutionPath,
        commitUrl: pushResult.commitUrl,
        timestamp: nowIso,
        status: "success",
      });

      // ── 9. Success notification ──────────────────────────────────────────────
      logger.info(`[LCSync] GitHub sync completed: ${pushResult.commitUrl}`);
      showNotification(
        "Synced to GitHub ✓",
        `✓ ${submission.title} synced to GitHub`
      );

      return { ok: true };
    }

    default: {
      logger.warn("Unknown message type received");
      return { ok: false, error: "Unknown message type" };
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function showNotification(title: string, message: string): void {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  logger.info(`Extension installed/updated. Reason: ${reason}`);
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") });
  }
});

logger.info("Background service worker started.");
