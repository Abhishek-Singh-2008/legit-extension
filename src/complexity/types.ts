// ─── Complexity Types ──────────────────────────────────────────────────────────

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ComplexityAnalysis {
  time: string;
  space: string;
  confidence: ConfidenceLevel;
  explanation: string[];
  detectedPatterns: string[];
}
