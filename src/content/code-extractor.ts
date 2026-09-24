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
  // Strategy 1: Search button/dropdown elements in the editor header for known language names
  const langElements = document.querySelectorAll(
    "button, [role='button'], [data-cy*='lang'], [class*='lang-select'], [class*='text-label'], [class*='select-none'], [class*='cursor-pointer']"
  );
  for (const el of langElements) {
    const text = (el.textContent ?? "").trim();
    for (const lang of KNOWN_LANGUAGES) {
      if (
        text === lang ||
        text.toLowerCase() === lang.toLowerCase() ||
        text.startsWith(`${lang}\n`) ||
        text.startsWith(`${lang} `)
      ) {
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

  // Strategy 3: Check code element class (e.g. language-python, language-cpp)
  const codeEl = document.querySelector('[class*="language-"], [class*="lang-"]');
  if (codeEl) {
    const cls = codeEl.className;
    const match = cls.match(/(?:language|lang)-([a-zA-Z0-9+#]+)/i);
    if (match?.[1]) {
      const found = match[1].toLowerCase();
      if (found === "python" || found === "python3") return "Python3";
      if (found === "cpp" || found === "c++") return "C++";
      if (found === "java") return "Java";
      if (found === "javascript" || found === "js") return "JavaScript";
      if (found === "typescript" || found === "ts") return "TypeScript";
      return match[1];
    }
  }

  return "Python3"; // Fallback default
}

// ── Monaco Editor & Page Code Extractor ────────────────────────────────────────

export class MonacoCodeExtractor implements CodeExtractor {
  canExtract(): boolean {
    return Boolean(
      document.querySelector(
        ".monaco-editor, .view-lines, .lines-content, textarea.inputarea, [class*='editor'], pre, code, .cm-content, [class*='code-container']"
      )
    );
  }

  extractCode(): string | null {
    // 1. Primary Strategy: Try window.monaco model directly from page memory
    // This gives 100% pristine code with exact formatting, indents and comments
    const blobCode = extractCodeViaBlobScript();
    if (blobCode && blobCode.trim().length > 0) {
      logger.info("[CodeExtractor] Successfully extracted code from Monaco memory model.");
      return blobCode;
    }

    // 2. Secondary Strategy: Extract cleanly from rendered lines (.view-line)
    const lineContainers = document.querySelectorAll(
      ".view-lines, .lines-content, [class*='view-lines']"
    );
    for (const container of lineContainers) {
      const lineEls = container.querySelectorAll(".view-line, [class*='view-line']");
      if (lineEls.length > 0) {
        const lines = Array.from(lineEls).map((el) =>
          (el.textContent ?? "").replace(/\u00a0/g, " ")
        );
        const code = lines.join("\n");
        if (code.trim().length > 0) {
          logger.info("[CodeExtractor] Extracted code from DOM .view-line elements.");
          return code;
        }
      }
    }

    // 3. Strategy: CodeMirror 6 (.cm-line)
    const cmLines = document.querySelectorAll(".cm-content .cm-line, .cm-line");
    if (cmLines.length > 0) {
      const cmText = Array.from(cmLines)
        .map((el) => (el.textContent ?? "").replace(/\u00a0/g, " "))
        .join("\n");
      if (cmText.trim().length > 0) {
        logger.info("[CodeExtractor] Extracted code from CodeMirror elements.");
        return cmText;
      }
    }

    // 4. Strategy: Dedicated submission code container (<pre><code>) on /submissions/ pages
    const codeBlocks = document.querySelectorAll("pre code, [class*='submission-code'] code");
    for (const block of codeBlocks) {
      const text = block.textContent?.replace(/\u00a0/g, " ");
      if (text && text.trim().length > 0) {
        return text;
      }
    }

    return null;
  }
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

  logger.debug(`Extracted code length: ${code.length} characters using ${extractorName}`);
  return { code, language, extractorName };
}
