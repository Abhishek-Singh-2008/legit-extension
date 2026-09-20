# Legit - LeetCode to GitHub Sync

A privacy-first, multi-user Chrome Extension that automatically synchronizes accepted LeetCode solutions to your GitHub repository with AI-powered time/space complexity analysis.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-blue)
![Vite](https://img.shields.io/badge/Vite-purple)
![License](https://img.shields.io/badge/License-MIT-green)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-v1.0.2-brightgreen?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ehjenhfhnkojhpljcdohihpjpngfljpo)

> 🚀 **Official Release**: **Legit - LeetCode to GitHub Sync** is publicly available on the [Chrome Web Store](https://chromewebstore.google.com/detail/ehjenhfhnkojhpljcdohihpjpngfljpo). Install it with a single click!

---

## 📌 Current Status

| Area | Status |
|---|---|
| Core extension & real-time sync | ✅ Ready (v1.0.2) |
| 1-Click GitHub Device Flow | ✅ Ready |
| Fine-Grained PAT support | ✅ Ready |
| Multi-Provider AI Complexity Analysis | ✅ Ready (Gemini, Groq, OpenAI, Anthropic, OpenRouter) |
| LeetCode GraphQL accuracy & Monaco DOM extraction | ✅ Ready |
| Sync history & local analytics dashboard | ✅ Ready |
| Chrome Web Store | 🚀 v1.0.2 Ready |

---

## 📦 Install from Chrome Web Store

The easiest and recommended way to use Legit is by installing it directly from the official Google Chrome Web Store:

👉 **[Install Legit from Chrome Web Store](https://chromewebstore.google.com/detail/ehjenhfhnkojhpljcdohihpjpngfljpo)**

### Getting Started in 4 Easy Steps

1. **Install**: Click the link above and choose **Add to Chrome**.
2. **Open Settings**: Click the Legit extension icon in your toolbar and select **Settings / Dashboard** (or right-click → Options).
3. **Connect GitHub**: Click **Connect with GitHub** (1-Click Device Flow) or paste a GitHub Fine-grained Personal Access Token (PAT).
4. **Solve & Sync**: Choose your target repository and branch. When you submit an **Accepted** solution on [LeetCode](https://leetcode.com/problems/), Legit automatically commits the solution, problem details, and AI complexity analysis to your repository!

---

## 🔑 Authentication Options

Legit connects directly from your browser to GitHub via the official GitHub REST API. No intermediate backend server ever sees your tokens.

### Option 1: 1-Click GitHub Device Flow (Recommended)
1. Open Legit **Settings / Dashboard**.
2. Under **GitHub Authentication**, click **Connect with GitHub**.
3. A modal opens with an 8-character code (e.g., `ABCD-1234`).
4. Click **Open GitHub & Authorize**, paste the code, and approve access.
5. Legit automatically completes authentication and connects your account!

### Option 2: Fine-Grained Personal Access Token (PAT)
1. Go to [GitHub Fine-grained Personal Access Tokens](https://github.com/settings/personal-access-tokens/new).
2. Set token name to `Legit` and select your target repository.
3. Under **Repository permissions**, grant **Contents: Read and write**.
4. Generate and copy the token (`github_pat_…`).
5. Paste into Legit **Settings** → **Personal Access Token** and click **Verify & Connect**.

---

## 🤖 AI Complexity & Approach Analysis

Legit includes built-in Multi-Provider AI analysis that automatically evaluates your accepted code upon submission:

- **Time Complexity** (e.g. `O(n log n)`)
- **Space Complexity** (e.g. `O(1)`)
- **Approach & Intuition** (A clean 2-3 sentence algorithmic summary)

### Supported AI Providers

| Provider | Supported Models / Defaults | Notes |
|---|---|---|
| **Google Gemini** | Dynamic auto-discovery (`gemini-2.0-flash`, `gemini-2.5-flash`, etc.) | Free tier available via Google AI Studio |
| **Groq** | `llama-3.3-70b-versatile`, `mixtral-8x7b-32768` | Ultra-fast inference |
| **OpenAI** | `gpt-4o-mini`, `gpt-4o` | Official OpenAI API |
| **Anthropic** | `claude-3-5-haiku-latest`, `claude-3-5-sonnet-latest` | Claude API |
| **OpenRouter** | Any OpenRouter model ID | Multi-model routing |
| **Custom (OpenAI-compatible)** | Local LLMs (Ollama, LM Studio, vLLM) or private gateways | Set custom Base URL |

> 🔒 **Privacy Guarantee**: AI keys are stored strictly in `chrome.storage.local`. Requests are sent directly from your browser to the chosen provider's official endpoint. If AI analysis fails or times out, solution synchronization to GitHub continues uninterrupted.

---

## ⚙️ How Synchronization Works

```
Solve a problem on LeetCode (e.g. Two Sum)
          ↓
Click Submit → Verdict: Accepted
          ↓
Legit detects the accepted verdict in real time
          ↓
Extracts fresh code directly from Monaco Editor DOM
          ↓
Resolves official problem metadata & difficulty via LeetCode GraphQL
          ↓
Runs AI Complexity & Approach Analysis (non-blocking)
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

- **Automatic Synchronization**: Detects accepted submissions on LeetCode in real-time and pushes solution code and documentation directly to GitHub.
- **1-Click Device Flow & PAT Authentication**: Flexible login options with zero third-party proxy servers.
- **AI-Powered README Generation**: Automatically populates `README.md` with Time Complexity, Space Complexity, and Approach alongside problem description and stats.
- **Multi-Provider AI**: Works with Google Gemini, Groq, OpenAI, Anthropic, OpenRouter, or custom OpenAI-compatible endpoints.
- **Accurate Difficulty & Metadata**: Fetches official difficulty (`Easy`, `Medium`, `Hard`) via GraphQL even if web DOM badges lag.
- **Real-Time Editor Code Extraction**: Captures latest Monaco Editor changes instantly without waiting for LeetCode indexing delays.
- **SHA-256 Duplicate Detection**: Prevents redundant commits when re-submitting unchanged code.
- **Conflict Prevention & Safe Retries**: Built-in 409 Conflict auto-resolution with SHA refresh and exponential backoff retry.
- **Customizable Folder Structure**: Organize solutions by `{slug}`, `{difficulty}/{slug}`, or `{slug}/{language}` with custom base directories.
- **Interactive Local Dashboard**: Visual sync history, difficulty counters, language distribution, search, and direct commit links.

---

## 📐 Architecture

```
LeetCode Tab (leetcode.com/problems/*)
          │
     content/leetcode.ts           ← SPA navigation listener & coordinator
     content/problem-detector.ts   ← Problem title, slug, difficulty
     content/submission-detector   ← Verdict watcher (MutationObserver)
     content/leetcode-api.ts       ← GraphQL query for metadata & difficulty
     content/code-extractor.ts     ← Monaco Editor real-time code reader
          │
          │ chrome.runtime.sendMessage
          ▼
     background/service-worker.ts  ← Message router & orchestrator
          │
          ├── storage/storage.ts        ← chrome.storage.local wrapper & stats
          ├── utils/hash.ts            ← SHA-256 submission deduplication
          ├── ai/ai-client.ts          ← Multi-provider AI analysis engine
          │
          ▼
     github/github-push.ts         ← Safe push pipeline orchestrator
          ├── github/github-api.ts      ← GitHub REST API client with retry backoff
          ├── github/github-auth.ts     ← Token & Device Flow authentication
          ├── github/github-device-flow.ts ← GitHub OAuth Device Flow client
          ├── github/github-repository.ts← File path resolver
          └── github/github-file.ts     ← README generator (with AI complexity)
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
    ├── ai/
    │   └── ai-client.ts           # Multi-provider AI engine (Gemini, Groq, OpenAI, etc.)
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
    │   ├── github-device-flow.ts  # GitHub OAuth 1-Click Device Flow implementation
    │   ├── github-file.ts         # README generator & commit message formatter
    │   ├── github-push.ts         # Safe GitHub file push orchestrator
    │   └── github-repository.ts   # File path resolver
    ├── options/
    │   ├── options.html           # Options & Dashboard HTML layout
    │   ├── options.ts             # Options script (Auth, AI config, Dashboard)
    │   └── options.css            # Options & Dashboard stylesheet
    ├── popup/
    │   ├── popup.html             # Extension popup HTML layout
    │   ├── popup.ts               # Popup script (active problem, status, stats)
    │   └── popup.css              # Popup stylesheet
    ├── storage/
    │   └── storage.ts             # Typed chrome.storage.local wrapper & stats calculator
    ├── types/
    │   ├── github.ts              # GitHub API interfaces
    │   ├── leetcode.ts            # LeetCode problem & submission interfaces
    │   └── settings.ts            # Extension settings, AI Config, History & Stats types
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
| **AI Complexity Analysis** | Enable automated Time/Space complexity & Approach generation | `true` |
| **AI Provider** | Choose from Gemini, Groq, OpenAI, Anthropic, OpenRouter, or Custom | `Gemini` |
| **AI API Key** | User-provided API key for your chosen AI provider | *User configured* |
| **Notifications** | Show desktop notifications for sync results and errors | `true` |

---

## 🔒 Security & Privacy

- **100% Serverless Architecture**: The extension communicates directly with `https://api.github.com`, `https://leetcode.com`, and the configured AI provider endpoint. No intermediate proxy servers or analytics databases exist.
- **Isolated Local Storage**: Your GitHub tokens and AI API keys are stored strictly in your browser's private `chrome.storage.local`.
- **Automatic Token Redaction**: All console logs pass through token sanitization filters (`github_pat_*`, `ghp_*`, `gho_*`, `Bearer *`, API keys) to prevent credential leakage in developer tools.
- **Strict Input Escaping & Link Validation**: User inputs and problem titles pass through HTML escaping before rendering. External links are strictly validated to begin with `https://github.com/` before opening.
- **Full Privacy Policy**: Read our comprehensive [Privacy Policy](privacy.html).

---

## 🛡️ Manifest Permissions

| Permission | Purpose |
|---|---|
| `storage` | Saves user settings, auth tokens, AI keys, sync history, and deduplication hashes locally in `chrome.storage.local`. |
| `notifications` | Displays desktop notifications for sync success, duplicate skips, and authentication errors. |
| `activeTab` | Detects current active problem tab on popup open for real-time problem tracking. |
| `https://leetcode.com/*` | Required for content scripts to detect verdicts and query problem details from LeetCode GraphQL. |
| `https://api.github.com/*` | Required to create commits, check repository permissions, and perform Device Flow auth. |
| `https://github.com/*` | Fallback avatar resolution, device flow authorization, and direct links. |
| `https://generativelanguage.googleapis.com/*` | Google Gemini AI complexity analysis API. |
| `https://api.groq.com/*` | Groq AI complexity analysis API. |
| `https://api.openai.com/*` | OpenAI complexity analysis API. |
| `https://api.anthropic.com/*` | Anthropic Claude complexity analysis API. |
| `https://openrouter.ai/*` | OpenRouter multi-model complexity analysis API. |

---

## 🛠️ Troubleshooting

- **Branch Selection Troubleshooting**: If the branch list does not load, verify that your token has `Contents: Read and write` permission and click the refresh button next to the dropdown.
- **AI Complexity Skipped or Timed Out**: If AI analysis takes longer than 15s or the API key runs out of quota, Legit safely commits the solution with standard templates without blocking. Verify your AI key in Options.
- **Duplicate Submissions Skipped**: Submitting identical code for the same problem produces a `Duplicate` status to prevent unnecessary GitHub commits. To push an update, modify your code or comments.
- **Authentication Expired**: If you revoke your token on GitHub, Legit updates the status to `Auth Expired`. Reconnect via 1-Click Device Flow or re-enter a valid PAT.

---

## 💻 Build From Source (For Developers & Contributors)

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
Compress-Archive -Path dist/* -DestinationPath legit-v1.0.2.zip -Force
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

Legit operates entirely client-side. We do not operate remote servers, collect telemetry, or share your data with third parties. All network calls occur directly between your browser, LeetCode, GitHub, and your chosen AI provider.

Read our full [Privacy Policy](privacy.html).

---

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
