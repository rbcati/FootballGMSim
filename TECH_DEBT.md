# Tech Debt & Refactoring Report

## Overview
This document outlines technical debt, code duplication, and refactoring opportunities identified during the analysis of the codebase.

## 1. Code Duplication

### Simulation Logic
*   **Issue**: Game simulation logic is split between `simulation.js` (regular season) and `playoffs.js` (postseason).
*   **Details**:
    *   `simulation.js` uses `simulateWeek` to iterate through the schedule.
    *   `playoffs.js` uses `simPlayoffWeek` to iterate through bracket rounds.
    *   Both rely on `window.simGameStats`, but the surrounding logic for result recording and UI updates is duplicated.
*   **Recommendation**: Extract a common `BatchSimulator` or `GameRunner` class that can handle a list of matchups (whether from schedule or bracket) and return standardized results.

### UI Rendering
*   **Issue**: Multiple files (`ui.js`, `playoffs.js`, `roster.js`) implement their own HTML string builders for player cards, team rows, and game results.
*   **Recommendation**: Create a dedicated `Component` library or use a lightweight templating system to standardize UI elements.

## 2. Global State & Dependencies

### Global Pollution
*   **Issue**: The application relies heavily on `window.state`, `window.league`, and attaching functions to the `window` object (e.g., `window.startPlayoffs`).
*   **Impact**: This makes dependencies implicit, testing difficult, and increases the risk of naming collisions.
*   **Recommendation**: Continue the migration to ES Modules. Ensure all state is managed via `state.js` exports rather than the global window object. Remove `window.*` assignments where possible.

### Module Loading Inconsistency
*   **Issue**: Some files (like `playoffs.js` prior to recent fixes) were written as ES Modules (using `import`) but loaded as classic scripts in `index.html`.
*   **Impact**: Potential runtime errors and confusion about the module system in use.
*   **Recommendation**: Audit `index.html` to ensure all files using `import/export` are loaded with `type="module"`.

## 3. Fragile Code Patterns

### Inline Event Handlers in HTML Strings
*   **Issue**: UI components often use inline handlers like `onclick="if(window.showPlayerDetails) ..."` within template literals.
*   **Impact**:
    *   Security risk (XSS if data isn't sanitized).
    *   Fragile: If the global function name changes, the UI breaks without errors until interaction.
*   **Recommendation**: Attach event listeners via JavaScript (`addEventListener`) after element creation, or use event delegation on container elements.

### Hardcoded Logic
*   **Issue**: Magic numbers and hardcoded configuration exist in logic files (e.g., `TEAMS_PER_CONF = 7` in `playoffs.js`).
*   **Recommendation**: Move all configuration constants to `constants.js` and import them.

## 4. Refactoring Clusters

### Simulation Cluster
*   **Files**: `simulation.js`, `playoffs.js`, `coach-system.js`
*   **Action**: Unify game simulation loops and result processing. (Completed: Unified in `game-simulator.js` via `simulateMatchup`)

### UI/View Cluster
*   **Files**: `ui.js`, `awards-viewer.js`, `stats-viewer.js`, `playoffs.js` (rendering parts)
*   **Action**: Standardize on a single rendering pattern (e.g., helper functions for common components like "Team Logo", "Player Row").

### State Management
*   **Files**: `state.js`, `main.js`, `league.js`
*   **Action**: Centralize all league modification actions (Draft, Trade, Sign, Sim) into a `LeagueActions` module that interacts with `state.js`.
