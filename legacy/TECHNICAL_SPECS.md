# Hybrid Architecture Technical Specifications

## 1. Data Bridge Protocol

### Objective
Establish a reliable and efficient mechanism for transferring "League State" (rosters, stats, schedule) between the Main Thread (UI) and the Web Worker (Simulation Logic).

### Comparison: postMessage vs. SharedArrayBuffer

| Feature | `postMessage` (Structured Clone) | `SharedArrayBuffer` (Shared Memory) |
| :--- | :--- | :--- |
| **Data Transfer** | Deep Copy (Serialization/Deserialization) | Zero-copy access |
| **Data Structure** | Supports complex nested Objects, Arrays, Maps, Sets | Requires strict `TypedArrays` (Int32Array, Float32Array) |
| **Thread Safety** | Safe by design (Memory isolation) | Requires manual locking (`Atomics.wait/notify`) |
| **Implementation Effort** | **Low**: Works with existing `window.state.league` structure | **High**: Requires complete rewrite of data model to Data-Oriented Design (SoA) |
| **Performance** | Slower for massive datasets (100MB+) due to cloning | Extremely fast for numeric data |

### Recommendation
**Selected Protocol: `postMessage`**

**Justification:**
The current codebase relies heavily on dynamic JavaScript objects (`league.teams`, `player.stats`, `schedule`). Converting this entire graph to a flat binary buffer for `SharedArrayBuffer` compatibility would require a complete rewrite of the simulation engine and data layer ("breaking the current logic").
`postMessage` with the Structured Clone algorithm is optimized in modern browsers and is sufficient for the text-based simulation data size (typically <5MB per transfer).

### Overhead Minimization Strategy
To reduce the cloning overhead of `postMessage`:
1.  **Stripping**: The Worker does not need the entire history array or UI-specific state (like `fanSatisfaction` history). These should be stripped before sending if possible.
2.  **Delta Returns**: The Worker should not return the full League object. It should return only the modified data (see Section 2).

## 2. Worker Simulation Protocol

### Input (Main -> Worker)
Event: `SIM_WEEK`
Payload:
```json
{
  "league": { ... }, // The current league state
  "options": { ... } // Simulation options (e.g., stopping criteria)
}
```

### Output (Worker -> Main)
Event: `SIM_COMPLETE`
Payload (The Delta):
```json
{
  "success": true,
  "results": [ ... ], // Array of game result objects (Game Logs)
  "updatedTeams": [ ... ], // Array of Team objects that were modified (rosters, stats, records)
  "scheduleUpdates": [ ... ] // IDs of games marked as 'played'
}
```

**Merge Logic (Main Thread):**
1.  **Results**: Append new results to `league.resultsByWeek`.
2.  **Teams**: Replace the local team instances with the `updatedTeams` (matching by ID). This updates rosters, stats, and records in one go.
3.  **Schedule**: Mark specific games as played in the local schedule.

## 3. Architecture Migration Steps
1.  **Isolate Logic**: Refactor `simulation.js` to separate UI calls (`setStatus`, `renderHub`) from core logic.
2.  **Worker Setup**: Initialize `simulation.worker.js` via Vite.
3.  **Async State**: Update `main.js` to await Worker responses instead of calling `simulateWeek` synchronously.
