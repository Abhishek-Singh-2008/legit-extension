// ─── Main Complexity Analyzer ──────────────────────────────────────────────────
// Static analyzer for Time and Space complexity estimation.

import type { ComplexityAnalysis, ConfidenceLevel } from "@/complexity/types";
import { tokenizeCode } from "@/complexity/tokenizer";
import { parseStructure } from "@/complexity/parser";
import { logger } from "@/utils/logger";

/**
 * Analyzes the static time and space complexity of a given source code solution.
 * Runs 100% locally with zero external network or AI dependencies.
 */
export function analyzeComplexity(code: string, language: string): ComplexityAnalysis {
  if (!code || code.trim().length === 0) {
    return {
      time: "O(1)",
      space: "O(1)",
      confidence: "high",
      explanation: [
        "Empty source code provided",
        "No constant or dynamic operations detected",
      ],
      detectedPatterns: ["Empty solution"],
    };
  }

  try {
    const codeInfo = tokenizeCode(code, language);
    const struct = parseStructure(codeInfo, language);

    const timeResult = evaluateTimeComplexity(struct);
    const spaceResult = evaluateSpaceComplexity(struct);

    // Compute overall confidence (lowest of time & space confidence)
    const confidence: ConfidenceLevel =
      timeResult.confidence === "low" || spaceResult.confidence === "low"
        ? "low"
        : timeResult.confidence === "medium" || spaceResult.confidence === "medium"
        ? "medium"
        : "high";

    const explanation = [...timeResult.explanation, ...spaceResult.explanation];
    const detectedPatterns = Array.from(new Set([...timeResult.patterns, ...spaceResult.patterns]));

    const analysis: ComplexityAnalysis = {
      time: timeResult.time,
      space: spaceResult.space,
      confidence,
      explanation,
      detectedPatterns,
    };

    logger.debug(
      `[Complexity] Analyzed ${language}: Time ${analysis.time}, Space ${analysis.space} [Confidence: ${analysis.confidence}]`
    );

    return analysis;
  } catch (err) {
    logger.warn("[Complexity] Static analysis error fallback:", err);
    return {
      time: "O(?)",
      space: "O(?)",
      confidence: "low",
      explanation: [
        "Static analysis encountered an unhandled syntax structure",
        "Manual complexity check recommended",
      ],
      detectedPatterns: ["Analysis error fallback"],
    };
  }
}

interface EvaluationResult {
  time: string;
  confidence: ConfidenceLevel;
  explanation: string[];
  patterns: string[];
}

function evaluateTimeComplexity(struct: ReturnType<typeof parseStructure>): EvaluationResult {
  const explanation: string[] = [];
  const patterns: string[] = [];
  let time = "O(1)";
  let confidence: ConfidenceLevel = "high";

  // 1. Recursion evaluation
  if (struct.recursion.detected) {
    patterns.push(`Recursion (${struct.recursion.pattern})`);
    if (struct.recursion.pattern === "EXPONENTIAL_BRANCHING") {
      time = "O(2^n)";
      confidence = "medium";
      explanation.push("Detected branching recursive calls (e.g. f(n-1) + f(n-2))");
    } else if (struct.recursion.pattern === "LOGARITHMIC_REDUCTION") {
      time = "O(log n)";
      confidence = "high";
      explanation.push("Detected divide-and-conquer recursive reduction (e.g. f(n/2))");
    } else {
      time = "O(n)";
      confidence = "medium";
      explanation.push("Detected linear recursive call stack (e.g. f(n-1))");
    }
    return { time, confidence, explanation, patterns };
  }

  // 2. Sorting evaluation
  if (struct.hasSorting) {
    patterns.push("Built-in sort operation");
    if (struct.maxLoopDepth > 0) {
      time = struct.maxLoopDepth === 1 ? "O(n log n)" : `O(n^${struct.maxLoopDepth} log n)`;
      explanation.push(`Built-in sort operation executed within ${struct.maxLoopDepth} loop(s)`);
    } else {
      time = "O(n log n)";
      explanation.push("Built-in sort operation (O(n log n))");
    }
    return { time, confidence, explanation, patterns };
  }

  // 3. Loop evaluation
  if (struct.loops.length > 0) {
    const maxDepthLoop = struct.loops.reduce(
      (max, curr) => (curr.depth > max.depth ? curr : max),
      struct.loops[0]!
    );

    if (maxDepthLoop.depth === 1) {
      if (maxDepthLoop.stepType === "LOGARITHMIC") {
        time = "O(log n)";
        patterns.push("Logarithmic loop / Binary search");
        explanation.push("Single loop with logarithmic variable step (dividing/multiplying by factor)");
      } else {
        time = "O(n)";
        patterns.push("Single linear loop");
        explanation.push("Single linear loop iterating over input");
      }
    } else if (maxDepthLoop.depth === 2) {
      if (maxDepthLoop.isLogNestedInLinear || maxDepthLoop.isNestedInLog) {
        time = "O(n log n)";
        patterns.push("Linear loop with nested logarithmic loop");
        explanation.push("Nested linear loop inside logarithmic loop structure");
      } else {
        time = "O(n²)";
        patterns.push("2 nested linear loops");
        explanation.push("Detected 2 nested linear loops iterating over input size");
      }
    } else if (maxDepthLoop.depth === 3) {
      time = "O(n³)";
      patterns.push("3 nested linear loops");
      explanation.push("Detected 3 nested linear loops");
    } else if (maxDepthLoop.depth > 3) {
      time = `O(n^${maxDepthLoop.depth})`;
      patterns.push(`${maxDepthLoop.depth} nested linear loops`);
      explanation.push(`Detected ${maxDepthLoop.depth} nested linear loops`);
    }

    // Check for sequential loops over distinct variable bounds (e.g., O(n + m))
    if (struct.maxLoopDepth === 1 && struct.sequentialLoopBounds.length >= 2) {
      const boundsStr = struct.sequentialLoopBounds.slice(0, 2).join(" + ");
      time = `O(${boundsStr})`;
      patterns.push("Sequential loops over distinct inputs");
      explanation.push(`Detected sequential non-nested loops iterating over separate variables (${boundsStr})`);
    }
  } else if (struct.searches.hasLinearSearch) {
    time = "O(n)";
    patterns.push("Linear collection search");
    explanation.push("Detected linear search method call (indexOf / includes / list.index)");
  } else {
    patterns.push("Constant time operations");
    explanation.push("No loops or recursive calls detected (constant time execution)");
  }

  return { time, confidence, explanation, patterns };
}

interface SpaceEvaluationResult {
  space: string;
  confidence: ConfidenceLevel;
  explanation: string[];
  patterns: string[];
}

function evaluateSpaceComplexity(struct: ReturnType<typeof parseStructure>): SpaceEvaluationResult {
  const explanation: string[] = [];
  const patterns: string[] = [];
  let space = "O(1)";
  let confidence: ConfidenceLevel = "high";

  // Check 2D allocations (Matrix / Grid)
  if (struct.allocations.has2DAllocation) {
    space = "O(nm)";
    patterns.push("2D Matrix / Grid allocation");
    explanation.push("Allocated 2D grid/matrix proportional to input dimensions (O(nm) auxiliary space)");
    return { space, confidence, explanation, patterns };
  }

  // Check 1D allocations & Hash tables
  if (struct.allocations.has1DAllocation || struct.allocations.hasHashMapOrSet) {
    space = "O(n)";
    if (struct.allocations.hasHashMapOrSet) {
      patterns.push("HashMap / HashSet allocation");
      explanation.push("Allocated hash table / dictionary proportional to input elements (O(n) auxiliary space)");
    } else {
      patterns.push("1D Array / List allocation");
      explanation.push("Allocated 1D list/array proportional to input size (O(n) auxiliary space)");
    }
    return { space, confidence, explanation, patterns };
  }

  // Check Recursion stack space
  if (struct.recursion.detected) {
    if (struct.recursion.pattern === "LOGARITHMIC_REDUCTION") {
      space = "O(log n)";
      patterns.push("Logarithmic recursion call stack");
      explanation.push("Auxiliary call stack depth proportional to log n");
    } else {
      space = "O(n)";
      patterns.push("Linear recursion call stack");
      explanation.push("Auxiliary call stack depth proportional to input size n");
    }
    return { space, confidence, explanation, patterns };
  }

  // Scalar variables only
  patterns.push("Scalar variables only");
  explanation.push("No additional data structure proportional to input size detected (O(1) auxiliary space)");

  return { space, confidence, explanation, patterns };
}
