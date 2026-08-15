// ─── Background Service Worker ───────────────────────────────────────────────
// Central coordinator: receives messages from the content script, then drives
// GitHub authentication and file push (Phase 5: auth implemented).

import { logger } from "@/utils/logger";
import {
  loadSettings,
  saveSettings,
  saveCurrentProblem,
  loadCurrentProblem,
  saveAuthCredentials,
  clearAuthCredentials,
  loadConnectionStatus,
} from "@/storage/storage";
import { verifyAndConnect, GitHubAuthError } from "@/github/github-auth";
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

    // Return true to keep the message channel open for the async response
    return true;
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
        logger.info(
          `Problem stored: ${problem.title} (${problem.difficulty}) — ${problem.slug}`
        );
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
      // Strip the token before sending — token must NEVER leave the service worker
      const { githubToken: _token, ...safe } = settings;
      return { ok: true, data: safe };
    }

    case "GET_CONNECTION_STATUS": {
      // Returns sanitized status: connected flag, username, avatarUrl — NO token
      const status = await loadConnectionStatus();
      return { ok: true, data: status };
    }

    case "SAVE_SETTINGS": {
      // Prevent callers from sneaking a token through SAVE_SETTINGS
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
        // Verify token against GitHub API — token never logged
        account = await verifyAndConnect(token);
      } catch (err) {
        if (err instanceof GitHubAuthError) {
          logger.warn(`[Auth] Verification failed: ${err.code}`);
          // Return descriptive error — token NOT included
          return { ok: false, error: err.message };
        }
        logger.error("[Auth] Unexpected error during verification.");
        return { ok: false, error: "An unexpected error occurred during verification." };
      }

      // Save ONLY after successful verification
      await saveAuthCredentials(token, account.login, account.avatarUrl);

      logger.info(`[Auth] Connected: @${account.login} → ${account.repoFullName}`);

      // Return sanitized account info — token NOT included
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

    // ── Phase 7 stub ─────────────────────────────────────────────────────────

    case "SUBMISSION_ACCEPTED": {
      const { submission } = message;
      logger.info(
        `SUBMISSION_ACCEPTED: ${submission.title} (${submission.language})`
      );
      // TODO Phase 7: invoke GitHub push pipeline here
      showNotification(
        "Submission detected (sync disabled)",
        `✓ ${submission.title} — GitHub sync coming in Phase 7`
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
    // Open options page on first install so the user can configure it
    chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") });
  }
});

logger.info("Background service worker started.");
