# Football GM Sim: Architecture Refactor Proposal

## 1. Ranked Architecture Options

### **Rank #1: Hybrid Approach (Vite + Web Workers)**
**Score: 9.5/10**
*   **Runtime Performance:** Superior. Moving the simulation engine (week/season simulation) to a **Web Worker** frees the main thread, ensuring the UI (animations, hover states, scrolling) remains buttery smooth even while simulating 10+ seasons in the background.
*   **Maintainability:** High. Enforces a strict boundary between "Simulation Logic" (Worker) and "View Layer" (Main Thread). Messages passed between them must be serializable data, preventing accidental DOM coupling in logic code.
*   **DX (Developer Experience):** Excellent. Vite handles the complexity of bundling the worker and provides HMR (Hot Module Replacement).

### **Rank #2: Bundled Approach (Vite/Rollup)**
**Score: 7/10**
*   **Runtime Performance:** Moderate. Better than current state (tree-shaking, minification), but the simulation logic still competes with the UI on the single main thread. Heavy calculations *will* freeze the browser.
*   **Maintainability:** Good. Solves the `index.html` script-soup problem and allows for proper dependency graphs.
*   **DX:** Excellent. Fast builds and standard ESM syntax.

### **Rank #3: Native ES Modules (No Build Step)**
**Score: 4/10**
*   **Runtime Performance:** Poor. While standard, loading 60+ separate files creates a network waterfall (even with HTTP/2). More importantly, it does nothing to solve the main-thread blocking issue.
*   **Maintainability:** Moderate. Requires maintaining a manual import map or careful ordering. Caching is harder (no content hashing).
*   **DX:** Poor. No type checking, linting, or HMR during development.

---

## 2. Challenge the Premise: Why Native ESM is Insufficient

**"Refactoring to ESM" organizes your code, but it does not optimize its execution.**

The primary bottleneck in a Simulation Game is **CPU blocking**, not file loading.
*   **The Problem:** Currently, when `simulateWeek()` runs, it occupies the browser's single thread. The user cannot click "Pause", hover over stats, or even see a loading spinner animation update until the math finishes.
*   **ESM Limitation:** Importing `simulation.js` as a native module `import { sim } from './simulation.js'` still runs that code on the main UI thread.
*   **The Solution:** You *must* move the heavy math to a **Web Worker**. This physically separates the logic into a parallel thread. The Hybrid approach (Rank #1) handles this complexity for you via Vite.

---

## 3. Implementation Plan (Hybrid / Vite + Workers)

### **New Directory Structure**

We will move from a flat structure to a Domain-Driven Design.

```text
/
├── public/                 # Static assets (images, sounds, json)
├── src/
│   ├── core/               # PURE JS: No DOM access allowed here.
│   │   ├── engine/         # The "Brain"
│   │   │   ├── match.js    # Single game logic
│   │   │   ├── season.js   # Week advancement logic
│   │   │   └── draft.js    # Draft logic
│   │   ├── data/           # Static data (teams, schedule templates)
│   │   └── models/         # Data structures (Player, Team classes)
│   │
│   ├── ui/                 # VIEW LAYER: DOM manipulation only.
│   │   ├── components/     # Reusable UI parts (Card, Table)
│   │   ├── views/          # Page views (Hub, Roster, Dashboard)
│   │   └── main.js         # Entry point (Mounts UI, starts Worker)
│   │
│   ├── workers/            # The Bridge
│   │   └── sim.worker.js   # Handles messages: { type: 'SIM_WEEK', payload: league }
│   │
│   └── utils/              # Shared pure functions (math, formatting)
│
├── index.html              # Clean entry point (only script src="/src/ui/main.js")
├── package.json            # Vite dependencies
└── vite.config.js          # Build config
```

### **Migration Strategy: Isolating the Simulation Engine**

To prevent main-thread blocking, we must sever the link between `Logic` and `DOM`.

**Step 1: The "Context Object" Pattern**
Currently, `simulation.js` calls `window.setStatus()` or reads `document.getElementById()`.
*   **Refactor:** Pass a `callbacks` object into the simulation functions.
*   **Before:** `window.setStatus("Simulating...")`
*   **After:** `callbacks.onStatusChange("Simulating...")`

**Step 2: The Worker Bridge**
Create `src/workers/sim.worker.js`. This worker will hold the "Headless" version of the league state.

```javascript
// src/workers/sim.worker.js
import { simulateRegularSeasonWeek } from '../core/engine/season.js';

let leagueState = null;

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'INIT_LEAGUE') {
    leagueState = payload;
  }

  if (type === 'SIM_WEEK') {
    // RUN HEAVY MATH HERE
    const results = simulateRegularSeasonWeek(leagueState);

    // Send Delta back to UI
    self.postMessage({ type: 'WEEK_COMPLETE', results });
  }
};
```

**Step 3: The UI Consumer**
The Main Thread sends commands and updates the UI *only* when the worker replies.

```javascript
// src/ui/main.js
const simWorker = new Worker(new URL('../workers/sim.worker.js', import.meta.url), { type: 'module' });

function advanceWeek() {
  // UI: Show Spinner
  showLoading();

  // LOGIC: Offload to worker
  simWorker.postMessage({ type: 'SIM_WEEK' });
}

simWorker.onmessage = (e) => {
  if (e.data.type === 'WEEK_COMPLETE') {
    // UI: Update DOM with new stats
    updateDashboard(e.data.results);
    hideLoading();
  }
};
```
