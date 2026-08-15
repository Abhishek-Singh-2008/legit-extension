// ─── Storage Layer ────────────────────────────────────────────────────────────
// Typed wrapper around chrome.storage.local.
// All reads/writes go through this module so the storage schema is centralised.

import { ExtensionSettings, DEFAULT_SETTINGS, LastSyncRecord } from "@/types/settings";
import { logger } from "@/utils/logger";
import type { LeetCodeProblem } from "@/types/leetcode";

// ── Auth Credential Helpers ───────────────────────────────────────────────────

/**
 * Saves the PAT and account metadata AFTER successful verification.
 * Must only be called once verifyAndConnect() has succeeded.
 * The token is stored in chrome.storage.local — treat as persistent storage,
 * not an encrypted vault.
 */
export async function saveAuthCredentials(
  token: string,
  username: string,
  avatarUrl: string
): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      ...(await loadSettings()),
      githubToken: token,
      githubUsername: username,
      githubAvatarUrl: avatarUrl,
    },
  });
  // Token is intentionally not logged.
  logger.info("Auth credentials saved.");
}

/**
 * Clears the stored PAT and associated account metadata.
 */
export async function clearAuthCredentials(): Promise<void> {
  const current = await loadSettings();
  const { githubToken: _t, githubUsername: _u, githubAvatarUrl: _a, ...rest } = current;
  await chrome.storage.local.set({ [SETTINGS_KEY]: rest });
  logger.info("Auth credentials cleared.");
}

/**
 * Returns the raw stored token — for use ONLY in the service worker
 * to set the Authorization header. Never send this to popup or content scripts.
 */
export async function loadAuthToken(): Promise<string | null> {
  const settings = await loadSettings();
  return settings.githubToken ?? null;
}

/**
 * Returns a sanitized connection status object — no token included.
 */
export interface ConnectionStatus {
  connected: boolean;
  username?: string;
  avatarUrl?: string;
}

export async function loadConnectionStatus(): Promise<ConnectionStatus> {
  const settings = await loadSettings();
  const connected = Boolean(settings.githubToken && settings.githubUsername);
  return {
    connected,
    username: settings.githubUsername,
    avatarUrl: settings.githubAvatarUrl,
  };
}

// ── Storage keys ─────────────────────────────────────────────────────────────
const SETTINGS_KEY = "extensionSettings";
const CURRENT_PROBLEM_KEY = "currentProblem";
const MAX_HASHES = 100; // keep last N submission hashes

// ── Settings ──────────────────────────────────────────────────────────────────

/** Load settings from chrome.storage.local, merging with defaults. */
export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** Persist settings to chrome.storage.local. */
export async function saveSettings(
  settings: Partial<ExtensionSettings>
): Promise<void> {
  const current = await loadSettings();
  const merged = { ...current, ...settings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  logger.debug("Settings saved.");
}

// ── Current Problem ───────────────────────────────────────────────────────────

/** Store the most recently detected LeetCode problem. */
export async function saveCurrentProblem(
  problem: LeetCodeProblem | null
): Promise<void> {
  await chrome.storage.local.set({ [CURRENT_PROBLEM_KEY]: problem });
  logger.debug("Current problem saved:", problem?.slug ?? "null");
}

/** Load the most recently detected LeetCode problem. */
export async function loadCurrentProblem(): Promise<LeetCodeProblem | null> {
  const result = await chrome.storage.local.get(CURRENT_PROBLEM_KEY);
  return (result[CURRENT_PROBLEM_KEY] as LeetCodeProblem | null | undefined) ?? null;
}

// ── Submission Hashes ─────────────────────────────────────────────────────────

/** Record a successfully synced submission hash for deduplication. */
export async function recordSubmissionHash(hash: string): Promise<void> {
  const settings = await loadSettings();
  const hashes = [hash, ...settings.recentSubmissionHashes].slice(
    0,
    MAX_HASHES
  );
  await saveSettings({ recentSubmissionHashes: hashes });
}

/** Check if a hash was recently synced. */
export async function isSubmissionDuplicate(hash: string): Promise<boolean> {
  const settings = await loadSettings();
  return settings.recentSubmissionHashes.includes(hash);
}

// ── Sync Record ───────────────────────────────────────────────────────────────

/** Update the last sync record. */
export async function updateLastSync(record: LastSyncRecord): Promise<void> {
  await saveSettings({ lastSync: record });
}

// ── Reset ─────────────────────────────────────────────────────────────────────

/** Clear all stored data (for reset/logout). */
export async function clearAllStorage(): Promise<void> {
  await chrome.storage.local.clear();
  logger.info("All storage cleared.");
}
