// ─── Popup Script ─────────────────────────────────────────────────────────────

import { logger } from "@/utils/logger";
import type { ExtensionSettings } from "@/types/settings";
import type { LeetCodeProblem } from "@/types/leetcode";

// ── DOM helpers ────────────────────────────────────────────────────────────────

function $<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
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
  const el = document.getElementById("version-label");
  if (el) el.textContent = `v${manifest.version}`;
}

async function loadAndRender(): Promise<void> {
  try {
    // Load settings and current problem in parallel
    const [settingsRes, problemRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
      chrome.runtime.sendMessage({ type: "GET_CURRENT_PROBLEM" }),
    ]);

    if (settingsRes?.ok) {
      render(settingsRes.data as Partial<ExtensionSettings>);
    }

    if (problemRes?.ok) {
      renderProblem(problemRes.data as LeetCodeProblem | null);
    }
  } catch (err) {
    logger.error("Failed to load data in popup:", err);
  }
}

function render(s: Partial<ExtensionSettings>): void {
  const isConnected = Boolean(s.githubUsername);

  // Badge
  const badge = $<HTMLElement>("#status-badge");
  badge.textContent = isConnected ? "Connected" : "Not connected";
  badge.className = `badge badge--${isConnected ? "connected" : "disconnected"}`;

  // Account section
  const accountConnected = $<HTMLElement>("#account-connected");
  const accountDisconnected = $<HTMLElement>("#account-disconnected");
  const usernameEl = $<HTMLElement>("#github-username");

  if (isConnected && s.githubUsername) {
    accountConnected.classList.remove("hidden");
    accountDisconnected.classList.add("hidden");
    usernameEl.textContent = `@${s.githubUsername}`;
  } else {
    accountConnected.classList.add("hidden");
    accountDisconnected.classList.remove("hidden");
  }

  // Repository
  const repoDisplay = $<HTMLElement>("#repo-display");
  repoDisplay.textContent = s.repository ?? "—";

  // Branch
  const branchDisplay = $<HTMLElement>("#branch-display");
  branchDisplay.textContent = s.branch ?? "main";

  // Auto sync toggle
  const autoSyncToggle = $<HTMLInputElement>("#auto-sync-toggle");
  autoSyncToggle.checked = s.autoSync ?? true;

  // Last sync
  renderLastSync(s);
}

function renderProblem(problem: LeetCodeProblem | null): void {
  const detected = document.getElementById("problem-detected");
  const none = document.getElementById("problem-none");
  const titleEl = document.getElementById("problem-title");
  const slugEl = document.getElementById("problem-slug");
  const badgeEl = document.getElementById("problem-difficulty");

  if (!detected || !none || !titleEl || !slugEl || !badgeEl) return;

  if (!problem) {
    detected.classList.add("hidden");
    none.classList.remove("hidden");
    return;
  }

  detected.classList.remove("hidden");
  none.classList.add("hidden");

  titleEl.textContent = problem.title;
  slugEl.textContent = problem.slug;

  // Difficulty badge
  const diff = problem.difficulty.toLowerCase();
  badgeEl.textContent = problem.difficulty;
  badgeEl.className = `problem__badge problem__badge--${diff}`;
}

function renderLastSync(s: Partial<ExtensionSettings>): void {
  const container = $<HTMLElement>("#last-sync-content");
  const ls = s.lastSync;

  if (!ls) {
    container.innerHTML = `<span class="last-sync__empty">No syncs yet</span>`;
    return;
  }

  const when = timeAgo(new Date(ls.timestamp));
  const icon = ls.success ? "✓" : "✗";
  const iconColor = ls.success ? "color: var(--color-success)" : "color: var(--color-danger)";

  container.innerHTML = `
    <div class="last-sync__item">
      <span class="last-sync__icon" style="${iconColor}">${icon}</span>
      <div class="last-sync__info">
        <span class="last-sync__title">${escapeHtml(ls.title)}</span>
        <span class="last-sync__time">${when}</span>
      </div>
    </div>
  `;
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents(): void {
  // Connect GitHub
  document.getElementById("connect-btn")?.addEventListener("click", () => {
    // TODO Phase 5
    showToast("GitHub auth coming in Phase 5!", "info");
  });

  // Auto sync toggle
  document
    .getElementById("auto-sync-toggle")
    ?.addEventListener("change", async (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      await chrome.runtime.sendMessage({
        type: "SAVE_SETTINGS",
        settings: { autoSync: checked },
      });
      logger.debug(`Auto sync set to: ${checked}`);
    });

  // Test connection
  document.getElementById("test-btn")?.addEventListener("click", async () => {
    const btn = $<HTMLButtonElement>("#test-btn");
    btn.disabled = true;
    btn.textContent = "Testing…";

    try {
      const response = await chrome.runtime.sendMessage({ type: "PING" });
      if (response?.ok) {
        showToast("✓ Background worker is alive", "success");
      } else {
        showToast("Background worker error", "error");
      }
    } catch {
      showToast("Could not reach background", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Test GitHub Connection";
    }
  });

  // Open settings
  document.getElementById("settings-btn")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showToast(message: string, _type: "success" | "error" | "info"): void {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.cssText = `
    position: fixed; bottom: 48px; left: 16px; right: 16px;
    background: var(--color-surface-2); border: 1px solid var(--color-border);
    border-radius: 6px; padding: 8px 12px; font-size: 12px;
    color: var(--color-text); text-align: center; z-index: 999;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
