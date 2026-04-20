import { describe, expect, it } from 'vitest';
import { buildOffseasonActionCenter } from './offseasonActionCenter.js';

function makePlayer(id, { pos = 'WR', ovr = 70, years = 1, decision = 'pending', baseAnnual = 6 } = {}) {
  return { id, pos, ovr, contract: { years, baseAnnual }, extensionDecision: decision };
}

describe('buildOffseasonActionCenter', () => {
  it('guides the full season-end to preseason management loop with updated cap and roster context', () => {
    const team = {
      id: 1,
      abbr: 'USR',
      capTotal: 255,
      capUsed: 236,
      deadCap: 2,
      capRoom: 17,
      picks: [{ id: '1-1' }, { id: '2-1' }, { id: '3-1' }, { id: '4-1' }, { id: '5-1' }, { id: '6-1' }, { id: '7-1' }],
      roster: [
        makePlayer(1, { pos: 'QB', ovr: 86, years: 1, decision: 'pending' }),
        makePlayer(2, { pos: 'WR', ovr: 79, years: 1, decision: 'pending' }),
        makePlayer(3, { pos: 'LB', ovr: 74, years: 2, decision: 'none' }),
      ],
      seasonTeamStats: {
        offenseYardsPerPlay: 4.9,
        defenseYardsPerPlayAllowed: 6.2,
        passSuccessRate: 0.42,
      },
      seasonEventDigest: [{ tone: 'warning', summary: 'Allowed explosive passes in late downs.' }],
    };

    const league = { year: 2028, phase: 'offseason_resign', userTeamId: 1, teams: [team], draftClass: null };

    const resignCenter = buildOffseasonActionCenter(league);
    expect(resignCenter.blockers.join(' ')).toContain('key expiring contracts');
    expect(resignCenter.actions.map((a) => a.tab)).toContain('Contract Center');
    expect(resignCenter.metrics.expiringContracts).toBe(2);
    expect(resignCenter.unresolved.keyExpiringContracts).toBe(2);

    team.roster[0].extensionDecision = 'deferred';
    const withDeferred = buildOffseasonActionCenter(league);
    expect(withDeferred.metrics.projectedCapRoom).toBeLessThan(withDeferred.metrics.capRoom);

    team.roster[0].extensionDecision = 'extended';
    team.roster[1].extensionDecision = 'let_walk';
    const resolved = buildOffseasonActionCenter(league);
    expect(resolved.unresolved.expiringContracts).toBe(0);

    team.capRoom = 10;
    league.phase = 'free_agency';
    const faCenter = buildOffseasonActionCenter(league);
    expect(faCenter.metrics.capRoom).toBe(10);
    expect(faCenter.actions.map((a) => a.tab)).toContain('Free Agency');

    team.capRoom = 4;
    team.roster.push(makePlayer(4, { pos: 'CB', ovr: 77, years: 3, decision: 'none' }));
    league.phase = 'trades';
    const tradeCenter = buildOffseasonActionCenter(league);
    expect(tradeCenter.phaseLabel).toBe('Trades');
    expect(tradeCenter.actions.map((a) => a.tab)).toContain('Transactions:Builder');
    expect(tradeCenter.metrics.rosterCount).toBe(4);

    league.phase = 'draft';
    league.draftClass = [{ id: 90, name: 'Prospect One', pos: 'OT' }];
    const draftCenter = buildOffseasonActionCenter(league);
    expect(draftCenter.blockers).not.toContain('Draft board is not hydrated yet.');

    team.roster.push(makePlayer(5, { pos: 'OT', ovr: 72, years: 4, decision: 'none' }));
    league.phase = 'post_draft';
    const postDraft = buildOffseasonActionCenter(league);
    expect(postDraft.actions.map((a) => a.tab)).toContain('Roster:depth|ALL');

    league.phase = 'preseason';
    team.roster = Array.from({ length: 56 }, (_, idx) => makePlayer(100 + idx));
    const preseason = buildOffseasonActionCenter(league);
    expect(preseason.blockers.join(' ')).toContain('Roster cutdown required');
    expect(preseason.metrics.rosterCount).toBe(56);
  });
});
