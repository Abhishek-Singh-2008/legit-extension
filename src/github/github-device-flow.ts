// ─── GitHub OAuth Device Flow (Client-Side Only, Zero Secrets) ───────────────
// Implements RFC 8628 Device Authorization Grant for GitHub.
// No backend server required — 100% serverless, private, and direct.

import { logger } from "@/utils/logger";

// Default public Client ID registered for Legit LeetCode Sync extension (or user custom)
// Device flow client IDs are public by RFC 8628 spec.
export const DEFAULT_GITHUB_CLIENT_ID = "Ov23liPTtEqvvgGYNRnq";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export type PollResult =
  | { status: "success"; accessToken: string }
  | { status: "pending" }
  | { status: "slow_down"; newInterval?: number }
  | { status: "expired"; error: string }
  | { status: "denied"; error: string }
  | { status: "error"; error: string };

/**
 * Step 1: Request device and user verification code from GitHub.
 */
export async function requestDeviceCode(
  clientId: string = DEFAULT_GITHUB_CLIENT_ID
): Promise<DeviceCodeResponse> {
  const url = "https://github.com/login/device/code";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: "repo",
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const message = (errData as { error_description?: string })?.error_description || `HTTP ${res.status}`;
    logger.error("[DeviceFlow] Failed to request device code:", message);
    throw new Error(`Device Flow Error: ${message}`);
  }

  const data = await res.json();
  if (!data.device_code || !data.user_code) {
    throw new Error("Invalid response from GitHub Device Flow.");
  }

  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri || "https://github.com/login/device",
    expires_in: data.expires_in || 900,
    interval: data.interval || 5,
  };
}

/**
 * Step 2: Poll GitHub for authorization completion.
 */
export async function pollDeviceToken(
  deviceCode: string,
  clientId: string = DEFAULT_GITHUB_CLIENT_ID
): Promise<PollResult> {
  const url = "https://github.com/login/oauth/access_token";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (!res.ok) {
      return { status: "error", error: `HTTP ${res.status}` };
    }

    const data = await res.json();

    if (data.access_token) {
      return { status: "success", accessToken: data.access_token };
    }

    if (data.error === "authorization_pending") {
      return { status: "pending" };
    }

    if (data.error === "slow_down") {
      return { status: "slow_down", newInterval: data.interval };
    }

    if (data.error === "expired_token") {
      return { status: "expired", error: "Verification code expired. Please try again." };
    }

    if (data.error === "access_denied") {
      return { status: "denied", error: "Access was denied on GitHub." };
    }

    return {
      status: "error",
      error: data.error_description || data.error || "Unknown authorization response",
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
