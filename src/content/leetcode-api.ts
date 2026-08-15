// ─── LeetCode Internal API Client ─────────────────────────────────────────────
// Fetches submission data from LeetCode's own GraphQL API.
// This is called AFTER an Accepted verdict is detected, to get the actual code.
//
// No secrets required — requests are made with the user's existing session
// cookie, which Chrome automatically attaches because we're on leetcode.com.

import { logger } from "@/utils/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SubmissionDetail {
  code: string;
  language: string;
  submissionId: string;
}

// ── GraphQL Queries ────────────────────────────────────────────────────────────

const RECENT_SUBMISSIONS_QUERY = `
  query recentAcSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id
      lang
      timestamp
      titleSlug
    }
  }
`;

const SUBMISSION_DETAIL_QUERY = `
  query submissionDetails($submissionId: Int!) {
    submissionDetails(submissionId: $submissionId) {
      code
      lang {
        name
        verboseName
      }
    }
  }
`;

// ── Internal Helpers ──────────────────────────────────────────────────────────

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch("https://leetcode.com/graphql/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrftoken": getCsrfToken(),
      Referer: location.href,
    },
    credentials: "include",
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`LeetCode GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as { data?: T; errors?: unknown[] };

  if (json.errors && json.errors.length > 0) {
    throw new Error(`LeetCode GraphQL returned errors: ${JSON.stringify(json.errors)}`);
  }

  if (!json.data) {
    throw new Error("LeetCode GraphQL response has no data.");
  }

  return json.data;
}

/**
 * Reads the CSRF token from the csrftoken cookie.
 * LeetCode requires this for API calls.
 */
function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;)\s*csrftoken=([^;]+)/);
  return match ? match[1] : "";
}

// ── Username Detection ─────────────────────────────────────────────────────────

/**
 * Gets the currently logged-in LeetCode username.
 * Tries multiple DOM locations before falling back to API.
 */
export async function getCurrentUsername(): Promise<string | null> {
  // Strategy 1: Check meta tags or global JS state
  const metaEl = document.querySelector('meta[name="user-login"]');
  if (metaEl?.getAttribute("content")) {
    return metaEl.getAttribute("content");
  }

  // Strategy 2: Check localStorage / sessionStorage
  for (const key of ["LEETCODE_USER_NAME", "user_name", "username"]) {
    try {
      const val = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      if (val && val.length > 0) return val.replace(/"/g, "");
    } catch { /* ignore */ }
  }

  // Strategy 3: Profile link in nav
  const profileLinks = document.querySelectorAll<HTMLAnchorElement>('a[href^="/u/"]');
  for (const link of profileLinks) {
    const match = link.href.match(/\/u\/([^/?#]+)/);
    if (match?.[1]) return match[1];
  }

  // Strategy 4: Ask the GraphQL API
  try {
    const data = await graphql<{ userStatus: { username: string } }>(
      `query { userStatus { username } }`,
      {}
    );
    if (data.userStatus.username) return data.userStatus.username;
  } catch (err) {
    logger.warn("[LeetCodeAPI] Could not fetch username via GraphQL:", err);
  }

  return null;
}

// ── Submission Fetching ────────────────────────────────────────────────────────

interface RecentSubmission {
  id: string;
  lang: string;
  timestamp: string;
  titleSlug: string;
}

interface RecentSubmissionsData {
  recentAcSubmissionList: RecentSubmission[];
}

interface SubmissionDetailsData {
  submissionDetails: {
    code: string;
    lang: {
      name: string;
      verboseName: string;
    };
  };
}

/**
 * Fetches the most recent accepted submission for a problem slug.
 *
 * This is the primary approach for code extraction. Called right after
 * an Accepted verdict is detected in the DOM.
 *
 * @param slug - The problem slug (e.g. "two-sum")
 * @param username - The logged-in user's LeetCode username
 */
export async function fetchLatestAcceptedSubmission(
  slug: string,
  username: string
): Promise<SubmissionDetail | null> {
  logger.info(`[LeetCodeAPI] Fetching recent accepted submissions for ${username}...`);

  // Step 1: Get list of recent accepted submissions
  let recentSubmissions: RecentSubmission[] = [];
  try {
    const data = await graphql<RecentSubmissionsData>(RECENT_SUBMISSIONS_QUERY, {
      username,
      limit: 10,
    });
    recentSubmissions = data.recentAcSubmissionList ?? [];
  } catch (err) {
    logger.error("[LeetCodeAPI] Failed to fetch recent submissions list:", err);
    return null;
  }

  // Step 2: Find the matching submission for this problem slug
  const match = recentSubmissions.find((s) => s.titleSlug === slug);
  if (!match) {
    logger.warn(`[LeetCodeAPI] No recent accepted submission found for slug: ${slug}`);
    // Fallback: try the first submission regardless of slug (in case just submitted)
    if (recentSubmissions.length > 0) {
      logger.info("[LeetCodeAPI] Using most recent submission as fallback.");
      const fallback = recentSubmissions[0];
      return fetchSubmissionDetail(fallback.id, fallback.lang);
    }
    return null;
  }

  return fetchSubmissionDetail(match.id, match.lang);
}

/**
 * Fetches the code and language for a specific submission ID.
 */
async function fetchSubmissionDetail(
  submissionId: string,
  langName: string
): Promise<SubmissionDetail | null> {
  logger.info(`[LeetCodeAPI] Fetching details for submission #${submissionId}...`);

  try {
    const data = await graphql<SubmissionDetailsData>(SUBMISSION_DETAIL_QUERY, {
      submissionId: parseInt(submissionId, 10),
    });

    const detail = data.submissionDetails;
    if (!detail?.code) {
      logger.warn("[LeetCodeAPI] Submission details returned no code.");
      return null;
    }

    return {
      code: detail.code,
      language: detail.lang?.verboseName ?? detail.lang?.name ?? langName,
      submissionId,
    };
  } catch (err) {
    logger.error(`[LeetCodeAPI] Failed to fetch submission detail #${submissionId}:`, err);
    return null;
  }
}

/**
 * High-level helper: gets code for the current problem after acceptance.
 * Returns null if username or code cannot be found.
 */
export async function fetchAcceptedCode(slug: string): Promise<{
  code: string;
  language: string;
} | null> {
  const username = await getCurrentUsername();
  if (!username) {
    logger.error("[LeetCodeAPI] Cannot fetch code: not logged in or username not found.");
    return null;
  }

  // Brief delay to let LeetCode record the submission server-side
  await new Promise((res) => setTimeout(res, 1500));

  const detail = await fetchLatestAcceptedSubmission(slug, username);
  if (!detail) {
    return null;
  }

  return { code: detail.code, language: detail.language };
}
