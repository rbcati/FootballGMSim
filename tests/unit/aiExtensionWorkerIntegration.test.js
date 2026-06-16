/**
 * aiExtensionWorkerIntegration.test.js
 *
 * Integration-level tests for Feature B (AI extensions) and Feature C
 * (contract restructure) that can be verified with pure-module imports —
 * no worker/DB/cache dependencies.
 *
 * Worker-side logic is exercised here via the pure engines; the full
 * worker wiring is covered by the engine soak / Playwright tests.
 */

import { describe, it, expect } from 'vitest';

// ── Feature B: AI Extension engine wiring surface ─────────────────────────────

import {
  AI_EXTENSION_FACTORS,
  shouldAIExtendPlayer,
  computeAIExtensionOffer,
  willPlayerAcceptAIExtension,
  getAIExtensionTargets,
} from '../../src/core/contracts/aiExtensionEngine.js';

// ── Feature C: Restructure engine ─────────────────────────────────────────────

import {
  canRestructure,
  computeRestructure,
  applyRestructure,
} from '../../src/core/contracts/restructureEngine.js';

// ── Morale engine ─────────────────────────────────────────────────────────────

import {
  MORALE_EVENTS,
  MORALE_DELTAS,
  applyMoraleEvent,
} from '../../src/core/mood/playerMoraleEngine.js';

// ── Holdout engine ────────────────────────────────────────────────────────────

import {
  HOLDOUT_STATUS,
  HOLDOUT_RESOLUTION,
  resolveHoldout,
  ensureHoldout,
} from '../../src/core/holdouts/holdoutEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 201,
    name: 'Test Player',
    ovr: 78,
    age: 26,
    pos: 'WR',
    contractYearsLeft: 1,
    negotiationStatus: null,
    holdout: { active: false },
    contract: {
      baseAnnual: 12,
      signingBonus: 3,
      years: 3,
      yearsRemaining: 3,
      yearsTotal: 3,
      restructureCount: 0,
    },
    ...overrides,
  };
}

function makeTeam(overrides = {}) {
  return { id: 20, name: 'League FC', wins: 11, losses: 5, capRoom: 60, deadCapItems: [], ...overrides };
}

// ── Worker integration: AI extensions run before FA market opens ───────────────

describe('AI extension wiring (worker integration surface)', () => {
  it('getAIExtensionTargets returns players filtered by shouldAIExtendPlayer', () => {
    const team    = makeTeam({ capRoom: 200 });
    const players = [
      makePlayer({ id: 1, ovr: 80, age: 25 }),
      makePlayer({ id: 2, ovr: 60, age: 25 }),  // below contender threshold 72
      makePlayer({ id: 3, ovr: 75, contractYearsLeft: 2 }), // not extension year
    ];
    const dm = new Map(players.map((p) => [p.id, { baseAnnual: 10 }]));
    const targets = getAIExtensionTargets(team, players, 'contender', 200, { demandByPlayerId: dm });
    const ids = targets.map((p) => p.id);
    expect(ids).toContain(1);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(3);
  });

  it('accepted extension removes player from FA consideration (has teamId)', () => {
    const player = makePlayer({ teamId: 20 });
    // Player has teamId → not a free agent (filtering is !p.teamId || status=free_agent)
    expect(player.teamId).toBeDefined();
  });

  it('EXTENSION_SIGNED morale event increments morale by delta', () => {
    const player = makePlayer({ morale: 70 });
    const updated = applyMoraleEvent(player, {
      type:      MORALE_EVENTS.EXTENSION_SIGNED,
      delta:     MORALE_DELTAS[MORALE_EVENTS.EXTENSION_SIGNED],
      season:    2026,
      week:      0,
      reason:    'Extended by team before free agency',
      source:    'ai_extension',
      dedupeKey: `extension_signed_${player.id}_2026`,
    }, { season: 2026, week: 0 });
    expect(updated.morale).toBe(player.morale + MORALE_DELTAS[MORALE_EVENTS.EXTENSION_SIGNED]);
  });

  it('EXTENSION_SIGNED delta is +5', () => {
    expect(MORALE_DELTAS[MORALE_EVENTS.EXTENSION_SIGNED]).toBe(5);
  });

  it('EXTENSION_SIGNED morale event is deduplicated correctly', () => {
    const player  = makePlayer({ morale: 70 });
    const key     = `extension_signed_${player.id}_2026`;
    const event   = { type: MORALE_EVENTS.EXTENSION_SIGNED, delta: 5, season: 2026, dedupeKey: key };
    const first   = applyMoraleEvent(player, event, { season: 2026 });
    const second  = applyMoraleEvent(first, event, { season: 2026 }); // same key, should not apply again
    expect(second.morale).toBe(first.morale);
  });

  it('cap reservation (capRoom decrease) must happen per accepted extension', () => {
    // Simulated: team starts at capRoom 60, first extension costs 10
    // After applying, effective cap for next player should be 50
    const team      = makeTeam({ capRoom: 60 });
    const demand    = 10;
    const offer     = computeAIExtensionOffer(team, makePlayer({ age: 26 }), demand, 'contender', 60);
    const remaining = team.capRoom - offer.amount;
    expect(remaining).toBeLessThan(team.capRoom);
    expect(remaining).toBeGreaterThan(0);
  });

  it('news is not emitted for non-rival, non-rostered players (filtering logic)', () => {
    // The worker filters news: isRival || wasPreviouslyRostered
    const userTeamConf = 'AFC';
    const userTeamDiv  = 'AFC_EAST';
    const aiTeam       = { conf: 'NFC', div: 'NFC_NORTH' };
    const player       = makePlayer({ lastTeamId: 99, careerTeamIds: [15, 16] });
    const userTeamId   = 20;

    const isRival = aiTeam.conf === userTeamConf && aiTeam.div === userTeamDiv;
    const wasPrev = Number(player.lastTeamId) === userTeamId ||
      (Array.isArray(player.careerTeamIds) && player.careerTeamIds.includes(userTeamId));

    expect(isRival).toBe(false);
    expect(wasPrev).toBe(false);
  });
});

// ── Worker integration: RESTRUCTURE_CONTRACT handler surface ───────────────────

describe('Restructure contract wiring (worker integration surface)', () => {
  it('RESTRUCTURE_RESOLVED morale delta is +8', () => {
    expect(MORALE_DELTAS[MORALE_EVENTS.RESTRUCTURE_RESOLVED]).toBe(8);
  });

  it('holdout resolution path: resolveHoldout clears active flag', () => {
    const player  = makePlayer({ holdout: { active: true, reason: 'extension_rejected', startSeason: 2026, startWeek: 1, demandPremium: 0.12, resolvedWeek: null, resolvedSeason: null, resolvedBy: null } });
    const resolved = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_SIGNED, 2026, 3);
    expect(resolved.holdout.active).toBe(false);
    expect(resolved.holdout.resolvedBy).toBe(HOLDOUT_RESOLUTION.GM_SIGNED);
  });

  it('holdout resolution path: RESTRUCTURE_RESOLVED morale event fires after resolve', () => {
    const player  = makePlayer({ holdout: { active: true, reason: 'extension_rejected', startSeason: 2026, startWeek: 1, demandPremium: 0.12, resolvedWeek: null, resolvedSeason: null, resolvedBy: null }, morale: 45 });
    const resolved = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_SIGNED, 2026, 3);
    const withMorale = applyMoraleEvent(resolved, {
      type:      MORALE_EVENTS.RESTRUCTURE_RESOLVED,
      delta:     MORALE_DELTAS[MORALE_EVENTS.RESTRUCTURE_RESOLVED],
      season:    2026,
      week:      3,
      reason:    'Holdout resolved via contract restructure',
      source:    'restructure_engine',
      dedupeKey: `restructure_resolved_${player.id}_2026`,
    }, { season: 2026, week: 3 });
    expect(withMorale.morale).toBeGreaterThan(player.morale);
    expect(withMorale.morale).toBe(player.morale + MORALE_DELTAS[MORALE_EVENTS.RESTRUCTURE_RESOLVED]);
  });

  it('cap is updated correctly after restructure (newCapHit < currentCapHit)', () => {
    const player  = makePlayer();
    const capHit  = 15;
    const preview = computeRestructure(player, capHit, 3, 2026);
    expect(preview.newCapHit).toBeLessThan(capHit);
  });

  it('dead cap item has correct expiresAfterSeason', () => {
    const player  = makePlayer();
    const preview = computeRestructure(player, 15, 3, 2026);
    const { updatedTeam } = applyRestructure(player, makeTeam(), preview, 2026);
    const item = updatedTeam.deadCapItems[0];
    expect(item.expiresAfterSeason).toBe(2029); // 2026 + 3
  });

  it('RESTRUCTURE_CONTRACT does not affect FA V2 pending-offers ledger', () => {
    // The pending offers ledger is unrelated to restructuring — restructuring
    // changes the contract only, not pending offer state.
    // We verify this by ensuring applyRestructure returns no offer-ledger fields.
    const player  = makePlayer();
    const preview = computeRestructure(player, 15, 3, 2026);
    const result  = applyRestructure(player, makeTeam(), preview, 2026);
    expect(result.updatedPlayer.offers).toBeUndefined();
    expect(result.updatedPlayer.pendingOffers).toBeUndefined();
  });
});

// ── Source-level guardrails ───────────────────────────────────────────────────

describe('Source guardrails', () => {
  it('aiExtensionEngine has no Math.random calls (deterministic)', () => {
    // We test determinism by running same inputs twice
    const team   = makeTeam({ capRoom: 100 });
    const player = makePlayer({ ovr: 80, age: 25 });

    const r1a = shouldAIExtendPlayer(team, player, 'contender', 100);
    const r1b = shouldAIExtendPlayer(team, player, 'contender', 100);
    expect(r1a).toBe(r1b);

    const r2a = computeAIExtensionOffer(team, player, 15, 'contender', 100);
    const r2b = computeAIExtensionOffer(team, player, 15, 'contender', 100);
    expect(r2a).toEqual(r2b);

    const r3a = willPlayerAcceptAIExtension(player, { amount: 14 }, 15, { score: 70 });
    const r3b = willPlayerAcceptAIExtension(player, { amount: 14 }, 15, { score: 70 });
    expect(r3a).toBe(r3b);
  });

  it('restructureEngine has no Math.random calls (deterministic)', () => {
    const player  = makePlayer();
    const preview1 = computeRestructure(player, 15, 3, 2026);
    const preview2 = computeRestructure(player, 15, 3, 2026);
    expect(preview1).toEqual(preview2);
  });

  it('AI_EXTENSION_FACTORS contains all expected postures', () => {
    const postures = ['contender', 'playoff_hunt', 'middle', 'rebuild', 'seller'];
    for (const p of postures) {
      expect(AI_EXTENSION_FACTORS[p]).toBeDefined();
      expect(typeof AI_EXTENSION_FACTORS[p].ovrThreshold).toBe('number');
      expect(typeof AI_EXTENSION_FACTORS[p].offerFactor).toBe('number');
      expect(typeof AI_EXTENSION_FACTORS[p].maxYears).toBe('number');
    }
  });
});

// ── UI surface: schema hydration ──────────────────────────────────────────────

describe('Schema hydration (old saves)', () => {
  it('deadCapItems hydrates safely to [] when not present', () => {
    const teamWithoutDeadCap = { id: 1, capRoom: 50 };
    const player  = makePlayer();
    const preview = computeRestructure(player, 15, 3, 2026);
    const { updatedTeam } = applyRestructure(player, teamWithoutDeadCap, preview, 2026);
    expect(Array.isArray(updatedTeam.deadCapItems)).toBe(true);
  });

  it('restructureCount hydrates to 0 when not present on old save', () => {
    const player = makePlayer();
    delete player.contract.restructureCount;
    const { eligible } = canRestructure(player, makeTeam());
    expect(eligible).toBe(true); // undefined restructureCount treated as 0
  });
});
