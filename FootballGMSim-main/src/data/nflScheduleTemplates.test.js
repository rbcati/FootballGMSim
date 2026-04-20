import { describe, expect, it } from 'vitest';
import {
  buildTemplateSlotToTidMap,
  canUseNfl32Templates,
  materializeTemplateSchedule,
  validateMaterializedTemplateSchedule,
} from './nflScheduleTemplates.js';

function createLeagueTeams() {
  return Array.from({ length: 32 }, (_, i) => ({
    tid: i + 100,
    cid: Math.floor(i / 16),
    did: Math.floor((i % 16) / 4),
  }));
}

describe('nflScheduleTemplates', () => {
  it('maps template slots to sorted team ids inside each division', () => {
    const teams = createLeagueTeams().reverse();
    const map = buildTemplateSlotToTidMap(teams);

    expect(map.get(0)).toBe(100);
    expect(map.get(3)).toBe(103);
    expect(map.get(16)).toBe(116);
    expect(map.get(31)).toBe(131);
  });

  it('materializes and validates a full 18-week / 17-game schedule', () => {
    const teams = createLeagueTeams();
    expect(canUseNfl32Templates(teams)).toBe(true);

    const weeks = materializeTemplateSchedule(teams, 2026);
    expect(weeks).toHaveLength(18);

    expect(() => validateMaterializedTemplateSchedule(weeks)).not.toThrow();
  });

  it('rejects non-standard conference/division layouts', () => {
    const teams = createLeagueTeams().map((team) => ({ ...team, did: 0 }));
    expect(canUseNfl32Templates(teams)).toBe(false);
  });
});
