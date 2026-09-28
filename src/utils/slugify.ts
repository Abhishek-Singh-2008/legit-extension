// ─── Slug Utilities ───────────────────────────────────────────────────────────

/**
 * Extract the LeetCode problem slug from a URL.
 * e.g. "https://leetcode.com/problems/two-sum/" → "two-sum"
 */
export function slugFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    // pathname: /problems/two-sum/description  OR  /problems/two-sum/
    const match = /^\/problems\/([^/]+)\/?/.exec(pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Convert any string to a URL-safe slug.
 * e.g. "Two Sum" → "two-sum"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Convert a slug to title case for display.
 * e.g. "two-sum" → "Two Sum"
 */
export function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Map a LeetCode language label to a file extension.
 * Covers all official LeetCode languages and common variants.
 */
export const LANGUAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  python: "py",
  python3: "py",
  pythondata: "py",
  pandas: "py",
  java: "java",
  cpp: "cpp",
  "c++": "cpp",
  javascript: "js",
  typescript: "ts",
  c: "c",
  csharp: "cs",
  "c#": "cs",
  golang: "go",
  go: "go",
  rust: "rs",
  kotlin: "kt",
  swift: "swift",
  ruby: "rb",
  scala: "scala",
  php: "php",
  dart: "dart",
  racket: "rkt",
  erlang: "erl",
  elixir: "ex",
  mysql: "sql",
  mssql: "sql",
  oraclesql: "sql",
  oracle: "sql",
  postgresql: "sql",
  postgres: "sql",
  sql: "sql",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  clojure: "clj",
  haskell: "hs",
  lua: "lua",
  julia: "jl",
  nim: "nim",
  zig: "zig",
  ocaml: "ml",
  r: "r",
} as const;

export function languageToExtension(language: string): string {
  const key = language.toLowerCase().trim().replace(/[\s_-]+/g, "");
  if (LANGUAGE_EXTENSIONS[key]) {
    return LANGUAGE_EXTENSIONS[key];
  }
  const rawKey = language.toLowerCase().trim();
  return LANGUAGE_EXTENSIONS[rawKey] ?? "txt";
}
