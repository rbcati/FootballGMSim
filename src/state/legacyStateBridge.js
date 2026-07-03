// legacyStateBridge.js — the ONLY module allowed to touch window.state.
//
// The worker (src/worker/worker.js + IndexedDB cache) is the authoritative
// league state. window.state exists purely for legacy compatibility: old
// modules and E2E tests still read it. Every remaining write to that global
// is funneled through this bridge so legacy behavior stays quarantined in
// one file and can eventually be deleted wholesale.
//
// Do not add app logic here. Do not import this from new feature code.

function hasWindow() {
  return typeof window !== 'undefined';
}

// Read the legacy global state object, or null when absent / not in a browser.
export function getLegacyState() {
  if (!hasWindow()) return null;
  return window.state || null;
}

// Replace the legacy global state object outright.
export function setLegacyState(nextState) {
  if (!hasWindow()) return nextState;
  window.state = nextState;
  return window.state;
}

// Shallow-merge a patch into the legacy state, only if it already exists.
// Mirrors the old inline `if (window.state) window.state.foo = …` writes.
export function patchLegacyState(patch) {
  const current = getLegacyState();
  if (!current || !patch || typeof patch !== 'object') return current;
  Object.assign(current, patch);
  return current;
}

// Reset the legacy state to a fresh object produced by `factory`.
//
// Legacy modules hold direct references to the state object, so when one
// already exists its identity must be preserved: clear every key in place,
// then assign the fresh values (the delete-loop that used to live in
// src/core/state.js). When no state exists yet, install the fresh object.
export function resetLegacyState(factory) {
  const fresh = typeof factory === 'function' ? factory() : {};
  if (!hasWindow()) return fresh;
  if (!window.state || typeof window.state !== 'object') {
    window.state = fresh;
    return window.state;
  }
  Object.keys(window.state).forEach((key) => {
    delete window.state[key];
  });
  Object.assign(window.state, fresh);
  return window.state;
}

// Legacy save delegate: the dashboard save system installs window.saveGame.
// src/core/state.js must not read window.saveGame directly — it asks the
// bridge, keeping the dual save path visible in exactly one place.
export function getLegacySaveDelegate() {
  if (!hasWindow()) return null;
  return typeof window.saveGame === 'function' ? window.saveGame : null;
}
