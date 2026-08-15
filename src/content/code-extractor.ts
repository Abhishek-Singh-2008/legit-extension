// ─── Code Extractor & Language Detector ──────────────────────────────────────
// Extracts submitted source code and detects selected programming language
// from LeetCode's Monaco Editor and page controls.

import { logger } from "@/utils/logger";

export interface CodeExtractor {
  /** Returns true if this extractor can read code from the current editor. */
  canExtract(): boolean;
  /** Returns the current editor source code, or null if extraction fails. */
  extractCode(): string | null;
}

// ── Language Detection ────────────────────────────────────────────────────────

const KNOWN_LANGUAGES: readonly string[] = [
  "C++",
  "Java",
  "Python3",
  "Python",
  "JavaScript",
  "TypeScript",
  "C#",
  "C",
  "Go",
  "Rust",
  "Kotlin",
  "Swift",
  "Ruby",
  "Scala",
  "PHP",
  "Dart",
  "Racket",
  "Erlang",
  "Elixir",
  "MySQL",
  "MS SQL Server",
  "Oracle",
];

/**
 * Detects the currently selected programming language on LeetCode.
 */
export function getCurrentLanguage(): string {
  // Strategy 1: Search button elements in the editor header for known language names
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    const text = (btn.textContent ?? "").trim();
    for (const lang of KNOWN_LANGUAGES) {
      if (text === lang || text.startsWith(`${lang}\n`)) {
        return lang;
      }
    }
  }

  // Strategy 2: Check localStorage preferred/global language
  try {
    const globalLang = localStorage.getItem("global_lang") ?? localStorage.getItem("preferred_lang");
    if (globalLang) {
      const cleanLang = globalLang.replace(/"/g, "").trim();
      if (cleanLang.length > 0) return cleanLang;
    }
  } catch {
    /* localStorage access might be restricted */
  }

  // Strategy 3: Check data attributes or dropdown options
  const langSelect = document.querySelector('[data-cy="lang-select"], [class*="lang-select"]');
  if (langSelect?.textContent) {
    const text = langSelect.textContent.trim();
    if (text.length > 0) return text;
  }

  return "python3"; // Fallback default
}

// ── Monaco Editor Code Extractor ──────────────────────────────────────────────

export class MonacoCodeExtractor implements CodeExtractor {
  canExtract(): boolean {
    return Boolean(
      document.querySelector(
        ".monaco-editor, .view-lines, .lines-content, textarea.inputarea, [class*='editor']"
      )
    );
  }

  extractCode(): string | null {
    const candidates: string[] = [];

    // 1. Scan ALL .view-lines and .lines-content containers in DOM
    const lineContainers = document.querySelectorAll(
      ".view-lines, .lines-content, [class*='view-lines']"
    );
    for (const container of lineContainers) {
      const code = extractFromContainer(container);
      if (code && code.trim().length > 0) {
        candidates.push(code.trim());
      }
    }

    // 2. Scan ALL .monaco-editor and editor containers on screen
    const editors = document.querySelectorAll(
      ".monaco-editor, [class*='editor-container'], [class*='code-editor']"
    );
    for (const editor of editors) {
      const text = (editor as HTMLElement).innerText ?? editor.textContent;
      if (text && text.trim().length > 0) {
        const cleaned = text.replace(/\u00a0/g, " ").trim();
        if (cleaned.length > 0) candidates.push(cleaned);
      }
    }

    // 3. Scan textareas
    const textareas = document.querySelectorAll<HTMLTextAreaElement>(
      "textarea.inputarea, textarea"
    );
    for (const ta of textareas) {
      if (ta.value && ta.value.trim().length > 0) {
        candidates.push(ta.value.trim());
      }
    }

    // 4. Try window.monaco via page script if available
    const blobCode = extractCodeViaBlobScript();
    if (blobCode && blobCode.trim().length > 0) {
      candidates.push(blobCode.trim());
    }

    if (candidates.length === 0) return null;

    // Sort candidates by length descending and pick the longest string
    candidates.sort((a, b) => b.length - a.length);

    // Return the longest candidate string
    return candidates[0] ?? null;
  }
}

function extractFromContainer(container: Element): string | null {
  // Method 1: Query individual line elements (.view-line)
  const lineEls = container.querySelectorAll(
    ".view-line, [class*='view-line'], :scope > div"
  );
  if (lineEls.length > 0) {
    const lines = Array.from(lineEls).map((el) =>
      (el.textContent ?? "").replace(/\u00a0/g, " ")
    );
    const code = lines.join("\n");
    if (code.trim().length > 0) return code;
  }

  // Method 2: Direct innerText of container
  const innerText = (container as HTMLElement).innerText;
  if (innerText && innerText.trim().length > 0) {
    return innerText.replace(/\u00a0/g, " ");
  }

  // Method 3: Direct textContent fallback
  const textContent = container.textContent;
  if (textContent && textContent.trim().length > 0) {
    return textContent.replace(/\u00a0/g, " ");
  }

  return null;
}

/**
 * Injects a script via Blob URL to query window.monaco in page context.
 * Bypasses inline-script CSP rules.
 */
function extractCodeViaBlobScript(): string | null {
  try {
    const attrName = "data-lcsync-extracted-code";
    const codeToRun = `
      (function() {
        try {
          if (window.monaco && window.monaco.editor) {
            var models = window.monaco.editor.getModels();
            if (models && models.length > 0) {
              for (var i = 0; i < models.length; i++) {
                var lang = models[i].getLanguageId ? models[i].getLanguageId() : "";
                if (lang !== "json" && lang !== "plaintext") {
                  var val = models[i].getValue();
                  if (val && val.trim().length > 0) {
                    document.documentElement.setAttribute("${attrName}", val);
                    return;
                  }
                }
              }
              var val0 = models[0].getValue();
              if (val0 && val0.trim().length > 0) {
                document.documentElement.setAttribute("${attrName}", val0);
              }
            }
          }
        } catch (e) {}
      })();
    `;

    const blob = new Blob([codeToRun], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const script = document.createElement("script");
    script.src = url;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    URL.revokeObjectURL(url);

    const code = document.documentElement.getAttribute(attrName);
    document.documentElement.removeAttribute(attrName);
    return code;
  } catch {
    return null;
  }
}

// ── Textarea / Generic Code Extractor ─────────────────────────────────────────

export class TextareaCodeExtractor implements CodeExtractor {
  canExtract(): boolean {
    return Boolean(document.querySelector("textarea, .CodeMirror"));
  }

  extractCode(): string | null {
    // Check CodeMirror lines
    const cmLines = document.querySelectorAll(".CodeMirror-line");
    if (cmLines.length > 0) {
      const lines = Array.from(cmLines).map((line) => line.textContent ?? "");
      const code = lines.join("\n");
      if (code.trim().length > 0) return code;
    }

    // Check textareas
    const textareas = document.querySelectorAll<HTMLTextAreaElement>("textarea");
    for (const ta of textareas) {
      if (ta.value && ta.value.trim().length > 0) {
        return ta.value;
      }
    }

    return null;
  }
}

// ── Stub Extractor ────────────────────────────────────────────────────────────

export class StubCodeExtractor implements CodeExtractor {
  canExtract(): boolean {
    return false;
  }

  extractCode(): string | null {
    return null;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns the best code extractor for the current page context.
 */
export function getBestExtractor(): CodeExtractor {
  const monaco = new MonacoCodeExtractor();
  if (monaco.canExtract()) {
    return monaco;
  }

  const textarea = new TextareaCodeExtractor();
  if (textarea.canExtract()) {
    return textarea;
  }

  return new StubCodeExtractor();
}

/**
 * Safely extracts submitted source code.
 * Logs extraction status and returns code or null if extraction fails.
 */
export function extractCodeSafely(): {
  code: string | null;
  language: string;
  extractorName: string;
} {
  const language = getCurrentLanguage();
  const extractor = getBestExtractor();
  const extractorName = extractor.constructor.name;

  if (!extractor.canExtract()) {
    logger.error("Could not safely extract submitted code: No supported editor found.");
    return { code: null, language, extractorName };
  }

  const code = extractor.extractCode();

  if (!code || code.trim().length === 0) {
    logger.error("Could not safely extract submitted code: Code is empty or null.");
    return { code: null, language, extractorName };
  }

  logger.info(`Language: ${language}`);
  logger.info(`Characters: ${code.length}`);
  logger.info(`Extractor: ${extractorName}`);
  logger.info("Code extraction: SUCCESS");

  // ── Development Debug Log (Phase 4 testing) ─────────────────────────────────
  console.log(
    `%c[LCSync Debug: Extracted Code]`,
    "color: #3fb950; font-weight: bold;"
  );
  console.log(`Extractor: ${extractorName}`);
  console.log(`Language:  ${language}`);
  console.log(`Length:    ${code.length} characters`);
  console.log("---------------------- CODE START ----------------------");
  console.log(code);
  console.log("----------------------- CODE END -----------------------");

  return { code, language, extractorName };
}
