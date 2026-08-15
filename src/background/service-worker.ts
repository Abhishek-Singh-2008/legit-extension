// ─── Background Service Worker ───────────────────────────────────────────────
// Central coordinator: receives messages from content script, drives
// GitHub authentication (Phase 5) and file push (Phase 6).

import { logger } from "@/utils/logger";
import {
  loadSettings,
  saveSettings,
  saveCurrentProblem,
  loadCurrentProblem,
  saveAuthCredentials,
  clearAuthCredentials,
  loadConnectionStatus,
  loadAuthToken,
  recordSubmissionHash,
  isSubmissionDuplicate,
  updateLastSync,
} from "@/storage/storage";
import { verifyAndConnect, GitHubAuthError } from "@/github/github-auth";
import { pushSubmissionToGitHub } from "@/github/github-push";
import { sha256 } from "@/utils/hash";
import { getErrorMessage } from "@/utils/errors";
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
  | { type: "PING" };

export type BackgroundResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

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

    // ── Phase 2 ──────────────────────────────────────────────────────────────

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

    // ── Phase 5: GitHub Authentication ────────────────────────────────────────

    case "CONNECT_GITHUB": {
      const { token } = message;

      if (!token || token.trim().length === 0) {
        return { ok: false, error: "Please enter your fine-grained PAT before connecting." };
      }

      logger.info("[Auth] Verifying fine-grained PAT...");

      let account;
      try {
        account = await verifyAndConnect(token);
      } catch (err) {
        if (err instanceof GitHubAuthError) {
          logger.warn(`[Auth] Verification failed: ${err.code}`);
          return { ok: false, error: err.message };
        }
        logger.error("[Auth] Unexpected error during verification.");
        return { ok: false, error: "An unexpected error occurred during verification." };
      }

      await saveAuthCredentials(token, account.login, account.avatarUrl);
      logger.info(`[Auth] Connected: @${account.login} → ${account.repoFullName}`);

      return {
        ok: true,
        data: {
          login: account.login,
          name: account.name,
          avatarUrl: account.avatarUrl,
          repoFullName: account.repoFullName,
          repoPrivate: account.repoPrivate,
        },
      };
    }

    case "DISCONNECT_GITHUB": {
      await clearAuthCredentials();
      logger.info("[Auth] Disconnected from GitHub.");
      return { ok: true };
    }

    // ── Phase 6: GitHub Push ──────────────────────────────────────────────────

    case "SUBMISSION_ACCEPTED": {
      const { submission } = message;
      logger.info(`[Push] SUBMISSION_ACCEPTED: ${submission.title} (${submission.language})`);

      // ── 1. Load settings ────────────────────────────────────────────────────
      const settings = await loadSettings();

      // ── 2. Guard: token present ─────────────────────────────────────────────
      const token = await loadAuthToken();
      if (!token) {
        logger.warn("[Push] No GitHub token stored — skipping push. Connect in Options.");
        showNotification(
          "GitHub not connected",
          `✓ ${submission.title} solved — connect GitHub in Options to sync.`
        );
        return { ok: true };
      }

      // ── 3. Guard: autoSync enabled ──────────────────────────────────────────
      if (!settings.autoSync) {
        logger.info("[Push] autoSync is disabled — skipping push.");
        return { ok: true };
      }

      // ── 4. Deduplication ────────────────────────────────────────────────────
      const hash = await sha256(`${submission.slug}:${submission.language}:${submission.code}`);
      const isDuplicate = await isSubmissionDuplicate(hash);
      if (isDuplicate) {
        logger.info(`[Push] Duplicate submission detected (${submission.slug}) — skipping.`);
        return { ok: true };
      }

      // ── 5. Push to GitHub ───────────────────────────────────────────────────
      logger.info(`[Push] Pushing ${submission.slug} to GitHub...`);
      let pushResult;
      try {
        pushResult = await pushSubmissionToGitHub(submission, token, settings);
      } catch (err) {
        const msg = getErrorMessage(err);
        logger.error("[Push] Push failed:", msg);
        showNotification(
          "Sync failed ✗",
          `${submission.title} — ${msg}`
        );
        await updateLastSync({
          title: submission.title,
          slug: submission.slug,
          timestamp: new Date().toISOString(),
          success: false,
          errorMessage: msg,
        });
        return { ok: false, error: msg };
      }

      // ── 6. Record deduplication hash ────────────────────────────────────────
      await recordSubmissionHash(hash);

      // ── 7. Update last sync record ──────────────────────────────────────────
      await updateLastSync({
        title: submission.title,
        slug: submission.slug,
        timestamp: new Date().toISOString(),
        commitUrl: pushResult.commitUrl,
        success: true,
      });

      // ── 8. Success notification ──────────────────────────────────────────────
      logger.info(`[Push] ✓ Committed: ${pushResult.commitUrl}`);
      showNotification(
        "Synced to GitHub ✓",
        `${submission.title} (${submission.language}) → ${pushResult.solutionPath}`
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
