/**
 * negotiationModifiersIntegration.test.js
 *
 * Integration tests for V2 negotiation modifiers:
 *  - demand calc wiring (modifier changes demand in expected direction)
 *  - disgruntled player demand < neutral baseline
 *  - MVP player demand > neutral baseline
 *  - championship franchise lowers demand vs non-championship baseline
 *  - playoff drought franchise raises demand vs standard baseline
 *  - fairness guard / offer feedback still runs after modifiers
 *  - old save (no award/morale fields) applies zero modifier safely
 */

import { describe, it, expect } from 'vitest';
import {
  LEVERAGE_MODIFIERS,
  computePlayerLeverage,
  computeFranchiseReputation,
  applyNegotiationModifiers,
  getNegotiationContext,
} from '../contracts/negotiationModifiers.js';
import { buildOfferFeedback } from '../freeAgency/pendingOffers.js';
import { getPlayerMoraleSummary } from '../mood/playerMoraleEngine.js';
import { getPlayerAwardSummary } from '../awards/awardEngine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_DEMAND = { baseAnnual: 15, yearsTotal: 3, signingBonus: 5, guaranteedPct: 0.5 };

function neutralPlayer() {
  return { id: 1, name: 'Neutral Player', pos: 'QB', ovr: 80, age: 27, morale: 70, moraleEvents: [], awards: [] };
}

function disgruntledPlayer() {
  return { ...neutralPlayer(), morale: 28 };
}

function mvpPlayer(currentSeason = 2025) {
  return {
    ...neutralPlayer(),
    morale: 70,
    awards: [{ type: 'MVP', season: currentSeason - 1, dedupeKey: `MVP_${currentSeason - 1}` }],
  };
}

function standardMeta() {
  return { season: 2025, userTeamId: 1, franchiseAwards: [], franchiseHistoryByTeam: {} };
}

function championshipMeta(teamId = 1) {
  return {
    ...standardMeta(),
    franchiseAwards: [
      { type: 'LEAGUE_CHAMPION', season: 2023, teamId },
      { type: 'LEAGUE_CHAMPION', season: 2024, teamId },
    ],
  };
}

function droughtMeta(teamId = 1) {
  return {
    ...standardMeta(),
    franchiseHistoryByTeam: {
      [String(teamId)]: {
        teamId,
        seasons: [
          { year: 2022, wins: 5, losses: 12, madePlayoffs: false },
          { year: 2023, wins: 6, losses: 11, madePlayoffs: false },
          { year: 2024, wins: 7, losses: 10, madePlayoffs: false },
        ],
      },
    },
  };
}

function computeAdjustedDemand(player, meta, season = 2025, teamId = 1) {
  const moraleSummary = getPlayerMoraleSummary(player);
  const awardSummary = getPlayerAwardSummary(player);
  const leverage = computePlayerLeverage(player, { moraleSummary, awardSummary, currentSeason: season });
  const franchise = computeFranchiseReputation(meta, { userTeamId: teamId, currentSeason: season });
  return applyNegotiationModifiers(BASE_DEMAND, leverage, franchise);
}

// ── Demand direction tests ────────────────────────────────────────────────────

describe('FA demand calculation integrates negotiation modifiers', () => {
  it('disgruntled player demand is lower than neutral baseline', () => {
    const neutral = computeAdjustedDemand(neutralPlayer(), standardMeta());
    const disgruntled = computeAdjustedDemand(disgruntledPlayer(), standardMeta());
    expect(disgruntled.baseAnnual).toBeLessThan(neutral.baseAnnual);
    // Exact delta: MORALE_DISGRUNTLED = -0.10
    expect(disgruntled.baseAnnual).toBeCloseTo(BASE_DEMAND.baseAnnual * (1 + LEVERAGE_MODIFIERS.MORALE_DISGRUNTLED), 1);
  });

  it('MVP player demand is higher than neutral baseline', () => {
    const neutral = computeAdjustedDemand(neutralPlayer(), standardMeta());
    const mvp = computeAdjustedDemand(mvpPlayer(2025), standardMeta());
    expect(mvp.baseAnnual).toBeGreaterThan(neutral.baseAnnual);
    expect(mvp._negotiationShift).toBeCloseTo(LEVERAGE_MODIFIERS.MVP_RECENT, 3);
  });

  it('championship franchise lowers demand vs non-championship baseline', () => {
    const standardDemand = computeAdjustedDemand(neutralPlayer(), standardMeta());
    const champDemand = computeAdjustedDemand(neutralPlayer(), championshipMeta());
    expect(champDemand.baseAnnual).toBeLessThan(standardDemand.baseAnnual);
    expect(champDemand._negotiationShift).toBeCloseTo(LEVERAGE_MODIFIERS.FRANCHISE_CHAMPION, 3);
  });

  it('playoff drought franchise raises demand vs standard baseline', () => {
    const standardDemand = computeAdjustedDemand(neutralPlayer(), standardMeta());
    const droughtDemand = computeAdjustedDemand(neutralPlayer(), droughtMeta());
    expect(droughtDemand.baseAnnual).toBeGreaterThan(standardDemand.baseAnnual);
    expect(droughtDemand.baseAnnual).toBeCloseTo(BASE_DEMAND.baseAnnual * (1 + LEVERAGE_MODIFIERS.FRANCHISE_DROUGHT), 1);
  });

  it('player awards and franchise rep stack to produce correct combined shift', () => {
    // MVP (+0.15) + championship franchise (-0.05) = +0.10
    const demand = computeAdjustedDemand(mvpPlayer(2025), championshipMeta());
    const expectedShift = LEVERAGE_MODIFIERS.MVP_RECENT + LEVERAGE_MODIFIERS.FRANCHISE_CHAMPION;
    expect(demand.baseAnnual).toBeCloseTo(BASE_DEMAND.baseAnnual * (1 + expectedShift), 1);
    expect(demand._negotiationShift).toBeCloseTo(expectedShift, 3);
  });

  it('modifiers from old save (no awards, no morale) apply zero change', () => {
    const legacyPlayer = { id: 99, name: 'Legacy', pos: 'RB', ovr: 72 };
    const demand = computeAdjustedDemand(legacyPlayer, standardMeta());
    expect(demand.baseAnnual).toBe(BASE_DEMAND.baseAnnual);
    expect(demand._negotiationShift ?? 0).toBe(0);
  });
});

// ── Offer feedback still runs after modifiers ─────────────────────────────────

describe('existing fairness guard still runs after negotiation modifiers', () => {
  it('buildOfferFeedback still marks weak offer as "weak" after MVP modifier raises demand', () => {
    // After MVP modifier, demand goes up 15% → previously-ok offer now looks weak
    const adjustedDemand = computeAdjustedDemand(mvpPlayer(2025), standardMeta());
    // Submit a contract at original base (before modifier) — now below the adjusted ask
    const contract = { baseAnnual: BASE_DEMAND.baseAnnual, yearsTotal: 3, signingBonus: 0 };
    const feedback = buildOfferFeedback({
      contract,
      demand: adjustedDemand,
      playerAge: 27,
      competingOfferCount: 0,
    });
    // The offer is now at ~87% of adjusted demand ($15M / $17.25M ≈ 0.87) — "competitive" or below
    expect(feedback.verdict).not.toBe('strong');
    expect(feedback.score).toBeLessThanOrEqual(90);
  });

  it('buildOfferFeedback marks "strong" offer as strong even with disgruntled player discount', () => {
    // Disgruntled drops demand by 10% — a previously-strong offer should still look strong
    const adjustedDemand = computeAdjustedDemand(disgruntledPlayer(), standardMeta());
    // Offer exactly at the ORIGINAL demand (above the adjusted lower demand)
    const contract = { baseAnnual: BASE_DEMAND.baseAnnual, yearsTotal: 3, signingBonus: 5 };
    const feedback = buildOfferFeedback({
      contract,
      demand: adjustedDemand,
      playerAge: 27,
      competingOfferCount: 0,
    });
    // Offer at $15M vs adjusted demand $13.5M → offer is above demand → "strong"
    expect(feedback.verdict).toBe('strong');
  });

  it('negotiation shift is deterministic across multiple calls', () => {
    const player = mvpPlayer(2025);
    const meta = standardMeta();
    const d1 = computeAdjustedDemand(player, meta);
    const d2 = computeAdjustedDemand(player, meta);
    expect(d1.baseAnnual).toBe(d2.baseAnnual);
    expect(d1._negotiationShift).toBe(d2._negotiationShift);
  });
});

// ── Morale events still work after V2 wiring ─────────────────────────────────

describe('morale engine still functions correctly alongside V2 modifiers', () => {
  it('getPlayerMoraleSummary reads morale from player correctly', () => {
    const summary = getPlayerMoraleSummary(disgruntledPlayer());
    expect(summary.score).toBe(28);
    expect(summary.label).toBe('Disgruntled');
    expect(summary.isLow).toBe(true);
  });

  it('getPlayerAwardSummary reads awards from player correctly', () => {
    const player = mvpPlayer(2025);
    const summary = getPlayerAwardSummary(player);
    expect(summary.mvpCount).toBe(1);
    expect(summary.totalAwards).toBe(1);
  });

  it('modifiers use morale summary score, not raw engine (pass-through contract)', () => {
    // If moraleSummary is passed with score = 30, it uses that regardless of player.morale
    const player = { ...neutralPlayer(), morale: 70 };
    const overrideSummary = { score: 30, label: 'Disgruntled', topEvent: null, isLow: true, isAlert: false };
    const leverage = computePlayerLeverage(player, { moraleSummary: overrideSummary, awardSummary: {}, currentSeason: 2025 });
    expect(leverage.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.MORALE_DISGRUNTLED);
  });
});

// ── getNegotiationContext end-to-end ──────────────────────────────────────────

describe('getNegotiationContext end-to-end', () => {
  it('combines player and franchise context into correct labels', () => {
    const player = neutralPlayer(); // morale 70, no awards
    const meta = droughtMeta();
    const moraleSummary = getPlayerMoraleSummary(player);
    const awardSummary = getPlayerAwardSummary(player);
    const ctx = getNegotiationContext(player, meta, { moraleSummary, awardSummary, currentSeason: 2025, userTeamId: 1 });
    expect(ctx.leverageLabel).toBe('High Leverage'); // drought +8% makes it positive
    expect(ctx.reputationLabel).toContain('drought');
    expect(ctx.feedbackLine).toBeTruthy();
  });

  it('championship franchise overrides drought and applies discount', () => {
    const player = neutralPlayer();
    const meta = championshipMeta();
    const moraleSummary = getPlayerMoraleSummary(player);
    const awardSummary = getPlayerAwardSummary(player);
    const ctx = getNegotiationContext(player, meta, { moraleSummary, awardSummary, currentSeason: 2025, userTeamId: 1 });
    expect(ctx.leverageLabel).toBe('Discount'); // champ -5%
    expect(ctx.reputationLabel).toContain('Championship');
  });

  it('no modifiers → Standard label with null feedbackLine', () => {
    const player = neutralPlayer();
    const meta = standardMeta();
    const moraleSummary = getPlayerMoraleSummary(player);
    const awardSummary = getPlayerAwardSummary(player);
    const ctx = getNegotiationContext(player, meta, { moraleSummary, awardSummary, currentSeason: 2025, userTeamId: 1 });
    expect(ctx.leverageLabel).toBe('Standard');
    expect(ctx.feedbackLine).toBeNull();
  });
});
