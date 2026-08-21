// ─── Storage Layer ────────────────────────────────────────────────────────────
// Typed wrapper around chrome.storage.local.
// All reads/writes go through this module so the storage schema is centralised.

import {
  ExtensionSettings,
  DEFAULT_SETTINGS,
  LastSyncRecord,
  SyncHistoryRecord,
  SyncStats,
} from "@/types/settings";
import { logger } from "@/utils/logger";
import type { LeetCodeProblem } from "@/types/leetcode";

// ── Storage Keys ──────────────────────────────────────────────────────────────
const SETTINGS_KEY = "extensionSettings";
const CURRENT_PROBLEM_KEY = "currentProblem";
const HISTORY_KEY = "syncHistory";
const MAX_HASHES = 100; // keep last N submission hashes
const MAX_HISTORY_RECORDS = 200; // keep last N sync history records

// ── Settings ──────────────────────────────────────────────────────────────────

/** Load settings from chrome.storage.local, merging with defaults. */
export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** Persist a partial settings update to chrome.storage.local. */
export async function saveSettings(
  settings: Partial<ExtensionSettings>
): Promise<void> {
  const current = await loadSettings();
  const merged = { ...current, ...settings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  logger.debug("Settings saved.");
}

// ── Auth Credential Helpers ───────────────────────────────────────────────────

/**
 * Saves the PAT and account identity AFTER successful token verification.
 * Does NOT save any repository config — that is a separate step.
 * Token is stored in chrome.storage.local and is intentionally not logged.
 */
export async function saveAuthCredentials(
  token: string,
  username: string,
  avatarUrl: string
): Promise<void> {
  const current = await loadSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      ...current,
      githubToken: token,
      githubUsername: username,
      githubAvatarUrl: avatarUrl,
    },
  });
  logger.info("Auth credentials saved.");
}

/**
 * Saves the selected repository and branch configuration.
 * Called after the user selects from the repo dropdown and clicks Save.
 */
export async function saveRepoConfig(
  owner: string,
  name: string,
  branch: string
): Promise<void> {
  await saveSettings({
    githubRepoOwner: owner,
    githubRepoName: name,
    githubBranch: branch,
  });
  logger.info(`Repo config saved: ${owner}/${name} @ ${branch}`);
}

/**
 * Clears only repository configuration (owner, name, branch).
 * Called separately or as part of disconnect.
 */
export async function clearRepoConfig(): Promise<void> {
  const current = await loadSettings();
  const {
    githubRepoOwner: _o,
    githubRepoName: _n,
    githubBranch: _b,
    ...rest
  } = current;
  await chrome.storage.local.set({ [SETTINGS_KEY]: rest });
  logger.info("Repo config cleared.");
}

/**
 * Clears the stored PAT, account metadata AND repository configuration.
 * Preserves all unrelated settings (autoSync, folderFormat, etc.)
 */
export async function clearAuthCredentials(): Promise<void> {
  const current = await loadSettings();
  const {
    githubToken: _t,
    githubUsername: _u,
    githubAvatarUrl: _a,
    githubRepoOwner: _o,
    githubRepoName: _n,
    githubBranch: _b,
    ...rest
  } = current;
  await chrome.storage.local.set({ [SETTINGS_KEY]: rest });
  logger.info("Auth credentials and repo config cleared.");
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
 * Includes repo config so the UI can render the selected repository.
 */
export interface ConnectionStatus {
  connected: boolean;
  username?: string;
  avatarUrl?: string;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
}

export async function loadConnectionStatus(): Promise<ConnectionStatus> {
  const settings = await loadSettings();
  const connected = Boolean(settings.githubToken && settings.githubUsername);
  const avatarUrl =
    settings.githubAvatarUrl ||
    (settings.githubUsername ? `https://github.com/${settings.githubUsername}.png` : undefined);

  return {
    connected,
    username: settings.githubUsername,
    avatarUrl,
    repoOwner: settings.githubRepoOwner,
    repoName: settings.githubRepoName,
    branch: settings.githubBranch,
  };
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
  const hashes = [hash, ...settings.recentSubmissionHashes].slice(0, MAX_HASHES);
  await saveSettings({ recentSubmissionHashes: hashes });
}

/** Check if a hash was recently synced. */
export async function isSubmissionDuplicate(hash: string): Promise<boolean> {
  const settings = await loadSettings();
  return settings.recentSubmissionHashes.includes(hash);
}

// ── Sync Record & History (Phase 10) ─────────────────────────────────────────

/** Update the last sync record (preserves existing Phase 8/9 behaviour). */
export async function updateLastSync(record: LastSyncRecord): Promise<void> {
  await saveSettings({ lastSync: record });
}

/**
 * Loads sync history records from storage.
 * Missing syncHistory is treated as empty array [].
 * Returns newest records first.
 */
export async function loadSyncHistory(limit?: number): Promise<SyncHistoryRecord[]> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const history = (result[HISTORY_KEY] as SyncHistoryRecord[] | undefined) ?? [];
  if (limit && limit > 0) {
    return history.slice(0, limit);
  }
  return history;
}

let historyWriteLock = Promise.resolve();

async function _addSyncHistoryRecordInternal(
  entry: Omit<SyncHistoryRecord, "id">
): Promise<SyncHistoryRecord> {
  const existing = await loadSyncHistory();

  // Ensure commitUrl is only saved if valid HTTPS GitHub URL
  let safeCommitUrl: string | undefined = undefined;
  if (entry.commitUrl && entry.commitUrl.startsWith("https://github.com/")) {
    safeCommitUrl = entry.commitUrl;
  }

  // Idempotency check: prevent duplicate records for the same logical submission event
  const entryTimestampMs = new Date(entry.timestamp).getTime();
  const duplicate = existing.find((rec) => {
    // Must match the same problem slug, language, and status
    if (rec.slug !== entry.slug || rec.language !== entry.language || rec.status !== entry.status) {
      return false;
    }

    // 1. If both records have commit URLs, match on exact commitUrl
    if (safeCommitUrl && rec.commitUrl && safeCommitUrl === rec.commitUrl) {
      return true;
    }

    // 2. If both records have filePath, check if timestamp is within 60 seconds (same push cycle)
    const recTimestampMs = new Date(rec.timestamp).getTime();
    const timeDiffMs = Math.abs(entryTimestampMs - recTimestampMs);

    if (entry.filePath && rec.filePath === entry.filePath && timeDiffMs < 60000) {
      return true;
    }

    // 3. Near-simultaneous events for the same problem/language/status (< 15 seconds)
    if (timeDiffMs < 15000) {
      return true;
    }

    return false;
  });

  if (duplicate) {
    logger.info(`[History] Duplicate history record suppressed for "${entry.title}" (${entry.status})`);
    return duplicate;
  }

  const id = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const record: SyncHistoryRecord = {
    ...entry,
    id,
    commitUrl: safeCommitUrl,
  };

  const updated = [record, ...existing].slice(0, MAX_HISTORY_RECORDS);
  await chrome.storage.local.set({ [HISTORY_KEY]: updated });
  logger.info(`[History] Added record ${record.id} for "${record.title}" (${record.status})`);
  return record;
}

/**
 * Adds a new sync history record.
 * Serialized via Promise queue to prevent concurrent race conditions.
 * Keeps at most MAX_HISTORY_RECORDS (200), newest first.
 * Never stores tokens or sensitive auth credentials.
 */
export async function addSyncHistoryRecord(
  entry: Omit<SyncHistoryRecord, "id">
): Promise<SyncHistoryRecord> {
  return new Promise((resolve, reject) => {
    historyWriteLock = historyWriteLock
      .then(() => _addSyncHistoryRecordInternal(entry))
      .then(resolve)
      .catch(reject);
  });
}

/**
 * Clears stored sync history records.
 * Preserves extension settings, auth, and repo configuration.
 */
export async function clearSyncHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
  logger.info("[History] Sync history cleared.");
}

/**
 * Calculates aggregate sync statistics across stored history.
 */
export async function loadSyncStats(): Promise<SyncStats> {
  const history = await loadSyncHistory();

  const stats: SyncStats = {
    total: history.length,
    success: 0,
    failed: 0,
    duplicate: 0,
    skipped: 0,
    authFailed: 0,
    byDifficulty: {
      Easy: 0,
      Medium: 0,
      Hard: 0,
    },
    byLanguage: {},
    lastSyncTimestamp: history[0]?.timestamp,
  };

  for (const item of history) {
    switch (item.status) {
      case "success":
        stats.success++;
        break;
      case "failed":
        stats.failed++;
        break;
      case "duplicate":
        stats.duplicate++;
        break;
      case "skipped":
        stats.skipped++;
        break;
      case "auth":
        stats.authFailed++;
        break;
    }

    if (item.difficulty && item.difficulty in stats.byDifficulty) {
      stats.byDifficulty[item.difficulty as "Easy" | "Medium" | "Hard"]++;
    }

    if (item.language) {
      const lang = item.language;
      stats.byLanguage[lang] = (stats.byLanguage[lang] ?? 0) + 1;
    }
  }

  return stats;
}

// ── Reset ─────────────────────────────────────────────────────────────────────

/** Clear all stored data (for reset/logout). */
export async function clearAllStorage(): Promise<void> {
  await chrome.storage.local.clear();
  logger.info("All storage cleared.");
}
