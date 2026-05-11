# AGENTS.md

## Cursor Cloud specific instructions

This is a client-side Football GM Simulator SPA (React 19 + Vite 7 + Tailwind CSS v4). There is no backend server or external database — all game state persists in the browser's IndexedDB.
Football GM Sim is a fully client-side American Football General Manager simulation SPA. No backend server or external database — all game state persists in the browser's IndexedDB.

### Key commands
### Tech stack

| Action | Command |
|--------|---------|
| Install deps | `npm ci` |
| Dev server | `npm run dev` (port 5173) |
| Build | `npm run build` |
| Unit tests | `npm run test:unit` (vitest, 181 files) |
| E2E tests | `npm run test:e2e` (Playwright, requires `npx playwright install --with-deps chromium` first) |
| Preview build | `npm run preview` (port 4173) |
- **Framework:** React 19, Vite 7, Tailwind CSS v4
- **Language:** JavaScript (ES Modules) + TypeScript (types, store, some core)
- **Package manager:** npm (lockfile: `package-lock.json`)
- **Node:** >=22 <23 (enforced by `engines` in `package.json`)
- **Testing:** Vitest (unit/integration), Playwright (E2E)
- **Deploy:** Netlify (static SPA + one optional serverless function)

### Commands

| Action | Command | Notes |
|--------|---------|-------|
| Install | `npm ci` | Respects lockfile exactly |
| Dev server | `npm run dev` | Vite on port 5173, starts in ~200ms |
| Build | `npm run build` | Production bundle to `dist/` |
| Preview | `npm run preview` | Serves `dist/` on port 4173 |
| Unit tests | `npm run test:unit` | Vitest — 181 files, 754 tests |
| E2E tests | `npm run test:e2e` | Playwright against preview build (port 4173) |
| Soak tests | `npm run test:soak` | Subset of Vitest dynasty-stress tests |
| Deploy checks | `npm run check:deploy` | Netlify build parity checks |
| Lint/Typecheck | _not configured_ | No ESLint/Prettier/tsc in devDependencies |

### Source directory layout

```
src/
├── ui/              # React components, hooks, utils, styles
│   ├── App.jsx      # Root component
│   ├── main.jsx     # Entry point (mounted to #root)
│   ├── components/  # ~140 feature components (screens, modals, widgets)
│   ├── hooks/       # useWorker, usePhaseRouteHydration, etc.
│   ├── features/    # Feature-specific logic modules
│   ├── utils/       # Formatting, filtering, helpers
│   ├── context/     # React contexts
│   ├── constants/   # UI constants
│   ├── lib/         # Shared UI utilities
│   └── styles/      # CSS/Tailwind styles
├── worker/          # Web Worker (game sim engine)
│   ├── worker.js    # Main simulation loop (~430KB, core game logic)
│   ├── protocol.js  # postMessage API between UI ↔ Worker
│   └── SimWorker.js # Worker instantiation wrapper
├── core/            # Shared game logic (ratings, contracts, draft, AI)
├── store/           # leagueStore.ts — typed store interface
├── state/           # League initialization, save schema, selectors
├── db/              # IndexedDB persistence layer
├── data/            # Static data (teams, schedules, names)
├── context/         # App-wide React context providers
├── types/           # TypeScript type definitions
└── testSupport/     # Shared test utilities
```

### Architecture notes

- Game simulation runs in a Web Worker (`src/worker/worker.js`).
- State management uses postMessage between UI thread and worker; no Redux/Zustand.
- The `@` path alias resolves to `src/ui/`.
- The only external service is an optional Groq LLM API proxy via Netlify Function (`netlify/functions/groq-proxy.js`); the game is fully playable without it.
- Node.js >=22 <23 is required (enforced by `engines` field in `package.json`).
- Game simulation runs in a **Web Worker** (`src/worker/worker.js`). UI communicates via `postMessage` (see `src/worker/protocol.js`).
- No Redux/Zustand — state flows through worker responses and React context.
- The `@` import alias resolves to `src/ui/` (configured in `vite.config.js`).
- **IndexedDB** is the only database (`src/db/index.js`). No backend DB.
- The optional Groq LLM proxy lives at `netlify/functions/groq-proxy.js`; game is fully playable without it.

### Gotchas
### Testing details

- E2E tests (`npm run test:e2e`) build the app first and serve from port 4173 (preview mode). They do NOT use the dev server.
- Playwright requires Chromium to be installed: `npx playwright install --with-deps chromium`.
- The Vite dev server starts in ~200ms; no build step is needed for development.
- There is no linter configured (no ESLint/Prettier in devDependencies). Lint checks are not applicable.
- **Unit/integration tests** (`npm run test:unit`): Run with Vitest + jsdom + fake-indexeddb. Config: `vitest.config.ts`.
- **E2E tests** (`npm run test:e2e`): Run with Playwright (Chromium). Config: `playwright.config.ts`. These build the app first, then serve from port 4173.
- **Playwright setup**: Before first E2E run, install browser: `npx playwright install --with-deps chromium`.
- **CI** (`.github/workflows/netlify-parity.yml`): Runs unit tests → deploy parity checks → E2E smoke test.

### Gotchas and common failure modes

1. **E2E uses preview, not dev**: Playwright tests hit `http://127.0.0.1:4173` (built app), not the dev server. If E2E fails with connection errors, ensure port 4173 is free.
2. **No lint/typecheck scripts**: There is no `npm run lint` or `npm run typecheck`. Don't invent one.
3. **Large worker bundle**: `src/worker/worker.js` is ~430KB. Changes here can affect the entire game simulation. Edit carefully and always run `npm run test:unit` afterward.
4. **IndexedDB mocking**: Unit tests use `fake-indexeddb`. Tests that interact with persistence must import the mock setup from `src/testSupport/`.
5. **Node 22 required**: Lower versions will fail. The environment provides Node 22 via nvm.
6. **Chunk size warning**: The build emits a chunk >500KB warning — this is expected and not a build failure.

### PR checklist for future agents

Before opening a PR:
- [ ] `npm run test:unit` passes (all 181 files)
- [ ] `npm run build` succeeds without errors
- [ ] If UI was changed: manually verify in browser (`npm run dev`, open http://localhost:5173)
- [ ] If game simulation/worker logic was changed: run `npm run test:soak` for dynasty stress tests
- [ ] If Netlify config or redirects were changed: run `npm run check:deploy`
- [ ] E2E smoke: `npx playwright test tests/e2e/fresh_franchise_first_week_smoke.spec.js`
- [ ] No unrelated files modified (repo root has legacy Python scripts — do not touch)
- [ ] Commit messages are clear and descriptive