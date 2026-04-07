import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_SETTINGS, normalizeLeagueSettings, getRuleEditType } from '../leagueSettings.js';

describe('leagueSettings', () => {
  it('fills defaults for legacy/empty settings', () => {
    const normalized = normalizeLeagueSettings({});
    expect(normalized.salaryCap).toBe(DEFAULT_LEAGUE_SETTINGS.salaryCap);
    expect(normalized.scoutingFogStrength).toBe(DEFAULT_LEAGUE_SETTINGS.scoutingFogStrength);
    expect(normalized.staffImpactStrength).toBe(DEFAULT_LEAGUE_SETTINGS.staffImpactStrength);
  });

  it('clamps invalid rule values', () => {
    const normalized = normalizeLeagueSettings({ salaryCap: 10, capFloor: 9999, playoffTeams: 100 });
    expect(normalized.salaryCap).toBe(50);
    expect(normalized.capFloor).toBeLessThanOrEqual(normalized.salaryCap);
    expect(normalized.playoffTeams).toBeLessThanOrEqual(normalized.leagueSize);
  });

  it('categorizes edit safety by rule type', () => {
    expect(getRuleEditType('salaryCap')).toBe('safe-live-edit');
    expect(getRuleEditType('playoffTeams')).toBe('offseason-only');
    expect(getRuleEditType('leagueSize')).toBe('new-league-only');
  });
});
