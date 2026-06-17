import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';
import { migrateSaveMetaToCurrent } from '../../src/state/saveSchema.js';

describe('Trade Schema Consolidation Migration', () => {
  it('migrates old save with only inboundTradeOffers', () => {
    const meta = { saveVersion: 5.6, userTeamId: 5, inboundTradeOffers: [{ offerId: 'o1', status: 'pending' }] };
    const { migrated } = migrateSaveMetaToCurrent(meta);
    expect(Array.isArray(migrated.tradeOffers)).toBe(true);
    expect(migrated.tradeOffers[0].offerId).toBe('o1');
    expect(migrated.tradeOffers[0].origin).toBe('legacy');
    expect(migrated.tradeOffers[0].isBlockOffer).toBe(true);
    expect(migrated.tradeOffers[0].targetTeamId).toBe(5);
    expect(migrated.inboundTradeOffers).toBeUndefined();
  });

  it('migrates old save with only incomingTradeOffers', () => {
    const meta = { saveVersion: 5.6, userTeamId: 3, incomingTradeOffers: [{ offerId: 'g1', status: 'pending' }] };
    const { migrated } = migrateSaveMetaToCurrent(meta);
    expect(migrated.tradeOffers[0].offerId).toBe('g1');
    expect(migrated.tradeOffers[0].origin).toBe('legacy');
    expect(migrated.tradeOffers[0].isBlockOffer).toBe(false);
    expect(migrated.tradeOffers[0].targetTeamId).toBe(3);
    expect(migrated.incomingTradeOffers).toBeUndefined();
  });

  it('merges both arrays and deduplicates by offerId', () => {
    const meta = {
      saveVersion: 5.6,
      userTeamId: 1,
      incomingTradeOffers: [{ offerId: 'dup1', status: 'pending' }, { offerId: 'unique1' }],
      inboundTradeOffers:  [{ offerId: 'dup1', status: 'pending' }, { offerId: 'unique2' }],
    };
    const { migrated } = migrateSaveMetaToCurrent(meta);
    expect(migrated.tradeOffers.length).toBe(3); // dup1 appears once
    const ids = migrated.tradeOffers.map(o => o.offerId);
    expect(ids.filter(id => id === 'dup1').length).toBe(1);
  });

  it('hydrates as empty array when neither field exists', () => {
    const meta = { saveVersion: 5.6, userTeamId: 0 };
    const { migrated } = migrateSaveMetaToCurrent(meta);
    expect(migrated.tradeOffers).toEqual([]);
  });

  it('is a no-op when tradeOffers already exists', () => {
    const existing = [{ offerId: 'x1', origin: 'ai_pursuit' }];
    const meta = { saveVersion: 5.6, tradeOffers: existing };
    const { migrated } = migrateSaveMetaToCurrent(meta);
    expect(migrated.tradeOffers).toEqual(existing);
  });

  it('sets origin correctly for inboundTradeOffers entries', () => {
    const meta = { saveVersion: 5.6, inboundTradeOffers: [{ offerId: 'b1' }] };
    const { migrated } = migrateSaveMetaToCurrent(meta);
    expect(migrated.tradeOffers[0].origin).toBe('legacy');
    expect(migrated.tradeOffers[0].isBlockOffer).toBe(true);
  });

  it('sets targetTeamId from meta.userTeamId during migration', () => {
    const meta = { saveVersion: 5.6, userTeamId: 7, incomingTradeOffers: [{ offerId: 'a1' }] };
    const { migrated } = migrateSaveMetaToCurrent(meta);
    expect(migrated.tradeOffers[0].targetTeamId).toBe(7);
  });
});

describe('Source-level guardrails', () => {
  it('meta.inboundTradeOffers does not appear outside migrations in runtime source files', () => {
    // saveSchema.js is excluded: migrations legitimately reference legacy field names
    // aiTradeEngine.js comment updated to reference meta.tradeOffers
    const files = [
      '../../src/worker/worker.js',
      '../../src/worker/serialization.js',
    ];
    for (const f of files) {
      const content = readFileSync(resolve(__dirname, f), 'utf8');
      const hasMeta = content.includes('meta.inboundTradeOffers') || content.includes('meta?.inboundTradeOffers');
      if (hasMeta) {
        throw new Error(`Found meta.inboundTradeOffers in ${f}`);
      }
    }
  });

  it('meta.incomingTradeOffers does not appear in runtime source files after consolidation', () => {
    // saveSchema.js is excluded: migrateV2ToV3 and migrateV56ToV57 must reference legacy fields
    const files = [
      '../../src/worker/worker.js',
      '../../src/worker/serialization.js',
    ];
    for (const f of files) {
      const content = readFileSync(resolve(__dirname, f), 'utf8');
      const hasMeta = content.includes('meta.incomingTradeOffers') || content.includes('meta?.incomingTradeOffers');
      if (hasMeta) {
        throw new Error(`Found meta.incomingTradeOffers in ${f}`);
      }
    }
  });

  it('aiToAiTradeEngine.js does not call Math.random() (uses seeded LCG)', () => {
    const content = readFileSync(resolve(__dirname, '../../src/core/trades/aiToAiTradeEngine.js'), 'utf8');
    // Check for actual calls to Math.random(), not mentions in comments
    expect(content).not.toMatch(/Math\.random\s*\(\s*\)/);
  });

  it('aiToAiTradeEngine.js has no prohibited import statements', () => {
    const content = readFileSync(resolve(__dirname, '../../src/core/trades/aiToAiTradeEngine.js'), 'utf8');
    // Only check import statements (lines starting with 'import')
    const importLines = content.split('\n').filter(line => line.trim().startsWith('import'));
    const prohibited = ['/worker/', '/ui/', 'news-engine', 'playerMoraleEngine', 'holdout', 'scouting', 'hallOfFame', 'coaching', 'freeAgency', 'extension', 'restructure', 'game-simulator', 'richGameSimulator'];
    for (const imp of importLines) {
      for (const p of prohibited) {
        expect(imp).not.toContain(p);
      }
    }
  });
});
