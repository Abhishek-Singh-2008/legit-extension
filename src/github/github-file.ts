import type { LeetCodeSubmission } from "@/types/leetcode";
import type { AIAnalysisResult } from "@/types/settings";

/**
 * Generate a README.md for a submission with optional AI complexity and approach analysis.
 */
export function generateReadme(
  submission: LeetCodeSubmission,
  aiResult?: AIAnalysisResult
): string {
  const languageDisplay =
    submission.language.charAt(0).toUpperCase() + submission.language.slice(1);

  const formattedDate = new Date(submission.submittedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let approachSection = "";
  let complexitySection = "";

  if (aiResult) {
    if (aiResult.error) {
      complexitySection = `## Complexity\n\n> ⚠️ *Complexity analysis unavailable (${aiResult.error}).*\n`;
    } else {
      if (aiResult.approach && aiResult.approach.trim().length > 0) {
        approachSection = `## Approach & Intuition\n\n> ${aiResult.approach.trim()}\n\n`;
      }

      const timeText = aiResult.timeReason
        ? `\`${aiResult.timeComplexity}\` — ${aiResult.timeReason}`
        : `\`${aiResult.timeComplexity}\``;
      const spaceText = aiResult.spaceReason
        ? `\`${aiResult.spaceComplexity}\` — ${aiResult.spaceReason}`
        : `\`${aiResult.spaceComplexity}\``;

      complexitySection = `## Complexity\n\n- **Time Complexity:** ${timeText}\n- **Space Complexity:** ${spaceText}\n`;
    }
  } else {
    complexitySection = `## Complexity\n\n> Time: Not provided  \n> Space: Not provided\n\n<!-- Add your own complexity analysis above. -->\n`;
  }

  return `# ${submission.title}

**Difficulty:** ${submission.difficulty}

**Language:** ${languageDisplay}

## Problem

${submission.url}

## Solution

Automatically synchronized from LeetCode on ${formattedDate}.

${approachSection}${complexitySection}`;
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
