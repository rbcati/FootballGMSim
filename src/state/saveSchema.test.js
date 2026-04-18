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
