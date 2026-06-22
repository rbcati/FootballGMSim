/**
 * frontOfficePersonaEngine.js — Per-team front office philosophy & decision persona
 *
 * Pure, deterministic module. No Math.random, no UI imports, no worker imports.
 * All outputs are immutable new objects.
 */

// ── Persona constants ──────────────────────────────────────────────────────────

export const FRONT_OFFICE_PERSONAS = Object.freeze({
  WIN_NOW:         'WIN_NOW',
  PATIENT_BUILDER: 'PATIENT_BUILDER',
  CAP_HOARDER:     'CAP_HOARDER',
  PLAYER_LOYALIST: 'PLAYER_LOYALIST',
});

// ── FNV-1a 32-bit hash (no Math.random) ──────────────────────────────────────

function _hash(input) {
  const str = String(input);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    h = h >>> 0;
  }
  return h;
}

// ── Profile multiplier tables ─────────────────────────────────────────────────

const PROFILE_DEFAULTS = Object.freeze({
  [FRONT_OFFICE_PERSONAS.WIN_NOW]: Object.freeze({
    persona:             FRONT_OFFICE_PERSONAS.WIN_NOW,
    tradeAggressiveness: 0.75,
    draftPickPremium:    0.60,
    extensionTolerance:  0.85,
  }),
  [FRONT_OFFICE_PERSONAS.PATIENT_BUILDER]: Object.freeze({
    persona:             FRONT_OFFICE_PERSONAS.PATIENT_BUILDER,
    tradeAggressiveness: 0.35,
    draftPickPremium:    1.40,
    extensionTolerance:  0.65,
  }),
  [FRONT_OFFICE_PERSONAS.CAP_HOARDER]: Object.freeze({
    persona:             FRONT_OFFICE_PERSONAS.CAP_HOARDER,
    tradeAggressiveness: 0.45,
    draftPickPremium:    1.10,
    extensionTolerance:  0.45,
  }),
  [FRONT_OFFICE_PERSONAS.PLAYER_LOYALIST]: Object.freeze({
    persona:             FRONT_OFFICE_PERSONAS.PLAYER_LOYALIST,
    tradeAggressiveness: 0.50,
    draftPickPremium:    0.90,
    extensionTolerance:  1.20,
  }),
});

/**
 * Returns the frozen multiplier profile for a persona.
 *
 * @param {string} persona
 * @returns {object} Frozen profile
 */
export function buildFrontOfficeProfile(persona) {
  return PROFILE_DEFAULTS[persona] ?? PROFILE_DEFAULTS[FRONT_OFFICE_PERSONAS.PATIENT_BUILDER];
}

// ── determineInitialPersona ───────────────────────────────────────────────────

/**
 * Deterministically derive the initial front office persona from team state.
 * No Math.random.
 *
 * Signals (in priority order):
 *  1. Contender OVR + aging roster → WIN_NOW
 *  2. Cap-stressed + at least mid-pack OVR → CAP_HOARDER
 *  3. Weak OVR or very young roster → PATIENT_BUILDER
 *  4. Hash-based deterministic fallback for mid-pack teams
 *
 * @param {object} team
 * @param {object} [context] - { allTeams }
 * @returns {object} Full frontOffice profile with persona
 */
export function determineInitialPersona(team, context = {}) {
  const allTeams = context.allTeams ?? [];
  const capUsed  = Number(team?.capUsed ?? 0);
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

  // Rule 1: Contender + aging roster → WIN_NOW
  if (pctile >= 0.60 && avgAge >= 27) {
    return buildFrontOfficeProfile(FRONT_OFFICE_PERSONAS.WIN_NOW);
  }

  // Rule 2: Cap-stressed and at least mid-pack → CAP_HOARDER
  if (capPct >= 0.92 && pctile >= 0.40) {
    return buildFrontOfficeProfile(FRONT_OFFICE_PERSONAS.CAP_HOARDER);
  }

  // Rule 3: Weak or very young → PATIENT_BUILDER
  if (pctile <= 0.35 || avgAge < 24) {
    return buildFrontOfficeProfile(FRONT_OFFICE_PERSONAS.PATIENT_BUILDER);
  }

  // Rule 4: Hash-based deterministic fallback for mid-pack teams
  const hashVal = _hash(String(team?.id ?? '') + String(team?.name ?? ''));
  const fallbacks = [
    FRONT_OFFICE_PERSONAS.WIN_NOW,
    FRONT_OFFICE_PERSONAS.PLAYER_LOYALIST,
    FRONT_OFFICE_PERSONAS.CAP_HOARDER,
    FRONT_OFFICE_PERSONAS.PATIENT_BUILDER,
  ];
  return buildFrontOfficeProfile(fallbacks[hashVal % fallbacks.length]);
}

// ── applyTradePersonaModifier ─────────────────────────────────────────────────

/**
 * Returns the persona-adjusted value of a trade asset from a given team's perspective.
 * Immutable — does not modify inputs.
 *
 * WIN_NOW:
 *   giving a pick        → 0.80× (own future picks de-valued)
 *   receiving veteran ≤30 → 1.15× (immediate help up-valued)
 *
 * PATIENT_BUILDER:
 *   receiving a pick     → 1.20× (incoming picks up-valued)
 *   any player age ≥30   → 0.82× (aging veterans down-valued)
 *
 * @param {object} team   - Team with team.frontOffice
 * @param {object} asset  - { type: 'pick'|'player', player?, pick? }
 * @param {number} baseValue
 * @param {object} [context] - { direction: 'receiving'|'giving' }
 * @returns {number} Adjusted value
 */
export function applyTradePersonaModifier(team, asset, baseValue, context = {}) {
  const persona   = team?.frontOffice?.persona;
  const direction = context.direction ?? 'receiving';
  const base      = Number(baseValue) || 0;
  if (!persona || !base) return base;

  let multiplier = 1.0;

  if (persona === FRONT_OFFICE_PERSONAS.WIN_NOW) {
    if (asset.type === 'pick' && direction === 'giving') {
      multiplier = 0.80;
    } else if (asset.type === 'player') {
      const age = Number(asset.player?.age ?? 28);
      if (direction === 'receiving' && age <= 30) {
        multiplier = 1.15;
      }
    }
  }

  if (persona === FRONT_OFFICE_PERSONAS.PATIENT_BUILDER) {
    if (asset.type === 'pick' && direction === 'receiving') {
      multiplier = 1.20;
    } else if (asset.type === 'player') {
      const age = Number(asset.player?.age ?? 28);
      if (age >= 30) {
        multiplier = 0.82;
      }
    }
  }

  return base * multiplier;
}

// ── shouldCapHoarderWalkAway ──────────────────────────────────────────────────

/**
 * CAP_HOARDER: returns true when a Shark agent's premium exceeds the configured
 * threshold (12% above fair market), triggering a budget-limit walk-away.
 *
 * @param {object} team
 * @param {object} [negotiationContext] - { sharkPremiumPct: number }
 * @returns {boolean}
 */
export function shouldCapHoarderWalkAway(team, negotiationContext = {}) {
  if (team?.frontOffice?.persona !== FRONT_OFFICE_PERSONAS.CAP_HOARDER) return false;
  const THRESHOLD = 0.12;
  const sharkPct  = Number(negotiationContext.sharkPremiumPct ?? 0);
  return sharkPct > THRESHOLD;
}

// ── getRetentionPremium ───────────────────────────────────────────────────────

/**
 * PLAYER_LOYALIST: returns a modest retention-value multiplier for homegrown stars.
 *
 * "Homegrown" = drafted by this team OR tenured ≥ 3 seasons.
 * "Star"      = OVR ≥ 80.
 *
 * When premium > 1.0, the player accepts a proportionally lower effective salary
 * from a team that values them more (they want to stay).
 *
 * @param {object} team
 * @param {object} player
 * @param {object} [context] - { teamId }
 * @returns {number} Multiplier (1.0 = no premium)
 */
export function getRetentionPremium(team, player, context = {}) {
  if (team?.frontOffice?.persona !== FRONT_OFFICE_PERSONAS.PLAYER_LOYALIST) return 1.0;

  const ovr         = Number(player?.ovr ?? 0);
  const tenure      = Number(player?.tenureYears ?? player?.yearsWithTeam ?? 0);
  const teamId      = team?.id ?? context.teamId;
  const draftedHere = player?.draftedByTeamId != null &&
    String(player.draftedByTeamId) === String(teamId);
  const isHomegrown = draftedHere || tenure >= 3;
  const isStar      = ovr >= 80;

  if (isHomegrown && isStar) return 1.08;
  if (isHomegrown)           return 1.04;
  if (isStar)                return 1.03;
  return 1.0;
}

// ── maybeDriftPersona ─────────────────────────────────────────────────────────

/**
 * Offseason persona drift — v1 (narrow, deterministic).
 *
 * Only drift implemented:
 *   WIN_NOW + 2 consecutive missed postseasons → PATIENT_BUILDER
 *
 * Other personas remain stable in v1.
 * Immutable — returns null when no change is needed, or a new frontOffice object.
 *
 * @param {object} team - Team with team.frontOffice
 * @param {object} [driftContext] - { madePostseason: boolean }
 * @returns {object|null} Updated frontOffice or null
 */
export function maybeDriftPersona(team, driftContext = {}) {
  const profile = team?.frontOffice;
  if (!profile) return null;

  const persona        = profile.persona;
  const madePostseason = Boolean(driftContext.madePostseason);
  const currentStreak  = Number(profile.missedPostseasonStreak ?? 0);
  const newStreak      = madePostseason ? 0 : currentStreak + 1;

  if (persona === FRONT_OFFICE_PERSONAS.WIN_NOW && newStreak >= 2) {
    const newProfile = buildFrontOfficeProfile(FRONT_OFFICE_PERSONAS.PATIENT_BUILDER);
    return { ...newProfile, missedPostseasonStreak: 0 };
  }

  if (newStreak !== currentStreak) {
    return { ...profile, missedPostseasonStreak: newStreak };
  }

  return null;
}
