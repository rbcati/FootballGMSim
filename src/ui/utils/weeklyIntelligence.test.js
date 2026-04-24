import { describe, expect, it } from 'vitest';
import { buildActionableWeeklyPriorities, buildWeeklyIntelligence } from './weeklyIntelligence.js';

const team = { id: 1, abbr: 'CHI', wins: 6, losses: 3, ties: 0, offenseRating: 80, defenseRating: 87 };
const opponent = { id: 2, abbr: 'DET', wins: 7, losses: 2, ties: 0, offenseRating: 88, defenseRating: 74 };

describe('buildWeeklyIntelligence', () => {
  it('adds offensive-risk insight when opponent offense is stronger', () => {
    const intel = buildWeeklyIntelligence({
      league: { week: 8 },
      team,
      nextGame: { isHome: true, opp: { ...opponent, defenseRating: 90, offenseRating: 92 } },
      prep: { lineupIssues: [] },
    });
    expect(intel.insights.some((item) => item.text.includes('Opponent offense is the pressure point'))).toBe(true);
  });

  it('adds defensive edge insight when user defense is stronger', () => {
    const intel = buildWeeklyIntelligence({
      league: { week: 8 },
      team,
      nextGame: { isHome: false, opp: { ...opponent, offenseRating: 80 } },
      prep: { lineupIssues: [] },
    });
    expect(intel.insights.some((item) => item.text.includes('Your defense has a matchup advantage'))).toBe(true);
  });

  it('returns tasteful fallback when opponent is missing', () => {
    const intel = buildWeeklyIntelligence({ league: { week: 3 }, team, nextGame: null, prep: {} });
    expect(intel.insights).toHaveLength(1);
    expect(intel.insights[0].text).toMatch(/No opponent is locked yet/i);
  });

  it('uses ratings fallback when ratings are unavailable', () => {
    const intel = buildWeeklyIntelligence({
      league: { week: 3 },
      team: { id: 1, abbr: 'CHI', wins: 1, losses: 1 },
      nextGame: { isHome: true, opp: { id: 2, abbr: 'DET', wins: 1, losses: 1 } },
      prep: { lineupIssues: [] },
    });
    expect(intel.insights.some((item) => item.id === 'intel-ratings-fallback')).toBe(true);
  });
});

describe('buildActionableWeeklyPriorities', () => {
  it('generates agenda reasons from real state', () => {
    const priorities = buildActionableWeeklyPriorities({
      team: { ...team, depthChartWarnings: { missingStarters: 2 } },
      nextGame: { opp: opponent },
      prep: { lineupIssues: [{ id: 'x' }] },
      weeklyAgenda: [{ id: 'ext1', title: 'Cap check', detail: 'Review cap', tab: 'Financials' }],
    });
    expect(priorities[0].title).toBe('Set Lineup');
    expect(priorities[0].description).toContain('2 depth chart warnings');
    expect(priorities.some((item) => item.title === 'Game Plan')).toBe(true);
    expect(priorities.some((item) => item.ctaLabel.startsWith('Open'))).toBe(true);
  });
});
