// ─── GitHub Repository Operations (Phase 1 stub) ─────────────────────────────

import type { FolderFormat } from "@/types/settings";
import type { LeetCodeSubmission } from "@/types/leetcode";
import { languageToExtension } from "@/utils/slugify";

export interface FilePaths {
  solutionPath: string;
  readmePath: string;
}

/**
 * Compute the paths for a submission given the configured folder format.
 *
 * @example
 * getFilePaths("two-sum", "py", "algorithms", "{slug}")
 * // → { solutionPath: "algorithms/two-sum/solution.py", readmePath: "algorithms/two-sum/README.md" }
 */
export function getFilePaths(
  submission: Pick<LeetCodeSubmission, "slug" | "language" | "difficulty">,
  baseDirectory: string,
  folderFormat: FolderFormat
): FilePaths {
  const ext = languageToExtension(submission.language);

  let folder: string;
  switch (folderFormat) {
    case "{difficulty}/{slug}":
      folder = `${submission.difficulty.toLowerCase()}/${submission.slug}`;
      break;
    case "{slug}/{language}":
      folder = `${submission.slug}/${submission.language.toLowerCase()}`;
      break;
    case "{slug}":
    default:
      folder = submission.slug;
      break;
  }

  const base = baseDirectory ? `${baseDirectory}/` : "";
  return {
    solutionPath: `${base}${folder}/solution.${ext}`,
    readmePath: `${base}${folder}/README.md`,
  };
}
