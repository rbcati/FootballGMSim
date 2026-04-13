import { describe, it, expect } from 'vitest';
import { migrateSaveMetaToCurrent, CURRENT_SAVE_SCHEMA_VERSION } from '../../src/state/saveSchema.js';

describe('save schema v5.2 economy migration', () => {
  it('adds safe economy defaults to older saves', () => {
    const { migrated } = migrateSaveMetaToCurrent({ saveVersion: 5.1, settings: { salaryCap: 312.5 } });
    expect(migrated.saveVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.economy.currentSalaryCap).toBe(312.5);
    expect(migrated.economy.baseSalaryCap).toBe(312.5);
  });
});
