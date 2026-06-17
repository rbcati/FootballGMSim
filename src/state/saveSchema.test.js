import { describe, expect, it } from 'vitest';
import { CURRENT_SAVE_SCHEMA_VERSION, migrateSaveMetaToCurrent } from './saveSchema.js';

describe('saveSchema migration', () => {
  it('safely defaults progression metadata for legacy/partial saves', () => {
    const legacy = {
      saveVersion: 5.5,
      year: 2030,
      schedule: { weeks: [] },
    };

    const migrated = migrateSaveMetaToCurrent(legacy);

    expect(migrated.migratedTo).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.migrated.developmentModel).toEqual({
      version: 1,
      lastEvolutionStamp: null,
    });
    expect(migrated.migrated.weeklyDevelopmentLog).toEqual([]);
  });
});

describe('migrateV56ToV57 — trade offers dedup', () => {
  function runMigration(meta) {
    return migrateSaveMetaToCurrent({ ...meta, saveVersion: 5.6 }).migrated;
  }

  it('merges both legacy arrays into tradeOffers', () => {
    const result = runMigration({
      incomingTradeOffers: [{ offerId: 'o1', status: 'pending' }],
      inboundTradeOffers:  [{ offerId: 'o2', status: 'pending' }],
    });
    expect(result.tradeOffers).toHaveLength(2);
    expect(result.tradeOffers.map(o => o.offerId).sort()).toEqual(['o1', 'o2']);
  });

  it('deduplicates overlapping offerId across both legacy arrays (Set-based dedup)', () => {
    const result = runMigration({
      incomingTradeOffers: [{ offerId: 'dup', status: 'pending' }],
      inboundTradeOffers:  [{ offerId: 'dup', status: 'pending' }],
    });
    expect(result.tradeOffers).toHaveLength(1);
    expect(result.tradeOffers[0].offerId).toBe('dup');
  });

  it('removes inboundTradeOffers and incomingTradeOffers from the migrated meta', () => {
    const result = runMigration({
      incomingTradeOffers: [{ offerId: 'o1' }],
      inboundTradeOffers:  [{ offerId: 'o2' }],
    });
    expect(result.inboundTradeOffers).toBeUndefined();
    expect(result.incomingTradeOffers).toBeUndefined();
  });

  it('handles missing legacy arrays gracefully', () => {
    const result = runMigration({});
    expect(result.tradeOffers).toEqual([]);
  });

  it('skips migration if tradeOffers already present', () => {
    const existing = [{ offerId: 'existing', origin: 'ai_pursuit' }];
    const result = runMigration({ tradeOffers: existing });
    expect(result.tradeOffers).toEqual(existing);
  });
});
