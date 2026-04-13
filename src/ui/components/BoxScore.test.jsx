import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { GameBookQuickNav } from './BoxScore.jsx';
import { PLAYER_STATS_TABLES, buildTeamComparisonRows } from '../../core/footballMeta';

describe('BoxScore UI 2.0 structure helpers', () => {
  it('renders the quick section nav with key tabs', () => {
    const html = renderToString(<GameBookQuickNav activeSection="summary" onJump={() => {}} />);
    expect(html).toContain('Summary');
    expect(html).toContain('Team Stats');
    expect(html).toContain('Players');
    expect(html).toContain('gamebook-quick-nav');
  });

  it('uses shared player stat metadata categories', () => {
    expect(Object.keys(PLAYER_STATS_TABLES)).toEqual(expect.arrayContaining(['passing', 'rushing', 'receiving', 'defense']));
    expect(PLAYER_STATS_TABLES.passing.columns.map((col) => col.key)).toContain('passYd');
  });

  it('renders team comparison rows from metadata config', () => {
    const rows = buildTeamComparisonRows({
      away: { totalYards: 380, passYards: 240, rushYards: 140, turnovers: 1, sacks: 3, thirdDownMade: 5, thirdDownAtt: 11 },
      home: { totalYards: 320, passYards: 210, rushYards: 110, turnovers: 2, sacks: 1, thirdDownMade: 4, thirdDownAtt: 12 },
    });
    expect(rows.find((row) => row.label === 'Total Yards')?.awayValue).toBe(380);
    expect(rows.find((row) => row.label === '3rd Down')?.homeValue).toBe('4/12');
  });
});
