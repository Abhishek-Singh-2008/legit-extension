# Legit - LeetCode to GitHub Sync

A privacy-first, multi-user Chrome Extension that automatically synchronizes accepted LeetCode solutions to the user's own GitHub repository.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-blue)
![Vite](https://img.shields.io/badge/Vite-purple)
![License](https://img.shields.io/badge/License-MIT-green)

> 🚧 **Current Distribution**: The extension is currently available for peer testing as an unpacked Chrome extension. Chrome Web Store publication is planned for a later release.

---

## 📌 Current Status

| Area | Status |
|---|---|
| Core extension | ✅ Ready |
| Multi-user GitHub support | ✅ Ready |
| Automatic sync | ✅ Ready |
| Error handling & recovery | ✅ Ready |
| Sync history & dashboard | ✅ Ready |
| Peer testing | 🧪 In progress |
| Chrome Web Store publication | 🔜 Planned |

---

## 🚀 Try It Yourself

### 📦 Download the latest peer-testing version

👉 **[Download Legit - LeetCode to GitHub Sync (Latest Release)](https://github.com/Abhishek-Singh-2008/legit-extension/releases/latest)**

> This is a pre-built peer-testing version. No Node.js, npm, Git, or terminal is required.

### Installation

1. Download the ZIP from the release page above.
2. Extract the ZIP.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Open the extracted folder and select the **`dist`** folder.
7. Open the extension's **Settings / Dashboard**.
8. Connect using **your own GitHub Fine-grained PAT**.
9. Select your GitHub repository and branch.
10. Start solving on LeetCode.

> ⚠️ **Never share your GitHub PAT with anyone.**

---

## 🚀 Quick Setup Guide

1. **Open Extension Options**: Click the extension icon and select **Open Settings / Dashboard** (or right-click icon → Options).
2. **Create your OWN GitHub Fine-Grained PAT**:
   - Go to [GitHub → Settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new).
   - Set **Resource owner** to your GitHub account.
   - Under **Repository access**, choose **Only selected repositories** and select your target repository.
   - Under **Repository permissions**, set **Contents** to **Read and write**.
   - Click **Generate token** and copy the token (`github_pat_…`).
3. **Connect Your Account**: Paste your token in Options → click **Verify & Connect**.
4. **Select Repository & Branch**: Select your **OWN** GitHub repository and branch, then click **Save Repository**.
5. **Submit Solution**: Open any problem on [LeetCode](https://leetcode.com/problems/) and submit a solution.
6. **Verify Sync**: Check your selected GitHub repository to confirm the solution file and `README.md` have been committed!

> ⚠️ **Important**: Every user must connect using their **OWN** GitHub account and their **OWN** Fine-grained Personal Access Token. Never share your token with anyone or commit it to a repository.

---

## 🧪 Peer Testing Checklist

Please test the following features and workflows:
- [ ] Extension installs cleanly from the pre-built `dist/` folder without running terminal commands
- [ ] GitHub Fine-grained PAT verification connects successfully
- [ ] Personal GitHub repositories load in the dropdown menu
- [ ] Branch selection loads and enables saving
- [ ] Accepted LeetCode submissions automatically push to GitHub
- [ ] Automated `README.md` generation works alongside solutions
- [ ] Submitting unchanged code is correctly skipped as a duplicate
- [ ] Modifying a solution updates the existing file on GitHub
- [ ] Local Sync History records each submission attempt
- [ ] Options Dashboard statistics (Total Syncs, Success Rate %, Difficulty breakdown) update accurately
- [ ] Authentication errors (e.g. invalid/expired PAT) are handled gracefully
- [ ] Network/API failures trigger retry notifications without crashing

> 🐛 **Feedback & Bug Reports**: If you encounter a bug or unexpected behavior during testing, please open a [GitHub Issue](https://github.com/Abhishek-Singh-2008/legit-extension/issues) with steps to reproduce it.

---

## What It Does

```
Solve a problem on LeetCode (e.g. Two Sum)
          ↓
Click Submit → Verdict: Accepted
          ↓
Extension detects the accepted verdict
          ↓
Extracts problem metadata & source code
          ↓
Pushes solution & README to your GitHub repository

algorithms/two-sum/solution.py
algorithms/two-sum/README.md
```

---

## Key Features

- **Automatic Synchronization**: Detects accepted submissions on LeetCode problem pages in real-time and pushes solution code and problem documentation to GitHub.
- **Fine-Grained Personal Access Token (PAT) Authentication**: Authenticates securely using GitHub Fine-grained PATs with scoped `Contents: Read and write` access to your selected repository. No OAuth servers or broad account permissions required.
- **Multi-User & Multi-Repository Support**: Any GitHub user can connect their account and select any repository and branch they have write access to.
- **Customizable Folder Formats**: Organize solutions by folder structure (`{slug}`, `{difficulty}/{slug}`, `{slug}/{language}`) and configurable base directories.
- **Template-Based Commit Messages**: Custom commit message templates supporting `{title}`, `{slug}`, `{difficulty}`, and `{language}` placeholders.
- **Automatic README Generation**: Creates structured `README.md` files alongside solutions containing difficulty, language, problem links, and submission date.
- **SHA-256 Duplicate Detection**: Hashes solution code to prevent duplicate GitHub commits when re-submitting unchanged code.
- **Resilient Error Recovery & Retries**: Retries transient API and network failures with exponential backoff (1s, 3s) while handling token expiration (HTTP 401) and rate limits gracefully.
- **Sync History & Dashboard**: Stores up to 200 local sync records with an interactive Options Dashboard featuring search, status filtering, difficulty stats, top language metrics, and commit links.
- **100% Serverless & Local-Only Privacy**: Solution code is sent directly from your browser to GitHub via the official REST API. Tokens are stored in `chrome.storage.local` and are never uploaded to any external server or logged.

---

## Architecture

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

## Project Structure

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
│   └── create-zip.mjs             # Distribution ZIP packager
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

## Build From Source (For Developers & Contributors)

Developers who want to modify source code or build from scratch require Node.js and npm:

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

# 5. Package distribution ZIP
node scripts/create-zip.mjs
```

---

## Extension Configuration Options

| Setting | Description | Default |
|---|---|---|
| **Base Directory** | Target directory in your repository (leave blank for root) | `algorithms` |
| **Folder Structure** | `{slug}`, `{difficulty}/{slug}`, or `{slug}/{language}` | `{slug}` |
| **Commit Message Format** | Template for commit messages (`{title}`, `{slug}`, `{difficulty}`, `{language}`) | `feat: add {title} solution` |
| **Auto Sync** | Toggle automatic pushing on Accepted verdict | `true` |
| **Generate README** | Automatically create a `README.md` alongside each solution | `true` |
| **Notifications** | Show desktop notifications for sync results | `true` |

---

## Security & Privacy

- **No Remote Servers / Serverless**: The extension communicates directly with `https://api.github.com` and `https://leetcode.com`. No intermediate proxy, tracking server, or backend is used.
- **Isolated Token Storage**: Fine-grained PATs are saved in `chrome.storage.local` on your local machine. They are never synced across devices or exposed to content scripts or popups.
- **Sanitized Logging**: All console logs pass through token redaction rules (`github_pat_*`, `ghp_*`, `gho_*`, `Bearer *`) to prevent credential leakage in devtools.
- **Strict Input Escaping & Link Validation**: User inputs and problem titles pass through HTML escaping before rendering. External links are strictly validated to begin with `https://github.com/` before opening.

---

## Troubleshooting

- **Branch Selection Troubleshooting**: If the branch list does not load, verify that your Fine-grained PAT has the required `Contents: Read and write` repository permission and try refreshing the repository list using the refresh button next to the dropdown. The extension does not silently switch to another branch.
- **Code Extraction Error**: Make sure you are on a problem page with an active submission. Refresh the LeetCode page if LeetCode's DOM structure fails to load.
- **Authentication Expired**: If you revoke or expire your PAT on GitHub, the extension notifies you and updates the sync status to `Auth Expired`. Re-enter a valid PAT in the Options page to reconnect.
- **Duplicate Submissions Skipped**: Submitting identical code for the same problem will produce a `Duplicate` status to prevent unnecessary GitHub commits. To push an update, modify your solution code or comments.

---

## Known Limitations

- **Single Solution File**: Synchronizes one primary solution file per submission (multi-file submissions are saved as a single solution file in V1).
- **Complexity Analysis**: Time and space complexity fields in generated `README.md` files require manual complexity analysis notes to prevent automated fabrication.

---

## Roadmap & Future Improvements

- [ ] Chrome Web Store publication after successful peer testing
- [ ] Custom README templates
- [ ] Support for problem tags and company tags
- [ ] Multiple solution version history per problem
- [ ] CSV / JSON statistics export

---

## ⭐ Support the Project

If you find Legit useful:
- ⭐ **Star the GitHub repository** on [GitHub](https://github.com/Abhishek-Singh-2008/legit-extension)
- 🐛 **Report bugs** through [GitHub Issues](https://github.com/Abhishek-Singh-2008/legit-extension/issues)
- 💡 **Suggest improvements** or feature requests
- 🤝 **Contribute** through Pull Requests
- 📢 **Share it** with other developers and LeetCode peers!

---

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository on GitHub.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Ensure TypeScript typechecks cleanly (`npm run typecheck`).
4. Commit your changes (`git commit -m 'feat: add amazing feature'`).
5. Push to your branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request.

---

## Privacy Policy

Legit operates entirely client-side. We do not operate remote servers, collect telemetry, or share your data with third parties. All network calls occur directly between your browser, LeetCode, and GitHub.

Read our full [Privacy Policy](privacy.html).

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
