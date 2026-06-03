import { describe, it, expect } from 'vitest';
import { prepareDraftView } from '../draftView.js';
import { prepareRosterView } from '../rosterView.js';
import { prepareGameResultView } from '../gameResultView.js';
import { prepareStandingsView } from '../standingsView.js';

describe('prepareDraftView', () => {
  it('shapes the draft phase + return destination from raw league state', () => {
    const v = prepareDraftView({ phase: 'draft', draftLifecycleStatus: 'not_generated', userTeamId: 3 });
    expect(v.isDraftPhase).toBe(true);
    expect(v.isDraftGenerationPending).toBe(true);
    expect(v.userTeamId).toBe(3);
    expect(v.returnDestination).toBe('HQ');

    const v2 = prepareDraftView({ phase: 'regular', userTeamId: 1 });
    expect(v2.isDraftPhase).toBe(false);
    expect(v2.returnDestination).toBe('League');
  });

  it('is defensive against null state', () => {
    const v = prepareDraftView(null);
    expect(v.isDraftPhase).toBe(false);
    expect(v.userTeamId).toBe(null);
  });
});

describe('prepareRosterView', () => {
  it('builds a depth chart and cap summary from a team slice', () => {
    const team = {
      id: 1,
      name: 'Test',
      salaryCap: 200,
      roster: [
        { id: 'a', name: 'QB One', pos: 'QB', ovr: 90, capHit: 40 },
        { id: 'b', name: 'QB Two', pos: 'QB', ovr: 70, capHit: 5 },
        { id: 'c', name: 'RB One', pos: 'RB', ovr: 80, capHit: 12 },
      ],
    };
    const v = prepareRosterView(team);
    expect(v.depthChart.QB.map((p) => p.id)).toEqual(['a', 'b']);
    expect(v.positionCounts.QB).toBe(2);
    expect(v.capSummary.capUsed).toBe(57);
    expect(v.capSummary.capSpace).toBe(143);
    // First in the sorted list is the highest-priority QB.
    expect(v.players[0].pos).toBe('QB');
  });
});

describe('prepareGameResultView', () => {
  it('shapes box score + highlights from a committed result', () => {
    const result = {
      homeTeamAbbr: 'HOM', awayTeamAbbr: 'AWY',
      scoreHome: 28, scoreAway: 20,
      boxScore: {
        home: { p1: { name: 'Star QB', pos: 'QB', playerId: 'p1', stats: { passYd: 320, passTD: 3 } } },
        away: { p2: { name: 'Sub WR', pos: 'WR', playerId: 'p2', stats: { recYd: 40, recTD: 0 } } },
      },
      playLogs: [{ text: 'Touchdown!' }],
    };
    const v = prepareGameResultView(result);
    expect(v.home.score).toBe(28);
    expect(v.home.won).toBe(true);
    expect(v.away.won).toBe(false);
    expect(v.boxScore.home).toHaveLength(1);
    expect(v.playLog).toHaveLength(1);
    expect(v.highlights.some((h) => h.name === 'Star QB')).toBe(true);
  });
});

describe('prepareStandingsView', () => {
  it('groups teams into divisions/conferences and seeds a playoff picture', () => {
    const league = {
      userTeamId: 1,
      teams: [
        { id: 1, abbr: 'A', conf: 0, div: 0, wins: 12, losses: 5, ties: 0, ptsFor: 400, ptsAgainst: 300 },
        { id: 2, abbr: 'B', conf: 0, div: 0, wins: 8, losses: 9, ties: 0, ptsFor: 350, ptsAgainst: 360 },
        { id: 3, abbr: 'C', conf: 0, div: 1, wins: 10, losses: 7, ties: 0, ptsFor: 380, ptsAgainst: 350 },
      ],
    };
    const v = prepareStandingsView(league);
    expect(v.userTeamId).toBe(1);
    expect(v.divisions.length).toBe(2);
    // Top seed in the conference is the best division winner.
    const conf = v.playoffPicture.find((p) => Number(p.conf) === 0);
    expect(conf.seeds[0].abbr).toBe('A');
    expect(conf.seeds[0].clinchedDivision).toBe(true);
  });
});
