import { describe, expect, it } from 'vitest';
import { buildWeeklyPrepActions } from './weeklyPrepActions.js';

const team = {
  id: 1, abbr: 'CHI', wins: 5, losses: 3, ties: 0,
  ovr: 84, offenseRating: 82, defenseRating: 83,
  recentResults: ['W', 'W', 'L', 'W'],
};

const opponent = {
  id: 2, abbr: 'DET', wins: 4, losses: 4, ties: 0,
  ovr: 81, offenseRating: 88, defenseRating: 74,
};

const baseLeague = {
  week: 8, year: 2027, seasonId: 's8', userTeamId: 1,
  teams: [team, opponent],
  schedule: {
    weeks: [
      { week: 7, games: [{ id: 'g7', home: { id: 1 }, away: { id: 2 }, homeScore: 28, awayScore: 14, played: true }] },
      { week: 8, games: [{ id: 'g8', home: { id: 1 }, away: { id: 2 }, played: false }] },
    ],
  },
};

const emptyContext = { pressurePoints: { injuriesCount: 0 }, urgentItems: [], incomingOffers: [] };
const emptyIntel = { insights: [] };
const emptyPrep = { nextGame: null, opponent: null, lineupIssues: [] };

describe('buildWeeklyPrepActions — injury action', () => {
  it('returns injury action only when injury data exists', () => {
    const withInjuries = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: { ...emptyContext, pressurePoints: { injuriesCount: 2 } },
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(withInjuries.some((a) => a.id === 'prep-action-injuries')).toBe(true);
  });

  it('does NOT return injury action when injuriesCount is 0', () => {
    const withoutInjuries = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(withoutInjuries.some((a) => a.id === 'prep-action-injuries')).toBe(false);
  });

  it('uses danger tone for 4+ injuries and warning for 2-3', () => {
    const four = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: { ...emptyContext, pressurePoints: { injuriesCount: 4 } },
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    const injuryAction = four.find((a) => a.id === 'prep-action-injuries');
    expect(injuryAction?.tone).toBe('danger');

    const two = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: { ...emptyContext, pressurePoints: { injuriesCount: 2 } },
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(two.find((a) => a.id === 'prep-action-injuries')?.tone).toBe('warning');
  });
});

describe('buildWeeklyPrepActions — opponent/stat action', () => {
  it('returns opponent threat action only when opponent stat context exists AND intel flags risk', () => {
    const withThreat = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: {
        insights: [{ id: 'intel-def-risk', tone: 'warning', text: 'Opponent offense is the pressure point (88 vs 83).' }],
      },
      prep: { nextGame: { opp: opponent }, opponent, lineupIssues: [] },
    });
    expect(withThreat.some((a) => a.id === 'prep-action-opponent-threat')).toBe(true);
  });

  it('does NOT return opponent threat action when no next game exists', () => {
    const withoutGame = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: {
        insights: [{ id: 'intel-def-risk', tone: 'warning', text: 'Opponent offense is the pressure point.' }],
      },
      prep: emptyPrep,
    });
    expect(withoutGame.some((a) => a.id === 'prep-action-opponent-threat')).toBe(false);
  });

  it('does NOT return opponent threat action when opponent has no stat ratings', () => {
    const noRatings = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: { nextGame: { opp: { id: 2, abbr: 'DET' } }, opponent: { id: 2, abbr: 'DET' }, lineupIssues: [] },
    });
    expect(noRatings.some((a) => a.id === 'prep-action-opponent-threat')).toBe(false);
  });

  it('returns matchup-leaders action when opponent stats exist but no threat insight', () => {
    const withEdge = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: {
        insights: [{ id: 'intel-off-edge', tone: 'ok', text: 'Your offense has the edge (82 vs 74).' }],
      },
      prep: { nextGame: { opp: opponent }, opponent, lineupIssues: [] },
    });
    expect(withEdge.some((a) => a.id === 'prep-action-leaders')).toBe(true);
    const leadersAction = withEdge.find((a) => a.id === 'prep-action-leaders');
    expect(leadersAction?.destination).toBe('League');
  });
});

describe('buildWeeklyPrepActions — roster/FA/trade action', () => {
  it('returns roster action only when weekly context urgentItems supports it', () => {
    const withRoster = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: {
        ...emptyContext,
        urgentItems: [{ tone: 'warning', level: 'recommendation', rank: 65, label: 'Roster pressure point', detail: 'Add OL depth.', tab: 'Roster', why: 'Depth issue.' }],
      },
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(withRoster.some((a) => a.id === 'prep-action-roster-context')).toBe(true);
  });

  it('does NOT return roster action when no urgentItems have roster tabs', () => {
    const withoutRoster = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(withoutRoster.some((a) => a.id === 'prep-action-roster-context')).toBe(false);
  });

  it('maps FA Hub destination to Free Agency', () => {
    const withFAHub = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: {
        ...emptyContext,
        urgentItems: [{ tone: 'danger', level: 'blocker', rank: 88, label: 'Bid Risk', detail: '1 bid at risk.', tab: 'FA Hub', why: 'Bid expires.' }],
      },
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    const rosterAction = withFAHub.find((a) => a.id === 'prep-action-roster-context');
    expect(rosterAction?.destination).toBe('Free Agency');
  });

  it('returns trade action only when incoming offers exist', () => {
    const withTrade = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: { ...emptyContext, incomingOffers: [{ id: 'offer1', reason: 'A deal is waiting.' }] },
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(withTrade.some((a) => a.id === 'prep-action-trade')).toBe(true);
    expect(withTrade.find((a) => a.id === 'prep-action-trade')?.destination).toBe('Trade Center');
  });

  it('does NOT return trade action when no incoming offers exist', () => {
    const withoutTrade = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(withoutTrade.some((a) => a.id === 'prep-action-trade')).toBe(false);
  });
});

describe('buildWeeklyPrepActions — Game Book action', () => {
  it('returns game-book action when coming off a loss with a completed game ID', () => {
    const lossLeague = {
      ...baseLeague,
      teams: [{ ...team, recentResults: ['W', 'L'] }, opponent],
    };
    const actions = buildWeeklyPrepActions({
      league: lossLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    const gbAction = actions.find((a) => a.id === 'prep-action-game-book');
    expect(gbAction).toBeDefined();
    expect(gbAction?.destination).toMatch(/^Game Book:/);
  });

  it('does NOT return game-book action when last result is a win', () => {
    const winLeague = {
      ...baseLeague,
      teams: [{ ...team, recentResults: ['W', 'W', 'L', 'W'] }, opponent],
    };
    const actions = buildWeeklyPrepActions({
      league: winLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(actions.some((a) => a.id === 'prep-action-game-book')).toBe(false);
  });

  it('does NOT return game-book action when no completed game exists', () => {
    const noGameLeague = {
      ...baseLeague,
      teams: [{ ...team, recentResults: ['L'] }, opponent],
      schedule: { weeks: [{ week: 8, games: [{ id: 'g8', home: { id: 1 }, away: { id: 2 }, played: false }] }] },
    };
    const actions = buildWeeklyPrepActions({
      league: noGameLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(actions.some((a) => a.id === 'prep-action-game-book')).toBe(false);
  });
});

describe('buildWeeklyPrepActions — caps and structure', () => {
  it('caps actions at 5', () => {
    const lossLeague = {
      ...baseLeague,
      teams: [{ ...team, recentResults: ['L'] }, opponent],
    };
    const actions = buildWeeklyPrepActions({
      league: lossLeague,
      weeklyContext: {
        pressurePoints: { injuriesCount: 4 },
        urgentItems: [
          { tone: 'warning', rank: 65, label: 'Roster need', detail: 'Add OL depth.', tab: 'Roster', why: 'Depth issue.' },
          { tone: 'danger', rank: 88, label: 'Bid Risk', detail: '2 bids at risk.', tab: 'FA Hub', why: 'Bids expire.' },
        ],
        incomingOffers: [{ id: 'offer1' }],
      },
      weeklyIntelligence: {
        insights: [{ id: 'intel-def-risk', tone: 'warning', text: 'Opponent offense is the pressure point.' }],
      },
      prep: {
        nextGame: { opp: opponent },
        opponent,
        lineupIssues: [{ id: 'x', level: 'urgent', label: 'Depth chart blocker', detail: 'Missing OL starters.' }],
      },
    });
    expect(actions.length).toBeLessThanOrEqual(5);
  });

  it('returns empty array when no signals exist', () => {
    const actions = buildWeeklyPrepActions({
      league: { userTeamId: 1, teams: [{ id: 1, wins: 0, losses: 0, recentResults: [] }], schedule: { weeks: [] } },
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(actions).toHaveLength(0);
  });

  it('returns empty array for empty inputs', () => {
    expect(buildWeeklyPrepActions()).toHaveLength(0);
    expect(buildWeeklyPrepActions({})).toHaveLength(0);
  });

  it('all returned actions have required shape', () => {
    const actions = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: {
        pressurePoints: { injuriesCount: 2 },
        urgentItems: [{ tone: 'warning', rank: 65, label: 'Roster issue', detail: 'Fix OL.', tab: 'Roster', why: 'Thin.' }],
        incomingOffers: [{ id: 'offer1' }],
      },
      weeklyIntelligence: {
        insights: [{ id: 'intel-def-risk', tone: 'warning', text: 'Opponent offense is the pressure point.' }],
      },
      prep: { nextGame: { opp: opponent }, opponent, lineupIssues: [] },
    });
    for (const action of actions) {
      expect(action).toHaveProperty('id');
      expect(action).toHaveProperty('title');
      expect(action).toHaveProperty('detail');
      expect(action).toHaveProperty('tone');
      expect(action).toHaveProperty('priority');
      expect(action).toHaveProperty('destination');
      expect(action).toHaveProperty('ctaLabel');
      expect(action).toHaveProperty('reason');
      expect(typeof action.title).toBe('string');
      expect(typeof action.destination).toBe('string');
    }
  });

  it('sorts actions by priority descending', () => {
    const actions = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: { pressurePoints: { injuriesCount: 4 }, urgentItems: [], incomingOffers: [] },
      weeklyIntelligence: {
        insights: [{ id: 'intel-def-risk', tone: 'warning', text: 'Threat.' }],
      },
      prep: { nextGame: { opp: opponent }, opponent, lineupIssues: [{ level: 'urgent', detail: 'Missing QB.' }] },
    });
    for (let i = 1; i < actions.length; i += 1) {
      expect(actions[i - 1].priority).toBeGreaterThanOrEqual(actions[i].priority);
    }
  });

  it('filters out actions with unknown/unsafe destinations', () => {
    const actions = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: {
        pressurePoints: {},
        urgentItems: [{ tone: 'warning', rank: 55, label: 'Unknown Tab', detail: 'Some issue.', tab: 'SomeUnknownTab', why: 'Reason.' }],
        incomingOffers: [],
      },
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(actions.some((a) => a.destination === 'SomeUnknownTab')).toBe(false);
  });
});

describe('buildWeeklyPrepActions — depth chart action', () => {
  it('returns depth chart action only when lineup issues exist', () => {
    const withIssues = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: { nextGame: null, opponent: null, lineupIssues: [{ id: 'x', level: 'warning', label: 'Thin RB', detail: 'Running Back is thin (1/3).' }] },
    });
    expect(withIssues.some((a) => a.id === 'prep-action-depth')).toBe(true);
    expect(withIssues.find((a) => a.id === 'prep-action-depth')?.destination).toBe('Team:Roster / Depth');

    const withoutIssues = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: emptyPrep,
    });
    expect(withoutIssues.some((a) => a.id === 'prep-action-depth')).toBe(false);
  });

  it('uses danger tone for urgent lineup issues', () => {
    const actions = buildWeeklyPrepActions({
      league: baseLeague,
      weeklyContext: emptyContext,
      weeklyIntelligence: emptyIntel,
      prep: {
        nextGame: null,
        opponent: null,
        lineupIssues: [{ id: 'x', level: 'urgent', label: 'Depth chart blocker', detail: 'No QB starter assigned.' }],
      },
    });
    expect(actions.find((a) => a.id === 'prep-action-depth')?.tone).toBe('danger');
  });
});
