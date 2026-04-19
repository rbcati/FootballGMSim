import { describe, expect, it } from 'vitest';
import { AWARD_DISPLAY_NAMES, buildTeamComparisonRows, PLAYER_GAME_STATS, PLAYER_STATS_TABLES, TEAM_STATS_TABLES, FOOTBALL_POSITIONS } from '../footballMeta';

describe('footballMeta', () => {
  it('uses game stats that exist in box score/stat flows', () => {
    expect(PLAYER_GAME_STATS).toContain('passYd');
    expect(PLAYER_GAME_STATS).toContain('rushYd');
    expect(PLAYER_GAME_STATS).toContain('recYd');
    expect(PLAYER_GAME_STATS).toContain('tackles');
  });

  it('defines player stat tables used by box score', () => {
    expect(PLAYER_STATS_TABLES.passing.columns.map((c) => c.key)).toEqual(['passComp', 'passAtt', 'passYd', 'passTD', 'interceptions']);
    expect(PLAYER_STATS_TABLES.defense.columns.map((c) => c.key)).toContain('passesDefended');
  });

  it('defines team comparison rows with third-down formatter', () => {
    const rows = buildTeamComparisonRows({
      away: { totalYards: 301, thirdDownMade: 3, thirdDownAtt: 9 },
      home: { totalYards: 355, thirdDownMade: 6, thirdDownAtt: 12 },
    });
    expect(rows.find((row) => row.label === 'Total Yards')?.awayValue).toBe(301);
    expect(rows.find((row) => row.label === '3rd Down')?.homeValue).toBe('6/12');
  });

  it('includes metadata-only return specialist positions', () => {
    expect(FOOTBALL_POSITIONS.KR.runtimeSupported).toBe(false);
    expect(FOOTBALL_POSITIONS.PR.runtimeSupported).toBe(false);
  });

  it('maps known awards to display names', () => {
    expect(AWARD_DISPLAY_NAMES.mvp).toBe('Most Valuable Player');
    expect(AWARD_DISPLAY_NAMES.sbMvp).toBe('Finals MVP');
  });
});
