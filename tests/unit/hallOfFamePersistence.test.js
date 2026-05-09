import { describe, it, expect } from 'vitest';
import {
  ensureLeagueMemoryMeta,
  addHallOfFameClass,
  syncHallOfFameAfterRecordBook,
} from '../../src/core/league-memory.js';
import { buildLegacyScoreReport, HOF_LEGACY_INDUCT_THRESHOLD } from '../../src/core/legacyScore.js';

describe('Hall of Fame persistence', () => {
  it('merges same-year classes instead of replacing prior inductees', () => {
    let meta = ensureLeagueMemoryMeta({});
    meta = addHallOfFameClass(meta, 2030, [
      { playerId: 'a', name: 'A', pos: 'QB', legacyScore: 80, tier: 'silver', reasons: [], score: 80 },
    ]);
    meta = addHallOfFameClass(meta, 2030, [
      { playerId: 'b', name: 'B', pos: 'RB', legacyScore: 75, tier: 'bronze', reasons: [], score: 75 },
    ]);
    const cls = meta.hallOfFame.classes.find((c) => c.year === 2030);
    expect(cls.inductees.length).toBe(2);
    expect(meta.hallOfFame.index.a).toBeTruthy();
    expect(meta.hallOfFame.index.b).toBeTruthy();
  });

  it('does not write empty classes', () => {
    const meta = addHallOfFameClass(ensureLeagueMemoryMeta({}), 2031, []);
    const y2031 = meta.hallOfFame.classes.filter((c) => c.year === 2031);
    expect(y2031.length).toBe(0);
  });

  it('syncHallOfFameAfterRecordBook skips active players and duplicate index entries', () => {
    const recordBook = { careerLeadersV1: {}, singleSeasonV1: {} };
    const meta = ensureLeagueMemoryMeta({
      leagueHistory: [],
      recordBook,
      hallOfFame: {
        classes: [{ year: 2028, classId: 'hof-2028', inductees: [{ playerId: 'old', name: 'Old', pos: 'QB', legacyScore: 90, tier: 'gold', reasons: [], score: 90 }] }],
        index: { old: { playerId: 'old' } },
        schemaVersion: 1,
      },
    });
    const active = { id: 'p1', status: 'active', pos: 'QB', careerStats: Array.from({ length: 12 }).map(() => ({ passYds: 5000, ovr: 95 })), accolades: [{ type: 'MVP' }] };
    const retiredOk = {
      id: 'p2',
      status: 'retired',
      pos: 'QB',
      careerStats: Array.from({ length: 12 }).map(() => ({ passYds: 1200, ovr: 90 })),
      accolades: [{ type: 'MVP' }],
    };
    const { memoryMeta, newInductees } = syncHallOfFameAfterRecordBook(meta, [active, retiredOk], 2030, { teams: [], teamAbbrMap: {} });
    expect(newInductees.some((x) => x.playerId === 'p1')).toBe(false);
    expect(newInductees.some((x) => x.playerId === 'p2')).toBe(true);
    expect(memoryMeta.hallOfFame.index.p2).toBeTruthy();
  });

  it('old saves without hallOfFame still get defaults via ensureLeagueMemoryMeta', () => {
    const meta = ensureLeagueMemoryMeta({ year: 2025 });
    expect(Array.isArray(meta.hallOfFame.classes)).toBe(true);
    expect(meta.hallOfFame.schemaVersion).toBe(1);
  });
});

describe('duplicate induction guard', () => {
  it('retired player at threshold is not double-added when already in index', () => {
    const report = buildLegacyScoreReport(
      { id: 'x', pos: 'QB', status: 'retired', accolades: [{ type: 'MVP' }], careerStats: Array.from({ length: 12 }).map(() => ({ passYds: 1200, ovr: 90 })) },
      {},
    );
    expect(report.legacyScore).toBeGreaterThanOrEqual(HOF_LEGACY_INDUCT_THRESHOLD);
    let meta = ensureLeagueMemoryMeta({});
    meta = addHallOfFameClass(meta, 2029, [{ playerId: 'x', name: 'X', pos: 'QB', legacyScore: report.legacyScore, tier: report.tier, reasons: [], score: report.legacyScore }]);
    const sync = syncHallOfFameAfterRecordBook(
      meta,
      [{ id: 'x', status: 'retired', pos: 'QB', accolades: [{ type: 'MVP' }], careerStats: Array.from({ length: 12 }).map(() => ({ passYds: 1200, ovr: 90 })), hof: true }],
      2029,
      { teams: [], teamAbbrMap: {} },
    );
    expect(sync.newInductees.length).toBe(0);
  });
});
