import type { LeetCodeSubmission } from "@/types/leetcode";
import type { AIAnalysisResult } from "@/types/settings";

export interface ReadmeOptions {
  filename?: string;
  version?: number;
  existingContent?: string;
}

function getLanguageEmoji(language: string): string {
  const lang = language.toLowerCase().trim();
  if (lang.includes("java") && !lang.includes("script")) return "☕";
  if (lang.includes("python")) return "🐍";
  if (lang.includes("c++") || lang.includes("cpp")) return "⚡";
  if (lang === "c") return "⚙️";
  if (lang.includes("c#") || lang.includes("csharp")) return "🔷";
  if (lang.includes("typescript") || lang.includes("ts")) return "🟦";
  if (lang.includes("javascript") || lang.includes("js")) return "🟨";
  if (lang.includes("go") || lang.includes("golang")) return "🐹";
  if (lang.includes("rust")) return "🦀";
  if (lang.includes("kotlin")) return "🟣";
  if (lang.includes("swift")) return "🍎";
  if (lang.includes("ruby")) return "💎";
  if (lang.includes("scala")) return "🔴";
  if (lang.includes("php")) return "🐘";
  if (lang.includes("dart")) return "🎯";
  if (lang.includes("sql")) return "🗄️";
  return "💻";
}

function getDifficultyBadge(difficulty: string): string {
  const d = difficulty.toLowerCase().trim();
  if (d === "easy") return "🟢 **Easy**";
  if (d === "medium") return "🟡 **Medium**";
  if (d === "hard") return "🔴 **Hard**";
  return `**${difficulty}**`;
}

function cleanExistingBlock(block: string): string {
  return block
    .replace(/^---\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatSolutionSection(
  submission: LeetCodeSubmission,
  aiResult: AIAnalysisResult | undefined,
  filename: string,
  version: number,
  formattedDate: string
): string {
  const emoji = getLanguageEmoji(submission.language);
  const langDisplay =
    submission.language.charAt(0).toUpperCase() + submission.language.slice(1);
  const approachTitle = version > 1 ? `${langDisplay} — Approach ${version}` : langDisplay;

  let body = `### ${emoji} ${approachTitle} (\`${filename}\`)\n\n`;
  body += `- **Synchronized:** ${formattedDate}\n`;
  body += `- **Language:** \`${langDisplay}\`\n`;
  body += `- **Source File:** [\`${filename}\`](${filename})\n\n`;

  if (aiResult) {
    if (aiResult.error) {
      body += `#### ⏱️ Complexity Analysis\n\n> ⚠️ *Complexity analysis unavailable (${aiResult.error}).*\n`;
    } else {
      if (aiResult.approach && aiResult.approach.trim().length > 0) {
        body += `#### 💡 Approach & Intuition\n\n> ${aiResult.approach.trim()}\n\n`;
      }

      const timeText = aiResult.timeReason
        ? `\`${aiResult.timeComplexity}\` — *${aiResult.timeReason}*`
        : `\`${aiResult.timeComplexity}\``;
      const spaceText = aiResult.spaceReason
        ? `\`${aiResult.spaceComplexity}\` — *${aiResult.spaceReason}*`
        : `\`${aiResult.spaceComplexity}\``;

      body += `#### ⏱️ Complexity Analysis\n\n- **Time Complexity:** ${timeText}\n- **Space Complexity:** ${spaceText}\n`;
    }
  } else {
    body += `#### ⏱️ Complexity Analysis\n\n> Time: Not provided  \n> Space: Not provided\n`;
  }

  return body.trim();
}

/**
 * Generate or incrementally update a README.md for a problem.
 * Preserves existing approaches and complexities across multiple languages and versions.
 */
export function generateReadme(
  submission: LeetCodeSubmission,
  aiResult?: AIAnalysisResult,
  options?: ReadmeOptions
): string {
  const filename = options?.filename ?? "solution.py";
  const version = options?.version ?? 1;
  const existing = options?.existingContent?.trim();

  const formattedDate = new Date(submission.submittedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const currentSection = formatSolutionSection(
    submission,
    aiResult,
    filename,
    version,
    formattedDate
  );

  const diffBadge = getDifficultyBadge(submission.difficulty);
  const header = `# ${submission.title}\n\n**Difficulty:** ${diffBadge}  \n**LeetCode Link:** [${submission.title}](${submission.url})\n\n---\n\n## Solutions\n`;

  if (!existing || existing.length === 0) {
    return `${header}\n${currentSection}\n`;
  }

  // Parse existing solution blocks
  const existingSections: { key: string; content: string }[] = [];

  if (existing.includes("### ")) {
    // Split cleanly on markdown ### section headers
    const rawBlocks = existing.split(/(?=^###\s+)/gm);
    for (const rawBlock of rawBlocks) {
      const cleaned = cleanExistingBlock(rawBlock);
      if (!cleaned.startsWith("### ")) continue;

      // Extract filename identifier like `solution.py` or `solution_2.py`
      const fileMatch = cleaned.match(/`([^`]+\.[a-zA-Z0-9]+)`/);
      const key = fileMatch ? fileMatch[1] : cleaned.split("\n")[0];
      existingSections.push({ key, content: cleaned });
    }
  } else if (existing.includes("## Approach & Intuition") || existing.includes("## Complexity")) {
    // Legacy single-solution format migration
    const langMatch = existing.match(/\*\*Language:\*\*\s*([^\n\r]+)/i);
    const legacyLang = langMatch ? langMatch[1].trim() : "Solution";
    const legacyEmoji = getLanguageEmoji(legacyLang);
    const legacyFile = `solution.${submission.language.toLowerCase().includes("python") ? "py" : "txt"}`;

    let legacyBody = `### ${legacyEmoji} ${legacyLang} (\`${legacyFile}\`)\n\n`;
    legacyBody += `- **Language:** \`${legacyLang}\`\n`;
    legacyBody += `- **Source File:** [\`${legacyFile}\`](${legacyFile})\n\n`;

    const approachMatch = existing.match(/## Approach & Intuition\s*\n\s*>([^\n\r]+)/i);
    if (approachMatch?.[1]) {
      legacyBody += `#### 💡 Approach & Intuition\n\n>${approachMatch[1]}\n\n`;
    }

    const complexityMatch = existing.match(/## Complexity\s*\n\s*([\s\S]+?)(?:\n---|\n##|$)/i);
    if (complexityMatch?.[1]) {
      legacyBody += `#### ⏱️ Complexity Analysis\n\n${complexityMatch[1].trim()}\n\n`;
    }

    existingSections.push({ key: legacyFile, content: legacyBody.trim() });
  }

  // Update or append the current solution
  const index = existingSections.findIndex(
    (s) => s.key === filename || s.content.includes(`\`${filename}\``)
  );

  if (index !== -1) {
    existingSections[index] = { key: filename, content: currentSection };
  } else {
    // Put newest solution at the top of the solutions list
    existingSections.unshift({ key: filename, content: currentSection });
  }

  const solutionsBody = existingSections.map((s) => s.content).join("\n\n---\n\n");
  return `${header}\n${solutionsBody}\n`;
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
