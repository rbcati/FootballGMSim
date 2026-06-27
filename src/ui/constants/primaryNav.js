import { SHELL_SECTIONS } from '../utils/shellNavigation.js';

// Primary nav sections for the desktop shell. Titles are direct labels (no vague
// "Office"/"Management" hub names); sub-tab order follows the core weekly loop so
// the most-used destinations come first. Tab ids are unchanged from the legacy
// nav — only ordering and the visible section label differ — so routing, deep
// links, and `section-tab-*` test ids stay stable.
export const NAV_GROUPS = [
  { id: SHELL_SECTIONS.hq, title: 'HQ', tabs: ['HQ'] },
  {
    id: SHELL_SECTIONS.team,
    title: 'Team',
    tabs: ['Team', 'Roster Hub', 'Depth Chart', 'Game Plan', 'Weekly Prep', 'Roster', 'Training', 'Injuries', 'Staff', 'Contract Center', 'Financials', '💰 Cap'],
  },
  {
    id: SHELL_SECTIONS.league,
    title: 'League',
    tabs: ['League', 'Weekly Results', 'Schedule', 'Standings', 'Stats', 'League Leaders', 'Free Agency', 'Transactions', 'Draft', 'History Hub', 'Awards & Records', 'Draft History', 'History', 'All-Time Records', 'Season Recap'],
  },
  { id: SHELL_SECTIONS.news, title: 'News', tabs: ['News', 'Story', 'League Pulse'] },
];

// Quick links surfaced under HQ — the destinations a GM is most likely to want
// next in the weekly loop. Each must exist in the dashboard's BASE_TABS.
export const HQ_QUICK_TABS = ['Weekly Results', 'Schedule', 'Roster Hub', 'Standings', 'Free Agency', 'Transactions'];
