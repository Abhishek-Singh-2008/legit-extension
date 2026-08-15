// ─── Content Script Entry Point ───────────────────────────────────────────────
// Runs on https://leetcode.com/problems/* pages.
//
// Phase 1: Background channel verification (PING).
// Phase 2: Detect current problem (title, slug, difficulty, URL) & SPA nav.
// Phase 3: Watch submission results (Accepted, Wrong Answer, etc.) & report.
// Phase 4: Fetch accepted code via LeetCode's own GraphQL API (no DOM hacks).

import { logger } from "@/utils/logger";
import { slugFromUrl } from "@/utils/slugify";
import { getCurrentProblem } from "@/content/problem-detector";
import { watchSubmissionResult } from "@/content/submission-detector";
import { fetchAcceptedCode } from "@/content/leetcode-api";
import type { LeetCodeProblem, LeetCodeSubmission, SubmissionStatus } from "@/types/leetcode";

logger.info("LeetCode GitHub Sync content script loaded.");

// ── State ─────────────────────────────────────────────────────────────────────

/** The URL that was active when we last ran detection. */
let lastDetectedUrl = "";

/** The slug we last successfully reported. Used to suppress duplicate sends. */
let lastReportedSlug = "";

// ── SPA Navigation: URL-change detection ─────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 400;

function scheduleDetection(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runDetection, DEBOUNCE_MS);
}

const navObserver = new MutationObserver(() => {
  if (location.href !== lastDetectedUrl) {
    scheduleDetection();
  }
});

navObserver.observe(document.body, { childList: true, subtree: true });

// ── Problem Detection ─────────────────────────────────────────────────────────

function runDetection(): void {
  const currentUrl = location.href;
  lastDetectedUrl = currentUrl;

  const slug = slugFromUrl(currentUrl);

  if (!slug) {
    if (lastReportedSlug !== "") {
      lastReportedSlug = "";
      sendProblemDetected(null);
    }
    return;
  }

  const problem = getCurrentProblem();

  if (!problem) {
    logger.warn("On problem URL but could not build problem object.");
    return;
  }

  if (problem.slug === lastReportedSlug) {
    logger.debug(`[Detector] Same slug (${problem.slug}), skipping re-send.`);
    return;
  }

  lastReportedSlug = problem.slug;

  logger.info("Problem detected:");
  logger.info(`  Title:      ${problem.title}`);
  logger.info(`  Slug:       ${problem.slug}`);
  logger.info(`  Difficulty: ${problem.difficulty}`);
  logger.info(`  URL:        ${problem.url}`);

  sendProblemDetected(problem);
}

function sendProblemDetected(problem: LeetCodeProblem | null): void {
  chrome.runtime
    .sendMessage({ type: "PROBLEM_DETECTED", problem })
    .then(() => {
      logger.debug("[Detector] PROBLEM_DETECTED sent.");
    })
    .catch((err: unknown) => {
      logger.warn("[Detector] Could not send PROBLEM_DETECTED:", err);
    });
}

// ── Submission Watching & Code Fetch (Phases 3 & 4) ──────────────────────────

watchSubmissionResult({
  onAccepted: async (status: SubmissionStatus) => {
    const problem = getCurrentProblem();
    if (!problem) {
      logger.warn(`[Content] Verdict ${status} detected but could not find problem details.`);
      return;
    }

    logger.info(`[LCSync] Accepted: ${problem.title}`);
    logger.info("[LCSync] Fetching code from LeetCode API...");

    // Fetch code via LeetCode's own GraphQL API — reliable, no DOM extraction
    const result = await fetchAcceptedCode(problem.slug);

    if (!result || !result.code) {
      logger.error("[LCSync] Could not fetch code from LeetCode API.");
      return;
    }

    const { code, language } = result;

    // ── Development Debug Log (Phase 4 testing) ─────────────────────────────
    console.log(
      `%c[LCSync Debug: Extracted Code]`,
      "color: #3fb950; font-weight: bold;"
    );
    console.log(`Language:  ${language}`);
    console.log(`Length:    ${code.length} characters`);
    console.log("---------------------- CODE START ----------------------");
    console.log(code);
    console.log("----------------------- CODE END -----------------------");
    // ─────────────────────────────────────────────────────────────────────────

    // Construct full submission payload
    const submission: LeetCodeSubmission = {
      title: problem.title,
      slug: problem.slug,
      url: problem.url,
      difficulty: problem.difficulty,
      language,
      code,
      submittedAt: new Date().toISOString(),
    };

    chrome.runtime
      .sendMessage({ type: "SUBMISSION_ACCEPTED", submission })
      .then(() => {
        logger.debug("[Content] SUBMISSION_ACCEPTED message sent to background.");
      })
      .catch((err: unknown) => {
        logger.error("[Content] Failed to send SUBMISSION_ACCEPTED:", err);
      });
  },

  onRejected: (status: SubmissionStatus) => {
    const problem = getCurrentProblem();
    const title = problem ? problem.title : "Unknown Problem";
    logger.info(`[LCSync] Submission Result (${status}): ${title}`);
  },
});

// ── Initial Detection ─────────────────────────────────────────────────────────

setTimeout(runDetection, 600);

// ── Background Channel Verification (Phase 1) ────────────────────────────────

chrome.runtime
  .sendMessage({ type: "PING" })
  .then((response) => {
    logger.debug("Background PING response:", response);
  })
  .catch((err: unknown) => {
    logger.warn("Could not ping background:", err);
  });
