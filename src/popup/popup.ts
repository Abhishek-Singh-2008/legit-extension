// ─── Popup Script — Phase 10: Sync History & Dashboard ───────────────────────
// Displays connection status, current problem, settings shortcuts,
// summary statistics, and the latest 5 sync history records.
//
// Security containment:
//   - Token is never loaded or exposed here.
//   - Commit links are validated to start with https://github.com/ before opening.

import { logger } from "@/utils/logger";
import type { ExtensionSettings, SyncHistoryRecord, SyncStats } from "@/types/settings";
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
    const [connRes, settingsRes, problemRes, historyRes, statsRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: "GET_CONNECTION_STATUS" }),
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
      chrome.runtime.sendMessage({ type: "GET_CURRENT_PROBLEM" }),
      chrome.runtime.sendMessage({ type: "GET_SYNC_HISTORY", limit: 5 }),
      chrome.runtime.sendMessage({ type: "GET_SYNC_STATS" }),
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
    if (statsRes?.ok) {
      renderStats(statsRes.data as SyncStats);
    }
    if (historyRes?.ok) {
      renderHistory(historyRes.data as SyncHistoryRecord[]);
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
    if (avatarEl) {
      const avatarSrc =
        status.avatarUrl || `https://github.com/${status.username}.png`;
      avatarEl.alt = status.username;
      avatarEl.onerror = () => {
        avatarEl.onerror = null;
        const initial = (status.username?.charAt(0) ?? "U").toUpperCase();
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="18" fill="#238636"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold">${initial}</text></svg>`;
        avatarEl.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      };
      avatarEl.src = avatarSrc;
    }
  } else {
    accountConnected?.classList.add("hidden");
    accountDisconnected?.classList.remove("hidden");
  }
}

function renderSettings(s: Partial<ExtensionSettings>): void {
  // Repository
  const repoDisplay = $id("repo-display");
  if (repoDisplay) {
    const owner = s.githubRepoOwner;
    const name = s.githubRepoName;
    repoDisplay.textContent = owner && name ? `${owner}/${name}` : "— not configured —";
  }

  // Branch
  const branchDisplay = $id("branch-display");
  if (branchDisplay) branchDisplay.textContent = s.githubBranch ?? "—";

  // Auto sync toggle
  const autoSyncToggle = $id<HTMLInputElement>("auto-sync-toggle");
  if (autoSyncToggle) autoSyncToggle.checked = s.autoSync ?? true;
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

function renderStats(stats: SyncStats): void {
  const totalEl = $id("stats-total");
  const rateEl = $id("stats-rate");

  if (totalEl) totalEl.textContent = String(stats.total);
  if (rateEl) {
    const rate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
    rateEl.textContent = `${rate}%`;
  }
}

function renderHistory(history: SyncHistoryRecord[]): void {
  const container = $id("history-list");
  if (!container) return;

  if (!history || history.length === 0) {
    container.innerHTML = `<span class="history-list__empty">No sync history yet</span>`;
    return;
  }

  let html = "";
  for (const item of history) {
    const when = timeAgo(new Date(item.timestamp));
    let icon = "✓";
    let iconClass = "history-item__icon--success";

    switch (item.status) {
      case "success":
        icon = "✓";
        iconClass = "history-item__icon--success";
        break;
      case "duplicate":
        icon = "○";
        iconClass = "history-item__icon--skipped";
        break;
      case "skipped":
        icon = "○";
        iconClass = "history-item__icon--skipped";
        break;
      case "auth":
        icon = "⚠";
        iconClass = "history-item__icon--warning";
        break;
      case "failed":
      default:
        icon = "⚠";
        iconClass = "history-item__icon--error";
        break;
    }

    const diffBadge = item.difficulty
      ? `<span class="history-item__badge history-item__badge--${item.difficulty.toLowerCase()}">${item.difficulty}</span>`
      : "";

    const langBadge = item.language
      ? `<span class="history-item__lang">${escapeHtml(item.language)}</span>`
      : "";

    // Commit link safety: only if valid HTTPS GitHub URL
    const safeCommitUrl =
      item.commitUrl && item.commitUrl.startsWith("https://github.com/")
        ? item.commitUrl
        : null;

    const linkHtml = safeCommitUrl
      ? `<a href="${escapeHtml(safeCommitUrl)}" class="history-item__link" data-commit-url="${escapeHtml(safeCommitUrl)}">View commit ↗</a>`
      : "";

    html += `
      <div class="history-item">
        <span class="history-item__icon ${iconClass}">${icon}</span>
        <div class="history-item__info">
          <div class="history-item__top">
            <span class="history-item__title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
            ${diffBadge}
          </div>
          <div class="history-item__sub">
            ${langBadge}
            <span class="history-item__time">${when}</span>
            <span class="history-item__status-text history-item__status-text--${item.status}">${item.status}</span>
          </div>
          ${item.errorMessage ? `<span class="history-item__error">${escapeHtml(item.errorMessage)}</span>` : ""}
          ${linkHtml}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Bind safe click handlers for commit links
  const links = container.querySelectorAll<HTMLAnchorElement>(".history-item__link");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const url = link.dataset.commitUrl;
      if (url && url.startsWith("https://github.com/")) {
        chrome.tabs.create({ url });
      }
    });
  });
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents(): void {
  // Connect GitHub → redirect to Options page
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

  // Clear popup history button
  $id("clear-history-popup-btn")?.addEventListener("click", async () => {
    if (confirm("Clear recent sync history?")) {
      await chrome.runtime.sendMessage({ type: "CLEAR_SYNC_HISTORY" });
      const [historyRes, statsRes] = await Promise.all([
        chrome.runtime.sendMessage({ type: "GET_SYNC_HISTORY", limit: 5 }),
        chrome.runtime.sendMessage({ type: "GET_SYNC_STATS" }),
      ]);
      if (historyRes?.ok) renderHistory(historyRes.data as SyncHistoryRecord[]);
      if (statsRes?.ok) renderStats(statsRes.data as SyncStats);
      showToast("History cleared", "info");
    }
  });

  // Test GitHub connection
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

  // Open settings / dashboard
  $id("settings-btn")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (isNaN(diff) || diff < 0) return "just now";
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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
