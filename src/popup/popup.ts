// ─── Popup Script — Phase 7 UI Polish ────────────────────────────────────────
// Uses GET_CONNECTION_STATUS (not GET_SETTINGS) for auth display so the token
// is never accessible in the popup context.

import { logger } from "@/utils/logger";
import type { ExtensionSettings, LastSyncRecord } from "@/types/settings";
import type { LeetCodeProblem } from "@/types/leetcode";
import type { ConnectionStatus } from "@/storage/storage";

// ── DOM Helpers ───────────────────────────────────────────────────────────────

function $<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

function $id<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initVersion();
  loadAndRender();
  bindEvents();
});

function initVersion(): void {
  const manifest = chrome.runtime.getManifest();
  const el = $id("version-label");
  if (el) el.textContent = `v${manifest.version}`;
}

async function loadAndRender(): Promise<void> {
  try {
    const [connRes, settingsRes, problemRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: "GET_CONNECTION_STATUS" }),
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
      chrome.runtime.sendMessage({ type: "GET_CURRENT_PROBLEM" }),
    ]);

    if (connRes?.ok) {
      renderConnection(connRes.data as ConnectionStatus);
    }
    if (settingsRes?.ok) {
      renderSettings(settingsRes.data as Partial<ExtensionSettings>);
    }
    if (problemRes?.ok) {
      renderProblem(problemRes.data as LeetCodeProblem | null);
    }
  } catch (err) {
    logger.error("Failed to load popup data:", err);
  }
}

// ── Renderers ─────────────────────────────────────────────────────────────────

function renderConnection(status: ConnectionStatus): void {
  const badge = $id("status-badge");
  const accountConnected = $id("account-connected");
  const accountDisconnected = $id("account-disconnected");
  const usernameEl = $id("github-username");
  const avatarEl = $<HTMLImageElement>("#account-avatar");

  const isConnected = status.connected && Boolean(status.username);

  // Header badge
  if (badge) {
    badge.textContent = isConnected ? "Connected" : "Not connected";
    badge.className = `badge badge--${isConnected ? "connected" : "disconnected"}`;
  }

  if (isConnected && status.username) {
    accountConnected?.classList.remove("hidden");
    accountDisconnected?.classList.add("hidden");
    if (usernameEl) usernameEl.textContent = `@${status.username}`;
    if (avatarEl && status.avatarUrl) {
      avatarEl.src = status.avatarUrl;
      avatarEl.alt = status.username;
    }
  } else {
    accountConnected?.classList.add("hidden");
    accountDisconnected?.classList.remove("hidden");
  }
}

function renderSettings(s: Partial<ExtensionSettings>): void {
  // Repository — show configured repo or the hardcoded target
  const repoDisplay = $id("repo-display");
  if (repoDisplay) {
    repoDisplay.textContent =
      s.repository ?? "Abhishek-Singh-2008/leetcode-solutions-test";
  }

  // Branch
  const branchDisplay = $id("branch-display");
  if (branchDisplay) branchDisplay.textContent = s.branch ?? "main";

  // Auto sync toggle
  const autoSyncToggle = $id<HTMLInputElement>("auto-sync-toggle");
  if (autoSyncToggle) autoSyncToggle.checked = s.autoSync ?? true;

  // Last sync
  renderLastSync(s.lastSync);
}

function renderProblem(problem: LeetCodeProblem | null): void {
  const detected = $id("problem-detected");
  const none = $id("problem-none");
  const titleEl = $id("problem-title");
  const slugEl = $id("problem-slug");
  const badgeEl = $id("problem-difficulty");

  if (!detected || !none) return;

  if (!problem) {
    detected.classList.add("hidden");
    none.classList.remove("hidden");
    return;
  }

  detected.classList.remove("hidden");
  none.classList.add("hidden");

  if (titleEl) titleEl.textContent = problem.title;
  if (slugEl) slugEl.textContent = problem.slug;
  if (badgeEl) {
    badgeEl.textContent = problem.difficulty;
    badgeEl.className = `problem__badge problem__badge--${problem.difficulty.toLowerCase()}`;
  }
}

function renderLastSync(ls: LastSyncRecord | undefined): void {
  const container = $id("last-sync-content");
  if (!container) return;

  if (!ls) {
    container.innerHTML = `<span class="last-sync__empty">No syncs yet</span>`;
    return;
  }

  const when = timeAgo(new Date(ls.timestamp));
  const icon = ls.success ? "✓" : "✗";
  const iconClass = ls.success ? "last-sync__icon--success" : "last-sync__icon--error";

  const linkHtml = ls.commitUrl
    ? `<a href="${escapeHtml(ls.commitUrl)}" class="last-sync__link" id="commit-link"
         target="_blank" rel="noopener noreferrer">View commit ↗</a>`
    : "";

  container.innerHTML = `
    <div class="last-sync__item">
      <span class="last-sync__icon ${iconClass}">${icon}</span>
      <div class="last-sync__info">
        <span class="last-sync__title">${escapeHtml(ls.title)}</span>
        <span class="last-sync__time">${when}</span>
        ${ls.errorMessage ? `<span class="last-sync__error">${escapeHtml(ls.errorMessage)}</span>` : ""}
        ${linkHtml}
      </div>
    </div>
  `;

  // External link must open via chrome.tabs.create (popup context blocks target=_blank)
  const commitLink = $id("commit-link");
  if (commitLink && ls.commitUrl) {
    commitLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: ls.commitUrl! });
    });
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents(): void {
  // Connect GitHub → redirect to Options page (auth is done there)
  $id("connect-btn")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Auto sync toggle
  $id("auto-sync-toggle")?.addEventListener("change", async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    await chrome.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: { autoSync: checked },
    });
    logger.debug(`Auto sync set to: ${checked}`);
  });

  // Test GitHub connection — actually tests stored token against GET /user
  $id("test-btn")?.addEventListener("click", async () => {
    const btn = $id<HTMLButtonElement>("test-btn");
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = "Testing…";

    try {
      const connRes = await chrome.runtime.sendMessage({ type: "GET_CONNECTION_STATUS" });
      if (!connRes?.ok || !connRes.data?.connected) {
        showToast("Not connected — open Settings to connect GitHub", "error");
        return;
      }
      // PING the worker as a health check
      const pingRes = await chrome.runtime.sendMessage({ type: "PING" });
      if (pingRes?.ok) {
        showToast(`✓ Connected as @${connRes.data.username ?? "—"}`, "success");
      } else {
        showToast("Background worker error", "error");
      }
    } catch {
      showToast("Could not reach background worker", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Test Connection";
    }
  });

  // Open settings
  $id("settings-btn")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message: string, type: "success" | "error" | "info"): void {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}
