// ─── DOM Utilities ────────────────────────────────────────────────────────────
// Resilient DOM helpers used by content script modules.
// Keeps selectors in one place so they're easy to update when LeetCode changes.

import { logger } from "@/utils/logger";

/**
 * Wait for a DOM element matching `selector` to appear, up to `timeoutMs`.
 * Uses MutationObserver for efficiency instead of polling.
 */
export function waitForElement(
  selector: string,
  timeoutMs = 10_000,
  root: Element | Document = document
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = root.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(root === document ? document.body : (root as Element), {
      childList: true,
      subtree: true,
    });
  });
}

/**
 * Safely get the text content of the first matching element.
 */
export function getTextContent(
  selector: string,
  root: Element | Document = document
): string | null {
  const el = root.querySelector(selector);
  if (!el) {
    logger.debug(`[DOM] Element not found: ${selector}`);
    return null;
  }
  return el.textContent?.trim() ?? null;
}

/**
 * Safely get an attribute from the first matching element.
 */
export function getAttribute(
  selector: string,
  attribute: string,
  root: Element | Document = document
): string | null {
  const el = root.querySelector(selector);
  return el?.getAttribute(attribute) ?? null;
}
