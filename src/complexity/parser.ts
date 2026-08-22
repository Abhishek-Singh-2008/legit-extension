// ─── Code Structure Parser ───────────────────────────────────────────────────
// Structural parser that identifies loops, recursion, allocations, and searches.

import type { CleanedCodeInfo, Token } from "@/complexity/tokenizer";

export type LoopStepType = "LINEAR" | "LOGARITHMIC";

export interface LoopInfo {
  line: number;
  depth: number;
  stepType: LoopStepType;
  boundVar?: string;
  isNestedInLog: boolean;
  isLogNestedInLinear: boolean;
}

export interface RecursionInfo {
  detected: boolean;
  pattern?: "LINEAR_REDUCTION" | "LOGARITHMIC_REDUCTION" | "EXPONENTIAL_BRANCHING";
  funcName?: string;
}

export interface AllocationInfo {
  has1DAllocation: boolean;
  has2DAllocation: boolean;
  hasHashMapOrSet: boolean;
  allocationDetails: string[];
}

export interface SearchInfo {
  hasLinearSearch: boolean;
  searchDetails: string[];
}

export interface ParsedCodeStructure {
  loops: LoopInfo[];
  maxLoopDepth: number;
  hasSorting: boolean;
  sortingDetails: string[];
  recursion: RecursionInfo;
  allocations: AllocationInfo;
  searches: SearchInfo;
  sequentialLoopBounds: string[];
}

export function parseStructure(codeInfo: CleanedCodeInfo, language: string): ParsedCodeStructure {
  const isPython = language.toLowerCase().includes("python");
  const { tokens, lines, rawCleanCode } = codeInfo;

  // 1. Analyze Loops & Nesting
  const loopResult = analyzeLoops(lines, tokens, isPython);

  // 2. Analyze Sorting
  const sortResult = analyzeSorting(rawCleanCode);

  // 3. Analyze Recursion
  const recursionResult = analyzeRecursion(rawCleanCode, tokens);

  // 4. Analyze Data Structure Allocations
  const allocationResult = analyzeAllocations(rawCleanCode);

  // 5. Analyze Search Operations
  const searchResult = analyzeSearches(rawCleanCode, isPython);

  return {
    loops: loopResult.loops,
    maxLoopDepth: loopResult.maxDepth,
    hasSorting: sortResult.hasSorting,
    sortingDetails: sortResult.details,
    recursion: recursionResult,
    allocations: allocationResult,
    searches: searchResult,
    sequentialLoopBounds: loopResult.sequentialBounds,
  };
}

function analyzeLoops(
  lines: { text: string; indent: number; lineNum: number }[],
  tokens: Token[],
  isPython: boolean
): { loops: LoopInfo[]; maxDepth: number; sequentialBounds: string[] } {
  const loops: LoopInfo[] = [];
  let maxDepth = 0;
  const sequentialBoundsSet = new Set<string>();

  if (isPython) {
    const activeLoops: { loopObj: LoopInfo; indent: number }[] = [];

    for (const l of lines) {
      const isLoop = /^(for\s+|while\s+)/.test(l.text);

      if (isLoop) {
        while (
          activeLoops.length > 0 &&
          activeLoops[activeLoops.length - 1]!.indent >= l.indent
        ) {
          activeLoops.pop();
        }

        const stepType = detectStepType(l.text);
        const boundVar = extractBoundVar(l.text);
        if (boundVar) sequentialBoundsSet.add(boundVar);

        const depth = activeLoops.length + 1;
        if (depth > maxDepth) maxDepth = depth;

        const loopObj: LoopInfo = {
          line: l.lineNum,
          depth,
          stepType,
          boundVar,
          isNestedInLog: activeLoops.some((parent) => parent.loopObj.stepType === "LOGARITHMIC"),
          isLogNestedInLinear: false,
        };

        loops.push(loopObj);
        activeLoops.push({ loopObj, indent: l.indent });
      } else {
        while (
          activeLoops.length > 0 &&
          l.indent <= activeLoops[activeLoops.length - 1]!.indent
        ) {
          activeLoops.pop();
        }

        // If line inside active loop body contains log step, upgrade loop stepType
        if (activeLoops.length > 0 && detectStepType(l.text) === "LOGARITHMIC") {
          activeLoops[activeLoops.length - 1]!.loopObj.stepType = "LOGARITHMIC";
        }
      }
    }
  } else {
    // Brace-based languages (JS, TS, Java, C++)
    let braceLevel = 0;
    const loopStack: { loopObj: LoopInfo; startBraceLevel: number }[] = [];

    for (const l of lines) {
      const isLoop = /\b(for|while|do)\b/.test(l.text) || /\.forEach\s*\(|\.map\s*\(/.test(l.text);

      const openBraces = (l.text.match(/\{/g) || []).length;
      const closeBraces = (l.text.match(/\}/g) || []).length;

      if (isLoop) {
        const stepType = detectStepType(l.text);
        const boundVar = extractBoundVar(l.text);
        if (boundVar) sequentialBoundsSet.add(boundVar);

        const depth = loopStack.length + 1;
        if (depth > maxDepth) maxDepth = depth;

        const loopObj: LoopInfo = {
          line: l.lineNum,
          depth,
          stepType,
          boundVar,
          isNestedInLog: loopStack.some((parent) => parent.loopObj.stepType === "LOGARITHMIC"),
          isLogNestedInLinear: false,
        };

        loops.push(loopObj);
        loopStack.push({ loopObj, startBraceLevel: braceLevel + 1 });
      } else if (loopStack.length > 0) {
        // If line inside active loop body contains log step, upgrade loop stepType
        if (detectStepType(l.text) === "LOGARITHMIC") {
          loopStack[loopStack.length - 1]!.loopObj.stepType = "LOGARITHMIC";
        }
      }

      braceLevel += openBraces - closeBraces;
      if (braceLevel < 0) braceLevel = 0;

      while (loopStack.length > 0 && loopStack[loopStack.length - 1]!.startBraceLevel > braceLevel) {
        loopStack.pop();
      }
    }
  }

  // Update isLogNestedInLinear flags after scanning completes
  for (const l of loops) {
    if (l.stepType === "LOGARITHMIC" && l.depth > 1) {
      l.isLogNestedInLinear = true;
    }
  }

  // Fallback check for single line loops without braces or simple while loops
  if (maxDepth === 0 && /\b(for|while)\b/.test(tokens.map((t) => t.value).join(" "))) {
    maxDepth = 1;
    loops.push({
      line: 1,
      depth: 1,
      stepType: "LINEAR",
      isNestedInLog: false,
      isLogNestedInLinear: false,
    });
  }

  return { loops, maxDepth, sequentialBounds: Array.from(sequentialBoundsSet) };
}

function detectStepType(lineText: string): LoopStepType {
  if (
    /\/\/\=|\/\=|>>\=|\*\=|\b(mid\s*=)|\/\s*2|>>\s*1/.test(lineText) ||
    /Math\.(floor|trunc)\s*\(\s*.*?\/\s*2/.test(lineText)
  ) {
    return "LOGARITHMIC";
  }
  return "LINEAR";
}

function extractBoundVar(lineText: string): string | undefined {
  const rangeMatch = lineText.match(/range\s*\(\s*(?:[0-9]+\s*,\s*)?([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  if (rangeMatch && rangeMatch[1]) return rangeMatch[1];

  const lenMatch = lineText.match(/(?:len|length|size)\s*[\(\.\[]\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  if (lenMatch && lenMatch[1]) return lenMatch[1];

  const condMatch = lineText.match(/[<>=]+\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  if (condMatch && condMatch[1] && !["0", "1", "true", "false", "null", "undefined"].includes(condMatch[1])) {
    return condMatch[1];
  }

  return undefined;
}

function analyzeSorting(code: string): { hasSorting: boolean; details: string[] } {
  const details: string[] = [];
  let hasSorting = false;

  if (/\b(sorted\(|\.sort\()/.test(code)) {
    hasSorting = true;
    details.push("Built-in sort operation (.sort / sorted)");
  } else if (/Arrays\.sort|Collections\.sort/.test(code)) {
    hasSorting = true;
    details.push("Java built-in sort (Arrays.sort / Collections.sort)");
  } else if (/std::sort|\bsort\s*\(/.test(code)) {
    hasSorting = true;
    details.push("C++ std::sort operation");
  }

  return { hasSorting, details };
}

function analyzeRecursion(code: string, tokens: Token[]): RecursionInfo {
  // Find function declarations
  const funcNames: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.value === "def" || t.value === "function") {
      const next = tokens[i + 1];
      if (next && next.type === "IDENTIFIER" && next.value !== "__init__") {
        funcNames.push(next.value);
      }
    } else if (["public", "private", "protected", "static"].includes(t.value)) {
      // Java / C++ methods
      let j = i + 1;
      while (j < tokens.length && tokens[j]!.type === "IDENTIFIER") {
        j++;
      }
      if (j < tokens.length && tokens[j]!.value === "(" && tokens[j - 1]) {
        const fn = tokens[j - 1]!.value;
        if (!["main", "Solution", "for", "while", "if"].includes(fn)) {
          funcNames.push(fn);
        }
      }
    }
  }

  for (const fn of funcNames) {
    const fnCalls = tokens.filter((t) => t.value === fn);
    if (fnCalls.length >= 2) {
      // Check call parameters for patterns
      const codeFn = code;

      // Exponential branching pattern e.g. f(n-1) + f(n-2)
      const expMatch = new RegExp(`\\b${fn}\\s*\\([^)]*-[^)]*\\)[^+*-]*\\+[^+*-]*\\b${fn}\\s*\\(`, "g");
      if (expMatch.test(codeFn) || fnCalls.length >= 3) {
        return {
          detected: true,
          pattern: "EXPONENTIAL_BRANCHING",
          funcName: fn,
        };
      }

      // Logarithmic reduction pattern e.g. f(n / 2)
      const logMatch = new RegExp(`\\b${fn}\\s*\\([^)]*(\\/|>>)[^)]*\\)`, "g");
      if (logMatch.test(codeFn)) {
        return {
          detected: true,
          pattern: "LOGARITHMIC_REDUCTION",
          funcName: fn,
        };
      }

      // Linear reduction pattern e.g. f(n - 1)
      return {
        detected: true,
        pattern: "LINEAR_REDUCTION",
        funcName: fn,
      };
    }
  }

  return { detected: false };
}

function analyzeAllocations(code: string): AllocationInfo {
  const details: string[] = [];
  let has1D = false;
  let has2D = false;
  let hasHash = false;

  // Hash structures (Map, Set, dict, HashSet, HashMap, unordered_map, unordered_set)
  if (
    /\b(new\s+Map|new\s+Set|dict\s*\(|set\s*\(|defaultdict|Counter|HashMap|HashSet|unordered_map|unordered_set)\b/.test(code) ||
    /\w+\s*=\s*\{\s*\}/.test(code) ||
    /\w+\s*=\s*dict\b/.test(code)
  ) {
    hasHash = true;
    details.push("Hash table / Dictionary / Set allocation");
  }

  // 2D allocations
  if (
    /\[\s*\[.*?\]\s*for\s+.*?in\s+.*?\]/.test(code) ||
    /Array\.\s*from\s*\(\s*\{.*?\}\s*,\s*\(\)\s*=>\s*new\s+Array/.test(code) ||
    /new\s+[a-zA-Z0-9_]+\s*\[[^\]]+\]\s*\[[^\]]+\]/.test(code) ||
    /vector\s*<\s*vector\s*<.*?>>/.test(code)
  ) {
    has2D = true;
    details.push("2D Matrix / Grid allocation");
  }

  // 1D allocations
  if (
    /\[\s*0\s*\]\s*\*\s*\w+/.test(code) ||
    /\[.*?for\s+.*?in\s+.*?\]/.test(code) ||
    /\w+\s*=\s*\[\s*\]/.test(code) ||
    /\.(append|push)\s*\(/.test(code) ||
    /\b(new\s+Array|new\s+ArrayList|new\s+vector|new\s+int\[|new\s+String\[|new\s+boolean\[|list\(\))\b/.test(code) ||
    /std::vector<[^>]+>\s+\w+\([^)]+\)/.test(code)
  ) {
    has1D = true;
    details.push("1D Array / Vector list allocation");
  }

  return {
    has1DAllocation: has1D,
    has2DAllocation: has2D,
    hasHashMapOrSet: hasHash,
    allocationDetails: details,
  };
}

function analyzeSearches(code: string, isPython: boolean): SearchInfo {
  const details: string[] = [];
  let hasLinear = false;

  if (/\b(indexOf|includes|\.index\()\b/.test(code)) {
    hasLinear = true;
    details.push("Linear search method call (indexOf / includes / index)");
  }

  if (isPython && /\b(in)\b/.test(code)) {
    // Check if 'in' is used on a list/string rather than 'for x in range(...)'
    if (!/\bfor\s+\w+\s+in\s+(range|enumerate|zip)\b/.test(code) && /\bif\s+.*?\bin\b/.test(code)) {
      // If not checking set/dict
      if (!/\b(set|dict|HashSet|HashMap)\b/.test(code)) {
        hasLinear = true;
        details.push("Linear membership search (x in list)");
      }
    }
  }

  return {
    hasLinearSearch: hasLinear,
    searchDetails: details,
  };
}
