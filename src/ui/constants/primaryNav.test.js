import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, HQ_QUICK_TABS } from './primaryNav.js';
import { SHELL_SECTIONS, getShellSectionForDashboardTab } from '../utils/shellNavigation.js';

const flatTabs = NAV_GROUPS.flatMap((group) => group.tabs);
const tabsFor = (sectionId) => NAV_GROUPS.find((g) => g.id === sectionId)?.tabs ?? [];

describe('primary navigation structure', () => {
  it('exposes exactly the four shell sections with direct labels', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      SHELL_SECTIONS.hq,
      SHELL_SECTIONS.team,
      SHELL_SECTIONS.league,
      SHELL_SECTIONS.news,
    ]);
    expect(NAV_GROUPS.map((g) => g.title)).toEqual(['HQ', 'Team', 'League', 'News']);
  });

  it('drops vague "hub"-style section labels', () => {
    for (const group of NAV_GROUPS) {
      expect(group.title).not.toMatch(/office|management/i);
    }
  });

  it('keeps every core weekly-loop destination directly discoverable', () => {
    const core = [
      'HQ',
      'Schedule',
      'Weekly Results',
      'Roster Hub',
      'Depth Chart',
      'Transactions', // Trade Center
      'Free Agency',
      'Stats',
      'Standings',
      'Draft',
      'History Hub',
      'Awards & Records',
    ];
    for (const tab of core) {
      expect(flatTabs, `missing nav destination: ${tab}`).toContain(tab);
    }
  });

  it('orders the league section around the weekly loop before deep archives', () => {
    const league = tabsFor(SHELL_SECTIONS.league);
    // Core results/standings/stats come before historical archive tabs.
    expect(league.indexOf('Weekly Results')).toBeLessThan(league.indexOf('Draft History'));
    expect(league.indexOf('Standings')).toBeLessThan(league.indexOf('Season Recap'));
    for (const tab of ['Schedule', 'Standings', 'Stats', 'Free Agency', 'Transactions', 'Draft']) {
      expect(league).toContain(tab);
    }
  });

  it('leads the team section with the roster/depth flow', () => {
    const team = tabsFor(SHELL_SECTIONS.team);
    expect(team.indexOf('Roster Hub')).toBeLessThan(team.indexOf('Financials'));
    expect(team.indexOf('Depth Chart')).toBeLessThan(team.indexOf('💰 Cap'));
  });
});

describe('nav destinations still route to existing sections', () => {
  it('maps every team-section tab back to the team shell section', () => {
    for (const tab of tabsFor(SHELL_SECTIONS.team)) {
      expect(getShellSectionForDashboardTab(tab)).toBe(SHELL_SECTIONS.team);
    }
  });

  it('maps the league weekly-loop tabs back to the league shell section', () => {
    const loopTabs = [
      'Weekly Results', 'Schedule', 'Standings', 'Stats', 'League Leaders',
      'Free Agency', 'Transactions', 'Draft', 'History Hub', 'Awards & Records',
    ];
    for (const tab of loopTabs) {
      expect(getShellSectionForDashboardTab(tab)).toBe(SHELL_SECTIONS.league);
    }
  });
});

describe('HQ quick links', () => {
  it('surfaces the most likely next actions in the weekly loop', () => {
    for (const tab of ['Weekly Results', 'Schedule', 'Roster Hub', 'Standings', 'Free Agency', 'Transactions']) {
      expect(HQ_QUICK_TABS).toContain(tab);
    }
  });

  it('routes each quick link to a reachable shell section', () => {
    for (const tab of HQ_QUICK_TABS) {
      const section = getShellSectionForDashboardTab(tab);
      expect([SHELL_SECTIONS.team, SHELL_SECTIONS.league, SHELL_SECTIONS.hq]).toContain(section);
    }
  });
});
