// ─── LeetCode Types ──────────────────────────────────────────────────────────

export type Difficulty = "Easy" | "Medium" | "Hard" | "Unknown";

export interface LeetCodeProblem {
  title: string;
  slug: string;
  url: string;
  difficulty: Difficulty;
}

export interface LeetCodeSubmission {
  title: string;
  slug: string;
  url: string;
  difficulty: Difficulty;
  language: string;
  code: string;
  submittedAt: string; // ISO 8601
  submissionHash?: string; // SHA-256 of code, for deduplication
  timeComplexity?: string;
  spaceComplexity?: string;
  complexityExplanation?: string;
  complexity?: import("@/complexity").ComplexityAnalysis;
}

export type SubmissionStatus =
  | "Accepted"
  | "Wrong Answer"
  | "Time Limit Exceeded"
  | "Runtime Error"
  | "Compile Error"
  | "Memory Limit Exceeded"
  | "Output Limit Exceeded"
  | "Unknown";
