import { describe, it, expect } from 'vitest';
import { processSeasonRecords, createEmptyRecords } from '../records.js';

/**
 * Regression coverage for the season-archive passYd crash.
 *
 * A freshly bootstrapped league carries a LEGACY record stub
 * (`{ mostPassingYardsSeason, ... }`) that lacks the V1 singleSeason/allTime
 * buckets. Before the guard, `records.singleSeason.passYd` threw
 * "Cannot read properties of undefined (reading 'passYd')" and aborted
 * archiveSeason() on the first rollover.
 */
describe('processSeasonRecords — legacy record-book shape', () => {
  const seasonStats = [
    { playerId: 'p1', name: 'Test QB', pos: 'QB', teamId: 1, totals: { passYd: 5000, passTD: 40 } },
  ];
  const teamAbbrMap = { 1: 'AAA' };

  it('does not throw when existingRecords uses the legacy stub shape', () => {
    const legacy = {
      mostPassingYardsSeason: null,
      mostRushingYardsSeason: null,
      mostWinsSeason: null,
      mostChampionships: null,
      highestOvrPlayer: null,
    };
    expect(() =>
      processSeasonRecords(legacy, seasonStats, [], 2026, teamAbbrMap, []),
    ).not.toThrow();
  });

  it('recovers to a valid V1 record book and records the season leader', () => {
    const legacy = { mostPassingYardsSeason: null };
    const { records } = processSeasonRecords(legacy, seasonStats, [], 2026, teamAbbrMap, []);
    expect(records.singleSeason).toBeDefined();
    expect(records.allTime).toBeDefined();
    expect(records.singleSeason.passYd.value).toBe(5000);
    expect(records.singleSeason.passYd.name).toBe('Test QB');
  });

  it('still handles a null existingRecords (first-ever season)', () => {
    expect(() => processSeasonRecords(null, seasonStats, [], 2026, teamAbbrMap, [])).not.toThrow();
  });

  it('preserves an already-V1 record book instead of resetting it', () => {
    const v1 = createEmptyRecords();
    v1.singleSeason.passYd = { playerId: 'old', name: 'Old QB', pos: 'QB', team: 'ZZZ', value: 6000, year: 2020 };
    const { records } = processSeasonRecords(v1, seasonStats, [], 2026, teamAbbrMap, []);
    // 5000 < existing 6000, so the prior record must survive.
    expect(records.singleSeason.passYd.value).toBe(6000);
    expect(records.singleSeason.passYd.name).toBe('Old QB');
  });
});
