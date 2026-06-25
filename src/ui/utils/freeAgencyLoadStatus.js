/**
 * freeAgencyLoadStatus.js — honest load/empty status for Free Agency screens.
 *
 * The Free Agency page must never show filters over a blank list with no
 * explanation. This resolver classifies the current load into one explicit
 * state so the UI can render an accurate, actionable message:
 *
 *   loading      → fetch in flight
 *   error        → fetch failed or returned an unusable payload
 *   unavailable  → loaded, but free agency is not open in this phase
 *   empty        → free agency is open but the pool genuinely has no players
 *   ready        → players exist (filter-level emptiness handled by the table)
 */

// Phases in which a free-agent pool is expected to be browseable.
const FA_ACTIVE_PHASES = new Set([
  "free_agency",
  "offseason_resign",
  "open",
  "regular", // in-season street free agents
  "regular_season",
  "preseason",
]);

/**
 * @param {object} args
 * @param {boolean} args.loading       Fetch in flight.
 * @param {string|null} [args.error]   Error message, if the load failed.
 * @param {object|null} [args.faState] Worker payload ({ freeAgents, phase, ... }).
 * @param {number} [args.poolCount]    Size of the evaluated (unfiltered) pool.
 * @returns {{ state: "loading"|"error"|"unavailable"|"empty"|"ready", title: string, body: string }}
 */
export function resolveFreeAgencyLoadStatus({ loading, error, faState, poolCount } = {}) {
  if (loading) {
    return { state: "loading", title: "Loading free agents…", body: "Fetching the current market snapshot." };
  }

  if (error) {
    return {
      state: "error",
      title: "Failed to load free agents",
      body: typeof error === "string" && error.trim() ? error : "Something went wrong fetching the market. Try again.",
    };
  }

  // No payload at all (and not loading / not an explicit error) — treat as error
  // so the user gets an honest message rather than a silent blank list.
  if (!faState || typeof faState !== "object") {
    return {
      state: "error",
      title: "Failed to load free agents",
      body: "Free agent data was unavailable.",
    };
  }

  const count = Number.isFinite(poolCount)
    ? poolCount
    : (Array.isArray(faState.freeAgents) ? faState.freeAgents.length : 0);

  if (count > 0) {
    return { state: "ready", title: "", body: "" };
  }

  const phase = typeof faState.phase === "string" ? faState.phase : null;
  if (phase && !FA_ACTIVE_PHASES.has(phase)) {
    return {
      state: "unavailable",
      title: "Free agency unavailable during this phase",
      body: `Free agents become available later in the season cycle (current phase: ${phase.replace(/_/g, " ")}).`,
    };
  }

  return {
    state: "empty",
    title: phase === "offseason_resign" ? "No re-sign targets available" : "No free agents available",
    body: "There are no available players in the pool right now. Check back after roster cuts or as contracts expire.",
  };
}
