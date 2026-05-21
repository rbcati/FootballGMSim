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

  it('returns at most 5 items', () => {
    const extra = Array.from({ length: 10 }, (_, i) => ({ id: `extra-${i}`, title: `Extra ${i}`, detail: 'Detail', tab: 'HQ' }));
    const priorities = buildActionableWeeklyPriorities({ team, nextGame: { opp: opponent }, prep: {}, weeklyAgenda: extra });
    expect(priorities.length).toBeLessThanOrEqual(5);
  });

  it('deduplicates items with matching titles', () => {
    const dupeAgenda = [
      { id: 'a1', title: 'Training', detail: 'First', tab: 'Training' },
      { id: 'a2', title: 'Training', detail: 'Duplicate', tab: 'Training' },
    ];
    const priorities = buildActionableWeeklyPriorities({ team, nextGame: { opp: opponent }, prep: {}, weeklyAgenda: dupeAgenda });
    const trainingItems = priorities.filter((item) => item.title === 'Training');
    expect(trainingItems.length).toBe(1);
  });

  it('returns base items even without a next game opponent', () => {
    const priorities = buildActionableWeeklyPriorities({ team, nextGame: null, prep: {} });
    expect(priorities.length).toBeGreaterThan(0);
    expect(priorities.every((item) => item.id && item.title && item.ctaLabel)).toBe(true);
  });

  it('marks Set Lineup as warning severity when starters are missing', () => {
    const priorities = buildActionableWeeklyPriorities({
      team: { ...team, missingStarters: 3 },
      nextGame: { opp: opponent },
      prep: {},
    });
    const lineupItem = priorities.find((item) => item.id === 'priority-lineup');
    expect(lineupItem).toBeDefined();
    expect(lineupItem.severity).toBe('warning');
  });
});

describe('buildWeeklyIntelligence — additional coverage', () => {
  it('includes late-season implication insight in week 10+', () => {
    const intel = buildWeeklyIntelligence({
      league: { week: 12 },
      team,
      nextGame: { isHome: true, opp: opponent },
      prep: { lineupIssues: [] },
    });
    expect(intel.insights.some((item) => item.id === 'intel-implication')).toBe(true);
  });

  it('includes injury insight when lineup issues contain injury keyword', () => {
    const intel = buildWeeklyIntelligence({
      league: { week: 5 },
      team,
      nextGame: { isHome: false, opp: opponent },
      prep: { lineupIssues: [{ label: 'QB injury', level: 'urgent' }, { label: 'RB injury risk', level: 'warning' }] },
    });
    expect(intel.insights.some((item) => item.id === 'intel-injuries')).toBe(true);
  });

  it('includes offensive edge insight when user offense outrates opponent defense', () => {
    const intel = buildWeeklyIntelligence({
      league: { week: 6 },
      team: { ...team, offenseRating: 90 },
      nextGame: { isHome: true, opp: { ...opponent, defenseRating: 75 } },
      prep: { lineupIssues: [] },
    });
    expect(intel.insights.some((item) => item.id === 'intel-off-edge')).toBe(true);
  });

  it('caps insights at 5', () => {
    const intel = buildWeeklyIntelligence({
      league: { week: 14 },
      team: { ...team, offenseRating: 90, defenseRating: 92 },
      nextGame: { isHome: true, opp: { ...opponent, offenseRating: 75, defenseRating: 70, recentResults: ['L'] } },
      prep: { lineupIssues: [{ label: 'WR injury', level: 'warning' }, { label: 'OL injury', level: 'warning' }] },
    });
    expect(intel.insights.length).toBeLessThanOrEqual(5);
  });

  it('all insights have required fields', () => {
    const intel = buildWeeklyIntelligence({
      league: { week: 8 },
      team,
      nextGame: { isHome: true, opp: opponent },
      prep: { lineupIssues: [] },
    });
    for (const insight of intel.insights) {
      expect(insight).toHaveProperty('id');
      expect(insight).toHaveProperty('tone');
      expect(insight).toHaveProperty('text');
      expect(typeof insight.text).toBe('string');
    }
  });
});
