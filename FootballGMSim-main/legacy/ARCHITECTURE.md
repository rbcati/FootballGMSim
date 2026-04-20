# Football GM Architecture (SPA Refactor)

## Overview

This document outlines the architecture for the refactored Football GM game. The goal is to separate concerns into a distinct UI layer (React), Core Logic layer (pure JS), and Data layer (IndexedDB), with heavy computation offloaded to a Web Worker.

## Directory Structure

```
src/
  core/           # Pure JS business logic (Shared between Main and Worker)
    game-runner.js
    game-simulator.js
    player.js
    league.js
    ...
  worker/         # Web Worker entry and handlers
    worker.js
  db/             # Persistence Layer
    index.js      # IndexedDB wrapper
    cache.js      # In-memory cache
  ui/             # React UI
    main.jsx      # Entry point
    App.jsx       # Root Component
    components/   # React Components
```

## Communication Flow

1.  **UI -> Worker**: The UI sends messages (e.g., `SIM_WEEK`) to the Worker via `postMessage`.
2.  **Worker -> Core**: The Worker invokes pure functions in `src/core/` to perform calculations.
3.  **Worker -> DB**: The Worker (or Core) saves/loads state from IndexedDB.
4.  **Worker -> UI**: The Worker sends results back to the UI via `postMessage`.

## Key Modules

-   **Core**: Contains `GameRunner`, `GameSimulator`, `Player`, `League`, etc. These must be pure ES modules with no DOM dependencies.
-   **Worker**: Handles the game loop and state management during simulation.
-   **DB**: Uses IndexedDB to store the `league` object. A caching layer optimizes read access.

## Data Persistence

-   **Storage**: IndexedDB (using `idb` pattern or raw API).
-   **Schema**:
    -   `leagues` store: Keyed by `leagueId`. Value is the full league object (or chunked).
    -   `games` store: Historical game results (if needed to separate from league object).

## Performance

-   **Web Worker**: Ensures the UI remains responsive during simulation.
-   **Caching**: `src/db/cache.js` maintains the active league in memory to avoid frequent IDB reads/writes during simulation loops.
