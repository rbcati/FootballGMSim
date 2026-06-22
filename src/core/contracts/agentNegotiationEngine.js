/**
 * agentNegotiationEngine.js — Player Agent Persona & Negotiation Friction
 *
 * Pure, deterministic module. No Math.random, no UI imports, no worker imports.
 * All outputs are immutable new objects.
 */

import { getPriorSeasonPrestigePremium } from '../awards/prestigeEngine.js';
import { shouldCapHoarderWalkAway, getRetentionPremium } from '../ai/frontOfficePersonaEngine.js';

// ── Archetype constants ───────────────────────────────────────────────────────

export const AGENT_ARCHETYPES = Object.freeze({
  SHARK:       'SHARK',
  LOYALIST:    'LOYALIST',
  RING_CHASER: 'RING_CHASER',
});

// ── FNV-1a 32-bit hash (no Math.random) ──────────────────────────────────────

function _hash(input) {
  const str = String(input);
  let h = 2166136261; // FNV offset basis (unsigned 32-bit)
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    h = h >>> 0; // keep unsigned
  }
  return h;
}

// ── Agent name tables ─────────────────────────────────────────────────────────

const _FIRST = [
  'Drew', 'Marcus', 'David', 'James', 'Scott', 'Michael', 'Andre', 'Leon',
  'Chris', 'Tyler', 'Evan', 'Grant', 'Victor', 'Nathan', 'Blake', 'Aaron',
  'Jordan', 'Brandon', 'Keith', 'Ryan',
];

const _LAST = [
  'Collier', 'Tanaka', 'Barnes', 'Ross', 'Winters', 'Fields', 'Church',
  'Harmon', 'Preston', 'Vaughn', 'Lowe', 'Drake', 'Silva', 'Mercer',
  'Holland', 'Cross', 'Stone', 'Sharp', 'Wells', 'Grant',
];

// ── generateDeterministicAgentProfile ────────────────────────────────────────

/**
 * Deterministic from player id / name seed.
 * Archetype distribution: SHARK 30%, LOYALIST 40%, RING_CHASER 30%.
 * No Math.random.
 *
 * @param {object} player
 * @returns {object} Frozen agent profile
 */
export function generateDeterministicAgentProfile(player) {
  const seed        = _hash(String(player?.id ?? '') + String(player?.name ?? ''));
  const archetypeN  = seed % 100;

  let archetype;
  if (archetypeN < 30)      archetype = AGENT_ARCHETYPES.SHARK;
  else if (archetypeN < 70) archetype = AGENT_ARCHETYPES.LOYALIST;
  else                       archetype = AGENT_ARCHETYPES.RING_CHASER;

  const greed          = (_hash(String(player?.id ?? '') + 'greed')   % 100) / 100;
  const aggressiveness = (_hash(String(player?.id ?? '') + 'aggr')    % 100) / 100;
  const patience       = (_hash(String(player?.id ?? '') + 'patience')% 100) / 100;

  const firstIdx  = _hash(String(player?.id ?? '') + 'fn') % _FIRST.length;
  const lastIdx   = _hash(String(player?.id ?? '') + 'ln') % _LAST.length;
  const agentName = `${_FIRST[firstIdx]} ${_LAST[lastIdx]}`;

  return Object.freeze({
    id:            `agent_${_hash(agentName)}`,
    name:          agentName,
    archetype,
    aggressiveness,
    greed,
    patience,
  });
}

// ── hydratePlayerAgent ────────────────────────────────────────────────────────

/**
 * If player.agent exists, return player unchanged.
 * Otherwise attach a generated deterministic profile.
 * Immutable — returns a new object.
 *
 * @param {object} player
 * @returns {object}
 */
export function hydratePlayerAgent(player) {
  if (!player) return player;

  const hasAgent = Boolean(player.agent);
  const hasState = Boolean(player.negotiationState);

  if (hasAgent && hasState) return player;

  const agent           = hasAgent ? player.agent : generateDeterministicAgentProfile(player);
  const negotiationState = hasState
    ? player.negotiationState
    : { negotiationsFrozenUntilSeason: null };

  return { ...player, agent, negotiationState };
}

// ── isNegotiationFrozen ───────────────────────────────────────────────────────

/**
 * @param {object} player
 * @param {number} currentSeason
 * @returns {boolean}
 */
export function isNegotiationFrozen(player, currentSeason) {
  const frozen = player?.negotiationState?.negotiationsFrozenUntilSeason;
  return frozen != null && frozen === currentSeason;
}

// ── internal: derive power-rank position from teamContext ─────────────────────

function _teamRank(teamContext) {
  const explicit = teamContext?.teamPowerRankPosition;
  if (typeof explicit === 'number' && explicit >= 1 && explicit <= 32) return explicit;
  const score = teamContext?.contenderScore;
  if (typeof score === 'number') {
    const clamped = Math.max(0, Math.min(100, score));
    return Math.round(1 + (100 - clamped) * 0.31);
  }
  return 16; // mid-table default
}

// ── computeAgentExpectedSalary ────────────────────────────────────────────────

/**
 * @param {{ player, baseFairMarketValue, teamContext }} params
 * @returns {{ expectedSalary, modifier, rationale, hardReject }}
 */
export function computeAgentExpectedSalary({ player, baseFairMarketValue, teamContext = {} }) {
  const hydrated        = hydratePlayerAgent(player);
  const agent           = hydrated.agent;
  const base            = Number(baseFairMarketValue) || 0;
  const archetype       = agent.archetype;
  const rank            = _teamRank(teamContext);
  const seasonsWithTeam = Number(player?.tenureYears ?? 0);

  let modifier   = 0;
  let rationale  = '';
  let hardReject = false;

  if (archetype === AGENT_ARCHETYPES.SHARK) {
    modifier  = agent.greed * 0.20;
    rationale = `Shark agent demands ${(modifier * 100).toFixed(1)}% premium`;

  } else if (archetype === AGENT_ARCHETYPES.LOYALIST) {
    if (seasonsWithTeam >= 3) {
      modifier  = -(agent.aggressiveness * 0.10);
      rationale = `Loyalist agent accepts ${Math.abs(modifier * 100).toFixed(1)}% team discount (${seasonsWithTeam} seasons)`;
    } else {
      modifier  = 0;
      rationale = 'Loyalist agent negotiating at fair market value';
    }

  } else if (archetype === AGENT_ARCHETYPES.RING_CHASER) {
    if (rank <= 8) {
      modifier  = -0.15; // 0.85× base
      rationale = `Ring Chaser takes contender discount (team rank ${rank})`;
    } else if (rank >= 25) {
      modifier  = 0.25; // 1.25× base
      rationale = `Ring Chaser demands rebuilding premium (team rank ${rank})`;
      // Deterministic ~50% hard reject on bottom-8 teams
      hardReject = (_hash(String(player?.id ?? '') + 'ring_reject') % 2) === 0;
    } else {
      modifier  = 0;
      rationale = 'Ring Chaser open to negotiation at fair market value';
    }
  }

  // Apply prior-season prestige premium (Pro Bowl / All-Pro leverage)
  const currentSeason = teamContext?.currentSeason;
  if (currentSeason != null) {
    const { hasPremium, multiplier, type } = getPriorSeasonPrestigePremium(hydrated, currentSeason);
    if (hasPremium) {
      const prestigeBonus = multiplier - 1.0;
      const extraSharkAllPro =
        archetype === AGENT_ARCHETYPES.SHARK &&
        (type === 'FIRST_TEAM_ALL_PRO' || type === 'SECOND_TEAM_ALL_PRO')
          ? 0.05
          : 0;
      modifier += prestigeBonus + extraSharkAllPro;
      rationale += `; prestige premium +${((prestigeBonus + extraSharkAllPro) * 100).toFixed(1)}% (${type})`;
    }
  }

  return { expectedSalary: base * (1 + modifier), modifier, rationale, hardReject };
}

// ── evaluateAgentNegotiation ──────────────────────────────────────────────────

/**
 * @param {{ player, offer, baseFairMarketValue, teamContext, currentSeason }} params
 * @returns {{ accepted, expectedSalary, rationale, rejectionCode, feedbackText, updatedPlayer }}
 */
export function evaluateAgentNegotiation({
  player,
  offer,
  baseFairMarketValue,
  teamContext = {},
  currentSeason,
}) {
  const hydrated    = hydratePlayerAgent(player);
  const agent       = hydrated.agent;
  const offerSalary = Number(offer?.salary ?? offer?.baseAnnual ?? 0);
  const base        = Number(baseFairMarketValue) || 0;

  // 1. Frozen gate
  if (isNegotiationFrozen(hydrated, currentSeason)) {
    return {
      accepted:       false,
      expectedSalary: base,
      rationale:      'Negotiations locked this season',
      rejectionCode:  'NEGOTIATIONS_FROZEN',
      feedbackText:   getAgentFeedbackText({ player: hydrated, rejectionCode: 'NEGOTIATIONS_FROZEN' }),
      updatedPlayer:  hydrated,
    };
  }

  const { expectedSalary, modifier, rationale, hardReject } =
    computeAgentExpectedSalary({ player: hydrated, baseFairMarketValue, teamContext });

  // 2a. CAP_HOARDER front office: walk away when a Shark demands above threshold
  if (agent.archetype === AGENT_ARCHETYPES.SHARK) {
    const teamFrontOffice = teamContext?.frontOffice;
    if (teamFrontOffice && shouldCapHoarderWalkAway(
      { frontOffice: teamFrontOffice },
      { sharkPremiumPct: modifier },
    )) {
      return {
        accepted:       false,
        expectedSalary,
        rationale:      'Cap Hoarder front office rejects Shark premium demand',
        rejectionCode:  'CAP_HOARDER_BUDGET_LIMIT',
        feedbackText:   "Our front office has strict budget parameters. The agent’s premium exceeds what we can allocate.",
        updatedPlayer:  hydrated,
      };
    }
  }

  // 2. Ring Chaser hard reject on losing team
  if (hardReject) {
    return {
      accepted:       false,
      expectedSalary,
      rationale,
      rejectionCode:  'RING_CHASER_HARD_REJECT',
      feedbackText:   getAgentFeedbackText({ player: hydrated, rejectionCode: 'RING_CHASER_HARD_REJECT', teamContext }),
      updatedPlayer:  hydrated,
    };
  }

  // 3. Shark walk-away: offer < 80% of base → freeze negotiations for this season
  if (agent.archetype === AGENT_ARCHETYPES.SHARK && base > 0 && offerSalary < base * 0.80) {
    const frozenPlayer = {
      ...hydrated,
      negotiationState: {
        ...hydrated.negotiationState,
        negotiationsFrozenUntilSeason: currentSeason,
      },
    };
    return {
      accepted:       false,
      expectedSalary,
      rationale:      'Insulting offer — Shark agent freezes negotiations',
      rejectionCode:  'NEGOTIATIONS_FROZEN',
      feedbackText:   getAgentFeedbackText({ player: hydrated, rejectionCode: 'NEGOTIATIONS_FROZEN' }),
      updatedPlayer:  frozenPlayer,
    };
  }

  // 4. Loyalist walk-away bypass: only rejects if offer < 50% of base
  if (agent.archetype === AGENT_ARCHETYPES.LOYALIST) {
    if (base > 0 && offerSalary < base * 0.50) {
      return {
        accepted:       false,
        expectedSalary,
        rationale:      'Even a loyalist will not accept a sub-50% lowball',
        rejectionCode:  'LOYALIST_LOWBALL',
        feedbackText:   getAgentFeedbackText({ player: hydrated, rejectionCode: 'LOYALIST_LOWBALL' }),
        updatedPlayer:  hydrated,
      };
    }
    // Loyalist accepts at or above expected
    const accepted = offerSalary >= expectedSalary;
    return {
      accepted,
      expectedSalary,
      rationale,
      rejectionCode:  accepted ? null : 'BELOW_EXPECTED',
      feedbackText:   accepted ? null : getAgentFeedbackText({ player: hydrated, rejectionCode: 'BELOW_EXPECTED' }),
      updatedPlayer:  hydrated,
    };
  }

  // 5. General case: compare offer to expectedSalary.
  // PLAYER_LOYALIST: homegrown stars accept a modestly lower effective floor
  // because they want to stay — the team's loyalty is worth something to them.
  let effectiveExpectedSalary = expectedSalary;
  {
    const teamFrontOffice = teamContext?.frontOffice;
    if (teamFrontOffice) {
      const premium = getRetentionPremium(
        { frontOffice: teamFrontOffice, id: teamContext?.teamId },
        hydrated,
        { teamId: teamContext?.teamId },
      );
      if (premium > 1.0) {
        effectiveExpectedSalary = expectedSalary / premium;
      }
    }
  }

  const accepted = offerSalary >= effectiveExpectedSalary;
  return {
    accepted,
    expectedSalary,
    rationale,
    rejectionCode:  accepted ? null : 'BELOW_EXPECTED',
    feedbackText:   accepted ? null : getAgentFeedbackText({ player: hydrated, rejectionCode: 'BELOW_EXPECTED' }),
    updatedPlayer:  hydrated,
  };
}

// ── getAgentBadgeMeta ─────────────────────────────────────────────────────────

/**
 * Returns UI metadata for the agent badge.
 *
 * @param {object} player
 * @param {object} [teamContext]
 * @returns {{ label, tone, shortDescription }}
 */
export function getAgentBadgeMeta(player, teamContext = {}) {
  const hydrated  = hydratePlayerAgent(player);
  const archetype = hydrated.agent?.archetype ?? AGENT_ARCHETYPES.LOYALIST;
  const rank      = _teamRank(teamContext);

  const MAP = {
    [AGENT_ARCHETYPES.SHARK]: {
      label:            '🦈 Shark Management (High Friction)',
      tone:             'shark',
      shortDescription: 'Aggressive agent. Expect premium demands and walk-away risk.',
    },
    [AGENT_ARCHETYPES.LOYALIST]: {
      label:            '🤝 Loyalist Sports (Team Friendly)',
      tone:             'loyalist',
      shortDescription: 'Team-friendly agent. Discounts available for long tenure.',
    },
    [AGENT_ARCHETYPES.RING_CHASER]: {
      label:            '🏆 Legacy First (Win-Driven)',
      tone:             'ring_chaser',
      shortDescription: rank <= 8
        ? 'Win-driven agent. Contender discount available.'
        : 'Win-driven agent. Demands premium on non-contenders.',
    },
  };

  return MAP[archetype] ?? MAP[AGENT_ARCHETYPES.LOYALIST];
}

// ── getAgentFeedbackText ──────────────────────────────────────────────────────

/**
 * Returns contextual feedback copy for a rejection.
 *
 * @param {{ player, rejectionCode, teamContext }} params
 * @returns {string}
 */
export function getAgentFeedbackText({ player, rejectionCode, teamContext = {} }) {
  const hydrated  = hydratePlayerAgent(player);
  const archetype = hydrated.agent?.archetype ?? AGENT_ARCHETYPES.LOYALIST;

  if (rejectionCode === 'NEGOTIATIONS_FROZEN') {
    return '🚨 Negotiations Frozen: This agent has locked down talks after an insulting opening offer.';
  }

  if (rejectionCode === 'RING_CHASER_HARD_REJECT') {
    return 'My client is focused on winning championships, not executing a slow rebuild here.';
  }

  if (rejectionCode === 'LOYALIST_LOWBALL') {
    return "My client has been loyal to this organization, but there's a limit. This offer is disrespectful.";
  }

  if (archetype === AGENT_ARCHETYPES.SHARK) {
    return 'My client knows his worth. Come back with a serious offer or we are testing free agency.';
  }

  if (archetype === AGENT_ARCHETYPES.RING_CHASER) {
    return 'My client needs assurance this team can compete. The numbers need to reflect the situation.';
  }

  // LOYALIST or generic BELOW_EXPECTED
  return 'We appreciate the offer, but my client deserves a fair deal that reflects his contributions.';
}

// ── shouldEscalateSharkPressure ───────────────────────────────────────────────

/**
 * True when: SHARK archetype + OVR >= 85 + final contract year + no extension reached.
 * Deterministic only; does not create a holdout — caller raises existing weight.
 *
 * @param {{ player, currentSeasonPhase, currentSeason }} params
 * @returns {boolean}
 */
export function shouldEscalateSharkPressure({ player, currentSeasonPhase, currentSeason }) {
  const hydrated  = hydratePlayerAgent(player);
  if (hydrated.agent?.archetype !== AGENT_ARCHETYPES.SHARK) return false;
  if (Number(player?.ovr ?? 0) < 85) return false;

  const yearsRemaining = Number(
    player?.contract?.yearsRemaining ??
    player?.contract?.years ??
    player?.contractYearsLeft ??
    2,
  );
  if (yearsRemaining > 1) return false;

  if (player?.extensionDecision === 'extended') return false;

  return true;
}
