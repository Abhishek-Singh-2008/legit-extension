// ─── Submission Detector ──────────────────────────────────────────────────────
// Monitors LeetCode submission results using a combination of Submit button
// click tracking, keyboard shortcut listening (Ctrl/Cmd + Enter), and
// debounced MutationObserver on the submission result panel.

import { logger } from "@/utils/logger";
import type { SubmissionStatus } from "@/types/leetcode";

export interface SubmissionDetectorCallbacks {
  onAccepted: (status: SubmissionStatus) => void;
  onRejected: (status: SubmissionStatus) => void;
}

// ── Known Status Strings ──────────────────────────────────────────────────────
const STATUS_MAP: Readonly<Record<string, SubmissionStatus>> = {
  accepted: "Accepted",
  "wrong answer": "Wrong Answer",
  "time limit exceeded": "Time Limit Exceeded",
  "runtime error": "Runtime Error",
  "compile error": "Compile Error",
  "memory limit exceeded": "Memory Limit Exceeded",
  "output limit exceeded": "Output Limit Exceeded",
} as const;

/**
 * Identifies if a string matches one of our known LeetCode submission status verdicts.
 */
export function parseSubmissionStatus(text: string): SubmissionStatus | null {
  const normalized = text.trim().toLowerCase();
  // Exact match first
  if (STATUS_MAP[normalized]) {
    return STATUS_MAP[normalized];
  }
  // Check if text starts with status (e.g., "Accepted 65 / 65 testcases passed")
  for (const [key, status] of Object.entries(STATUS_MAP)) {
    if (normalized.startsWith(key)) {
      return status;
    }
  }
  return null;
}

/**
 * Watches the LeetCode submission result area for a verdict.
 * Returns a cleanup function to disconnect listeners & observers.
 */
export function watchSubmissionResult(
  callbacks: SubmissionDetectorCallbacks
): () => void {
  logger.info("[SubmissionDetector] Initializing submission watcher...");

  let isSubmitting = false;
  let submitTimestamp = 0;
  let hasReportedForCurrentSubmit = false;
  let lastProcessedKey = "";
  let preSubmitVerdictKey = "";
  let sawJudgingState = false;

  // 1. Submit Button Click Listener & Keyboard Listener
  const handleClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Search for button or interactive element that triggers submission
    const button = target.closest("button, [role='button'], [data-e2e-locator*='submit'], [data-cy*='submit']");
    if (!button) return;

    const label = (button.getAttribute("aria-label") ?? "").toLowerCase();
    const dataLocator = (button.getAttribute("data-e2e-locator") ?? "").toLowerCase();
    const dataCy = (button.getAttribute("data-cy") ?? "").toLowerCase();
    const text = (button.textContent ?? "").trim().toLowerCase();

    // Ensure it is specifically a SUBMIT action, NOT a RUN action
    const isRun =
      dataLocator.includes("run") ||
      dataCy.includes("run") ||
      label.includes("run") ||
      text === "run" ||
      text === "run code";

    if (isRun) {
      logger.debug("[SubmissionDetector] Run button clicked (testcase only) — ignoring.");
      return;
    }

    if (
      label === "submit" ||
      label.includes("submit") ||
      dataLocator.includes("submit") ||
      dataCy.includes("submit") ||
      text === "submit" ||
      text.includes("submit")
    ) {
      logger.info("[SubmissionDetector] Submit action detected!");
      // Capture any stale verdict currently in DOM to ignore it
      const currentVerdict = findVerdictInDOM();
      preSubmitVerdictKey = currentVerdict ? `${currentVerdict.status}:${currentVerdict.identifier}` : "";
      isSubmitting = true;
      submitTimestamp = Date.now();
      hasReportedForCurrentSubmit = false;
      sawJudgingState = false;
    }
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    // Detect Ctrl+Enter or Cmd+Enter for code submission (Ctrl+' is Run Code, ignore)
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      logger.info("[SubmissionDetector] Submit keyboard shortcut detected (Ctrl/Cmd + Enter)");
      const currentVerdict = findVerdictInDOM();
      preSubmitVerdictKey = currentVerdict ? `${currentVerdict.status}:${currentVerdict.identifier}` : "";
      isSubmitting = true;
      submitTimestamp = Date.now();
      hasReportedForCurrentSubmit = false;
      sawJudgingState = false;
    }
  };

  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);

  // 2. MutationObserver for Result DOM Area
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const isJudgingInDOM = (): boolean => {
    const text = document.body.textContent?.toLowerCase() ?? "";
    const hasJudgingText =
      text.includes("judging") ||
      text.includes("pending") ||
      text.includes("running testcases") ||
      Boolean(document.querySelector('[data-e2e-locator*="loading"], [class*="loading-"], [class*="spinner"]'));
    return hasJudgingText;
  };

  const checkResultDOM = (): void => {
    // Only evaluate if user is actively submitting OR on a direct submission permalink URL
    const isSubmissionPage = location.pathname.includes("/submissions/");
    if (!isSubmitting && !isSubmissionPage) {
      return;
    }

    // If submit happened more than 90 seconds ago without a verdict, expire it
    if (isSubmitting && Date.now() - submitTimestamp > 90000) {
      isSubmitting = false;
      return;
    }

    // Check if intermediate judging/pending state is observed
    if (isSubmitting && isJudgingInDOM()) {
      sawJudgingState = true;
    }

    const verdict = findVerdictInDOM();
    if (!verdict) return;

    const submissionKey = `${verdict.status}:${verdict.identifier}`;

    // Suppress stale pre-submit verdict before LeetCode finishes judging
    if (isSubmitting && !sawJudgingState) {
      if (submissionKey === preSubmitVerdictKey && Date.now() - submitTimestamp < 1500) {
        logger.debug("[SubmissionDetector] Stale pre-submit verdict detected — waiting for fresh result.");
        return;
      }
    }

    // Suppress multiple callbacks for the same active submit event
    if (hasReportedForCurrentSubmit && !isSubmitting) {
      return;
    }

    // Prevent duplicate processing of the same result
    if (submissionKey === lastProcessedKey && !isSubmitting) {
      return;
    }

    lastProcessedKey = submissionKey;
    isSubmitting = false;
    hasReportedForCurrentSubmit = true;

    logger.info(`[SubmissionDetector] Fresh submission verdict detected: ${verdict.status} (${submissionKey})`);

    if (verdict.status === "Accepted") {
      callbacks.onAccepted("Accepted");
    } else {
      callbacks.onRejected(verdict.status);
    }
  };

  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkResultDOM, 250);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Check immediately if directly loaded on a submission page
  if (location.pathname.includes("/submissions/")) {
    setTimeout(checkResultDOM, 600);
    setTimeout(checkResultDOM, 1500);
  }

  // Cleanup
  return () => {
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKeyDown, true);
    observer.disconnect();
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    logger.info("[SubmissionDetector] Disconnected watcher.");
  };
}

// ── DOM Verdict Finder ────────────────────────────────────────────────────────

interface FoundVerdict {
  status: SubmissionStatus;
  identifier: string;
  isFresh: boolean;
}

/**
 * Searches the DOM for submission result containers and verifies full testcase pass.
 */
function findVerdictInDOM(): FoundVerdict | null {
  // Strategy A: data-e2e-locator="submission-result" or data-cy attributes
  const e2eEls = document.querySelectorAll(
    '[data-e2e-locator*="submission-result"], [data-cy*="submission-result"], [data-e2e-locator*="result-status"], [data-cy*="result-status"]'
  );
  for (const e2eEl of e2eEls) {
    const text = e2eEl.textContent?.trim() ?? "";
    const status = parseSubmissionStatus(text);
    if (status && verifyAllTestCasesPassed(e2eEl, status)) {
      return {
        status,
        identifier: getElementIdentifier(e2eEl),
        isFresh: true,
      };
    }
  }

  // Strategy B: Match elements with status CSS classes or tokens
  const statusSelectors = [
    ".text-sd-easy",
    ".text-fixed-positive",
    ".text-green-s",
    ".text-green-500",
    ".text-green-600",
    ".text-olive",
    ".text-sd-hard",
    ".text-fixed-negative",
    ".text-red-s",
    ".text-red-500",
    ".text-pink",
    '[class*="submission-result"]',
    '[class*="result-state"]',
    '[class*="result-container"]',
    '[class*="status-accepted"]',
  ];

  for (const selector of statusSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent?.trim() ?? "";
      const status = parseSubmissionStatus(text);
      if (status && isInsideSubmissionPanel(el) && verifyAllTestCasesPassed(el, status)) {
        return {
          status,
          identifier: getElementIdentifier(el),
          isFresh: true,
        };
      }
    }
  }

  // Strategy C: Inspect headings, spans, divs with status text in submission area
  const candidates = document.querySelectorAll("div, span, h3, h4, p, a");
  for (const el of candidates) {
    if (el.children.length > 2) continue;

    const text = el.textContent?.trim() ?? "";
    if (text.length === 0 || text.length > 60) continue;

    for (const [key, status] of Object.entries(STATUS_MAP)) {
      if (
        text.toLowerCase() === key ||
        text.toLowerCase().startsWith(`${key} `) ||
        text.toLowerCase().startsWith(key)
      ) {
        if (isInsideSubmissionPanel(el) && verifyAllTestCasesPassed(el, status)) {
          return {
            status,
            identifier: getElementIdentifier(el),
            isFresh: true,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Ensures that if status is "Accepted", all testcases actually passed (e.g., "61 / 61 testcases passed").
 * Rejects partial testcase runs or wrong answer states.
 */
function verifyAllTestCasesPassed(el: Element, status: SubmissionStatus): boolean {
  if (status !== "Accepted") {
    return true; // For rejected verdicts, allow status through so onRejected can handle it
  }

  // Search surrounding container for testcase indicators (e.g. "61 / 61 testcases passed")
  const container =
    el.closest('[data-e2e-locator*="result"], [data-layout-path], section, main, div[class*="flex"]') ??
    el.parentElement?.parentElement ??
    el.parentElement;

  if (container) {
    const containerText = container.textContent ?? "";
    
    // Check if testcases ratio like "35 / 65" or "61 / 61" exists
    const tcMatch = containerText.match(/(\d+)\s*\/\s*(\d+)\s*testcases\s*passed/i);
    if (tcMatch) {
      const passed = parseInt(tcMatch[1], 10);
      const total = parseInt(tcMatch[2], 10);
      if (total > 0 && passed < total) {
        logger.warn(`[SubmissionDetector] Testcases mismatch: ${passed}/${total} passed — not fully accepted.`);
        return false;
      }
    }
  }

  return true;
}

/**
 * Generate a unique fingerprint for a result element to prevent duplicate triggers.
 */
function getElementIdentifier(el: Element): string {
  const parentText = el.parentElement?.textContent?.slice(0, 100).trim() ?? "";
  const submissionUrlId = location.pathname.match(/\/submissions\/(\d+)/)?.[1] ?? "";
  return `${submissionUrlId}:${el.textContent?.trim()}:${parentText}`;
}

/**
 * Checks if an element is located inside a submission result container or panel,
 * and NOT inside the purely interactive "Run Code" console tab.
 */
function isInsideSubmissionPanel(el: Element): boolean {
  // If on a dedicated submission URL, it is always a submission panel
  if (location.pathname.includes("/submissions/")) {
    return true;
  }

  // Ignore navigation tab strip headers like <button role="tab">Accepted</button>
  const isTabHeader = Boolean(
    el.getAttribute("role") === "tab" ||
    el.closest('[role="tablist"], nav, [class*="tab-header"]')
  );
  if (isTabHeader) {
    // If it's just the tab title tab without testcase stats, ignore
    const text = el.parentElement?.textContent ?? "";
    if (!text.includes("testcases") && !text.includes("Runtime") && !text.includes("submitted at")) {
      return false;
    }
  }

  // Check if surrounding DOM contains submission result markers
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < 12) {
    const cls = current.className ? String(current.className).toLowerCase() : "";
    const id = current.id ? String(current.id).toLowerCase() : "";
    const dataLocator = (current.getAttribute("data-e2e-locator") ?? "").toLowerCase();
    const currentText = current.textContent ?? "";

    // If container has "testcases passed", "submitted at", "Beats", or submission markers, it's valid
    if (
      currentText.includes("testcases passed") ||
      currentText.includes("submitted at") ||
      currentText.includes("Beats ") ||
      dataLocator.includes("submission") ||
      dataLocator.includes("result") ||
      cls.includes("submission") ||
      cls.includes("result") ||
      id.includes("submission") ||
      id.includes("result")
    ) {
      return true;
    }

    current = current.parentElement;
    depth++;
  }

  // Fallback: if element itself has Accepted text and is not in editor
  const inEditor = Boolean(el.closest(".monaco-editor, .cm-editor, textarea, pre"));
  return !inEditor;
}


