/*
 * Game Simulator (compatibility shim)
 * ───────────────────────────────────
 * The simulation engine has been decomposed into focused domain modules under
 * `src/core/simulation/`. This file is kept as a thin re-export so existing
 * importers (worker, game-runner, tests) continue to work unchanged.
 *
 * New code should import directly from `./simulation/index.js` or the specific
 * domain module it needs. There is intentionally NO logic here — it is pure
 * re-export surface, so it stays fully deterministic (seeded Utils PRNG only).
 */

export * from './simulation/index.js';
export { default } from './simulation/index.js';
