// ─── Options Script — Phase 10: Sync History & Dashboard ───────────────────────
// Handles GitHub authentication, repository selection, general settings,
// and the Phase 10 Sync Dashboard & Analytics.
//
// Token containment rules enforced here:
//   - Token is read from the input field, sent to service worker, then cleared.
//   - Token is NEVER stored in JS variables beyond the message send.
//   - Token is NEVER logged, even in error paths.
//   - No hardcoded GitHub owner, repo, or branch values.

import { logger } from "@/utils/logger";
import type { ExtensionSettings, FolderFormat, SyncHistoryRecord, SyncStats } from "@/types/settings";
import type { ConnectionStatus } from "@/storage/storage";
import type { GitHubRepository, GitHubBranch } from "@/types/github";

// ── State ─────────────────────────────────────────────────────────────────────
let cachedHistory: SyncHistoryRecord[] = [];

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
    const [connResponse, settingsResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: "GET_CONNECTION_STATUS" }),
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
    ]);

    if (connResponse?.ok) {
      const status = connResponse.data as ConnectionStatus;
      renderAccount(status);
      if (status.connected) {
        await loadRepos(status);
      }
    }

    if (settingsResponse?.ok) {
      populateForm(settingsResponse.data as Partial<ExtensionSettings>);
    }

    await loadDashboard();
  } catch (err) {
    logger.error("Failed to load settings in options:", err);
  }
}

function populateForm(s: Partial<ExtensionSettings>): void {
  ($<HTMLInputElement>("basedir-input")).value = s.baseDirectory ?? "algorithms";
  ($<HTMLSelectElement>("folder-format")).value = s.folderFormat ?? "{slug}";
  ($<HTMLInputElement>("commit-format")).value =
    s.commitMessageFormat ?? "feat: add {title} solution";
  ($<HTMLInputElement>("auto-sync")).checked = s.autoSync ?? true;
  ($<HTMLInputElement>("gen-readme")).checked = s.generateReadme ?? true;
  ($<HTMLInputElement>("notifications")).checked = s.notifications ?? true;
}

// ── Dashboard & Sync History (Phase 10) ───────────────────────────────────────

async function loadDashboard(): Promise<void> {
  try {
    const [statsRes, historyRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: "GET_SYNC_STATS" }),
      chrome.runtime.sendMessage({ type: "GET_SYNC_HISTORY" }),
    ]);

    if (statsRes?.ok) {
      renderStats(statsRes.data as SyncStats);
    }

    if (historyRes?.ok) {
      cachedHistory = (historyRes.data as SyncHistoryRecord[]) ?? [];
      applyAndRenderFilteredHistory();
    }
  } catch (err) {
    logger.error("Failed to load dashboard:", err);
  }
}

function renderStats(stats: SyncStats): void {
  $("dash-total-syncs").textContent = String(stats.total);

  const rate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
  $("dash-success-rate").textContent = `${rate}%`;

  $("dash-easy-cnt").textContent = String(stats.byDifficulty.Easy);
  $("dash-medium-cnt").textContent = String(stats.byDifficulty.Medium);
  $("dash-hard-cnt").textContent = String(stats.byDifficulty.Hard);

  // Render top 2 languages
  const sortedLangs = Object.entries(stats.byLanguage).sort((a, b) => b[1] - a[1]);
  if (sortedLangs.length === 0) {
    $("dash-top-langs").textContent = "—";
  } else {
    const topStr = sortedLangs
      .slice(0, 2)
      .map(([lang, cnt]) => `${lang} (${cnt})`)
      .join(", ");
    $("dash-top-langs").textContent = topStr;
  }
}

function applyAndRenderFilteredHistory(): void {
  const searchQuery = ($<HTMLInputElement>("dash-search-input")).value.trim().toLowerCase();
  const statusFilter = ($<HTMLSelectElement>("dash-status-filter")).value;

  const filtered = cachedHistory.filter((item) => {
    // 1. Search match
    const matchSearch =
      searchQuery.length === 0 ||
      item.title.toLowerCase().includes(searchQuery) ||
      item.slug.toLowerCase().includes(searchQuery);

    // 2. Status match
    const matchStatus = statusFilter === "all" || item.status === statusFilter;

    return matchSearch && matchStatus;
  });

  renderHistoryList(filtered);
}

function renderHistoryList(records: SyncHistoryRecord[]): void {
  const container = $("dash-history-list");

  if (!records || records.length === 0) {
    container.innerHTML = `<span class="dash-history-empty">No sync records match your filters.</span>`;
    return;
  }

  let html = "";
  for (const item of records) {
    const when = timeAgo(new Date(item.timestamp));

    let icon = "✓";
    let statusClass = "dash-item__status--success";

    switch (item.status) {
      case "success":
        icon = "✓";
        statusClass = "dash-item__status--success";
        break;
      case "duplicate":
        icon = "○";
        statusClass = "dash-item__status--duplicate";
        break;
      case "skipped":
        icon = "○";
        statusClass = "dash-item__status--skipped";
        break;
      case "auth":
        icon = "⚠";
        statusClass = "dash-item__status--auth";
        break;
      case "failed":
      default:
        icon = "⚠";
        statusClass = "dash-item__status--failed";
        break;
    }

    const diffBadge = item.difficulty
      ? `<span class="dash-item__badge dash-item__badge--${item.difficulty.toLowerCase()}">${item.difficulty}</span>`
      : "";

    const langBadge = item.language
      ? `<span class="dash-item__lang">${escapeHtml(item.language)}</span>`
      : "";

    const repoInfo = item.repository
      ? `<span class="dash-item__repo">${escapeHtml(item.repository)}${item.branch ? `@${escapeHtml(item.branch)}` : ""}</span>`
      : "";

    // Commit URL validation: only HTTPS GitHub URLs are used
    const safeCommitUrl =
      item.commitUrl && item.commitUrl.startsWith("https://github.com/")
        ? item.commitUrl
        : null;

    const commitLink = safeCommitUrl
      ? `<a href="${escapeHtml(safeCommitUrl)}" target="_blank" rel="noopener noreferrer" class="dash-item__link">View Commit ↗</a>`
      : "";

    html += `
      <div class="dash-item">
        <div class="dash-item__header">
          <span class="dash-item__status ${statusClass}">${icon} ${item.status}</span>
          <span class="dash-item__title">${escapeHtml(item.title)}</span>
          ${diffBadge}
          <span class="dash-item__time">${when}</span>
        </div>
        <div class="dash-item__details">
          ${langBadge}
          ${repoInfo}
          ${item.filePath ? `<span class="dash-item__path">${escapeHtml(item.filePath)}</span>` : ""}
          ${commitLink}
        </div>
        ${item.errorMessage ? `<div class="dash-item__error">${escapeHtml(item.errorMessage)}</div>` : ""}
      </div>
    `;
  }

  container.innerHTML = html;
}

// ── Account Rendering ──────────────────────────────────────────────────────────

function renderAccount(status: ConnectionStatus): void {
  const isConnected = status.connected && Boolean(status.username);

  $("account-connected").classList.toggle("hidden", !isConnected);
  $("account-disconnected").classList.toggle("hidden", isConnected);
  $("repo-config-section").classList.toggle("hidden", !isConnected);

  if (isConnected && status.username) {
    $("account-username").textContent = `@${status.username}`;
    const avatarEl = $<HTMLImageElement>("account-avatar");
    const avatarSrc =
      status.avatarUrl || `https://github.com/${status.username}.png`;

    avatarEl.alt = status.username;
    avatarEl.onerror = () => {
      avatarEl.onerror = null;
      const initial = (status.username?.charAt(0) ?? "U").toUpperCase();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="#238636"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="22" font-weight="bold">${initial}</text></svg>`;
      avatarEl.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    };
    avatarEl.src = avatarSrc;
  }
}

// ── Repository Loading & Selection ────────────────────────────────────────────

async function loadRepos(status?: ConnectionStatus): Promise<void> {
  const repoSelect = $<HTMLSelectElement>("repo-select");
  const hint = $("repo-select-hint");

  repoSelect.disabled = true;
  hint.textContent = "Loading your repositories…";
  repoSelect.innerHTML = '<option value="">— Loading… —</option>';

  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_USER_REPOS" });
    if (!res?.ok) {
      hint.textContent = `Error: ${res?.error ?? "Failed to load repositories."}`;
      return;
    }

    const repos = res.data as GitHubRepository[];
    repoSelect.innerHTML = '<option value="">— Select repository —</option>';
    for (const repo of repos) {
      const opt = document.createElement("option");
      opt.value = repo.full_name;
      opt.textContent = `${repo.name}${repo.private ? " 🔒" : ""}`;
      opt.dataset.defaultBranch = repo.default_branch;
      repoSelect.appendChild(opt);
    }

    hint.textContent = `${repos.length} repositories found.`;
    repoSelect.disabled = false;

    // Pre-select saved repo if available
    if (status?.repoOwner && status?.repoName) {
      const saved = `${status.repoOwner}/${status.repoName}`;
      if (repoSelect.querySelector(`option[value="${saved}"]`)) {
        repoSelect.value = saved;
        await loadBranches(saved, status.branch);
      }
    }
  } catch (err) {
    hint.textContent = "Could not load repositories. Check your connection.";
    logger.error("Failed to load repos:", err);
  }
}

async function loadBranches(repoFullName: string, preselectBranch?: string): Promise<void> {
  const branchSelect = $<HTMLSelectElement>("branch-select");
  const saveBtn = $<HTMLButtonElement>("save-repo-btn");

  branchSelect.disabled = true;
  saveBtn.disabled = true;
  hideRepoStatus();
  branchSelect.innerHTML = '<option value="">— Loading branches… —</option>';

  const repoSelect = $<HTMLSelectElement>("repo-select");
  const selectedOption = repoSelect.options[repoSelect.selectedIndex];
  const defaultBranch = selectedOption?.dataset.defaultBranch || "main";

  let branches: GitHubBranch[] = [];

  try {
    const res = await chrome.runtime.sendMessage({
      type: "GET_REPO_BRANCHES",
      repo: repoFullName,
    });

    if (res?.ok && Array.isArray(res.data) && res.data.length > 0) {
      branches = res.data as GitHubBranch[];
    }
  } catch (err) {
    logger.error("Failed to load branches via API:", err);
  }

  branchSelect.innerHTML = "";

  if (branches.length > 0) {
    for (const branch of branches) {
      const opt = document.createElement("option");
      opt.value = branch.name;
      opt.textContent = `${branch.name}${branch.protected ? " 🔒" : ""}`;
      branchSelect.appendChild(opt);
    }
  } else {
    // If listing branches returned 0 results or failed, fallback to repository default branch
    const opt = document.createElement("option");
    opt.value = defaultBranch;
    opt.textContent = `${defaultBranch} (default)`;
    branchSelect.appendChild(opt);
  }

  // Pre-select: previously saved branch > repo default branch > first branch option
  const toSelect = preselectBranch ?? defaultBranch;
  if (branchSelect.querySelector(`option[value="${toSelect}"]`)) {
    branchSelect.value = toSelect;
  } else if (branchSelect.options.length > 0) {
    branchSelect.value = branchSelect.options[0].value;
  }

  branchSelect.disabled = false;
  saveBtn.disabled = false;
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents(): void {
  // Token toggle
  $("pat-toggle").addEventListener("click", () => {
    const input = $<HTMLInputElement>("pat-input");
    input.type = input.type === "password" ? "text" : "password";
  });

  // Connect & Enter key
  $("connect-btn").addEventListener("click", handleConnect);
  $<HTMLInputElement>("pat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleConnect();
  });

  // Disconnect
  $("disconnect-btn").addEventListener("click", handleDisconnect);

  // Repo select change
  $<HTMLSelectElement>("repo-select").addEventListener("change", async (e) => {
    const selected = (e.target as HTMLSelectElement).value;
    const branchSelect = $<HTMLSelectElement>("branch-select");
    const saveBtn = $<HTMLButtonElement>("save-repo-btn");

    if (!selected) {
      branchSelect.disabled = true;
      branchSelect.innerHTML = '<option value="">— Select a repository first —</option>';
      saveBtn.disabled = true;
      return;
    }

    await loadBranches(selected);
  });

  // Reload repos button
  $("reload-repos-btn").addEventListener("click", async () => {
    const connRes = await chrome.runtime.sendMessage({ type: "GET_CONNECTION_STATUS" });
    if (connRes?.ok) {
      await loadRepos(connRes.data as ConnectionStatus);
    }
  });

  // Save repository config
  $("save-repo-btn").addEventListener("click", handleSaveRepo);

  // Dashboard search & status filter
  $<HTMLInputElement>("dash-search-input").addEventListener("input", applyAndRenderFilteredHistory);
  $<HTMLSelectElement>("dash-status-filter").addEventListener("change", applyAndRenderFilteredHistory);

  // Clear History button
  $("clear-history-dash-btn").addEventListener("click", async () => {
    if (confirm("Clear all sync history? Your settings and GitHub connection will remain intact.")) {
      await chrome.runtime.sendMessage({ type: "CLEAR_SYNC_HISTORY" });
      await loadDashboard();
      showSaveStatus("History cleared ✓");
    }
  });

  // Save general settings button
  $("save-btn").addEventListener("click", saveGeneralSettings);

  // Reset button
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

// ── Connect / Disconnect ──────────────────────────────────────────────────────

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
    });

    patInput.value = "";

    if (response?.ok) {
      const account = response.data as {
        login: string;
        name: string | null;
        avatarUrl: string;
      };
      const status: ConnectionStatus = {
        connected: true,
        username: account.login,
        avatarUrl: account.avatarUrl,
      };
      renderAccount(status);
      await loadRepos(status);
    } else {
      showError(response?.error ?? "Verification failed. Please try again.");
    }
  } catch (err) {
    logger.error("Failed to send CONNECT_GITHUB message:", err instanceof Error ? err.message : "unknown");
    showError("Could not reach the extension service worker. Try reloading.");
  } finally {
    setConnecting(false);
  }
}

async function handleDisconnect(): Promise<void> {
  if (
    !confirm(
      "Disconnect your GitHub account? You will need to re-enter your token to reconnect."
    )
  ) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: "DISCONNECT_GITHUB" });
    const repoSelect = $<HTMLSelectElement>("repo-select");
    const branchSelect = $<HTMLSelectElement>("branch-select");
    const saveBtn = $<HTMLButtonElement>("save-repo-btn");
    repoSelect.innerHTML = '<option value="">— Select repository —</option>';
    repoSelect.disabled = true;
    branchSelect.innerHTML = '<option value="">— Select branch —</option>';
    branchSelect.disabled = true;
    saveBtn.disabled = true;
    hideRepoStatus();
    renderAccount({ connected: false });
  } catch (err) {
    logger.error("Failed to disconnect:", err instanceof Error ? err.message : "unknown");
  }
}

// ── Repo Config Saving ────────────────────────────────────────────────────────

async function handleSaveRepo(): Promise<void> {
  const repoSelect = $<HTMLSelectElement>("repo-select");
  const branchSelect = $<HTMLSelectElement>("branch-select");
  const fullName = repoSelect.value;
  const branch = branchSelect.value;

  if (!fullName || !branch) {
    showRepoStatus("Please select both a repository and a branch.", "error");
    return;
  }

  const [owner, name] = fullName.split("/");
  if (!owner || !name) {
    showRepoStatus("Invalid repository selection.", "error");
    return;
  }

  setSavingRepo(true);
  hideRepoStatus();

  try {
    const res = await chrome.runtime.sendMessage({
      type: "SAVE_REPO_CONFIG",
      owner,
      name,
      branch,
    });

    if (res?.ok) {
      showRepoStatus(`✓ Repository connected: ${fullName} @ ${branch}`, "success");
    } else {
      showRepoStatus(res?.error ?? "Failed to save repository configuration.", "error");
    }
  } catch (err) {
    logger.error("Failed to save repo config:", err instanceof Error ? err.message : "unknown");
    showRepoStatus("Could not reach the extension service worker.", "error");
  } finally {
    setSavingRepo(false);
  }
}

// ── Loading States ────────────────────────────────────────────────────────────

function setConnecting(loading: boolean): void {
  const btn = $<HTMLButtonElement>("connect-btn");
  const btnText = $("connect-btn-text");
  const spinner = $("connect-spinner");

  btn.disabled = loading;
  btnText.textContent = loading ? "Verifying…" : "Verify & Connect";
  spinner.classList.toggle("hidden", !loading);
}

function setSavingRepo(loading: boolean): void {
  const btn = $<HTMLButtonElement>("save-repo-btn");
  const btnText = $("save-repo-btn-text");
  const spinner = $("save-repo-spinner");

  btn.disabled = loading;
  btnText.textContent = loading ? "Validating…" : "Save Repository";
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

function showRepoStatus(message: string, type: "success" | "error"): void {
  const el = $("repo-status");
  el.textContent = message;
  el.className = `repo-status repo-status--${type}`;
}

function hideRepoStatus(): void {
  const el = $("repo-status");
  el.className = "repo-status hidden";
  el.textContent = "";
}

// ── Save General Settings ─────────────────────────────────────────────────────

async function saveGeneralSettings(): Promise<void> {
  const btn = $<HTMLButtonElement>("save-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const settings: Partial<ExtensionSettings> = {
    baseDirectory: ($<HTMLInputElement>("basedir-input")).value.trim() || "algorithms",
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
