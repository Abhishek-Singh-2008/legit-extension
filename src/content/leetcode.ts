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
import { fetchAcceptedCode, fetchQuestionDifficulty } from "@/content/leetcode-api";
import { MonacoCodeExtractor, getCurrentLanguage, extractCodeSafely } from "@/content/code-extractor";
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

// Run initial detection immediately on load
runDetection();

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

  // If DOM gave Unknown difficulty, resolve asynchronously via GraphQL
  if (problem.difficulty === "Unknown") {
    fetchQuestionDifficulty(problem.slug).then((d) => {
      if (d && d !== "Unknown") {
        problem.difficulty = d;
        sendProblemDetected(problem);
      }
    });
  }
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

let isHandlingAccepted = false;

watchSubmissionResult({
  onAccepted: async (status: SubmissionStatus, metadata?: { staleSubmissionId?: string }) => {
    if (isHandlingAccepted) {
      logger.debug("[Content] Already processing an Accepted submission — skipping duplicate callback.");
      return;
    }
    isHandlingAccepted = true;

    try {
      const problem = getCurrentProblem();
      if (!problem) {
        logger.warn(`[Content] Verdict ${status} detected but could not find problem details.`);
        return;
      }

      // Ensure accurate difficulty
      if (problem.difficulty === "Unknown") {
        const gqlDiff = await fetchQuestionDifficulty(problem.slug);
        if (gqlDiff) problem.difficulty = gqlDiff;
      }

      logger.info(`[LCSync] Accepted: ${problem.title} (${problem.difficulty})`);
      
      // Extract active editor code & language as primary ground truth from page
      const editorData = extractCodeSafely();
      let code: string | null = editorData.code;
      let language = editorData.language;

      // Check URL for a submission ID (ignore if it's the stale ID from before clicking Submit)
      const currentUrlSubId = location.pathname.match(/\/submissions\/(\d+)/)?.[1];
      const freshUrlSubmissionId =
        currentUrlSubId && currentUrlSubId !== metadata?.staleSubmissionId
          ? currentUrlSubId
          : undefined;

      logger.info(
        `[LCSync] Fetching code from LeetCode GraphQL API (submissionId: ${
          freshUrlSubmissionId ?? "latest"
        }, staleId: ${metadata?.staleSubmissionId ?? "none"})...`
      );

      try {
        const result = await fetchAcceptedCode(problem.slug, freshUrlSubmissionId, metadata?.staleSubmissionId);
        if (result?.code && result.code.trim().length > 0) {
          // If editor has code and detected a specific language (e.g. Java) but GraphQL returned a different language (e.g. stale Python),
          // prioritize editor code to prevent stale overwrite
          if (
            editorData.code &&
            editorData.language &&
            result.language &&
            editorData.language.toLowerCase() !== result.language.toLowerCase()
          ) {
            logger.warn(
              `[LCSync] GraphQL returned language ${result.language} but editor has ${editorData.language}. Using editor code to prevent stale overwrite.`
            );
          } else {
            code = result.code;
            if (result.language) language = result.language;
            logger.info(`[LCSync] Pristine code fetched via LeetCode GraphQL API (${code.length} chars, ${language})`);
          }
        }
      } catch (gqlErr) {
        logger.warn("[LCSync] GraphQL code fetch failed, falling back to editor extractor:", gqlErr);
      }

      // Fallback: Monaco editor / DOM extraction if GraphQL was unavailable
      if (!code || code.trim().length === 0) {
        const monacoExtractor = new MonacoCodeExtractor();
        if (monacoExtractor.canExtract()) {
          code = monacoExtractor.extractCode();
          language = getCurrentLanguage();
        }
      }

      if (!code || code.trim().length === 0) {
        logger.error("[LCSync] Could not extract your submitted code (empty result).");
        return;
      }

      logger.info(`[LCSync] Final code ready for push (${code.length} chars, ${language})`);

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
    } finally {
      setTimeout(() => {
        isHandlingAccepted = false;
      }, 3000);
    }
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
