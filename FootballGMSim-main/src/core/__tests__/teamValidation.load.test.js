import { describe, it, expect } from 'vitest';
import { validateLeagueTeamLegality } from '../teamValidation.js';

describe('team validation load-time cap behavior', () => {
  it('reports cap violations as warnings when requested', () => {
    const result = validateLeagueTeamLegality({
      teams: [{ id: 1, abbr: 'BUF', deadCap: 0 }],
      players: [{ id: 10, teamId: 1, contract: { yearsTotal: 4, baseAnnual: 100, signingBonus: 0 } }],
      hardCap: 50,
      capViolationSeverity: 'warn',
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('cap_limit');
    expect(result.issues[0].severity).toBe('warn');
  });
});

