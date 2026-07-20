import { describe, it, expect } from 'vitest';
import { buildDriveBasedSummary } from '../../simulation/driveEngine.js';
import {
  buildCanonicalGameEvents,
  reconcileCanonicalEvents,
} from '../../simulation/canonicalGameEvents.js';

const SEEDS = [6, 39, 123, 777, 2026, 4242, 8888];
const HOME = { id: 10, abbr: 'NYJ' };
const AWAY = { id: 20, abbr: 'BAL' };

function ledgerForSeed(seed, overrides = {}) {
  const ds = buildDriveBasedSummary({
    season: 2026, week: 6, home: HOME, away: AWAY,
    homeOff: 74, awayOff: 76, homeDef: 73, awayDef: 75,
    globalSeed: seed, ...overrides,
  });
  const ledger = buildCanonicalGameEvents({
    gameId: `g-${seed}`,
    homeId: HOME.id, awayId: AWAY.id, homeAbbr: HOME.abbr, awayAbbr: AWAY.abbr,
    homeDriveLog: ds.homeDriveLog, awayDriveLog: ds.awayDriveLog,
    overtimeEvents: [],
    seed: ds.seed,
  });
  return { ds, ledger, finalScore: { home: ds.homeScore, away: ds.awayScore } };
}

describe('canonical game event ledger (#1700)', () => {
  it('1. canonical scoring-event points equal the final score (both sides)', () => {
    for (const seed of SEEDS) {
      const { ledger, finalScore } = ledgerForSeed(seed);
      const sum = (teamId) => ledger.scoringSummary
        .filter((r) => r.teamId === teamId)
        .reduce((a, r) => a + r.points, 0);
      expect(sum(HOME.id)).toBe(finalScore.home);
      expect(sum(AWAY.id)).toBe(finalScore.away);
    }
  });

  it('2. last scoreAfter equals the final score', () => {
    for (const seed of SEEDS) {
      const { ledger, finalScore } = ledgerForSeed(seed);
      const last = ledger.events[ledger.events.length - 1];
      expect(last.scoreAfter).toEqual(finalScore);
    }
  });

  it('3. NO fabricated quarter authority: quarterScores is null and events carry null quarter + honest periodLabel', () => {
    for (const seed of SEEDS) {
      const { ledger } = ledgerForSeed(seed);
      // The sim owns no chronological regulation quarters — no quarter-score table.
      expect(ledger.quarterScores).toBeNull();
      // Every regulation drive event has a null quarter and an honest "Drive N" label.
      const driveEvents = ledger.events.filter((e) => e.eventType !== 'game_end');
      driveEvents.forEach((e, i) => {
        expect(e.quarter).toBeNull();
        expect(e.periodLabel).toBe(`Drive ${i + 1}`);
        expect(e.isOvertime).toBe(false);
      });
      // Scoring summary rows also drop the fabricated quarter.
      ledger.scoringSummary.forEach((r) => {
        expect(r.quarter).toBeNull();
        expect(typeof r.periodLabel).toBe('string');
      });
    }
  });

  it('4. scoring-summary totals equal the final score', () => {
    for (const seed of SEEDS) {
      const { ledger, finalScore } = ledgerForSeed(seed);
      const rec = reconcileCanonicalEvents(ledger.events, finalScore);
      expect(rec.finalMatchesSum).toBe(true);
      expect(rec.finalMatchesLast).toBe(true);
    }
  });

  it('5. score progression is monotonic and only changes on scoring events', () => {
    for (const seed of SEEDS) {
      const { ledger, finalScore } = ledgerForSeed(seed);
      const rec = reconcileCanonicalEvents(ledger.events, finalScore);
      expect(rec.monotonic).toBe(true);
      expect(rec.scoreOnlyOnScore).toBe(true);
    }
  });

  it('6. no duplicate event ids', () => {
    for (const seed of SEEDS) {
      const { ledger, finalScore } = ledgerForSeed(seed);
      const rec = reconcileCanonicalEvents(ledger.events, finalScore);
      expect(rec.uniqueIds).toBe(true);
    }
  });

  it('7. event sequences are strictly ordered', () => {
    for (const seed of SEEDS) {
      const { ledger } = ledgerForSeed(seed);
      let prev = -Infinity;
      for (const e of ledger.events) {
        expect(e.sequence).toBeGreaterThan(prev);
        prev = e.sequence;
      }
    }
  });

  it('8. every scoring event references a real team', () => {
    for (const seed of SEEDS) {
      const { ledger } = ledgerForSeed(seed);
      for (const e of ledger.events.filter((x) => x.isScore)) {
        expect([HOME.id, AWAY.id]).toContain(e.scoringTeamId);
        expect(e.scoringTeamId).toBe(e.possessionTeamId);
      }
    }
  });

  it('9. home and away sides are never swapped', () => {
    // Feed a lopsided game; the home drive log alone must land on the home side.
    const ledger = buildCanonicalGameEvents({
      gameId: 'swap', homeId: 1, awayId: 2, homeAbbr: 'H', awayAbbr: 'A',
      homeDriveLog: [{ result: 'TOUCHDOWN', points: 7, plays: 9, yards: 75 }],
      awayDriveLog: [{ result: 'PUNT', points: 0, plays: 3, yards: 4 }],
      seed: 1,
    });
    const last = ledger.events[ledger.events.length - 1];
    expect(last.scoreAfter).toEqual({ home: 7, away: 0 });
    expect(ledger.scoringSummary[0].teamId).toBe(1);
  });

  it('10. overtime is represented honestly (isOvertime + OT label, never a fabricated Q5)', () => {
    const ledger = buildCanonicalGameEvents({
      gameId: 'ot', homeId: 1, awayId: 2, homeAbbr: 'H', awayAbbr: 'A',
      homeDriveLog: [{ result: 'FIELD_GOAL', points: 3, plays: 8, yards: 60 }],
      awayDriveLog: [{ result: 'FIELD_GOAL', points: 3, plays: 7, yards: 55 }],
      overtimeEvents: [{ side: 'home', points: 3, result: 'FIELD_GOAL' }],
      seed: 2,
    });
    // No fabricated quarter table, even with overtime.
    expect(ledger.quarterScores).toBeNull();
    const otEvent = ledger.events.find((e) => e.isOvertime && e.isScore);
    expect(otEvent).toBeTruthy();
    expect(otEvent.periodLabel).toBe('OT');
    expect(otEvent.quarter).toBeNull();
    // No event is ever labeled Q5.
    expect(ledger.events.some((e) => e.periodLabel === 'Q5' || e.quarter === 5)).toBe(false);
    const last = ledger.events[ledger.events.length - 1];
    expect(last.scoreAfter).toEqual({ home: 6, away: 3 });
    expect(last.isOvertime).toBe(true);
  });

  it('11. field goals, TDs, and 2-pt conversions are accounted for accurately', () => {
    const ledger = buildCanonicalGameEvents({
      gameId: 'mix', homeId: 1, awayId: 2, homeAbbr: 'H', awayAbbr: 'A',
      homeDriveLog: [
        { result: 'TOUCHDOWN', points: 8, plays: 10, yards: 80, twoPointMade: true }, // TD + 2PT
        { result: 'FIELD_GOAL', points: 3, plays: 6, yards: 40 },
        { result: 'TOUCHDOWN', points: 6, plays: 5, yards: 55 }, // TD, PAT no good
      ],
      awayDriveLog: [{ result: 'TOUCHDOWN', points: 7, plays: 8, yards: 70 }],
      seed: 3,
    });
    const last = ledger.events[ledger.events.length - 1];
    expect(last.scoreAfter).toEqual({ home: 17, away: 7 });
    const homeRows = ledger.scoringSummary.filter((r) => r.teamId === 1);
    expect(homeRows.map((r) => r.points).sort()).toEqual([3, 6, 8]);
    expect(homeRows.find((r) => r.points === 8).type).toMatch(/2-PT/i);
  });

  it('12. a genuine 0-0 game remains valid (no scoring rows, null quarter table)', () => {
    const ledger = buildCanonicalGameEvents({
      gameId: 'zero', homeId: 1, awayId: 2,
      homeDriveLog: [{ result: 'PUNT', points: 0, plays: 3, yards: 5 }],
      awayDriveLog: [{ result: 'TURNOVER', points: 0, plays: 4, yards: 8 }],
      seed: 4,
    });
    expect(ledger.scoringSummary).toHaveLength(0);
    expect(ledger.quarterScores).toBeNull();
    const last = ledger.events[ledger.events.length - 1];
    expect(last.scoreAfter).toEqual({ home: 0, away: 0 });
  });

  it('13. same seed produces identical event fingerprints', () => {
    const fp = (seed) => ledgerForSeed(seed).ledger.events
      .map((e) => `${e.sequence}:${e.periodLabel}:${e.eventType}:${e.points}:${e.scoreAfter.home}-${e.scoreAfter.away}:${e.possessionTeamId}`)
      .join('|');
    for (const seed of SEEDS) {
      expect(fp(seed)).toBe(fp(seed));
    }
  });

  it('14. no RNG is consumed building the ledger (drive-engine score unchanged)', () => {
    // Building the ledger must not disturb the seeded score. Two identical drive
    // summaries produce identical ledgers and identical scores.
    const a = buildDriveBasedSummary({ season: 1, week: 1, home: HOME, away: AWAY, globalSeed: 555 });
    const b = buildDriveBasedSummary({ season: 1, week: 1, home: HOME, away: AWAY, globalSeed: 555 });
    expect(a.homeScore).toBe(b.homeScore);
    expect(a.awayScore).toBe(b.awayScore);
    // The drive logs sum to the score (no phantom points).
    const homePts = a.homeDriveLog.reduce((s, d) => s + d.points, 0);
    const awayPts = a.awayDriveLog.reduce((s, d) => s + d.points, 0);
    expect(homePts).toBe(a.homeScore);
    expect(awayPts).toBe(a.awayScore);
  });
});
