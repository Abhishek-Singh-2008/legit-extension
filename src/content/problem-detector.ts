// ─── Problem Detector ────────────────────────────────────────────────────────
// Extracts title, slug, and difficulty from the current LeetCode page.
//
// DOM STRATEGY (verified against LeetCode as of 2026-08):
//
// 1. SLUG   — derived from the URL pathname. This is the most reliable source
//             and is immune to DOM layout changes.
//             e.g. /problems/two-sum/ → "two-sum"
//
// 2. TITLE  — three sources tried in order (most to least reliable):
//   a. document.title          e.g. "Two Sum - LeetCode"  → strip " - LeetCode"
//   b. og:title meta tag       same value, but present in <head> from SSR
//   c. slugToTitle(slug)       last-resort fallback, avoids empty strings
//
// 3. DIFFICULTY — LeetCode renders the badge with a CSS design-token class:
//      .text-difficulty-easy   / .text-difficulty-medium / .text-difficulty-hard
//   We query for an element bearing one of those classes and read its text.
//   This is stable because it's driven by a design system, not a layout tree.
//   Fallback: "Unknown".

import { slugFromUrl, slugToTitle } from "@/utils/slugify";
import type { LeetCodeProblem, Difficulty } from "@/types/leetcode";

// ── Difficulty class map ──────────────────────────────────────────────────────
// Keys are the CSS class suffixes LeetCode uses on the difficulty badge element.
const DIFFICULTY_CLASSES: Record<string, Difficulty> = {
  "text-difficulty-easy": "Easy",
  "text-difficulty-medium": "Medium",
  "text-difficulty-hard": "Hard",
} as const;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract the current LeetCode problem from the page.
 * Returns null if the current URL is not a problem page.
 */
export function getCurrentProblem(): LeetCodeProblem | null {
  const url = location.href;
  const slug = slugFromUrl(url);

  if (!slug) {
    // Not a problem page (e.g. /problemset/, /profile/, etc.)
    return null;
  }

  const title = extractTitle(slug);
  const difficulty = extractDifficulty();

  const problem: LeetCodeProblem = {
    title,
    slug,
    difficulty,
    url: normalizeProblemUrl(slug),
  };

  return problem;
}

// ── Title extraction ──────────────────────────────────────────────────────────

/**
 * Try multiple sources for the title; never return an empty string.
 */
function extractTitle(slug: string): string {
  // Source 1: document.title (React updates this on navigation)
  const fromTitle = parseTitleTag(document.title);
  if (fromTitle) return fromTitle;

  // Source 2: og:title meta (present from SSR, may be stale after SPA nav)
  const ogTitle = document
    .querySelector<HTMLMetaElement>('meta[property="og:title"]')
    ?.content.trim();
  const fromOg = ogTitle ? parseTitleTag(ogTitle) : null;
  if (fromOg) return fromOg;

  // Source 3: derive from slug as last resort
  return slugToTitle(slug);
}

/**
 * Strip the " - LeetCode" suffix from a title string.
 * Returns null if the result is empty or looks invalid.
 */
function parseTitleTag(raw: string): string | null {
  const cleaned = raw
    .replace(/\s*[-–|]\s*LeetCode\s*$/i, "")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

// ── Difficulty extraction ─────────────────────────────────────────────────────

/**
 * Find the difficulty badge element by its CSS class and read its text.
 * Returns "Unknown" if no badge is found (e.g. page not fully loaded).
 */
function extractDifficulty(): Difficulty {
  for (const [cls, difficulty] of Object.entries(DIFFICULTY_CLASSES)) {
    const el = document.querySelector(`.${cls}`);
    if (el) {
      const text = el.textContent?.trim();
      // Confirm the text actually matches what we expect (sanity check)
      if (text === difficulty) return difficulty;
      // Class found but text doesn't match — still trust the class
      if (text) {
        const normalised = normaliseDifficultyText(text);
        if (normalised) return normalised;
      }
      return difficulty;
    }
  }

  // Fallback: search any element whose sole text content is a difficulty word.
  // This guards against LeetCode renaming the class while keeping the text.
  return searchDifficultyByText();
}

function normaliseDifficultyText(text: string): Difficulty | null {
  const lower = text.toLowerCase();
  if (lower === "easy") return "Easy";
  if (lower === "medium") return "Medium";
  if (lower === "hard") return "Hard";
  return null;
}

/**
 * Last-resort: walk elements that have exactly the difficulty words as text.
 */
function searchDifficultyByText(): Difficulty {
  const candidates = document.querySelectorAll(
    '[class*="difficulty"], [class*="Difficulty"]'
  );
  for (const el of candidates) {
    const t = normaliseDifficultyText(el.textContent?.trim() ?? "");
    if (t) return t;
  }
  return "Unknown";
}

// ── URL normalisation ─────────────────────────────────────────────────────────

/**
 * Return a canonical, trailing-slash problem URL regardless of the sub-path
 * the user is currently on (/description/, /submissions/, etc.).
 */
function normalizeProblemUrl(slug: string): string {
  return `https://leetcode.com/problems/${slug}/`;
}
