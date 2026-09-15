import { describe, expect, it } from 'vitest';
import { getLeagueIdentity, getLeagueScopedStorageKey } from './leagueIdentity.js';

describe('league identity storage scope', () => {
  it('uses canonical active league identity and produces stable, isolated keys', () => {
    const a = { activeLeagueId: 'league_A', id: 'fallback', seasonId: '2026', week: 1, userTeamId: 1 };
    const b = { ...a, activeLeagueId: 'league_B' };
    expect(getLeagueIdentity(a)).toBe('league_A');
    expect(getLeagueScopedStorageKey('footballgm_gameplan_v1', a)).toBe(getLeagueScopedStorageKey('footballgm_gameplan_v1', { ...a }));
    expect(getLeagueScopedStorageKey('footballgm_gameplan_v1', a)).not.toBe(getLeagueScopedStorageKey('footballgm_gameplan_v1', b));
  });

  it('requires league identity rather than substituting team, year, or week', () => {
    expect(getLeagueIdentity({ seasonId: '2026', week: 1, userTeamId: 1 })).toBeNull();
    expect(getLeagueScopedStorageKey('footballgm_weekly_prep_v1', { seasonId: '2026', week: 1, userTeamId: 1 })).toBeNull();
  });
});
