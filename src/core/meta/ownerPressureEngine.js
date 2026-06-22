/**
 * ownerPressureEngine.js — Owner Expectations & Job Security Engine
 *
 * Pure, deterministic module. No Math.random, no UI imports, no worker imports.
 * All outputs are immutable new objects. Inputs are never mutated.
 */

// ── Mandate constants ─────────────────────────────────────────────────────────

export const OWNER_MANDATES = Object.freeze({
  MAKE_PLAYOFFS:      'MAKE_PLAYOFFS',
  WIN_DIVISION:       'WIN_DIVISION',
  DEVELOP_YOUNG_CORE: 'DEVELOP_YOUNG_CORE',
  REDUCE_PAYROLL:     'REDUCE_PAYROLL',
});

const MANDATE_LABELS = Object.freeze({
  MAKE_PLAYOFFS:      'Make the Playoffs',
  WIN_DIVISION:       'Win the Division',
  DEVELOP_YOUNG_CORE: 'Develop Young Core',
  REDUCE_PAYROLL:     'Reduce Payroll',
});

// ── Profile builder ───────────────────────────────────────────────────────────

/**
 * Returns a safe owner profile with baseline values.
 *
 * @param {string} mandate - One of OWNER_MANDATES keys
 * @param {object} [overrides] - Optional overrides (hotSeatRating, seasonsUnderGoal, …)
 * @returns {object}
 */
export function buildOwnerProfile(mandate, overrides = {}) {
  const safeMandate = OWNER_MANDATES[mandate] ? mandate : OWNER_MANDATES.MAKE_PLAYOFFS;
  return {
    mandate: safeMandate,
    hotSeatRating: 25,
    seasonsUnderGoal: 0,
    ...overrides,
  };
}

// ── determineInitialMandate ───────────────────────────────────────────────────

/**
 * Deterministically derive the initial owner mandate from team state.
 * No Math.random. Same inputs always produce the same mandate.
 *
 * Priority (evaluated in order):
 *  1. Cap-stressed (capPct >= 0.92) → REDUCE_PAYROLL
 *  2. Weak OVR percentile (≤ 0.35) or very young roster → DEVELOP_YOUNG_CORE
 *  3. Top-tier percentile (≥ 0.65) → WIN_DIVISION
 *  4. Default → MAKE_PLAYOFFS
 *
 * @param {object} team
 * @param {object} [context] - { allTeams }
 * @returns {string} One of OWNER_MANDATES
 */
export function determineInitialMandate(team, context = {}) {
  const allTeams = context.allTeams ?? [];
  const capUsed  = Number(team?.capUsed  ?? 0);
  const capTotal = Number(team?.capTotal ?? 255_000_000);
  const capPct   = capTotal > 0 ? capUsed / capTotal : 0;

  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const avgAge  = roster.length > 0
    ? roster.reduce((s, p) => s + Number(p?.age ?? 25), 0) / roster.length
    : 25;

  // Power-rank percentile (1.0 = best team in league)
  let pctile = 0.5;
  if (allTeams.length > 0) {
    const sorted = [...allTeams].sort(
      (a, b) => Number(b.ovr ?? b.overallRating ?? 0) - Number(a.ovr ?? a.overallRating ?? 0),
    );
    const idx = sorted.findIndex(t => t.id === team.id);
    pctile = idx >= 0 ? 1 - idx / allTeams.length : 0.5;
  }

  // Rule 1: Cap-stressed → REDUCE_PAYROLL
  if (capPct >= 0.92) return OWNER_MANDATES.REDUCE_PAYROLL;

  // Rule 2: Weak or very young → DEVELOP_YOUNG_CORE
  if (pctile <= 0.35 || avgAge < 24) return OWNER_MANDATES.DEVELOP_YOUNG_CORE;

  // Rule 3: Top-tier → WIN_DIVISION
  if (pctile >= 0.65) return OWNER_MANDATES.WIN_DIVISION;

  // Rule 4: Solid middle → MAKE_PLAYOFFS
  return OWNER_MANDATES.MAKE_PLAYOFFS;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _winPct(t) {
  const wins   = Number(t?.wins   ?? 0);
  const ties   = Number(t?.ties   ?? 0);
  const losses = Number(t?.losses ?? 0);
  const total  = wins + losses + ties;
  return total > 0 ? (wins + ties * 0.5) / total : 0;
}

// ── evaluateMandate ───────────────────────────────────────────────────────────

/**
 * Evaluate whether a team fulfilled its owner mandate this season.
 *
 * @param {object} team         - Team object with `owner.mandate`, win/loss, capUsed, conf, div
 * @param {object} [context]    - { allTeams, playoffTeamIds, teamRoster }
 * @returns {{ achieved: boolean, reason: string, severity: 'normal'|'severe' }}
 */
export function evaluateMandate(team, context = {}) {
  const mandate = team?.owner?.mandate;
  if (!mandate) return { achieved: false, reason: 'No mandate set', severity: 'normal' };

  const allTeams = context.allTeams ?? [];
  const rawIds   = context.playoffTeamIds;
  const playoffTeamIds = rawIds instanceof Set
    ? rawIds
    : new Set(Array.isArray(rawIds) ? rawIds : []);
  const teamRoster = Array.isArray(context.teamRoster)
    ? context.teamRoster
    : Array.isArray(team?.roster) ? team.roster : [];

  const madePlayoffs = playoffTeamIds.has(team.id);

  switch (mandate) {
    case OWNER_MANDATES.MAKE_PLAYOFFS: {
      if (madePlayoffs) return { achieved: true, reason: 'Qualified for postseason', severity: 'normal' };
      return { achieved: false, reason: 'Missed the playoffs', severity: 'normal' };
    }

    case OWNER_MANDATES.WIN_DIVISION: {
      const sameDiv = allTeams.filter(t => t.conf === team.conf && t.div === team.div);
      const teamWP  = _winPct(team);
      const teamW   = Number(team?.wins ?? 0);
      const isDivWinner = sameDiv.length === 0 || sameDiv.every(
        t => t.id === team.id ||
          teamWP > _winPct(t) ||
          (Math.abs(teamWP - _winPct(t)) < 1e-9 && teamW >= Number(t?.wins ?? 0)),
      );
      if (isDivWinner) return { achieved: true, reason: 'Won the division', severity: 'normal' };
      const severity = !madePlayoffs ? 'severe' : 'normal';
      return { achieved: false, reason: 'Did not win the division', severity };
    }

    case OWNER_MANDATES.DEVELOP_YOUNG_CORE: {
      const young = teamRoster.filter(p => Number(p?.age ?? 30) < 25 && Number(p?.ovr ?? 0) >= 78);
      if (young.length >= 4) {
        return { achieved: true, reason: `${young.length} young contributors (U25, OVR 78+)`, severity: 'normal' };
      }
      return {
        achieved: false,
        reason: `Only ${young.length} young contributor${young.length === 1 ? '' : 's'} (U25, OVR 78+) — need 4`,
        severity: 'normal',
      };
    }

    case OWNER_MANDATES.REDUCE_PAYROLL: {
      const allCapUsed = allTeams.map(t => Number(t?.capUsed ?? 0)).sort((a, b) => a - b);
      const medianIdx  = Math.floor(allCapUsed.length / 2);
      const median     = allCapUsed.length > 0 ? allCapUsed[medianIdx] : 0;
      const teamCap    = Number(team?.capUsed ?? 0);
      if (teamCap <= median) {
        return { achieved: true, reason: 'Cap obligations in bottom half of league', severity: 'normal' };
      }
      return { achieved: false, reason: 'Cap obligations above league median', severity: 'normal' };
    }

    default:
      return { achieved: false, reason: `Unknown mandate: ${mandate}`, severity: 'normal' };
  }
}

// ── applyHotSeatDelta ─────────────────────────────────────────────────────────

/**
 * Apply a hot-seat rating change based on mandate evaluation.
 * Immutable — returns a new profile object.
 *
 * Success:
 *   hotSeatRating −15 (floor 0), seasonsUnderGoal reset to 0.
 * Failure:
 *   hotSeatRating +20; severe miss adds +15 more.
 *   seasonsUnderGoal incremented.
 *
 * @param {object} ownerProfile
 * @param {{ achieved: boolean, severity: string }} evaluation
 * @returns {object} Updated owner profile (new object)
 */
export function applyHotSeatDelta(ownerProfile, evaluation) {
  if (!ownerProfile) return ownerProfile;

  const current    = Number(ownerProfile.hotSeatRating ?? 25);
  const underGoal  = Number(ownerProfile.seasonsUnderGoal ?? 0);

  if (evaluation.achieved) {
    return {
      ...ownerProfile,
      hotSeatRating:    Math.max(0, current - 15),
      seasonsUnderGoal: 0,
    };
  }

  let delta = 20;
  if (evaluation.severity === 'severe') delta += 15;

  return {
    ...ownerProfile,
    hotSeatRating:    current + delta,
    seasonsUnderGoal: underGoal + 1,
  };
}

// ── shouldFireFrontOffice ─────────────────────────────────────────────────────

/**
 * Returns true when the hot-seat rating has reached the firing threshold (>= 100).
 *
 * @param {object} ownerProfile
 * @returns {boolean}
 */
export function shouldFireFrontOffice(ownerProfile) {
  return Number(ownerProfile?.hotSeatRating ?? 0) >= 100;
}

// ── buildAIFiringOutcome ──────────────────────────────────────────────────────

/**
 * Returns a deterministic reset plan for AI teams whose front office is fired.
 * No Math.random.
 *
 * Persona signal:
 *   Expensive failing roster (capPct ≥ 0.85 AND winPct < 0.5) → CAP_HOARDER
 *   Otherwise (weak/losing team)                               → PATIENT_BUILDER
 *
 * @param {object} team
 * @param {object} [context] - { allTeams }
 * @returns {{ newPersona: string, newMandate: string, newOwnerProfile: object }}
 */
export function buildAIFiringOutcome(team, context = {}) {
  const allTeams = context.allTeams ?? [];
  const capUsed  = Number(team?.capUsed  ?? 0);
  const capTotal = Number(team?.capTotal ?? 255_000_000);
  const capPct   = capTotal > 0 ? capUsed / capTotal : 0;
  const wins     = Number(team?.wins   ?? 0);
  const losses   = Number(team?.losses ?? 0);
  const winPct   = (wins + losses) > 0 ? wins / (wins + losses) : 0;

  const newPersona = (capPct >= 0.85 && winPct < 0.5) ? 'CAP_HOARDER' : 'PATIENT_BUILDER';

  // New mandate derived from post-firing team state
  let pctile = 0.5;
  if (allTeams.length > 0) {
    const sorted = [...allTeams].sort((a, b) => Number(b.ovr ?? 0) - Number(a.ovr ?? 0));
    const idx = sorted.findIndex(t => t.id === team.id);
    pctile = idx >= 0 ? 1 - idx / allTeams.length : 0.5;
  }

  const newMandate = capPct >= 0.92
    ? OWNER_MANDATES.REDUCE_PAYROLL
    : pctile <= 0.40
      ? OWNER_MANDATES.DEVELOP_YOUNG_CORE
      : OWNER_MANDATES.MAKE_PLAYOFFS;

  return {
    newPersona,
    newMandate,
    newOwnerProfile: buildOwnerProfile(newMandate, { hotSeatRating: 30, seasonsUnderGoal: 0 }),
  };
}

// ── getHotSeatStatus ──────────────────────────────────────────────────────────

/**
 * Returns a UI-friendly band string for the hot-seat rating.
 *
 * secure:    hotSeatRating  < 50
 * unstable:  hotSeatRating 50–79
 * high-risk: hotSeatRating >= 80
 *
 * @param {object} ownerProfile
 * @returns {'secure'|'unstable'|'high-risk'}
 */
export function getHotSeatStatus(ownerProfile) {
  const rating = Number(ownerProfile?.hotSeatRating ?? 25);
  if (rating < 50) return 'secure';
  if (rating < 80) return 'unstable';
  return 'high-risk';
}

// ── getMandateLabel ───────────────────────────────────────────────────────────

/**
 * Returns a human-readable label for a mandate key.
 *
 * @param {string} mandate
 * @returns {string}
 */
export function getMandateLabel(mandate) {
  return MANDATE_LABELS[mandate] ?? (mandate ? String(mandate).replace(/_/g, ' ') : 'Unknown');
}
