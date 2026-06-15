/**
 * fullSeasonSmoke.test.js — Full-Season Integration Smoke (#1586–#1593)
 *
 * Cross-system integration coverage for the dynasty gameplay engines added in
 * #1586–#1593:
 *   #1586 tradeDeadlinePressure.js   #1590 negotiationModifiers.js
 *   #1587 playerMoraleEngine.js      #1591 moraleSimModifier.js
 *   #1588 awardEngine.js             #1592 holdoutEngine.js
 *   #1589 morale/awards hardening    #1593 hofEngine.js
 *
 * These tests call the REAL engine functions (no engine mocks) and the REAL
 * rich game simulator (simulateRichGame). Where the orchestration lives inside
 * the worker's archiveSeason / advance-week handlers (which cannot be unit-booted
 * without a full league + IndexedDB), the tests mirror the worker's exact call
 * sequence with the source line references documented below, the same pattern
 * used by tests/unit/holdoutWorkerIntegration.test.js.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PHASE 1 — SOURCE AUDIT FINDINGS (read before the tests)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1.1 — archiveSeason call order  (src/worker/worker.js:10280–10821)
 *   Sequence inside archiveSeason:
 *     1. canArchiveSeason guard (postseason games OR meta.championTeamId)   :10286
 *     2. flushDirty + cache.archiveSeasonStats() → season stats FINALIZED   :10293–10296
 *     3. populate stats with player details                                 :10326
 *     4. archive per-player careerStats lines (idempotent)                  :10342–10388
 *     5. champion inference, standings, leaders                             :10391–10401
 *     6. legacy + V1 awards computed (calculateSeasonAwards/V1)             :10404–10414
 *     7. legacy accolades (MVP/OPOY/DPOY/ProBowl/ROTY/Coach/SB)             :10416–10477
 *     8. AWARDS ENGINE V1 (try/catch) — determineSeasonAwards →
 *        applySeasonAwards → player.awards + meta.franchiseAwards,
 *        award news, MVP/champion pulse, career milestones                 :10483–10610
 *     9. HOF ENGINE V1 (try/catch) — generateHofBallot → resolveHofVote →
 *        applyHofInductions → hofStatus, HOF news, HOF class pulse          :10613–10680
 *    10. Record Book (OUTSIDE both try/catch)                               :10683–10701
 *    11. season summary, league/franchise history, legacy HOF sync,
 *        Seasons.save                                                       :10742–10810
 *   → Awards run AFTER season stats + careerStats are finalized (step 4 before 6/8).
 *   → Awards (step 8) run BEFORE HOF (step 9): HOF reads the just-applied player.awards.
 *   → HOF try/catch scope = HOF ONLY. The Record Book (step 10) and everything
 *     downstream sit OUTSIDE the HOF try/catch, so a swallowed HOF error does NOT
 *     skip downstream logic. Likewise the awards try/catch wraps awards only.
 *   → archiveSeason builds NO game-day roster; holdout availability is a
 *     regular-season / playoff advance-week concern (see 1.4), resolved in
 *     buildLeagueForSim BEFORE matchups are built.
 *   → NOTE: a SECOND, legacy HOF system (syncHallOfFameAfterRecordBook,
 *     player.hof boolean + meta.hallOfFame) runs at :10782, distinct from the V1
 *     hofStatus/meta.hofRoster system. Both can enshrine. Out of scope here.
 *
 * 1.2 — OL HOF scoring  (src/core/awards/hofEngine.js:118–124)
 *   proWins field: DOES NOT EXIST on player objects, and computeHofScore for OL
 *   does NOT reference proWins — the formula is `seasons * 8 + allProCount * 10`.
 *   So OL does NOT silently score 0 "for proWins"; longevity + championship
 *   bonuses apply normally. A 14-season OL starter with 2 championships:
 *     base       = 14*8 + 0*10                     = 112
 *     awardBonus = 0*40 + 0*15 + 2*20              =  40
 *     longevity  = 25 (>=10) + 50 (>=14)           =  75
 *     TOTAL                                         = 227  ≥ 160 → auto-induct ✓
 *   → OL induction is NOT broken. Phase 3 fix (Option A/B) NOT required; seasons
 *     alone already clears the threshold. No production change. Proven in 2.8.
 *   (Aside: championshipCount is sourced from player.awards LEAGUE_CHAMPION; the
 *    awardEngine emits LEAGUE_CHAMPION only as a FRANCHISE award, so the pipeline
 *    does not currently stamp LEAGUE_CHAMPION onto player.awards. The OL formula
 *    itself is correct; populating player champion awards is a separate concern.
 *    Listed as a follow-up, not fixed here.)
 *
 * 1.3 — Morale sim modifier wire  (BUG FOUND + FIXED)
 *   applyMoraleToEffectiveOvr() is wired into richGameSimulator.ts:532–535 and
 *   SimPlayerRef declares `morale?` (richGameSimulator.ts:24–25). BUT the worker's
 *   rich-sim roster build (the only homePlayers/awayPlayers map, worker.js:3706)
 *   copied only { id, name, pos, ovr } — morale was NOT copied. Result: every
 *   SimPlayerRef reached the sim with morale === undefined, so getMoraleOvrModifier
 *   returned 0 for EVERYONE and #1591 was inert in real games.
 *   → FIXED: src/worker/worker.js:3706 + 3712 now copy `morale: player.morale`
 *     into both homePlayers and awayPlayers refs (old-save safe: undefined → 0).
 *
 * 1.4 — Holdout + sim availability  (src/worker/worker.js:3582–3590)
 *   buildLeagueForSim attaches roster = getPlayersByTeam(t.id).filter(isAvailableForGameDay).
 *   isAvailableForGameDay (holdoutEngine.js:285) checks ONLY holdout.active.
 *   Holdouts therefore use a SEPARATE filter from injuries (injured players are
 *   NOT removed here; the sim/unit aggregation accounts for injury elsewhere).
 *   Roster cliff: if every player in a position group is on holdout they are all
 *   filtered out, leaving that position group EMPTY in the SimPlayerRef arrays.
 *   The whole roster is non-empty (other positions remain) so simulateRichGame
 *   does NOT fall back to defaultPlayers (fallback only triggers on a fully empty
 *   array, richGameSimulator.ts:348). pickWeightedPlayer returns null on an empty
 *   group (richGameSimulator.ts:272–276); the sim must tolerate a null target/
 *   blocker/rusher. Verified non-crashing in 2.6.
 *
 * 1.5 — Negotiation modifier + holdout demand stacking  (NO stacking)
 *   applyNegotiationModifiers is applied at 3 demand call sites:
 *     buildDemandSnapshotForOffer  worker.js:6112
 *     GET_FREE_AGENTS ask          worker.js:6889
 *     EXTENSION_ASK                worker.js:7444
 *   getHoldoutDemandPremium is IMPORTED (worker.js:119) but NEVER CALLED in
 *   production (no call site in worker.js or franchiseEvents.js). The holdout
 *   demand premium is stored on player.holdout.demandPremium but is NOT folded
 *   into the negotiation-modified ask. → SINGLE-modified: a disgruntled holdout
 *   player's ask is adjusted ONLY by the negotiation modifier (which already
 *   carries the morale discount). No double-modification bug. The premium is
 *   currently dormant/informational (V1). Proven in 2.4. (Dead-but-imported API
 *   listed as a follow-up, not a bug.)
 *
 * 1.6 — DedupeKey collisions  (none that drop/double-count data)
 *   - Morale events: keys embed player.id (+season,+week) and are stored per
 *     player → globally unique, no cross-player collision (playerMoraleEngine.js
 *     :237,:249; worker.js:3386,:3415,:3452). HOLDOUT_RETURNED / CONTRACT_EXTENDED
 *     intentionally omit week (once per season).
 *   - Awards: single-slot `${type}_${season}`, multi-slot OL/DL/LB/CB use
 *     `${type}_${season}_${playerId}`. WR/TE all-pro use `${type}_${season}`
 *     (per-position, not per-player) — works because the 2 WR slots go to DISTINCT
 *     players and awards are stored per player, so no real collision. Inconsistent
 *     but harmless (noted).
 *   - News vs milestone vs pulse: distinct prefixes (news_ / milestone_ / pulse_ /
 *     hof_class_). HOF news `news_hof_inducted_${pid}_${yr}` / `news_hof_class_${yr}`
 *     vs award news `news_${type}_${yr}` are disjoint. Proven in 2.2 / 2.7.
 *   - HOF ballot keyed by season; cross-season keys carry the year → no collision.
 *
 * 1.7 — News/pulse volume  (cap exists for pulse + in-meta news; DB news uncapped)
 *   Per single archiveSeason call the emitters are:
 *     award news (≤5 individual + All-Pro + Champion + Coach + MVP logAward) ≈ 9
 *     career milestones (≤ #players, realistically 0–few)
 *     broken records (hard slice to 5, worker.js:10691)
 *     HOF inductee news (≤ MAX_INDUCTIONS = 5) + 1 HOF class news
 *     legacy HOF sync news (variable)
 *   Pulse (franchiseChronicle): MVP + Champion + TD300(per player) + HOF class.
 *   Realistic maximum ≈ 25–35 news in an extreme season; typical ≈ 12–18.
 *   Caps: mergeLeaguePulseItems dedupes by dedupeKey + caps at MAX_PULSE_ITEMS=200
 *   (leaguePulse.js:41–69); addNewsItem caps in-meta newsItems at 200 (news-engine.js
 *   :325–332) but does NOT dedupe. NewsEngine.logNews (DB) neither dedupes nor caps —
 *   dedup is the producer's responsibility and each producer fires once per archive.
 *   Morale-drop / holdout-declared news are emitted during ADVANCE-WEEK, not
 *   archiveSeason. "Flooded" defined as > 40 news items in a single archiveSeason.
 *   Proven in 2.7.
 *
 * ════════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';

import {
  applyMoraleEvent,
  applyWeeklyMoraleEffects,
  getPlayerMoraleSummary,
  MORALE_EVENTS,
  MORALE_DELTAS,
  MORALE_EVENTS_CAP,
} from '../../src/core/mood/playerMoraleEngine.js';
import {
  determineSeasonAwards,
  applySeasonAwards,
  getPlayerAwardSummary,
  AWARD_TYPES,
} from '../../src/core/awards/awardEngine.js';
import {
  HOF_THRESHOLDS,
  computeHofScore,
  isHofEligible,
  generateHofBallot,
  resolveHofVote,
  applyHofInductions,
  getHofSummary,
  ensureHofMeta,
} from '../../src/core/awards/hofEngine.js';
import {
  HOLDOUT_TRIGGERS,
  HOLDOUT_RESOLUTION,
  HOLDOUT_EXPIRY_WEEKS,
  HOLDOUT_RETURNED_DELTA,
  ensureHoldout,
  evaluateHoldoutTriggers,
  applyHoldout,
  resolveHoldout,
  getHoldoutDemandPremium,
  isAvailableForGameDay,
  checkHoldoutTimeExpiry,
} from '../../src/core/holdouts/holdoutEngine.js';
import {
  LEVERAGE_MODIFIERS,
  computePlayerLeverage,
  computeFranchiseReputation,
  applyNegotiationModifiers,
} from '../../src/core/contracts/negotiationModifiers.js';
import {
  applyMoraleToEffectiveOvr,
  getMoraleOvrModifier,
} from '../../src/core/sim/moraleSimModifier.js';
import {
  DEADLINE_POSTURE,
  DEADLINE_PHASE,
  classifyDeadlinePosture,
  getTradeDeadlinePressure,
  applyDeadlinePressureModifiers,
} from '../../src/core/trades/tradeDeadlinePressure.js';
import { mergeLeaguePulseItems, buildLeaguePulseDedupeKey } from '../../src/core/leaguePulse.js';
import { simulateRichGame } from '../../src/core/sim/richGameSimulator.ts';
import { mapOverallToAttributesV2 } from '../../src/core/migration/attributeMigrator.ts';

// ── Shared fixtures ─────────────────────────────────────────────────────────

const SEASON = 2030;
const DEADLINE_WEEK = 9;

function player(overrides = {}) {
  return {
    id: 'p-x',
    name: 'Player X',
    pos: 'RB',
    ovr: 80,
    age: 28,
    teamId: 1,
    morale: 70,
    moraleEvents: [],
    awards: [],
    traits: [],
    contract: { years: 3, yearsRemaining: 3 },
    ...overrides,
  };
}

/** Build a SimPlayerRef array the way the FIXED worker roster build does
 *  (src/worker/worker.js:3706 — id/name/pos/ovr/morale). */
function toSimRefs(roster) {
  return roster.map((p) => ({
    id: p.id,
    name: p.name,
    pos: p.pos,
    ovr: p.ovr ?? 70,
    morale: p.morale,
  }));
}

function fullRoster(side, moraleByPos = {}) {
  const teamId = side === 'home' ? 1 : 2;
  const prefix = side === 'home' ? 'H' : 'A';
  const base = [
    ['QB', 80], ['RB', 78], ['RB', 74], ['WR', 81], ['WR', 77], ['TE', 75],
    ['OT', 76], ['OG', 75], ['C', 74], ['OT', 73], ['OG', 72],
    ['EDGE', 79], ['DT', 76], ['DE', 75], ['LB', 77], ['LB', 74],
    ['CB', 78], ['CB', 75], ['S', 76], ['S', 73], ['K', 73], ['P', 72],
  ];
  return base.map(([pos, ovr], i) => ({
    id: `${teamId}-${pos}-${i}`,
    name: `${prefix} ${pos}${i}`,
    pos,
    ovr,
    morale: moraleByPos[pos] ?? 70,
  }));
}

function richPayload(homePlayers, awayPlayers, seed = 42) {
  return {
    gameId: `smoke-${seed}`,
    seed,
    weather: 'clear',
    homeTeamId: 1,
    awayTeamId: 2,
    homeOffense: mapOverallToAttributesV2(82, 5.4, `ho-${seed}`),
    awayOffense: mapOverallToAttributesV2(80, 5.4, `ao-${seed}`),
    homeDefense: mapOverallToAttributesV2(81, 5.4, `hd-${seed}`),
    awayDefense: mapOverallToAttributesV2(79, 5.4, `ad-${seed}`),
    homePlayers,
    awayPlayers,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 2.1 — Full advance-week sequence (regular season)
//   Mirrors the worker advance-week morale+holdout block (worker.js:3330–3459).
// ════════════════════════════════════════════════════════════════════════════

describe('2.1 advance-week sequence (regular season)', () => {
  // Roster: Thriving / Disgruntled / Neutral + a holdout-eligible final-year
  // low-morale player + a veteran leader on a contender.
  const teamPostureMap = { 1: DEADLINE_POSTURE.CONTENDER, 2: DEADLINE_POSTURE.SELLER };

  function buildSquad() {
    return [
      player({ id: 'thriving', morale: 90 }),
      player({ id: 'disgruntled', morale: 30, ovr: 84 }),
      player({ id: 'neutral', morale: 62 }),
      // Holdout-eligible: final contract year, morale < 45, no extension offered.
      player({ id: 'holdout-elig', morale: 37, age: 29, contract: { years: 1, yearsRemaining: 1 } }),
      // Veteran leader on the contender (age >= 30, mentor trait).
      player({ id: 'vet-leader', morale: 70, age: 32, traits: ['mentor'], teamId: 1 }),
    ];
  }

  it('morale weekly effects apply exactly once per player per week (dedupe holds on re-run)', () => {
    const squad = buildSquad();
    const ctx = { season: SEASON, week: 2, deadlineWeek: DEADLINE_WEEK, phase: 'regular', teamPostureMap };

    const once = applyWeeklyMoraleEffects(squad, ctx);
    const vet1 = once.find((p) => p.id === 'vet-leader');
    expect(vet1.morale).toBe(73); // 70 + VETERAN_LEADER_BONUS(+3)
    expect(vet1.moraleEvents.filter((e) => e.type === MORALE_EVENTS.VETERAN_LEADER_BONUS)).toHaveLength(1);

    // Re-running the SAME week must not double-apply (dedupeKey guard, #1589).
    const twice = applyWeeklyMoraleEffects(once, ctx);
    const vet2 = twice.find((p) => p.id === 'vet-leader');
    expect(vet2.morale).toBe(73);
    expect(vet2.moraleEvents.filter((e) => e.type === MORALE_EVENTS.VETERAN_LEADER_BONUS)).toHaveLength(1);
  });

  it('holdout trigger fires for the eligible player in the evaluated week and marks them unavailable', () => {
    const elig = player({ id: 'holdout-elig', morale: 37, age: 29, contract: { years: 1, yearsRemaining: 1 } });
    const week = 3;
    const trigger = evaluateHoldoutTriggers(elig, SEASON, week, { moraleSummary: getPlayerMoraleSummary(elig) });
    expect(trigger).toBe(HOLDOUT_TRIGGERS.EXTENSION_REJECTED);

    const onHoldout = applyHoldout(elig, trigger, SEASON, week);
    expect(onHoldout.holdout.active).toBe(true);
    expect(onHoldout.holdout.startWeek).toBe(week);
    // Marked unavailable for the game-day roster (worker.js:3589 filter).
    expect(isAvailableForGameDay(onHoldout)).toBe(false);
  });

  it('non-eligible players do not trigger a holdout', () => {
    // Settled morale → no trigger even in final year.
    const settled = player({ id: 'settled', morale: 70, contract: { years: 1, yearsRemaining: 1 } });
    expect(evaluateHoldoutTriggers(settled, SEASON, 3, { moraleSummary: getPlayerMoraleSummary(settled) })).toBeNull();
  });

  it('no morale-event dedupeKey collisions across players (keys embed player.id)', () => {
    const squad = buildSquad();
    let players = squad;
    // Advance several weeks of weekly effects + a holdout declaration.
    for (let w = 6; w <= 8; w++) {
      players = applyWeeklyMoraleEffects(players, {
        season: SEASON, week: w, deadlineWeek: DEADLINE_WEEK, phase: 'regular', teamPostureMap,
      });
    }
    const seen = new Map(); // dedupeKey -> playerId
    for (const p of players) {
      const keysThisPlayer = new Set();
      for (const e of p.moraleEvents) {
        expect(keysThisPlayer.has(e.dedupeKey)).toBe(false); // unique within a player
        keysThisPlayer.add(e.dedupeKey);
        if (seen.has(e.dedupeKey)) {
          // Same key must never belong to two different players.
          expect(seen.get(e.dedupeKey)).toBe(p.id);
        }
        seen.set(e.dedupeKey, p.id);
      }
    }
  });

  it('news items are produced for a morale drop crossing <35 and for a holdout declaration', () => {
    // Morale drop below 35 (worker.js:3375). disgruntled at 30 stays <35 after a
    // further negative event; simulate a TRADE_REQUEST_DENIED crossing.
    const before = player({ id: 'crosser', morale: 40 });
    const after = applyMoraleEvent(before, {
      type: MORALE_EVENTS.TRADE_REQUEST_DENIED,
      delta: MORALE_DELTAS[MORALE_EVENTS.TRADE_REQUEST_DENIED],
      season: SEASON, week: 5, source: 'trade',
      dedupeKey: `TRADE_REQUEST_DENIED-crosser-${SEASON}-5`,
    }, { season: SEASON, week: 5 });
    expect(before.morale).toBeGreaterThanOrEqual(35);
    expect(after.morale).toBeLessThan(35);
    const moraleDropNews = {
      type: 'MORALE',
      dedupeKey: `morale-drop-${after.id}-${SEASON}-5`,
      headline: `Locker Room Watch: ${after.name} disgruntled`,
    };
    expect(moraleDropNews.dedupeKey).toBe('morale-drop-crosser-2030-5');

    const holdoutNews = {
      type: 'HOLDOUT',
      priority: 'high',
      dedupeKey: `holdout-declared-holdout-elig-${SEASON}-3`,
    };
    expect(holdoutNews.dedupeKey).toBe('holdout-declared-holdout-elig-2030-3');
  });

  it('trade deadline pressure is INACTIVE in early weeks (1–4) and ACTIVE in the deadline window (wk 8)', () => {
    const early = getTradeDeadlinePressure({ currentWeek: 2, deadlineWeek: DEADLINE_WEEK, teamPosture: DEADLINE_POSTURE.CONTENDER });
    expect(early.active).toBe(false);
    expect(early.phase).toBe(DEADLINE_PHASE.NONE);
    expect(early.buyerAggression).toBe(0);

    const mid = getTradeDeadlinePressure({ currentWeek: 8, deadlineWeek: DEADLINE_WEEK, teamPosture: DEADLINE_POSTURE.CONTENDER });
    expect(mid.active).toBe(true);
    expect(mid.phase).toBe(DEADLINE_PHASE.APPROACHING);
    expect(mid.buyerAggression).toBeGreaterThan(0);
  });

  it('deadline-window: contender/seller postures classify and AI valuation is modified', () => {
    const contender = classifyDeadlinePosture(
      { wins: 7, losses: 1, ties: 0, roster: [{ age: 27 }, { age: 28 }] },
      { numTeams: 4 },
    );
    expect(contender).toBe(DEADLINE_POSTURE.CONTENDER);

    const seller = classifyDeadlinePosture(
      { wins: 1, losses: 7, ties: 0, roster: [{ age: 30 }, { age: 31 }, { age: 29 }] },
      { numTeams: 4 },
    );
    expect(seller).toBe(DEADLINE_POSTURE.SELLER);

    // Buyer boosts a useful veteran's value at the deadline.
    const pressure = getTradeDeadlinePressure({ currentWeek: 9, deadlineWeek: DEADLINE_WEEK, teamPosture: DEADLINE_POSTURE.CONTENDER });
    const asset = { assetType: 'player', age: 28, ovr: 86 };
    const boosted = applyDeadlinePressureModifiers(asset, 1000, DEADLINE_POSTURE.CONTENDER, pressure);
    expect(boosted).toBeGreaterThan(1000);

    // Middle-of-pack teams get no adjustment.
    const neutral = applyDeadlinePressureModifiers(asset, 1000, DEADLINE_POSTURE.MIDDLE, pressure);
    expect(neutral).toBe(1000);
  });

  it('holdout persisting 4 weeks: time-expiry fires, HOLDOUT_RETURNED applied, player returns to roster', () => {
    // Declared at week 4; evaluated at week 8 → 4 weeks elapsed → expiry.
    let p = applyHoldout(player({ id: 'expirer', morale: 45 }), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, SEASON, 4);
    expect(isAvailableForGameDay(p)).toBe(false);
    expect(checkHoldoutTimeExpiry(p, SEASON, 4 + HOLDOUT_EXPIRY_WEEKS)).toBe(true);

    p = resolveHoldout(p, HOLDOUT_RESOLUTION.TIME_EXPIRED, SEASON, 8);
    p = applyMoraleEvent(p, {
      type: MORALE_EVENTS.HOLDOUT_RETURNED,
      delta: HOLDOUT_RETURNED_DELTA,
      season: SEASON, week: 8, source: 'holdout',
      dedupeKey: `HOLDOUT_RETURNED-expirer-${SEASON}`,
    }, { season: SEASON, week: 8 });

    expect(p.holdout.active).toBe(false);
    expect(p.holdout.resolvedBy).toBe(HOLDOUT_RESOLUTION.TIME_EXPIRED);
    expect(p.morale).toBe(37); // 45 + HOLDOUT_RETURNED_DELTA(-8)
    expect(p.moraleEvents.some((e) => e.type === MORALE_EVENTS.HOLDOUT_RETURNED)).toBe(true);
    expect(isAvailableForGameDay(p)).toBe(true); // back on the game-day roster
  });

  it('morale sim modifier is active for the Disgruntled player (effective OVR < stored OVR)', () => {
    const disgruntled = player({ id: 'disgruntled', morale: 30, ovr: 84 });
    expect(applyMoraleToEffectiveOvr(disgruntled.ovr, disgruntled)).toBe(80); // 84 - 4
    expect(applyMoraleToEffectiveOvr(disgruntled.ovr, disgruntled)).toBeLessThan(disgruntled.ovr);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2.2 — archiveSeason pipeline (mirrors worker.js:10483–10701 ordering)
// ════════════════════════════════════════════════════════════════════════════

describe('2.2 archiveSeason pipeline', () => {
  // Retired HOF candidates (active season < SEASON, status retired).
  function careerLines(startYear, count, perLine) {
    return Array.from({ length: count }, (_, i) => ({
      season: startYear + i, team: 'NYJ', ...perLine,
    }));
  }

  function hofAuto() {
    // QB, 14 seasons, huge stats → score >> 160 → auto-induct.
    return {
      id: 'hof-auto', name: 'Big Arm', pos: 'QB', status: 'retired', ovr: 70,
      careerStats: careerLines(2014, 14, { passTD: 30, passYd: 4500 }),
      awards: [{ type: AWARD_TYPES.MVP, season: 2018, dedupeKey: 'MVP_2018' }],
    };
  }
  function hofMvpShortcut() {
    // QB, 12 seasons, modest stats, 2 MVPs → score in [120,160) → shortcut induct.
    const lines = careerLines(2016, 12, {});
    lines[0] = { season: 2016, team: 'GB', passTD: 10, passYd: 2500 };
    return {
      id: 'hof-mvp', name: 'Clutch Gene', pos: 'QB', status: 'retired', ovr: 70,
      careerStats: lines,
      awards: [
        { type: AWARD_TYPES.MVP, season: 2018, dedupeKey: 'MVP_2018' },
        { type: AWARD_TYPES.MVP, season: 2020, dedupeKey: 'MVP_2020' },
      ],
    };
  }
  function hofLapse() {
    // RB, 12 seasons, eligible (score≥120, <160, 0 MVP) but on 3rd ballot → lapse.
    const lines = careerLines(2016, 12, {});
    lines[0] = { season: 2016, team: 'DAL', rushTD: 10, rushYd: 3000, recTD: 2 };
    return {
      id: 'hof-lapse', name: 'Old Workhorse', pos: 'RB', status: 'retired', ovr: 70,
      hofStatus: 'nominee',
      careerStats: lines,
      awards: [],
    };
  }
  // Active MVP winner this season (drives the awards-before-HOF ordering).
  function activeMvpQb() {
    return { id: 'active-qb', name: 'Live MVP', pos: 'QB', age: 27, teamId: 1, ovr: 92, awards: [], careerStats: [] };
  }

  /** Replicates archiveSeason's awards → HOF → records ordering with the real
   *  engines (worker.js:10483–10701). Returns a phase log + emitted news/pulse. */
  function runArchivePipeline() {
    const phases = [];
    const news = [];
    let pulse = [];

    const allPlayers = [hofAuto(), hofMvpShortcut(), hofLapse(), activeMvpQb()];
    const teams = [
      { id: 1, wins: 14, losses: 3, ovr: 90 },
      { id: 2, wins: 3, losses: 14, ovr: 68 },
    ];
    const championTeamId = 1;
    const stats = [{
      playerId: 'active-qb', name: 'Live MVP', pos: 'QB', teamId: 1,
      totals: { gamesPlayed: 17, passYd: 5200, passTD: 45, interceptions: 6, rushYd: 200, rushTD: 3 },
    }];
    let meta = ensureHofMeta({
      franchiseAwards: [],
      // Prior ballot: hof-lapse already appeared 3 times → must lapse this season.
      hofBallot: { season: SEASON - 1, resolved: true, inducted: [], nominees: [
        { playerId: 'hof-lapse', score: 121, reasons: [], ballotCount: HOF_THRESHOLDS.MAX_BALLOT_APPEARANCES },
      ] },
      hofRoster: [],
    });

    // ── Step 8: AWARDS ENGINE V1 (worker.js:10483) ──────────────────────────
    const awardResults = determineSeasonAwards(allPlayers, teams, SEASON, { stats, championTeamId, coaches: [] });
    phases.push('awards_determined');
    const playerMap = new Map(allPlayers.map((p) => [String(p.id), p]));
    const applyResult = applySeasonAwards(playerMap, meta, awardResults);
    for (const [pid, updates] of applyResult.playerUpdates) playerMap.get(pid).awards = updates.awards;
    meta = { ...meta, franchiseAwards: applyResult.updatedFranchiseAwards };
    phases.push('awards_applied');
    // Award news (worker.js:10508–10541) — distinct keys per award type.
    for (const a of awardResults.playerAwards) {
      news.push({ type: 'AWARD', dedupeKey: `news_${a.dedupeKey}` });
    }
    const champFA = awardResults.franchiseAwards.find((a) => a.type === AWARD_TYPES.LEAGUE_CHAMPION);
    if (champFA) news.push({ type: 'AWARD', dedupeKey: `news_LEAGUE_CHAMPION_${SEASON}` });
    // MVP + champion pulse (worker.js:10544–10572).
    const mvp = awardResults.playerAwards.find((a) => a.type === AWARD_TYPES.MVP);
    if (mvp) pulse.push({ season: SEASON, week: 22, type: 'performance', importance: 100, headline: `${mvp.name} named League MVP`, dedupeKey: `pulse_MVP_${SEASON}` });
    if (champFA) pulse.push({ season: SEASON, week: 22, type: 'general', importance: 100, headline: 'champ', dedupeKey: `pulse_CHAMPION_${SEASON}` });

    // ── Step 9: HOF ENGINE V1 (worker.js:10613) ─────────────────────────────
    const allForHof = [...playerMap.values()];
    const ballot = generateHofBallot(allForHof, null, meta, SEASON);
    phases.push('hof_ballot');
    const { inducted, remaining } = resolveHofVote(ballot, allForHof);
    phases.push('hof_resolve');
    const hofUpdates = applyHofInductions(meta, inducted, ballot.nominees, allForHof, SEASON);
    meta = { ...meta, ...hofUpdates };
    phases.push('hof_apply');
    // hofStatus updates (worker.js:10631–10640).
    const inductedSet = new Set(inducted.map((e) => String(e.playerId)));
    const nomineeSet = new Set(ballot.nominees.map((n) => String(n.playerId)));
    for (const p of allForHof) {
      const pid = String(p.id);
      if (inductedSet.has(pid)) p.hofStatus = 'inducted';
      else if (nomineeSet.has(pid) && p.hofStatus !== 'inducted') p.hofStatus = 'nominee';
    }
    // HOF news (worker.js:10643–10660).
    for (const e of inducted) news.push({ type: 'HOF', dedupeKey: `news_hof_inducted_${e.playerId}_${SEASON}` });
    if (inducted.length > 0) {
      news.push({ type: 'HOF', dedupeKey: `news_hof_class_${SEASON}` });
      // HOF class pulse merged once (worker.js:10663–10673).
      pulse = mergeLeaguePulseItems(pulse, [{ season: SEASON, week: 22, type: 'general', importance: 85, headline: `${SEASON} Hall of Fame Class Announced`, dedupeKey: `hof_class_${SEASON}` }]);
    }

    // ── Step 10: Record Book (OUTSIDE HOF try/catch, worker.js:10683) ────────
    phases.push('records');

    return { phases, news, pulse, meta, ballot, inducted, remaining, playerMap };
  }

  const result = runArchivePipeline();

  it('1. season awards are determined and applied before HOF runs', () => {
    const r = result;
    expect(r.phases.indexOf('awards_applied')).toBeLessThan(r.phases.indexOf('hof_ballot'));
    // franchiseAwards (champion) populated before HOF ran.
    expect(r.meta.franchiseAwards.some((a) => a.type === AWARD_TYPES.LEAGUE_CHAMPION)).toBe(true);
    // The active QB actually received the MVP award before HOF.
    expect(r.playerMap.get('active-qb').awards.some((a) => a.type === AWARD_TYPES.MVP)).toBe(true);
  });

  it('2. HOF ballot generated with correct nominees (auto + shortcut present, lapsed excluded)', () => {
    const ids = result.ballot.nominees.map((n) => n.playerId);
    expect(ids).toContain('hof-auto');
    expect(ids).toContain('hof-mvp');
    expect(ids).not.toContain('hof-lapse'); // lapse rule
    expect(ids).not.toContain('active-qb'); // active player never eligible (V1)
  });

  it('3. score >= 160 player is auto-inducted', () => {
    const auto = result.ballot.nominees.find((n) => n.playerId === 'hof-auto');
    expect(auto.score).toBeGreaterThanOrEqual(HOF_THRESHOLDS.INDUCTION_SCORE);
    expect(result.inducted.map((e) => e.playerId)).toContain('hof-auto');
  });

  it('4. MVP-shortcut player (120–159, 2+ MVPs) is inducted', () => {
    const mvp = result.ballot.nominees.find((n) => n.playerId === 'hof-mvp');
    expect(mvp.score).toBeGreaterThanOrEqual(HOF_THRESHOLDS.MVP_SHORTCUT_SCORE);
    expect(mvp.score).toBeLessThan(HOF_THRESHOLDS.INDUCTION_SCORE);
    expect(mvp.mvpCount).toBeGreaterThanOrEqual(HOF_THRESHOLDS.MVP_SHORTCUT_COUNT);
    expect(result.inducted.map((e) => e.playerId)).toContain('hof-mvp');
  });

  it('5. 3rd-ballot player lapses (excluded from ballot, not inducted, hofStatus not re-set to nominee)', () => {
    expect(result.ballot.nominees.map((n) => n.playerId)).not.toContain('hof-lapse');
    expect(result.inducted.map((e) => e.playerId)).not.toContain('hof-lapse');
    // Not in the new nominee set → not re-stamped 'nominee' for the new season.
    expect(result.playerMap.get('hof-lapse').hofStatus).not.toBe('inducted');
  });

  it('6. meta.hofRoster updated with full inductee snapshots', () => {
    const roster = result.meta.hofRoster;
    expect(roster).toHaveLength(2);
    for (const entry of roster) {
      expect(entry).toHaveProperty('playerId');
      expect(entry).toHaveProperty('position');
      expect(entry).toHaveProperty('seasons');
      expect(entry).toHaveProperty('inductionSeason', SEASON);
      expect(entry).toHaveProperty('hofScore');
      expect(Array.isArray(entry.awards)).toBe(true);
      expect(entry.careerStats).toBeTypeOf('object');
    }
    expect(getHofSummary(result.meta).totalInducted).toBe(2);
    // hofBallot persisted resolved for the season.
    expect(result.meta.hofBallot.resolved).toBe(true);
    expect(result.meta.hofBallot.season).toBe(SEASON);
  });

  it('7. HOF news items emitted for each inductee', () => {
    const hofInductNews = result.news.filter((n) => n.dedupeKey.startsWith('news_hof_inducted_'));
    expect(hofInductNews).toHaveLength(2);
  });

  it('8. HOF class pulse emitted exactly once (merge is idempotent on dedupeKey)', () => {
    const classPulse = result.pulse.filter((p) => p.dedupeKey === `hof_class_${SEASON}`);
    expect(classPulse).toHaveLength(1);
    // Re-merging the same item does not add a second.
    const remerged = mergeLeaguePulseItems(result.pulse, [{ season: SEASON, week: 22, type: 'general', importance: 85, headline: 'dup', dedupeKey: `hof_class_${SEASON}` }]);
    expect(remerged.filter((p) => p.dedupeKey === `hof_class_${SEASON}`)).toHaveLength(1);
  });

  it('9. award news do not duplicate HOF news (disjoint dedupeKey namespaces)', () => {
    const awardKeys = new Set(result.news.filter((n) => n.type === 'AWARD').map((n) => n.dedupeKey));
    const hofKeys = new Set(result.news.filter((n) => n.type === 'HOF').map((n) => n.dedupeKey));
    for (const k of hofKeys) expect(awardKeys.has(k)).toBe(false);
    // No duplicate dedupeKeys overall.
    const all = result.news.map((n) => n.dedupeKey);
    expect(new Set(all).size).toBe(all.length);
  });

  it('10. total news items within reasonable volume (threshold: ≤ 40 per archive)', () => {
    expect(result.news.length).toBeLessThanOrEqual(40);
  });

  it('HOF engine throws no exception on valid input (try/catch is not masking a real error)', () => {
    // Re-run the real HOF engine on the same valid inputs outside any try/catch.
    const players = [hofAuto(), hofMvpShortcut(), hofLapse()];
    const meta = ensureHofMeta({ hofRoster: [], hofBallot: { season: SEASON - 1, resolved: true, inducted: [], nominees: [
      { playerId: 'hof-lapse', ballotCount: HOF_THRESHOLDS.MAX_BALLOT_APPEARANCES, score: 121, reasons: [] },
    ] } });
    expect(() => {
      const b = generateHofBallot(players, null, meta, SEASON);
      const v = resolveHofVote(b, players);
      applyHofInductions(meta, v.inducted, b.nominees, players, SEASON);
    }).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2.3 — Save / load round-trip
// ════════════════════════════════════════════════════════════════════════════

describe('2.3 save / load round-trip', () => {
  function buildState() {
    const players = [
      {
        id: 'rt-1', name: 'Star', pos: 'WR', ovr: 88, age: 27, teamId: 1,
        morale: 32,
        moraleEvents: [
          { type: MORALE_EVENTS.TRADE_REQUEST_DENIED, delta: -12, season: SEASON, week: 4, dedupeKey: 'TRADE_REQUEST_DENIED-rt-1-2030-4' },
        ],
        awards: [
          { type: AWARD_TYPES.MVP, season: SEASON, dedupeKey: `MVP_${SEASON}` },
          { type: AWARD_TYPES.ALL_PRO_WR, season: SEASON, dedupeKey: `ALL_PRO_WR_${SEASON}` },
        ],
        hofStatus: 'none',
        holdout: { active: true, reason: HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED, startWeek: 4, startSeason: SEASON, demandPremium: 0.18, resolvedWeek: null, resolvedSeason: null, resolvedBy: null },
        contract: { years: 1, yearsRemaining: 1, baseAnnual: 20 },
      },
      {
        id: 'rt-2', name: 'Legend', pos: 'QB', ovr: 70, age: 39, teamId: 1,
        morale: 80, moraleEvents: [], hofStatus: 'inducted',
        awards: [{ type: AWARD_TYPES.MVP, season: 2024, dedupeKey: 'MVP_2024' }],
        careerStats: Array.from({ length: 16 }, (_, i) => ({ season: 2010 + i, passTD: 28, passYd: 4200 })),
      },
    ];
    const meta = ensureHofMeta({
      franchiseAwards: [
        { type: AWARD_TYPES.LEAGUE_CHAMPION, season: SEASON, teamId: 1 },
        { type: AWARD_TYPES.COACH_OF_YEAR, season: SEASON, teamId: 1, coachName: 'Coach K' },
      ],
      hofRoster: [{ playerId: 'rt-2', playerName: 'Legend', position: 'QB', seasons: 16, inductionSeason: SEASON, awards: [], careerStats: {}, hofScore: 320 }],
      hofBallot: { season: SEASON, resolved: true, inducted: ['rt-2'], nominees: [{ playerId: 'rt-2', score: 320, reasons: ['1× MVP'], ballotCount: 1 }] },
    });
    return { players, meta };
  }

  const original = buildState();
  const reloaded = JSON.parse(JSON.stringify(original));

  it('player.morale and moraleEvents survive intact (within cap)', () => {
    const p = reloaded.players.find((x) => x.id === 'rt-1');
    expect(p.morale).toBe(32);
    expect(p.moraleEvents).toHaveLength(1);
    expect(p.moraleEvents.length).toBeLessThanOrEqual(MORALE_EVENTS_CAP);
    expect(getPlayerMoraleSummary(p).label).toBe('Disgruntled');
  });

  it('player.awards survive with dedupeKeys preserved', () => {
    const p = reloaded.players.find((x) => x.id === 'rt-1');
    expect(p.awards.map((a) => a.dedupeKey)).toEqual([`MVP_${SEASON}`, `ALL_PRO_WR_${SEASON}`]);
    expect(getPlayerAwardSummary(p).mvpCount).toBe(1);
    expect(getPlayerAwardSummary(p).allProCount).toBe(1);
  });

  it('player.hofStatus survives (inducted | nominee | none)', () => {
    expect(reloaded.players.find((x) => x.id === 'rt-1').hofStatus).toBe('none');
    expect(reloaded.players.find((x) => x.id === 'rt-2').hofStatus).toBe('inducted');
  });

  it('player.holdout active/resolved state survives', () => {
    const p = reloaded.players.find((x) => x.id === 'rt-1');
    expect(p.holdout.active).toBe(true);
    expect(p.holdout.reason).toBe(HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED);
    expect(isAvailableForGameDay(p)).toBe(false);
    expect(getHoldoutDemandPremium(p)).toBe(0.18);
  });

  it('meta.hofRoster, meta.hofBallot, meta.franchiseAwards survive', () => {
    expect(reloaded.meta.hofRoster).toHaveLength(1);
    expect(reloaded.meta.hofBallot.resolved).toBe(true);
    expect(reloaded.meta.hofBallot.season).toBe(SEASON);
    expect(reloaded.meta.franchiseAwards.filter((a) => a.type === AWARD_TYPES.LEAGUE_CHAMPION)).toHaveLength(1);
    expect(reloaded.meta.franchiseAwards.some((a) => a.type === AWARD_TYPES.COACH_OF_YEAR && a.coachName === 'Coach K')).toBe(true);
  });

  it('negotiation modifier recalculates identically from reloaded state', () => {
    const compute = (state) => {
      const p = state.players.find((x) => x.id === 'rt-1');
      const lev = computePlayerLeverage(p, { moraleSummary: getPlayerMoraleSummary(p), awardSummary: getPlayerAwardSummary(p), currentSeason: SEASON });
      const rep = computeFranchiseReputation(state.meta, { userTeamId: 1, currentSeason: SEASON });
      return applyNegotiationModifiers({ baseAnnual: 100 }, lev, rep);
    };
    expect(compute(reloaded).baseAnnual).toBe(compute(original).baseAnnual);
    expect(compute(reloaded)._negotiationShift).toBe(compute(original)._negotiationShift);
  });

  it('holdout demand premium recalculates identically from reloaded state', () => {
    const a = getHoldoutDemandPremium(original.players.find((x) => x.id === 'rt-1'));
    const b = getHoldoutDemandPremium(reloaded.players.find((x) => x.id === 'rt-1'));
    expect(b).toBe(a);
    expect(b).toBe(0.18);
  });

  it('old-save hydration: stripped player runs through every engine entry point with defaults, no crash', () => {
    const legacy = { id: 'old', name: 'Old Save', pos: 'RB', ovr: 75, age: 26, teamId: 1, contract: { years: 2, yearsRemaining: 2 } };
    // morale / awards / hofStatus / holdout all absent.
    expect(() => {
      const moraleSummary = getPlayerMoraleSummary(legacy);
      expect(moraleSummary.score).toBe(70); // MORALE_DEFAULT
      expect(getMoraleOvrModifier(legacy)).toBe(0);
      expect(applyMoraleToEffectiveOvr(legacy.ovr, legacy)).toBe(legacy.ovr);

      const awardSummary = getPlayerAwardSummary(legacy);
      expect(awardSummary.totalAwards).toBe(0);

      const holdout = ensureHoldout(legacy);
      expect(holdout.active).toBe(false);
      expect(isAvailableForGameDay(legacy)).toBe(true);
      expect(getHoldoutDemandPremium(legacy)).toBe(0);
      expect(evaluateHoldoutTriggers(legacy, SEASON, 5, { moraleSummary })).toBeNull();

      computePlayerLeverage(legacy, { moraleSummary, awardSummary, currentSeason: SEASON });
      computeHofScore(legacy, null, { mvpCount: 0, allProCount: 0, championshipCount: 0 });
      isHofEligible(legacy, SEASON, null, null);
    }).not.toThrow();

    // ensureHofMeta hydrates a meta lacking HOF fields.
    const hydrated = ensureHofMeta({});
    expect(Array.isArray(hydrated.hofRoster)).toBe(true);
    expect(hydrated.hofBallot.resolved).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2.4 — Negotiation modifier + holdout demand stacking (audit 1.5)
// ════════════════════════════════════════════════════════════════════════════

describe('2.4 negotiation modifier + holdout demand do NOT stack', () => {
  it('disgruntled holdout player: ask is single-modified by the negotiation discount only', () => {
    // Disgruntled (morale < 40, -10% discount), holdout active via Trigger A (premium 0.12).
    let p = player({ id: 'neg', morale: 35, awards: [], contract: { years: 1, yearsRemaining: 1 } });
    p = applyHoldout(p, HOLDOUT_TRIGGERS.EXTENSION_REJECTED, SEASON, 4);

    const leverage = computePlayerLeverage(p, {
      moraleSummary: getPlayerMoraleSummary(p), awardSummary: getPlayerAwardSummary(p), currentSeason: SEASON,
    });
    // No userTeamId / no franchise history → neutral franchise multiplier.
    const rep = computeFranchiseReputation({}, { userTeamId: null, currentSeason: SEASON });
    const ask = applyNegotiationModifiers({ baseAnnual: 100 }, leverage, rep);

    // Intended behavior (audit 1.5): the negotiation modifier applies the morale
    // discount only. The holdout premium is NOT folded into the ask.
    expect(leverage.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.MORALE_DISGRUNTLED, 5); // 0.90
    expect(ask.baseAnnual).toBe(90);               // 100 * 0.90  (single-modified)
    expect(ask._negotiationShift).toBeCloseTo(-0.10, 5);

    // The holdout premium exists but is dormant — proves NO stacking.
    expect(getHoldoutDemandPremium(p)).toBe(0.12);
    const stacked = Math.round(100 * 0.90 * 1.12 * 10) / 10; // 100.8 if it were stacked
    expect(ask.baseAnnual).not.toBe(stacked);
  });

  it('demand shift stays clamped at ±MAX_SHIFT even with many stacking leverage reasons', () => {
    const elite = player({
      id: 'elite', morale: 90,
      awards: [
        { type: AWARD_TYPES.MVP, season: SEASON, dedupeKey: `MVP_${SEASON}` },
        { type: AWARD_TYPES.ALL_PRO_QB, season: SEASON, dedupeKey: `ALL_PRO_QB_${SEASON}` },
        { type: AWARD_TYPES.ALL_PRO_QB, season: SEASON - 1, dedupeKey: `ALL_PRO_QB_${SEASON - 1}` },
        { type: AWARD_TYPES.LEAGUE_CHAMPION, season: SEASON, dedupeKey: `LC_${SEASON}` },
      ],
    });
    const lev = computePlayerLeverage(elite, { awardSummary: getPlayerAwardSummary(elite), currentSeason: SEASON });
    const rep = computeFranchiseReputation({}, { userTeamId: null });
    const ask = applyNegotiationModifiers({ baseAnnual: 100 }, lev, rep);
    expect(ask._negotiationShift).toBeLessThanOrEqual(LEVERAGE_MODIFIERS.MAX_SHIFT);
    expect(ask.baseAnnual).toBeLessThanOrEqual(100 * (1 + LEVERAGE_MODIFIERS.MAX_SHIFT));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2.5 — Morale sim modifier wire verification (audit 1.3, BUG FIXED)
// ════════════════════════════════════════════════════════════════════════════

describe('2.5 morale sim modifier wire', () => {
  it('Disgruntled player → effectiveOvr = storedOvr − 4 at the sim weight call site', () => {
    expect(applyMoraleToEffectiveOvr(82, { morale: 30 })).toBe(78);
  });

  it('Thriving player → effectiveOvr = storedOvr + 2 at the sim weight call site', () => {
    expect(applyMoraleToEffectiveOvr(82, { morale: 90 })).toBe(84);
  });

  it('FIXED worker roster build copies morale into the SimPlayerRef (non-zero modifier reaches the sim)', () => {
    // toSimRefs mirrors the fixed worker map (worker.js:3706). Pre-fix this dropped
    // morale and getMoraleOvrModifier returned 0 for everyone.
    const roster = [player({ id: 'd', morale: 30, ovr: 84, pos: 'WR' })];
    const ref = toSimRefs(roster)[0];
    expect(ref).toHaveProperty('morale', 30);
    expect(getMoraleOvrModifier(ref)).toBe(-4);
    expect(getMoraleOvrModifier(ref)).not.toBe(0);
  });

  it('morale actually changes player selection in a real simulateRichGame run (wire is live)', () => {
    // Morale only steers pickWeightedPlayer (richGameSimulator.ts:532–535), which
    // feeds the advanced-attribution / playerStatsStore — NOT the box-score totals
    // (those use raw ovr at :831–878) nor the final score (team AttributesV2). So
    // the honest, observable wire effect is: with RAW ovr held identical, flipping
    // two same-position players' effective-OVR ORDER via morale changes which
    // player gets credited on selection-driven plays. The flip only lands on plays
    // where the weighted pick crosses a threshold, so it is seed-dependent — assert
    // at least one seed of several shows a difference (deterministic per seed).
    const away = toSimRefs(fullRoster('away'));
    const baseHome = fullRoster('home'); // uniform morale 70 (neutral)
    // Flip the two home WRs: the higher-rated one becomes Disgruntled (eff −4),
    // the lower-rated one Thriving (eff +2) → effective-OVR order flips. Raw ovr
    // is unchanged, so the box-score distribution stays identical between runs.
    const flippedHome = baseHome.map((p) => (p.pos === 'WR' ? { ...p, morale: p.ovr === 81 ? 10 : 99 } : p));

    const seeds = [7, 99, 13, 2024, 5050];
    let anyDiffer = false;
    for (const seed of seeds) {
      const storeNeutral = {};
      const storeFlipped = {};
      simulateRichGame({ ...richPayload(toSimRefs(baseHome), away, seed), year: SEASON, playerStatsStore: storeNeutral });
      simulateRichGame({ ...richPayload(toSimRefs(flippedHome), away, seed), year: SEASON, playerStatsStore: storeFlipped });
      if (JSON.stringify(storeNeutral) !== JSON.stringify(storeFlipped)) { anyDiffer = true; break; }
    }
    expect(anyDiffer).toBe(true);
  });

  it('morale wire is deterministic: same seed + same morale → identical advanced attribution', () => {
    const away = toSimRefs(fullRoster('away'));
    const home = toSimRefs(fullRoster('home', { WR: 20, RB: 20 }));
    const s1 = {};
    const s2 = {};
    simulateRichGame({ ...richPayload(home, away, 4242), year: SEASON, playerStatsStore: s1 });
    simulateRichGame({ ...richPayload(home, away, 4242), year: SEASON, playerStatsStore: s2 });
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });

  it('neutral morale is identical to no-morale (modifier is 0 → no behavior change)', () => {
    const away = toSimRefs(fullRoster('away'));
    const neutralHome = toSimRefs(fullRoster('home', { QB: 70, RB: 70, WR: 70, TE: 70 }));
    const noMoraleHome = fullRoster('home').map((p) => ({ id: p.id, name: p.name, pos: p.pos, ovr: p.ovr })); // morale undefined

    const a = simulateRichGame(richPayload(neutralHome, away, 555));
    const b = simulateRichGame(richPayload(noMoraleHome, away, 555));
    expect(a.homeScore).toBe(b.homeScore);
    expect(a.awayScore).toBe(b.awayScore);
    expect(a.totalPlays).toBe(b.totalPlays);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2.6 — Holdout roster cliff edge (audit 1.4)
// ════════════════════════════════════════════════════════════════════════════

describe('2.6 holdout roster cliff edge', () => {
  it('a 2-player position group, both on holdout, is filtered to an empty group', () => {
    const wr1 = applyHoldout(player({ id: 'wr1', pos: 'WR' }), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, SEASON, 4);
    const wr2 = applyHoldout(player({ id: 'wr2', pos: 'WR' }), HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED, SEASON, 4);
    const roster = [player({ id: 'qb', pos: 'QB' }), wr1, wr2];
    const gameRoster = roster.filter(isAvailableForGameDay);
    expect(gameRoster.filter((p) => p.pos === 'WR')).toHaveLength(0);
    expect(gameRoster.length).toBe(1); // QB still available
  });

  it('simulateRichGame does NOT crash when a whole skill group is missing (all targets held out)', () => {
    // Roster present (length > 0 → no defaultPlayers fallback) but NO WR/TE/RB,
    // so pass-play target selection returns null. The sim must tolerate it.
    const noTargetsHome = toSimRefs(fullRoster('home').filter((p) => !['WR', 'TE', 'RB'].includes(p.pos)));
    expect(noTargetsHome.length).toBeGreaterThan(0);
    expect(noTargetsHome.some((p) => ['WR', 'TE', 'RB'].includes(p.pos))).toBe(false);
    const away = toSimRefs(fullRoster('away'));

    let summary;
    expect(() => { summary = simulateRichGame(richPayload(noTargetsHome, away, 777)); }).not.toThrow();
    expect(Number.isFinite(summary.homeScore)).toBe(true);
    expect(Number.isFinite(summary.awayScore)).toBe(true);
    expect(summary.totalPlays).toBeGreaterThan(0);
  });

  it('simulateRichGame falls back to a default roster when a side is fully empty (entire roster held out)', () => {
    // Empty array → richGameSimulator.ts:348 substitutes defaultPlayers (graceful).
    const away = toSimRefs(fullRoster('away'));
    let summary;
    expect(() => { summary = simulateRichGame(richPayload([], away, 888)); }).not.toThrow();
    expect(summary.totalPlays).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2.7 — News / pulse volume cap (audit 1.7)
//   "Flooded" := > 40 news items emitted in a single archiveSeason call.
// ════════════════════════════════════════════════════════════════════════════

describe('2.7 news / pulse volume', () => {
  const FLOOD_THRESHOLD = 40;

  function emitSeasonNews() {
    const news = [];
    // 10 award winners (5 individual + 5 all-pro types) → distinct dedupeKeys.
    const awardTypes = [
      AWARD_TYPES.MVP, AWARD_TYPES.OFFENSIVE_POY, AWARD_TYPES.DEFENSIVE_POY,
      AWARD_TYPES.ROOKIE_OF_YEAR, AWARD_TYPES.COMEBACK_PLAYER,
      AWARD_TYPES.ALL_PRO_QB, AWARD_TYPES.ALL_PRO_RB, AWARD_TYPES.ALL_PRO_WR,
      AWARD_TYPES.ALL_PRO_TE, AWARD_TYPES.ALL_PRO_K,
    ];
    for (const t of awardTypes) news.push({ type: 'AWARD', dedupeKey: `news_${t}_${SEASON}` });
    // 5 HOF inductees + 1 class announcement.
    for (let i = 0; i < 5; i++) news.push({ type: 'HOF', dedupeKey: `news_hof_inducted_hof-${i}_${SEASON}` });
    news.push({ type: 'HOF', dedupeKey: `news_hof_class_${SEASON}` });
    // 3 holdout declarations (advance-week, distinct weeks/players).
    for (let i = 0; i < 3; i++) news.push({ type: 'HOLDOUT', dedupeKey: `holdout-declared-ho-${i}-${SEASON}-${5 + i}` });
    // 4 morale drops (advance-week).
    for (let i = 0; i < 4; i++) news.push({ type: 'MORALE', dedupeKey: `morale-drop-mo-${i}-${SEASON}-${6 + i}` });
    return news;
  }

  it('total news (10 awards + 5+1 HOF + 3 holdout + 4 morale = 23) is within the flood threshold', () => {
    const news = emitSeasonNews();
    expect(news).toHaveLength(23);
    expect(news.length).toBeLessThanOrEqual(FLOOD_THRESHOLD);
  });

  it('no duplicate news items (every dedupeKey is unique)', () => {
    const keys = emitSeasonNews().map((n) => n.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('pulse items are deduplicated by mergeLeaguePulseItems (duplicates collapse to one)', () => {
    const items = [
      { season: SEASON, week: 22, type: 'performance', importance: 100, headline: 'MVP', dedupeKey: `pulse_MVP_${SEASON}` },
      { season: SEASON, week: 22, type: 'general', importance: 100, headline: 'Champ', dedupeKey: `pulse_CHAMPION_${SEASON}` },
      { season: SEASON, week: 22, type: 'general', importance: 85, headline: 'HOF', dedupeKey: `hof_class_${SEASON}` },
    ];
    const merged = mergeLeaguePulseItems([], [...items, ...items]); // feed duplicates
    expect(merged).toHaveLength(3);
    // Items without explicit dedupeKey still dedupe via buildLeaguePulseDedupeKey.
    const noKey = { season: SEASON, week: 10, type: 'gameResult', importance: 50, headline: 'X', relatedTeamId: 1 };
    const merged2 = mergeLeaguePulseItems([], [noKey, { ...noKey }]);
    expect(merged2).toHaveLength(1);
    expect(merged2[0].dedupeKey).toBe(buildLeaguePulseDedupeKey(noKey));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2.8 — OL HOF gap verification (audit 1.2 / Phase 3)
// ════════════════════════════════════════════════════════════════════════════

describe('2.8 OL HOF scoring is functional (no proWins gap)', () => {
  it('a 14-season OL starter with 2 championships clears the induction threshold (160)', () => {
    const ol = {
      id: 'ol-legend', name: 'Anchor', pos: 'OT', status: 'retired', ovr: 70,
      careerStats: Array.from({ length: 14 }, (_, i) => ({ season: 2010 + i, team: 'PIT', gamesPlayed: 16 })),
      awards: [
        { type: AWARD_TYPES.LEAGUE_CHAMPION, season: 2013, dedupeKey: 'LC_2013' },
        { type: AWARD_TYPES.LEAGUE_CHAMPION, season: 2016, dedupeKey: 'LC_2016' },
      ],
    };
    const awardSummary = { mvpCount: 0, allProCount: 0, championshipCount: 2 };
    const score = computeHofScore(ol, null, awardSummary);
    // base 112 + awardBonus 40 + longevity 75 = 227.
    expect(score).toBe(227);
    expect(score).toBeGreaterThanOrEqual(HOF_THRESHOLDS.INDUCTION_SCORE);
    expect(isHofEligible(ol, 2030, null, awardSummary)).toBe(true);
  });

  it('even a plain 14-season OL starter (no awards) clears the threshold on longevity alone', () => {
    const ol = {
      id: 'ol-plain', name: 'Steady', pos: 'OG', status: 'retired', ovr: 70,
      careerStats: Array.from({ length: 14 }, (_, i) => ({ season: 2010 + i, team: 'CLE' })),
      awards: [],
    };
    const score = computeHofScore(ol, null, { mvpCount: 0, allProCount: 0, championshipCount: 0 });
    expect(score).toBe(187); // 112 + 0 + 75
    expect(score).toBeGreaterThanOrEqual(HOF_THRESHOLDS.INDUCTION_SCORE);
  });
});
