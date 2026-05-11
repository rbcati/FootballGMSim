# AGENTS.md

## Cursor Cloud specific instructions

This is a client-side Football GM Simulator SPA (React 19 + Vite 7 + Tailwind CSS v4). There is no backend server or external database — all game state persists in the browser's IndexedDB.

### Key commands

| Action | Command |
|--------|---------|
| Install deps | `npm ci` |
| Dev server | `npm run dev` (port 5173) |
| Build | `npm run build` |
| Unit tests | `npm run test:unit` (vitest, 181 files) |
| E2E tests | `npm run test:e2e` (Playwright, requires `npx playwright install --with-deps chromium` first) |
| Preview build | `npm run preview` (port 4173) |

### Architecture notes

- Game simulation runs in a Web Worker (`src/worker/worker.js`).
- State management uses postMessage between UI thread and worker; no Redux/Zustand.
- The `@` path alias resolves to `src/ui/`.
- The only external service is an optional Groq LLM API proxy via Netlify Function (`netlify/functions/groq-proxy.js`); the game is fully playable without it.
- Node.js >=22 <23 is required (enforced by `engines` field in `package.json`).

### Gotchas

- E2E tests (`npm run test:e2e`) build the app first and serve from port 4173 (preview mode). They do NOT use the dev server.
- Playwright requires Chromium to be installed: `npx playwright install --with-deps chromium`.
- The Vite dev server starts in ~200ms; no build step is needed for development.
- There is no linter configured (no ESLint/Prettier in devDependencies). Lint checks are not applicable.
