import { describe, it, expect } from 'vitest';
import { migrateSaveMetaToCurrent, CURRENT_SAVE_SCHEMA_VERSION } from '../../src/state/saveSchema.js';

describe('save schema v5.2 economy migration', () => {
  it('adds safe economy defaults to older saves', () => {
    const { migrated } = migrateSaveMetaToCurrent({ saveVersion: 5.1, settings: { salaryCap: 312.5 } });
    expect(migrated.saveVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.economy.currentSalaryCap).toBe(312.5);
    expect(migrated.economy.baseSalaryCap).toBe(312.5);
  });

  it('migrates pre-economy saves with safe defaults when salary cap setting is absent', () => {
    const { migrated } = migrateSaveMetaToCurrent({ saveVersion: 4, settings: {} });
    expect(migrated.saveVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.economy.currentSalaryCap).toBe(301.2);
    expect(migrated.economy.annualCapGrowthRate).toBe(0.035);
    expect(migrated.economy.annualSalaryInflationRate).toBe(0.025);
  });
});
