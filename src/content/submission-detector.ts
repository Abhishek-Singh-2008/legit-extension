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
  let hasReportedForCurrentSubmit = false;
  let lastProcessedKey = "";

  // 1. Submit Button Click Listener & Keyboard Listener
  const handleClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const button = target.closest("button");
    if (!button) return;

    const label = (button.getAttribute("aria-label") ?? "").toLowerCase();
    const dataLocator = (button.getAttribute("data-e2e-locator") ?? "").toLowerCase();
    const text = (button.textContent ?? "").trim().toLowerCase();

    if (
      label === "submit" ||
      dataLocator === "console-submit-button" ||
      text === "submit" ||
      text.includes("submit")
    ) {
      logger.info("[SubmissionDetector] Submit button clicked!");
      isSubmitting = true;
      hasReportedForCurrentSubmit = false;
      lastProcessedKey = ""; // Reset to allow fresh detection for new submission
    }
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    // Detect Ctrl+Enter or Cmd+Enter for code submission
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      logger.info("[SubmissionDetector] Submit keyboard shortcut detected (Ctrl/Cmd + Enter)");
      isSubmitting = true;
      hasReportedForCurrentSubmit = false;
      lastProcessedKey = ""; // Reset to allow fresh detection for new submission
    }
  };

  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);

  // 2. MutationObserver for Result DOM Area
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const checkResultDOM = (): void => {
    const verdict = findVerdictInDOM();
    if (!verdict) return;

    const submissionKey = `${verdict.status}:${verdict.identifier}`;

    // Suppress multiple callbacks for the same active submit event
    if (hasReportedForCurrentSubmit && !isSubmitting) {
      return;
    }

    // Prevent duplicate processing of the same result UNLESS user actively pressed Submit
    if (!isSubmitting && submissionKey === lastProcessedKey) {
      return;
    }

    // Only process if user actively submitted OR if a new submission result appeared
    if (!isSubmitting && !verdict.isFresh) {
      return;
    }

    lastProcessedKey = submissionKey;
    isSubmitting = false;
    hasReportedForCurrentSubmit = true;

    logger.info(`[SubmissionDetector] Submission verdict detected: ${verdict.status}`);

    if (verdict.status === "Accepted") {
      callbacks.onAccepted("Accepted");
    } else {
      callbacks.onRejected(verdict.status);
    }
  };

  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkResultDOM, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Run initial check in case result is already on screen
  setTimeout(checkResultDOM, 500);

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
 * Searches the DOM for submission result containers.
 */
function findVerdictInDOM(): FoundVerdict | null {
  // Strategy A: data-e2e-locator="submission-result"
  const e2eEl = document.querySelector('[data-e2e-locator="submission-result"]');
  if (e2eEl) {
    const text = e2eEl.textContent?.trim() ?? "";
    const status = parseSubmissionStatus(text);
    if (status) {
      return {
        status,
        identifier: getElementIdentifier(e2eEl),
        isFresh: true,
      };
    }
  }

  // Strategy B: CSS class design tokens for status
  // LeetCode uses classes like text-sd-easy / text-fixed-positive for Accepted
  // and text-sd-hard / text-fixed-negative for Wrong Answer / Errors
  const statusSelectors = [
    ".text-sd-easy",
    ".text-fixed-positive",
    ".text-sd-hard",
    ".text-fixed-negative",
    '[class*="submission-result"]',
    '[class*="result-state"]',
    '[data-cy="submission-result-status"]',
  ];

  for (const selector of statusSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent?.trim() ?? "";
      const status = parseSubmissionStatus(text);
      if (status) {
        return {
          status,
          identifier: getElementIdentifier(el),
          isFresh: true,
        };
      }
    }
  }

  // Strategy C: Inspect submission result container headings or tabs
  const headings = document.querySelectorAll("div, span, h3, h4");
  for (const el of headings) {
    // Only check elements with direct text or simple child node
    if (el.children.length > 2) continue;

    const text = el.textContent?.trim() ?? "";
    if (text.length === 0 || text.length > 50) continue;

    // Check exact text matching known status
    for (const [key, status] of Object.entries(STATUS_MAP)) {
      if (text.toLowerCase() === key || text.toLowerCase().startsWith(`${key} `)) {
        // Ensure this is inside a submission result panel/container
        if (isInsideSubmissionPanel(el)) {
          return {
            status,
            identifier: getElementIdentifier(el),
            isFresh: false,
          };
        }
      }
    }
  }

  return null;
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
 * Checks if an element is located inside a submission result container or panel.
 */
function isInsideSubmissionPanel(el: Element): boolean {
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < 8) {
    const cls = current.className ? String(current.className).toLowerCase() : "";
    const id = current.id ? String(current.id).toLowerCase() : "";
    const dataPath = current.getAttribute("data-layout-path") ?? "";

    if (
      cls.includes("result") ||
      cls.includes("submission") ||
      id.includes("result") ||
      id.includes("submission") ||
      dataPath.includes("result") ||
      current.getAttribute("data-e2e-locator")?.includes("result")
    ) {
      return true;
    }
    current = current.parentElement;
    depth++;
  }
  return false;
}
