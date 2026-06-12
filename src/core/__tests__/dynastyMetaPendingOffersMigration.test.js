/**
 * Pre-#1580 save migration — ensureDynastyMeta must hydrate the Market V2
 * pending-offer ledger on old saves without corrupting adjacent meta fields.
 * (The worker-path companion lives in
 * tests/integration/freeAgencyMarketV2.worker.test.js, which round-trips a
 * stripped meta through the real LOAD_SAVE pipeline.)
 */
import { describe, expect, it } from 'vitest';
import { ensureDynastyMeta } from '../dynasty-story.js';

/** A meta object shaped like a save written before Free Agency Market V2. */
function buildPreMarketV2Meta() {
  return {
    id: 'league',
    name: 'Legacy Dynasty',
    userTeamId: 0,
    year: 2028,
    season: 3,
    currentSeasonId: 's3',
    currentWeek: 1,
    phase: 'free_agency',
    freeAgencyState: { day: 3, maxDays: 5, complete: false },
    contractMarketMemory: { 17: { waitCycles: 2 }, 88: { waitCycles: 0 } },
    offseasonFaMovements: [
      { id: 'mv-1', playerId: 17, playerName: 'Legacy Corner', pos: 'CB', prevTeamId: 4, newTeamId: 11 },
    ],
    newsItems: [{ id: 'n1', type: 'TRANSACTION', text: 'Legacy Corner signs.' }],
    socialFeedEntries: [{ id: 'sf1', text: 'Big signing!' }],
    ownerGoals: [
      { id: 'g1', type: 'win_games', description: 'Win 10 games', target: 10, current: 4, complete: false, reward: 'Scout budget +$2M' },
    ],
    retiredPlayers: [{ id: 901, name: 'Old Guard', pos: 'OL' }],
    leagueHistory: [{ id: 's2', year: 2027 }],
    // No pendingOffers key — this save predates the ledger entirely.
  };
}

describe('pre-Market-V2 meta migration through ensureDynastyMeta', () => {
  it('hydrates a missing pendingOffers field to an empty array', () => {
    const meta = ensureDynastyMeta(buildPreMarketV2Meta());
    expect(meta.pendingOffers).toEqual([]);
  });

  it('hydrates non-array pendingOffers corruption to an empty array', () => {
    for (const bad of [null, 'nope', 42, { 0: {} }]) {
      const meta = ensureDynastyMeta({ ...buildPreMarketV2Meta(), pendingOffers: bad });
      expect(meta.pendingOffers).toEqual([]);
    }
  });

  it('keeps an existing ledger untouched', () => {
    const ledger = [{ id: 'fa-offer-1-0-1-1', playerId: 1, teamId: 0, status: 'pending' }];
    const meta = ensureDynastyMeta({ ...buildPreMarketV2Meta(), pendingOffers: ledger });
    expect(meta.pendingOffers).toBe(ledger);
  });

  it('does not corrupt adjacent FA / dynasty / user-team fields', () => {
    const original = buildPreMarketV2Meta();
    const meta = ensureDynastyMeta(original);

    expect(meta.userTeamId).toBe(original.userTeamId);
    expect(meta.phase).toBe('free_agency');
    expect(meta.freeAgencyState).toEqual(original.freeAgencyState);
    expect(meta.contractMarketMemory).toEqual(original.contractMarketMemory);
    expect(meta.offseasonFaMovements).toEqual(original.offseasonFaMovements);
    expect(meta.newsItems).toEqual(original.newsItems);
    expect(meta.socialFeedEntries).toEqual(original.socialFeedEntries);
    expect(meta.ownerGoals).toEqual(original.ownerGoals);
    expect(meta.retiredPlayers).toEqual(original.retiredPlayers);
    expect(meta.leagueHistory).toEqual(original.leagueHistory);
    expect(meta.year).toBe(2028);
    expect(meta.currentSeasonId).toBe('s3');
  });
});
