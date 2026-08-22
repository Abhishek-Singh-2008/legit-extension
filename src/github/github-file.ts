// ─── GitHub File Operations ───────────────────────────────────────────────────

import type { LeetCodeSubmission } from "@/types/leetcode";

/**
 * Generate a README.md for a submission.
 * Formats problem details, solution timestamp, and local static complexity analysis.
 */
export function generateReadme(submission: LeetCodeSubmission): string {
  const languageDisplay =
    submission.language.charAt(0).toUpperCase() + submission.language.slice(1);

  const complexityBlock = formatComplexitySection(submission);

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

${complexityBlock}
`;
}

function formatComplexitySection(submission: LeetCodeSubmission): string {
  const comp = submission.complexity;

  const isAvailable =
    Boolean(comp) &&
    Boolean(comp?.time) &&
    comp?.time !== "O(?)" &&
    comp?.time !== "Not provided" &&
    comp?.time !== "Analysis unavailable" &&
    Boolean(comp?.space) &&
    comp?.space !== "O(?)" &&
    comp?.space !== "Not provided" &&
    comp?.space !== "Analysis unavailable";

  if (!isAvailable || !comp) {
    return `## Complexity

> **Time:** Analysis unavailable
>
> **Space:** Analysis unavailable`;
  }

  const timeStr = sanitizeMarkdown(comp.time);
  const spaceStr = sanitizeMarkdown(comp.space);

  const confidenceDisplay =
    comp.confidence.charAt(0).toUpperCase() + comp.confidence.slice(1).toLowerCase();

  let analysisBlock = "";
  if (comp.explanation && comp.explanation.length > 0) {
    const listItems = comp.explanation
      .map((e) => `* ${sanitizeMarkdown(e)}`)
      .join("\n");
    analysisBlock = `\n\n### Analysis\n\n${listItems}`;
  }

  return `## Complexity

> **Time:** ${timeStr}
>
> **Space:** ${spaceStr}${analysisBlock}

**Confidence:** ${confidenceDisplay}`;
}

function sanitizeMarkdown(str: string): string {
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
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
