import { describe, it, expect } from 'vitest';
import { makeLeague } from '../../core/league.js';
import { DEFAULT_TEAMS } from '../../data/default-teams.js';
import { autoBuildDepthChart, applyDepthChartToPlayers } from '../../core/depthChart.js';
import { deriveRosterReadinessModel } from './rosterReadinessModel.js';
import { deriveWeeklyPrepState } from './weeklyPrep.js';

function normalTeam() {
  const team = makeLeague(DEFAULT_TEAMS.slice(0, 2)).teams[0];
  for (const p of team.roster) p.ovr = 80;
  const assignments = autoBuildDepthChart(team.roster);
  team.roster = applyDepthChartToPlayers(team.roster, assignments);
  return { team, assignments };
}

describe('opaque player IDs in readiness consumers', () => {
  it('identifies the injured assigned QB without mistaking every row for the last player', () => {
    const { team, assignments } = normalTeam();
    const qb = team.roster.find(p => p.id === assignments.QB[0]);
    qb.injuryWeeksRemaining = 2;
    const model = deriveRosterReadinessModel({ team, roster: team.roster, assignments });
    expect(model.injuryReplacementConcerns).toBe(1);
    expect(model.topRiskyPositionGroups.find(row => row.rowKey === 'QB')?.reason).toBe('Starter unavailable');
    expect(model.safeToMarkLineupChecked).toBe(false);
    qb.injuryWeeksRemaining = 0;
    expect(deriveRosterReadinessModel({ team, roster: team.roster, assignments }).injuryReplacementConcerns).toBe(0);
  });

  it('preserves an explicitly ordered opaque QB starter when deriving assignments', () => {
    const { team } = normalTeam();
    const qbs = team.roster.filter(p => p.pos === 'QB');
    for (const [index, p] of qbs.entries()) {
      p.depthChart = { rowKey: 'QB', order: index === 1 ? 1 : index + 2 };
      p.ovr = index === 1 ? 60 : 90;
    }
    expect(deriveRosterReadinessModel({ team, roster: team.roster }).assignments.QB[0]).toBe(qbs[1].id);
  });

  it('weekly prep reports only the actual low-rated starters and respects saved choices', () => {
    const { team } = normalTeam();
    const qbs = team.roster.filter(p => p.pos === 'QB');
    for (const [index, p] of qbs.entries()) {
      p.depthChart = { rowKey: 'QB', order: index === 1 ? 1 : index + 2 };
      p.ovr = index === 1 ? 60 : 90;
    }
    team.roster.find(p => p.pos === 'P').ovr = 50;
    const prep = deriveWeeklyPrepState({ year: 2026, week: 1, phase: 'regular', userTeamId: team.id, teams: [team] });
    expect(prep.lineupIssues.filter(x => x.id.startsWith('starter-low-')).map(x => x.id).sort()).toEqual(['starter-low-P', 'starter-low-QB']);
  });
});
