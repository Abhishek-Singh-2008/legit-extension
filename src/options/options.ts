// ─── Options Script — Phase 5 ─────────────────────────────────────────────────
// Handles GitHub authentication using a fine-grained Personal Access Token.
// Token containment rules enforced here:
//   - Token is read from the input field, sent to service worker, then cleared.
//   - Token is NEVER stored in JS variables beyond the message send.
//   - Token is NEVER logged, even in error paths.

import { logger } from "@/utils/logger";
import type { ExtensionSettings, FolderFormat } from "@/types/settings";
import type { ConnectionStatus } from "@/storage/storage";

// ── Helpers ───────────────────────────────────────────────────────────────────

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initVersion();
  loadAndRender();
  bindEvents();
});

function initVersion(): void {
  const manifest = chrome.runtime.getManifest();
  $("version-label").textContent = `v${manifest.version}`;
}

async function loadAndRender(): Promise<void> {
  try {
    // Load connection status (no token) separately from settings
    const connResponse = await chrome.runtime.sendMessage({ type: "GET_CONNECTION_STATUS" });
    if (connResponse?.ok) {
      renderAccount(connResponse.data as ConnectionStatus);
    }

    // Load rest of settings for the form (token is already stripped by service worker)
    const settingsResponse = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (settingsResponse?.ok) {
      populateForm(settingsResponse.data as Partial<ExtensionSettings>);
    }
  } catch (err) {
    logger.error("Failed to load settings in options:", err);
  }
}

function populateForm(s: Partial<ExtensionSettings>): void {
  ($<HTMLInputElement>("repo-input")).value = s.repository ?? "";
  ($<HTMLInputElement>("branch-input")).value = s.branch ?? "main";
  ($<HTMLInputElement>("basedir-input")).value = s.baseDirectory ?? "algorithms";
  ($<HTMLSelectElement>("folder-format")).value = s.folderFormat ?? "{slug}";
  ($<HTMLInputElement>("commit-format")).value =
    s.commitMessageFormat ?? "feat: add {title} solution";
  ($<HTMLInputElement>("auto-sync")).checked = s.autoSync ?? true;
  ($<HTMLInputElement>("gen-readme")).checked = s.generateReadme ?? true;
  ($<HTMLInputElement>("notifications")).checked = s.notifications ?? true;
}

function renderAccount(status: ConnectionStatus): void {
  const isConnected = status.connected && Boolean(status.username);

  $("account-connected").classList.toggle("hidden", !isConnected);
  $("account-disconnected").classList.toggle("hidden", isConnected);

  if (isConnected && status.username) {
    $("account-username").textContent = `@${status.username}`;
    const avatarEl = $<HTMLImageElement>("account-avatar");
    if (status.avatarUrl) {
      avatarEl.src = status.avatarUrl;
      avatarEl.alt = status.username;
    }
    $("account-repo").textContent = "Abhishek-Singh-2008/leetcode-solutions";
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents(): void {
  // Show/hide token toggle
  $("pat-toggle").addEventListener("click", () => {
    const input = $<HTMLInputElement>("pat-input");
    input.type = input.type === "password" ? "text" : "password";
  });

  // Connect button — verify & save fine-grained PAT
  $("connect-btn").addEventListener("click", handleConnect);

  // Also allow pressing Enter in the PAT field
  $<HTMLInputElement>("pat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleConnect();
  });

  // Disconnect button
  $("disconnect-btn").addEventListener("click", handleDisconnect);

  // Save settings button
  $("save-btn").addEventListener("click", saveRepoSettings);

  $("reset-btn").addEventListener("click", async () => {
    if (
      !confirm(
        "This will clear ALL settings including your stored credentials. Continue?"
      )
    )
      return;
    await chrome.storage.local.clear();
    location.reload();
  });
}

async function handleConnect(): Promise<void> {
  const patInput = $<HTMLInputElement>("pat-input");
  const token = patInput.value.trim();

  hideError();

  if (!token) {
    showError("Please enter your fine-grained Personal Access Token.");
    return;
  }

  setConnecting(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CONNECT_GITHUB",
      token,
      // Token travels from here → service worker → Authorization header.
      // It goes nowhere else.
    });

    // Immediately clear the input so the token doesn't linger in the DOM
    patInput.value = "";

    if (response?.ok) {
      const account = response.data as {
        login: string;
        name: string | null;
        avatarUrl: string;
        repoFullName: string;
        repoPrivate: boolean;
      };
      renderAccount({
        connected: true,
        username: account.login,
        avatarUrl: account.avatarUrl,
      });
    } else {
      showError(response?.error ?? "Verification failed. Please try again.");
    }
  } catch (err) {
    // Log the error object without any token reference
    logger.error("Failed to send CONNECT_GITHUB message:", err instanceof Error ? err.message : "unknown");
    showError("Could not reach the extension service worker. Try reloading.");
  } finally {
    setConnecting(false);
  }
}

async function handleDisconnect(): Promise<void> {
  if (!confirm("Disconnect your GitHub account? You will need to re-enter your token to reconnect.")) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: "DISCONNECT_GITHUB" });
    renderAccount({ connected: false });
  } catch (err) {
    logger.error("Failed to disconnect:", err instanceof Error ? err.message : "unknown");
  }
}

// ── Connecting State ──────────────────────────────────────────────────────────

function setConnecting(loading: boolean): void {
  const btn = $<HTMLButtonElement>("connect-btn");
  const btnText = $("connect-btn-text");
  const spinner = $("connect-spinner");

  btn.disabled = loading;
  btnText.textContent = loading ? "Verifying…" : "Verify & Connect";
  spinner.classList.toggle("hidden", !loading);
}

// ── Error Display ─────────────────────────────────────────────────────────────

function showError(message: string): void {
  const el = $("connect-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideError(): void {
  const el = $("connect-error");
  el.classList.add("hidden");
  el.textContent = "";
}

// ── Save Repo Settings ────────────────────────────────────────────────────────

async function saveRepoSettings(): Promise<void> {
  const btn = $<HTMLButtonElement>("save-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  // Only non-credential settings are saved here.
  // Token saving only happens through CONNECT_GITHUB in the service worker.
  const settings: Partial<ExtensionSettings> = {
    repository: ($<HTMLInputElement>("repo-input")).value.trim() || undefined,
    branch: ($<HTMLInputElement>("branch-input")).value.trim() || "main",
    baseDirectory:
      ($<HTMLInputElement>("basedir-input")).value.trim() || "algorithms",
    folderFormat: ($<HTMLSelectElement>("folder-format")).value as FolderFormat,
    commitMessageFormat:
      ($<HTMLInputElement>("commit-format")).value.trim() ||
      "feat: add {title} solution",
    autoSync: ($<HTMLInputElement>("auto-sync")).checked,
    generateReadme: ($<HTMLInputElement>("gen-readme")).checked,
    notifications: ($<HTMLInputElement>("notifications")).checked,
  };

  try {
    await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
    showSaveStatus("Saved ✓");
  } catch (err) {
    logger.error("Failed to save settings:", err instanceof Error ? err.message : "unknown");
    showSaveStatus("Save failed ✗");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Settings";
  }
}

function showSaveStatus(msg: string): void {
  const el = $("save-status");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2500);
}
