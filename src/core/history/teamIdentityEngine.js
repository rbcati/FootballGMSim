/**
 * teamIdentityEngine.js — Per-team Jersey Retirement & Championship Wall engine
 *
 * Pure module: no side effects, no UI/worker/DOM imports, no Math.random.
 * All functions are immutable — inputs are never mutated.
 *
 * Stored under:
 *   team.retiredNumbers     — array of jersey numbers retired by the franchise
 *   team.championshipYears  — array of years the franchise won the championship
 */

/**
 * Returns the default team identity fields for new or migrated teams.
 */
export function createDefaultTeamIdentity() {
  return {
    retiredNumbers: [],
    championshipYears: [],
  };
}

/**
 * Retire a jersey number for a franchise.
 * Validates number is in 1–99 range and is an integer.
 * Ignores duplicate entries.
 * Sorts ascending for stable display.
 * Returns new team object — never mutates input.
 *
 * @param {Object} team   - { retiredNumbers: number[] }
 * @param {Object} player - { jerseyNumber: number }
 * @returns {Object} new team with updated retiredNumbers
 */
export function retireJerseyNumber(team, player) {
  const num = Number(player?.jerseyNumber);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > 99) {
    return team;
  }

  const current = Array.isArray(team?.retiredNumbers) ? team.retiredNumbers : [];
  if (current.includes(num)) return team;

  const updated = [...current, num].sort((a, b) => a - b);
  return { ...team, retiredNumbers: updated };
}

/**
 * Append a championship year to the franchise history.
 * Ignores duplicate years.
 * Sorted ascending (oldest to newest) for stable display.
 * Returns new team object — never mutates input.
 *
 * @param {Object} team - { championshipYears: number[] }
 * @param {number} year
 * @returns {Object} new team with updated championshipYears
 */
export function appendChampionshipYear(team, year) {
  const y = Number(year);
  if (!Number.isFinite(y) || !Number.isInteger(y)) return team;

  const current = Array.isArray(team?.championshipYears) ? team.championshipYears : [];
  if (current.includes(y)) return team;

  const updated = [...current, y].sort((a, b) => a - b);
  return { ...team, championshipYears: updated };
}

/**
 * Returns true if the given jerseyNumber is in the team's retiredNumbers list.
 *
 * @param {Object} team         - { retiredNumbers: number[] }
 * @param {number} jerseyNumber
 * @returns {boolean}
 */
export function isRetiredNumber(team, jerseyNumber) {
  const num = Number(jerseyNumber);
  if (!Number.isFinite(num)) return false;
  return Array.isArray(team?.retiredNumbers) && team.retiredNumbers.includes(num);
}

/**
 * Find an available jersey number that is neither retired nor already used.
 * Returns `preferredNumber` if it is valid (1–99 integer) and available.
 * Otherwise scans 1–99 deterministically and returns the first available.
 * Returns null only if all 99 numbers are somehow taken.
 *
 * No Math.random — fully deterministic.
 *
 * @param {number}   preferredNumber
 * @param {number[]} retiredNumbers  - Numbers retired by the franchise
 * @param {number[]} usedNumbers     - Numbers already in use on the current roster
 * @returns {number|null}
 */
export function findAvailableJerseyNumber(preferredNumber, retiredNumbers = [], usedNumbers = []) {
  const retired = new Set(retiredNumbers.map(Number).filter((n) => Number.isFinite(n)));
  const used    = new Set(usedNumbers.map(Number).filter((n) => Number.isFinite(n)));

  const pref = Number(preferredNumber);
  if (
    Number.isFinite(pref) &&
    Number.isInteger(pref) &&
    pref >= 1 &&
    pref <= 99 &&
    !retired.has(pref) &&
    !used.has(pref)
  ) {
    return pref;
  }

  for (let n = 1; n <= 99; n++) {
    if (!retired.has(n) && !used.has(n)) return n;
  }

  return null;
}

/**
 * Build UI-ready display objects for retired numbers, linking each number
 * to a Ring of Honor member's surname when a matching jerseyNumber is found.
 * Always returns an entry per number; surname is null when no ROH match exists.
 *
 * @param {Object}   team        - { retiredNumbers: number[] }
 * @param {Object[]} ringOfHonor - Array of ROH member objects { jerseyNumber, name }
 * @returns {Array<{ jerseyNumber: number, surname: string|null }>}
 */
export function buildRetiredNumberDisplay(team, ringOfHonor = []) {
  const retiredNumbers = Array.isArray(team?.retiredNumbers) ? team.retiredNumbers : [];
  const roh = Array.isArray(ringOfHonor) ? ringOfHonor : [];

  return retiredNumbers.map((num) => {
    const match = roh.find((m) => Number(m?.jerseyNumber) === num);
    let surname = null;
    if (match?.name) {
      const parts = String(match.name).trim().split(/\s+/);
      surname = parts.length > 0 ? (parts[parts.length - 1] ?? null) : null;
    }
    return { jerseyNumber: num, surname };
  });
}

/**
 * Deterministically derive a preferred jersey number for a position+id combo.
 * Used when generating jersey numbers for drafted/signed players.
 * Position ranges follow loose NFL convention:
 *   QB/K/P: 1–19  |  RB/DB/CB/S: 20–49  |  LB/OL: 50–79  |  DL: 50–79  |  WR/TE: 80–89
 * Falls back to 1–99 for unknown positions.
 *
 * @param {string} pos  - Position string
 * @param {string|number} playerId
 * @returns {number}   1–99 integer
 */
export function derivePreferredJerseyNumber(pos, playerId) {
  const RANGES = {
    QB: [1,  19],
    K:  [1,  19],
    P:  [1,  19],
    RB: [20, 49],
    CB: [20, 49],
    S:  [20, 49],
    LB: [50, 79],
    OL: [50, 79],
    DL: [50, 79],
    WR: [80, 89],
    TE: [80, 89],
  };
  const range = RANGES[String(pos).toUpperCase()] ?? [1, 99];
  const [lo, hi] = range;
  const span = hi - lo + 1;
  // Derive a stable offset from the playerId without Math.random
  const seed = String(playerId ?? '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return lo + (seed % span);
}
