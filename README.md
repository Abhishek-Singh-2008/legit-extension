# LeetCode GitHub Sync

> A production-quality Chrome Extension (Manifest V3) that automatically synchronises accepted LeetCode solutions to your GitHub repository.

---

## What It Does

```
User solves Two Sum on LeetCode
         ↓
Clicks Submit → Accepted
         ↓
Extension detects the verdict
         ↓
Extracts source code + metadata
         ↓
Pushes to GitHub

algorithms/two-sum/solution.py
algorithms/two-sum/README.md
```

---

## Features

| Feature | Status |
|---|---|
| Manifest V3 (Chrome) | ✅ |
| TypeScript + Vite | ✅ |
| LeetCode SPA navigation detection | ✅ |
| Submission detection (MutationObserver) | Phase 3 |
| Code extraction (Monaco editor) | Phase 4 |
| GitHub App OAuth (no broad `repo` scope) | Phase 5 |
| GitHub REST API push | Phase 7 |
| Auto README generation | Phase 8 |
| Duplicate detection (SHA-256 hash) | Phase 9 |
| Popup + Settings UI | ✅ (skeleton) |

---

## Architecture

```
chrome.tabs (LeetCode page)
         │
    content/leetcode.ts          ← SPA nav + problem detection
    content/submission-detector  ← MutationObserver on result DOM
    content/code-extractor       ← Monaco/CodeMirror reader
         │
         │  chrome.runtime.sendMessage
         ▼
    background/service-worker.ts ← Message router
         │
    github/github-auth.ts        ← OAuth flow
    github/github-api.ts         ← REST API client
    github/github-repository.ts  ← Path generation
    github/github-file.ts        ← README + commit formatting
         │
         ▼
    GitHub REST API
    └── repos/{owner}/{repo}/contents/{path}
```

### Message Flow

```
Content Script ──SUBMISSION_ACCEPTED──► Background SW
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                       Check duplicate   Load settings   GitHub API push
                              │                               │
                              └───────────── notify ──────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Build | Vite 5 |
| Extension API | Chrome Manifest V3 |
| Auth | GitHub OAuth App (PKCE) |
| Storage | `chrome.storage.local` |
| Notifications | `chrome.notifications` |
| HTTP | `fetch` (native, no extra deps) |

---

## Project Structure

```
leetcode-github-sync/
├── public/icons/          # Extension icons (16/32/48/128px)
├── src/
│   ├── background/
│   │   └── service-worker.ts   # Message router + coordinator
│   ├── content/
│   │   ├── leetcode.ts         # Entry point, SPA nav
│   │   ├── submission-detector.ts
│   │   ├── code-extractor.ts
│   │   └── dom-utils.ts
│   ├── github/
│   │   ├── github-api.ts       # REST client
│   │   ├── github-auth.ts      # OAuth flow
│   │   ├── github-repository.ts
│   │   └── github-file.ts
│   ├── storage/
│   │   └── storage.ts          # Typed chrome.storage wrapper
│   ├── types/
│   │   ├── leetcode.ts
│   │   ├── github.ts
│   │   └── settings.ts
│   ├── popup/
│   │   ├── popup.html/ts/css
│   ├── options/
│   │   ├── options.html/ts/css
│   └── utils/
│       ├── logger.ts           # Token-redacting logger
│       ├── errors.ts           # Typed error hierarchy
│       └── slugify.ts          # Slug + language utils
├── scripts/
│   └── postbuild.mjs           # Copies HTML/CSS/manifest to dist/
├── manifest.json
├── vite.config.ts
└── tsconfig.json
```

---

## Installation (Development)

### Prerequisites

- Node.js 18+
- npm 9+
- Google Chrome

### Build

```bash
git clone <repo>
cd leetcode-github-sync
npm install
npm run build:fast
```

The `dist/` folder is the unpacked extension.

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

You should see the extension icon in your toolbar.

### Development Watch Mode

```bash
npm run dev
```

Vite will rebuild on every file change. Reload the extension in `chrome://extensions` after each rebuild (click the ↺ button on the extension card).

---

## GitHub App Setup (Phase 5)

> Not required for Phase 1. Instructions will be added when Phase 5 is implemented.

The extension uses a **GitHub OAuth App** with:

```
Scopes:
  repo (Contents: Read & Write — repository-specific via App installation)
```

**Never** store the `client_secret` in the extension source.

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Store settings and submission history |
| `notifications` | Show sync success/failure notifications |
| `identity` | Drive the OAuth popup for GitHub login |
| `https://leetcode.com/*` | Read problem metadata and submission results |
| `https://api.github.com/*` | Push solutions via REST API |
| `https://github.com/*` | OAuth redirect handling |

No `<all_urls>`. No broad `repo` scope without explicit user consent.

---

## Security

- **No secrets in source code.** `client_secret` is never bundled.
- **Token redaction in logs.** The logger strips `ghp_*` and `Bearer *` patterns.
- **Minimal host permissions.** Only `leetcode.com` and `api.github.com`.
- **Storage isolation.** Tokens stored in `chrome.storage.local` (not `sync`).
- **No code sent to external servers.** Code is sent only to the user's own GitHub repository.

---

## Development Phases

| Phase | Description | Status |
|---|---|---|
| 1 | Extension skeleton (TypeScript + Vite + manifest) | ✅ Done |
| 2 | LeetCode problem detection | 🔜 Next |
| 3 | Submission detection | ⏳ |
| 4 | Code extraction | ⏳ |
| 5 | GitHub authentication | ⏳ |
| 6 | Repository access | ⏳ |
| 7 | First GitHub push | ⏳ |
| 8 | README generation | ⏳ |
| 9 | Duplicate detection | ⏳ |
| 10 | UI polish | ⏳ |
| 11 | Security review | ⏳ |
| 12 | Production build | ⏳ |

---

## Troubleshooting

**Extension doesn't appear after loading:**
- Check `chrome://extensions` for errors
- Make sure you loaded the `dist/` folder, not the project root

**Service worker errors:**
- Open `chrome://extensions → LeetCode GitHub Sync → Service Worker` to inspect

**Build errors:**
- Run `npm run typecheck` to see TypeScript errors before building

---

## Future Features

- LeetCode daily streak tracker
- Problem difficulty / language statistics
- Multiple repository support
- AI-generated complexity analysis
- Progress dashboard

---

## License

MIT
