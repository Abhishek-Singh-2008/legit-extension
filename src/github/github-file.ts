// ─── GitHub File Operations (Phase 1 stub) ───────────────────────────────────

import type { LeetCodeSubmission } from "@/types/leetcode";

/**
 * Generate a README.md for a submission.
 * Time/space complexity is intentionally omitted in V1 to avoid fabrication.
 */
export function generateReadme(submission: LeetCodeSubmission): string {
  const languageDisplay =
    submission.language.charAt(0).toUpperCase() + submission.language.slice(1);

  return `# ${submission.title}

**Difficulty:** ${submission.difficulty}

**Language:** ${languageDisplay}

## Problem

${submission.url}

## Solution

Automatically synchronized from LeetCode on ${new Date(submission.submittedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}.

## Complexity

> Time: Not provided  
> Space: Not provided

<!-- Add your own complexity analysis above. -->
`;
}

/**
 * Format the commit message using the configured template.
 * Supported tokens: {title}, {slug}, {difficulty}, {language}
 */
export function formatCommitMessage(
  template: string,
  submission: LeetCodeSubmission
): string {
  return template
    .replace(/\{title\}/g, submission.title)
    .replace(/\{slug\}/g, submission.slug)
    .replace(/\{difficulty\}/g, submission.difficulty)
    .replace(/\{language\}/g, submission.language);
}
