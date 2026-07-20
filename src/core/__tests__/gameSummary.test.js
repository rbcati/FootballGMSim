import { describe, expect, it } from 'vitest';
import { normalizePlayLogs } from '../gameEvents.js';
import {
  buildDriveSummaryFromSimulation,
  buildQuarterScoresFromScoring,
  buildScoringSummaryFromSimulation,
  buildTeamStatComparisonFromArchive,
  resolveCanonicalTeamStats,
} from '../gameSummary.js';

describe('game summary pipeline', () => {
  const context = { homeId: 1, awayId: 2, homeAbbr: 'HME', awayAbbr: 'AWY' };
  const rawLogs = [
    { quarter: 1, clock: '12:15', possession: 'home', text: 'QB finds WR for 12 yds.', type: 'pass', yards: 12, passer: { id: 10, name: 'QB' }, receiver: { id: 11, name: 'WR' }, homeScore: 0, awayScore: 0 },
    { quarter: 1, clock: '10:08', possession: 'home', text: 'TOUCHDOWN! 8-yard pass.', type: 'touchdown', isTouchdown: true, homeScore: 7, awayScore: 0, passer: { id: 10 }, receiver: { id: 11 } },
    { quarter: 2, clock: '04:41', possession: 'away', text: 'AWY field goal attempt... GOOD!', type: 'field_goal', homeScore: 7, awayScore: 3 },
  ];

  it('normalizes play logs with structured ids/team refs', () => {
    const logs = normalizePlayLogs(rawLogs, context);
    expect(logs[0].offenseTeamId).toBe(1);
    expect(logs[0].defenseTeamId).toBe(2);
    expect(logs[0].playType).toBe('pass');
    expect(logs[0].scoreHomeAfter).toBe(0);
  });

  it('builds explicit scoring summaries and quarter arrays', () => {
    const logs = normalizePlayLogs(rawLogs, context);
    const scoring = buildScoringSummaryFromSimulation(logs, context);
    const quarterScores = buildQuarterScoresFromScoring(scoring, context);
    expect(scoring).toHaveLength(2);
    expect(scoring[0].scoreType).toBe('touchdown');
    expect(scoring[0].passerId).toBe(10);
    expect(quarterScores.home[0]).toBe(7);
    expect(quarterScores.away[1]).toBe(3);
  });

  it('builds structured drive summaries', () => {
    const drives = buildDriveSummaryFromSimulation(normalizePlayLogs(rawLogs, context), context);
    expect(drives.length).toBeGreaterThan(0);
    expect(drives[0]).toEqual(expect.objectContaining({
      teamId: expect.any(Number),
      startClock: expect.any(String),
      startFieldPos: expect.anything(),
      plays: expect.any(Number),
      yards: expect.any(Number),
      result: expect.any(String),
      points: expect.any(Number),
    }));
  });
});

describe('archived team stats (post-engine-flip stabilization)', () => {
  const context = { homeId: 1, awayId: 2, homeAbbr: 'HME', awayAbbr: 'AWY' };
  // Rich-engine box-score shape: the QB row's `interceptions` are INTs THROWN
  // (set to total offensive turnovers), defender rows' are INTs MADE.
  const boxScore = {
    home: {
      hqb: { name: 'Home QB', pos: 'QB', stats: { passAtt: 30, passYd: 250, interceptions: 2 } },
      hrb: { name: 'Home RB', pos: 'RB', stats: { rushAtt: 18, rushYd: 80, fumblesLost: 1 } },
      hcb: { name: 'Home CB', pos: 'CB', stats: { interceptions: 1, tackles: 6 } },
      hedge: { name: 'Home EDGE', pos: 'EDGE', stats: { sacks: 2, tackles: 4 } },
    },
    away: {
      aqb: { name: 'Away QB', pos: 'QB', stats: { passAtt: 28, passYd: 210, interceptions: 1 } },
      as: { name: 'Away S', pos: 'S', stats: { interceptions: 2, tackles: 5 } },
    },
  };

  it('does not count defensive INTs made as offensive turnovers (fallback derivation)', () => {
    const derived = buildTeamStatComparisonFromArchive(boxScore, context);
    // Home giveaways: 2 thrown INTs + 1 lost fumble — NOT the CB's pick.
    expect(derived.home.turnovers).toBe(3);
    // Away giveaways: 1 thrown INT — NOT the safety's 2 picks.
    expect(derived.away.turnovers).toBe(1);
    expect(derived.home.sacks).toBe(2);
  });

  it('prefers the simulator canonical teamStats and preserves the full line', () => {
    const richLine = (over) => ({
      plays: 62, firstDowns: 21, passAtt: 33, passComp: 21, passYd: 245, passYards: 245,
      passTD: 2, rushAtt: 26, rushYd: 110, rushYards: 110, rushTD: 1, totalYards: 355,
      yardsPerPlay: 5.73, turnovers: 1, sacksAllowed: 2, sacksMade: 3, interceptions: 1,
      redZoneTrips: 4, redZoneScores: 3, explosivePlays: 5, successRate: 0.47,
      fieldGoalsMade: 1, fieldGoalsAttempted: 2, extraPointsMade: 3, extraPointsAttempted: 3,
      punts: 4, puntYards: 180, kickReturns: 2, kickReturnYards: 44, puntReturns: 1, puntReturnYards: 8,
      ...over,
    });
    const canonical = resolveCanonicalTeamStats(
      { home: richLine({}), away: richLine({ passYd: 200, passYards: 200, totalYards: 310 }) },
      boxScore,
      context,
    );
    // The engine's full line survives — not zeroed/dropped by box-row re-derivation.
    expect(canonical.home.plays).toBe(62);
    expect(canonical.home.firstDowns).toBe(21);
    expect(canonical.home.yardsPerPlay).toBe(5.73);
    expect(canonical.home.redZoneTrips).toBe(4);
    expect(canonical.home.redZoneScores).toBe(3);
    expect(canonical.home.turnovers).toBe(1);
    // Alias keys the Game Book comparison rows read.
    expect(canonical.home.sacks).toBe(3);
    expect(canonical.home.passYards).toBe(245);
    expect(canonical.away.passYards).toBe(200);
  });

  it('falls back to box-row derivation when the result has no team stats', () => {
    const fallback = resolveCanonicalTeamStats(null, boxScore, context);
    expect(fallback.home.passYards).toBe(250);
    expect(fallback.home.turnovers).toBe(3);
  });
});

describe('postgame leader interception semantics', () => {
  it('uses passer interceptions as turnovers, never defensive takeaways', async () => {
    const { buildPlayerLeadersFromArchive } = await import('../gameSummary.js');
    const boxScore = {
      home: {
        qb: { name: 'Turnover QB', pos: 'QB', stats: { passAtt: 35, passComp: 24, passYd: 300, passTD: 3, interceptions: 3 } },
        cb: { name: 'Takeaway CB', pos: 'CB', stats: { interceptions: 1, tackles: 2 } },
      },
      away: {},
    };
    const leaders = buildPlayerLeadersFromArchive(boxScore, { homeId: 1, awayId: 2 });
    expect(leaders.categories.defense?.name).toBe('Takeaway CB');
    expect(leaders.categories.defense?.stats?.interceptions).toBe(1);
    expect(leaders.standouts.find((p) => p.name === 'Turnover QB')?.stats?.interceptions).toBe(3);
  });

  it('does not promote a passer into defense when no defender has production', async () => {
    const { buildPlayerLeadersFromArchive } = await import('../gameSummary.js');
    const leaders = buildPlayerLeadersFromArchive({
      home: { qb: { name: 'Only QB', pos: 'QB', stats: { passAtt: 28, passYd: 220, interceptions: 4 } } },
      away: {},
    }, { homeId: 1, awayId: 2 });
    expect(leaders.categories.defense).toBeNull();
  });

  it('penalizes otherwise identical passers for interceptions thrown', async () => {
    const { buildPlayerLeadersFromArchive } = await import('../gameSummary.js');
    const leaders = buildPlayerLeadersFromArchive({
      home: { clean: { name: 'Clean QB', pos: 'QB', stats: { passAtt: 30, passComp: 20, passYd: 300, passTD: 3, interceptions: 0 } } },
      away: { risky: { name: 'Risky QB', pos: 'QB', stats: { passAtt: 30, passComp: 20, passYd: 300, passTD: 3, interceptions: 3 } } },
    }, { homeId: 1, awayId: 2 });
    expect(leaders.playerOfGame?.name).toBe('Clean QB');
  });
});

describe('postgame sack semantics — offensive sacks-taken are not defensive production (#1700 review defect #3)', () => {
  // Fixture from the review: a QB with 5 sacks TAKEN and an EDGE with 1 sack MADE.
  const boxScore = {
    home: { qb: { name: 'Sacked QB', pos: 'QB', stats: { passAtt: 32, passComp: 20, passYd: 240, sacks: 5 } } },
    away: { edge: { name: 'Edge Rusher', pos: 'EDGE', stats: { passAtt: 0, sacks: 1, tackles: 3 } } },
  };

  it('the EDGE (sacks made) is the defensive leader, never the QB (sacks taken)', async () => {
    const { buildPlayerLeadersFromArchive } = await import('../gameSummary.js');
    const leaders = buildPlayerLeadersFromArchive(boxScore, { homeId: 1, awayId: 2 });
    expect(leaders.categories.defense?.name).toBe('Edge Rusher');
    expect(leaders.categories.defense?.name).not.toBe('Sacked QB');
  });

  it("a QB's sacks taken add NO positive Player-of-Game impact", async () => {
    const { buildPlayerLeadersFromArchive } = await import('../gameSummary.js');
    // Two QBs identical except: one took 5 sacks, the other took 0 and threw for
    // one more yard. If sacks-taken added impact the sacked QB would win; it must
    // not — the extra yard decides it.
    const leaders = buildPlayerLeadersFromArchive({
      home: { sacked: { name: 'Sacked QB', pos: 'QB', stats: { passAtt: 32, passComp: 20, passYd: 300, sacks: 5 } } },
      away: { clean: { name: 'Clean QB', pos: 'QB', stats: { passAtt: 32, passComp: 20, passYd: 301, sacks: 0 } } },
    }, { homeId: 1, awayId: 2 });
    expect(leaders.playerOfGame?.name).toBe('Clean QB');
  });

  it('genuine defender sacks still count as defensive production', async () => {
    const { buildPlayerLeadersFromArchive } = await import('../gameSummary.js');
    const leaders = buildPlayerLeadersFromArchive({
      home: { edge: { name: 'Real Sacker', pos: 'EDGE', stats: { passAtt: 0, sacks: 3 } } },
      away: {},
    }, { homeId: 1, awayId: 2 });
    expect(leaders.categories.defense?.name).toBe('Real Sacker');
  });
});
