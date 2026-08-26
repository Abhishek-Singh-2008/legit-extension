# Legit - LeetCode to GitHub Sync

A privacy-first, multi-user Chrome Extension that automatically synchronizes accepted LeetCode solutions to the user's own GitHub repository.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-blue)
![Vite](https://img.shields.io/badge/Vite-purple)
![License](https://img.shields.io/badge/License-MIT-green)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-v1.0.1_Live-brightgreen?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ehjenhfhnkojhpljcdohihpjpngfljpo)

> 🚀 **Official Release**: **Legit - LeetCode to GitHub Sync** is now live and publicly available on the [Chrome Web Store](https://chromewebstore.google.com/detail/ehjenhfhnkojhpljcdohihpjpngfljpo). Install it with a single click!

---

## 📌 Current Status

| Area | Status |
|---|---|
| Core extension | ✅ Ready |
| Multi-user GitHub support | ✅ Ready |
| Automatic sync | ✅ Ready |
| Error handling & recovery | ✅ Ready |
| Sync history & dashboard | ✅ Ready |
| Peer testing | ✅ Completed |
| Chrome Web Store | 🚀 Published / Live (v1.0.1) |

---

## 📦 Install from Chrome Web Store

The easiest and recommended way to use Legit is by installing it directly from the official Google Chrome Web Store:

👉 **[Install Legit from Chrome Web Store](https://chromewebstore.google.com/detail/ehjenhfhnkojhpljcdohihpjpngfljpo)**

### Getting Started in 4 Easy Steps

1. **Install**: Click the link above and choose **Add to Chrome**.
2. **Open Settings**: Click the Legit extension icon in your toolbar and select **Settings / Dashboard** (or right-click → Options).
3. **Connect GitHub**: Generate your own GitHub Fine-grained Personal Access Token (PAT) and click **Verify & Connect**.
4. **Solve & Sync**: Choose your target repository and branch. When you submit an **Accepted** solution on [LeetCode](https://leetcode.com/problems/), Legit automatically commits the solution and problem details to your repository!

---

## 🔑 GitHub Fine-Grained PAT Setup Guide

Legit uses GitHub's Fine-grained Personal Access Tokens (PAT) to commit solutions directly from your browser to your GitHub repository without routing your code through third-party servers.

> ⚠️ **IMPORTANT**: Every user must create and connect using their **OWN** GitHub account and their **OWN** Personal Access Token. Never use anyone else's token or commit your PAT to any public repository.

### Step 1: Create your Personal Access Token on GitHub

1. Sign in to your **OWN** account on [GitHub](https://github.com).
2. Go to the [GitHub Fine-grained Personal Access Tokens creation page](https://github.com/settings/personal-access-tokens/new).
3. Fill out the token details:
   - **Token name**: Enter `Legit` (or any recognizable name).
   - **Expiration**: Select your preferred expiration timeframe (e.g., 90 days, 1 year).
   - **Resource owner**: Select your personal GitHub account.
   - **Repository access**: Choose **Only selected repositories** and pick the repository where you want Legit to commit your LeetCode solutions.
4. Set the required repository permission:
   - Scroll down to **Repository permissions**.
   - Find **Contents** and set the access level to **Read and write** (access: `Read and write`).
5. Click **Generate token** at the bottom of the page.
6. **Copy your token immediately** (`github_pat_…`). GitHub will only show it to you once!

### Step 2: Connect Your Token in Legit

1. Click the **Legit** icon in your browser toolbar and open **Settings / Dashboard** (or right-click → Options).
2. In the **GitHub Authentication** card, paste your token into the **Personal Access Token (PAT)** input field.
3. Click **Verify & Connect**.
4. Once verified, your GitHub username and avatar will display.
5. In the **Repository Configuration** card:
   - Select your target **Repository** from the dropdown menu.
   - Select your target **Branch** (e.g. `main` or `master`).
   - Click **Save Repository**.
6. That's it! Your setup is complete.

---

## ⚙️ How Synchronization Works

```
Solve a problem on LeetCode (e.g. Two Sum)
          ↓
Click Submit → Verdict: Accepted
          ↓
Legit detects the accepted verdict in real time
          ↓
Extracts problem metadata & source code via LeetCode GraphQL
          ↓
Generates SHA-256 hash to verify code isn't a duplicate
          ↓
Pushes solution & README.md directly to your GitHub repository
          ↓
algorithms/two-sum/solution.py
algorithms/two-sum/README.md
```

---

## ✨ Key Features

- **Automatic Synchronization**: Detects accepted submissions on LeetCode problem pages in real-time and pushes solution code and problem documentation directly to GitHub.
- **Fine-Grained PAT Authentication**: Authenticates securely using GitHub Fine-grained PATs with scoped `Contents: Read and write` access to your selected repository. No OAuth servers or broad account permissions required.
- **Multi-User & Multi-Repository Support**: Any GitHub user can connect their account and select any repository and branch they have write access to.
- **Customizable Folder Formats**: Organize solutions by folder structure (`{slug}`, `{difficulty}/{slug}`, `{slug}/{language}`) and configurable base directories.
- **Template-Based Commit Messages**: Custom commit message templates supporting `{title}`, `{slug}`, `{difficulty}`, and `{language}` placeholders.
- **Automatic README Generation**: Creates structured `README.md` files alongside solutions containing difficulty, language, problem links, and submission date.
- **SHA-256 Duplicate Detection**: Hashes solution code locally using Web Crypto SHA-256 to prevent duplicate GitHub commits when re-submitting unchanged code.
- **Resilient Error Recovery & Retries**: Retries transient API and network failures with exponential backoff (1s, 3s) while handling token expiration (HTTP 401) and rate limits gracefully.
- **Sync History & Local Dashboard**: Stores up to 200 local sync records with an interactive Options Dashboard featuring search, status filtering, difficulty stats, top language metrics, and direct commit links.
- **100% Serverless & Privacy-First**: Solution code is sent directly from your browser to GitHub via the official REST API. Tokens are stored locally in `chrome.storage.local` and are never uploaded to any external server or logged.

---

## 📐 Architecture

```
LeetCode Tab (leetcode.com/problems/*)
          │
     content/leetcode.ts           ← SPA navigation listener & coordinator
     content/problem-detector.ts   ← Problem title, slug, difficulty
     content/submission-detector   ← Verdict watcher (MutationObserver)
     content/leetcode-api.ts       ← GraphQL query for accepted code
          │
          │ chrome.runtime.sendMessage
          ▼
     background/service-worker.ts  ← Message router & orchestrator
          │
          ├── storage/storage.ts        ← chrome.storage.local wrapper & stats
          ├── utils/hash.ts            ← SHA-256 submission deduplication
          ├── utils/errors.ts          ← Extension error hierarchy & HTTP classifiers
          │
          ▼
     github/github-push.ts         ← Push pipeline orchestrator
          ├── github/github-api.ts      ← GitHub REST API client with retry backoff
          ├── github/github-auth.ts     ← PAT verification & repo access check
          ├── github/github-repository.ts← File path resolver
          └── github/github-file.ts     ← README generator & commit message template
          │
          ▼
     GitHub REST API (api.github.com)
     └── /repos/{owner}/{repo}/contents/{path}
```

---

## 📁 Project Structure

```
legit-extension/
├── manifest.json                  # Manifest V3 configuration
├── package.json                   # Dependencies & build scripts
├── tsconfig.json                  # TypeScript configuration (strict mode)
├── vite.config.ts                 # Vite bundler & IIFE content script build
├── public/
│   └── icons/                     # Extension icons (16/32/48/128px)
├── scripts/
│   ├── postbuild.mjs              # Post-build asset copy script
│   ├── create-zip.mjs             # Distribution ZIP packager
│   └── create-webstore-zip.mjs    # Chrome Web Store ZIP packager
└── src/
    ├── background/
    │   └── service-worker.ts      # MV3 Service Worker (message router & pipeline)
    ├── content/
    │   ├── leetcode.ts            # Content script entry point & SPA nav listener
    │   ├── problem-detector.ts    # LeetCode problem detector
    │   ├── submission-detector.ts # Verdict DOM watcher
    │   ├── leetcode-api.ts        # LeetCode GraphQL API client
    │   └── code-extractor.ts      # Monaco & CodeMirror code reader
    ├── github/
    │   ├── github-api.ts          # GitHub REST API client (with retry backoff)
    │   ├── github-auth.ts         # Token verification & repository access checks
    │   ├── github-file.ts         # README generator & commit message formatter
    │   ├── github-push.ts         # GitHub file push orchestrator
    │   └── github-repository.ts   # File path resolver
    ├── options/
    │   ├── options.html           # Options & Dashboard HTML layout
    │   ├── options.ts             # Options script (PAT connect, repo select, dashboard)
    │   └── options.css            # Options & Dashboard stylesheet
    ├── popup/
    │   ├── popup.html             # Extension popup HTML layout
    │   ├── popup.ts               # Popup script (status, stats summary, recent syncs)
    │   └── popup.css              # Popup stylesheet
    ├── storage/
    │   └── storage.ts             # Typed chrome.storage.local wrapper & stats calculator
    ├── types/
    │   ├── github.ts              # GitHub API interfaces
    │   ├── leetcode.ts            # LeetCode problem & submission interfaces
    │   └── settings.ts            # Extension settings, LastSync, History & Stats types
    └── utils/
        ├── errors.ts              # Custom ExtensionError hierarchy & HTTP error handling
        ├── hash.ts                # Web Crypto SHA-256 hash utility
        ├── logger.ts              # Token-redacting logger
        └── slugify.ts             # Slugifier & programming language extension mapper
```

---

## ⚙️ Extension Configuration Options

Configure these settings inside the **Options / Dashboard** page:

| Setting | Description | Default |
|---|---|---|
| **Base Directory** | Target directory in your repository (leave blank for repository root) | `algorithms` |
| **Folder Structure** | `{slug}`, `{difficulty}/{slug}`, or `{slug}/{language}` | `{slug}` |
| **Commit Message Format** | Template for commit messages (`{title}`, `{slug}`, `{difficulty}`, `{language}`) | `feat: add {title} solution` |
| **Auto Sync** | Automatically push solution when Accepted verdict is detected | `true` |
| **Generate README** | Automatically create a `README.md` alongside each solution | `true` |
| **Notifications** | Show desktop notifications for sync results and errors | `true` |

---

## 🔒 Security & Privacy

- **100% Serverless Architecture**: The extension communicates directly with `https://api.github.com` and `https://leetcode.com`. There are no intermediate proxy servers, tracking backends, or third-party databases.
- **Isolated Local Storage**: Your GitHub PAT is saved strictly in your browser's private `chrome.storage.local`. It is never transmitted to any server other than official GitHub endpoints.
- **Automatic Token Redaction**: All console logs pass through token sanitization filters (`github_pat_*`, `ghp_*`, `gho_*`, `Bearer *`) to prevent credential leakage in developer tools.
- **Strict Input Escaping & Link Validation**: User inputs and problem titles pass through HTML escaping before rendering. External links are strictly validated to begin with `https://github.com/` before opening.
- **Full Privacy Policy**: Read our comprehensive [Privacy Policy](privacy.html).

---

## 🛡️ Manifest Permissions

Legit requires minimal permissions to operate:

| Permission | Purpose |
|---|---|
| `storage` | Saves user settings, GitHub PAT, sync history, and deduplication hashes locally in `chrome.storage.local`. |
| `notifications` | Displays desktop notifications for sync success, duplicate skips, and authentication errors. |
| `https://leetcode.com/*` | Required for content scripts to detect verdicts and query problem details from LeetCode GraphQL. |
| `https://api.github.com/*` | Required to create commits, check repository permissions, and list branches via GitHub REST API. |
| `https://github.com/*` | Fallback avatar resolution and direct links. |

---

## 🛠️ Troubleshooting

- **Branch Selection Troubleshooting**: If the branch list does not load, verify that your Fine-grained PAT has the required `Contents: Read and write` repository permission and try clicking the refresh button next to the dropdown.
- **Code Extraction Error**: Make sure you are on a problem page with an active submission. Refresh the LeetCode tab if LeetCode's DOM structure fails to load.
- **Authentication Expired**: If you revoke or expire your PAT on GitHub, the extension notifies you and updates the sync status to `Auth Expired`. Re-enter a valid PAT in the Options page to reconnect.
- **Duplicate Submissions Skipped**: Submitting identical code for the same problem will produce a `Duplicate` status to prevent unnecessary GitHub commits. To push an update, modify your solution code or comments.

---

## ⚠️ Known Limitations

- **Single Solution File**: Synchronizes one primary solution file per submission (multi-file submissions are saved as a single solution file in V1).
- **Complexity Analysis**: Time and space complexity fields in generated `README.md` files require manual complexity analysis notes to prevent automated fabrication.

---

## 🗺️ Roadmap & Future Improvements

- [x] Chrome Web Store publication (Live at v1.0.1)
- [ ] Custom README templates
- [ ] Support for problem tags and company tags
- [ ] Multiple solution version history per problem
- [ ] CSV / JSON statistics export

---

## 💻 Build From Source (For Developers & Contributors)

Developers who want to modify source code, test locally, or build from scratch require **Node.js** (v18+) and **npm**:

```bash
# 1. Clone repository
git clone https://github.com/Abhishek-Singh-2008/legit-extension.git
cd legit-extension

# 2. Install dependencies
npm install

# 3. Typecheck TypeScript
npm run typecheck

# 4. Build production extension (outputs to dist/)
npm run build

# 5. Package distribution ZIPs
node scripts/create-webstore-zip.mjs
node scripts/create-zip.mjs
```

### Loading Unpacked Extension in Chrome (Development Mode)

1. Run `npm run build`.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the **`dist`** folder generated in the project root.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository on GitHub.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Ensure TypeScript typechecks cleanly (`npm run typecheck`).
4. Ensure the build succeeds (`npm run build`).
5. Commit your changes (`git commit -m 'feat: add amazing feature'`).
6. Push to your branch (`git push origin feature/amazing-feature`).
7. Open a Pull Request on GitHub.

---

## ⭐ Support the Project

If you find Legit useful:
- ⭐ **Star the GitHub repository** on [GitHub](https://github.com/Abhishek-Singh-2008/legit-extension)
- 🛍️ **Leave a Review** on the [Chrome Web Store](https://chromewebstore.google.com/detail/ehjenhfhnkojhpljcdohihpjpngfljpo)
- 🐛 **Report bugs** through [GitHub Issues](https://github.com/Abhishek-Singh-2008/legit-extension/issues)
- 💡 **Suggest improvements** or feature requests
- 📢 **Share it** with other developers and LeetCode peers!

---

## 📄 Privacy Policy

Legit operates entirely client-side. We do not operate remote servers, collect telemetry, or share your data with third parties. All network calls occur directly between your browser, LeetCode, and GitHub.

Read our full [Privacy Policy](privacy.html).

---

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
