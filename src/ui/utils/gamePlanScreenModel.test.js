import { describe, expect, it } from 'vitest';
import { buildGamePlanScreenModel } from './gamePlanScreenModel.js';

describe('buildGamePlanScreenModel', () => {
  it('derives opponent matchup context and tactical brief', () => {
    const league = {
      week: 8,
      seasonId: 's8',
      userTeamId: 1,
      teams: [
        { id: 1, abbr: 'CHI', wins: 4, losses: 3, offenseRating: 85, defenseRating: 81, strategies: { offSchemeId: 'WEST_COAST', defSchemeId: 'COVER_2' } },
        { id: 2, abbr: 'DET', wins: 5, losses: 2, offenseRating: 83, defenseRating: 79 },
      ],
      schedule: { weeks: [{ week: 8, games: [{ home: 1, away: 2, played: false }] }] },
    };

    const model = buildGamePlanScreenModel({ league, prepProgress: { planReviewed: false } });
    expect(model.matchupHeadline).toContain('Home matchup vs DET');
    expect(model.userRatings.offense).toBe(85);
    expect(model.opponentRatings.defense).toBe(79);
    expect(model.tacticalBrief.length).toBeGreaterThan(0);
  });

  it('returns safe fallback without opponent or malformed data', () => {
    const model = buildGamePlanScreenModel({ league: { week: 2, teams: [{ id: 5 }], userTeamId: 5, schedule: { weeks: [] } } });
    expect(model.hasOpponent).toBe(false);
    expect(model.matchupHeadline).toBe('No opponent locked yet');
    expect(model.tacticalBrief[0].title).toBe('Attack Plan');
    expect(model.strategySummary.offSchemeId).toBe('WEST_COAST');
  });
});
