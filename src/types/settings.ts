// ─── Settings / Storage Types ────────────────────────────────────────────────

export interface ExtensionSettings {
  // GitHub auth
  githubToken?: string;
  githubUsername?: string;
  githubAvatarUrl?: string;

  // Repository config
  repository?: string; // e.g. "abhishek/leetcode-solutions"
  branch: string; // e.g. "main"
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

export interface LastSyncRecord {
  title: string;
  slug: string;
  timestamp: string; // ISO 8601
  commitUrl?: string;
  success: boolean;
  errorMessage?: string;
}

// Sensible defaults shipped with the extension
export const DEFAULT_SETTINGS: ExtensionSettings = {
  branch: "main",
  baseDirectory: "algorithms",
  folderFormat: "{slug}",
  autoSync: true,
  generateReadme: true,
  notifications: true,
  commitMessageFormat: "feat: add {title} solution",
  recentSubmissionHashes: [],
};
