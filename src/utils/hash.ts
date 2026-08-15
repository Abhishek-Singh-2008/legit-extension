// ─── Cryptographic Hash Utilities ─────────────────────────────────────────────
// Uses the Web Crypto API — no external dependencies.

/**
 * Returns a lowercase hex SHA-256 digest of the given string.
 * Used to deduplicate submissions: if the same code is submitted twice,
 * we skip the second push to avoid creating redundant commits.
 */
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
