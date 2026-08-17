// ─── Settings / Storage Types ────────────────────────────────────────────────

export interface ExtensionSettings {
  // GitHub auth
  githubToken?: string;
  githubUsername?: string;
  githubAvatarUrl?: string;

  // Repository config — set by user after auth via dropdown selection
  githubRepoOwner?: string;  // e.g. "Abhishek-Singh-2008"
  githubRepoName?: string;   // e.g. "leetcode-solutions-test"
  githubBranch?: string;     // e.g. "main" — user-selected, never assumed
  baseDirectory: string; // e.g. "algorithms"
  folderFormat: FolderFormat;

  // Sync behaviour
  autoSync: boolean;
  generateReadme: boolean;
  notifications: boolean;

  // Commit messages
  commitMessageFormat: string; // e.g. "feat: add {title} solution"

  // Deduplication
  recentSubmissionHashes: string[]; // up to last 100

  // Last sync
  lastSync?: LastSyncRecord;
}

export type FolderFormat = "{slug}" | "{difficulty}/{slug}" | "{slug}/{language}";

/**
 * Typed status for each sync attempt — enables rich UI rendering.
 *
 * success   — solution committed to GitHub
 * failed    — GitHub API or network error
 * skipped   — autoSync off or other intentional skip
 * duplicate — same code already committed (dedup hash match)
 * auth      — authentication expired or invalid
 */
export type SyncStatus = "success" | "failed" | "skipped" | "duplicate" | "auth";

export interface LastSyncRecord {
  title: string;
  slug: string;
  timestamp: string;     // ISO 8601
  status: SyncStatus;
  commitUrl?: string;
  errorMessage?: string;
}

export interface SyncHistoryRecord {
  id: string;
  title: string;
  slug: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  language?: string;
  repository?: string;
  branch?: string;
  filePath?: string;
  commitUrl?: string;
  timestamp: string;
  status: SyncStatus;
  errorMessage?: string;
}

export interface SyncStats {
  total: number;
  success: number;
  failed: number;
  duplicate: number;
  skipped: number;
  authFailed: number;
  byDifficulty: {
    Easy: number;
    Medium: number;
    Hard: number;
  };
  byLanguage: Record<string, number>;
  lastSyncTimestamp?: string;
}

// Sensible defaults shipped with the extension
export const DEFAULT_SETTINGS: ExtensionSettings = {
  baseDirectory: "algorithms",
  folderFormat: "{slug}",
  autoSync: true,
  generateReadme: true,
  notifications: true,
  commitMessageFormat: "feat: add {title} solution",
  recentSubmissionHashes: [],
};
