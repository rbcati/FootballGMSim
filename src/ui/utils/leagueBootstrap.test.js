import { describe, it, expect } from 'vitest';
import { hasMinimumPlayableLeague, summarizeBootstrapState } from './leagueBootstrap.js';

describe('league bootstrap guards', () => {
  it('accepts minimal playable league payload', () => {
    expect(hasMinimumPlayableLeague({
      phase: 'regular',
      week: 1,
      teams: [{ id: 0, name: 'A' }],
    })).toBe(true);
  });

  it('rejects partial payloads and reports reasons', () => {
    const summary = summarizeBootstrapState({ teams: [], userTeamId: 0 });
    expect(summary.ready).toBe(false);
    expect(summary.reasons.length).toBeGreaterThan(0);
  });
});
