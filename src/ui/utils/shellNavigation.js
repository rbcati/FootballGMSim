export const SHELL_SECTIONS = Object.freeze({
  hq: 'hq',
  team: 'team',
  league: 'league',
  news: 'news',
});

export const SECTION_DEFAULT_TAB = Object.freeze({
  [SHELL_SECTIONS.hq]: 'HQ',
  [SHELL_SECTIONS.team]: 'Team',
  [SHELL_SECTIONS.league]: 'League',
  [SHELL_SECTIONS.news]: 'News',
});

const DASHBOARD_TAB_ALIASES = Object.freeze({
  'Weekly Hub': 'HQ',
  Home: 'HQ',
  'Trade Center': 'Transactions',
  'Trade Finder': 'Transactions',
  Trades: 'Transactions',
  'FA Hub': 'Free Agency',
  '📰 News': 'News',
  History: 'History Hub',
});

const TAB_TO_SECTION = Object.freeze({
  HQ: SHELL_SECTIONS.hq,
  Team: SHELL_SECTIONS.team,
  Roster: SHELL_SECTIONS.team,
  'Depth Chart': SHELL_SECTIONS.team,
  'Roster Hub': SHELL_SECTIONS.team,
  'Weekly Prep': SHELL_SECTIONS.team,
  'Game Plan': SHELL_SECTIONS.team,
  Training: SHELL_SECTIONS.team,
  Injuries: SHELL_SECTIONS.team,
  Staff: SHELL_SECTIONS.team,
  Financials: SHELL_SECTIONS.team,
  'Contract Center': SHELL_SECTIONS.team,
  '💰 Cap': SHELL_SECTIONS.team,

  League: SHELL_SECTIONS.league,
  Standings: SHELL_SECTIONS.league,
  Schedule: SHELL_SECTIONS.league,
  Stats: SHELL_SECTIONS.league,
  Leaders: SHELL_SECTIONS.league,
  Analytics: SHELL_SECTIONS.league,
  'Award Races': SHELL_SECTIONS.league,
  'League Leaders': SHELL_SECTIONS.league,
  Postseason: SHELL_SECTIONS.league,
  News: SHELL_SECTIONS.news,

  Transactions: SHELL_SECTIONS.league,
  Trades: SHELL_SECTIONS.league,
  'Free Agency': SHELL_SECTIONS.league,
  Draft: SHELL_SECTIONS.league,
  'Draft Room': SHELL_SECTIONS.league,
  'Mock Draft': SHELL_SECTIONS.league,

  'History Hub': SHELL_SECTIONS.league,
  History: SHELL_SECTIONS.league,
  'Team History': SHELL_SECTIONS.league,
  'Hall of Fame': SHELL_SECTIONS.league,
  'Awards & Records': SHELL_SECTIONS.league,
  'Season Recap': SHELL_SECTIONS.league,
  Saves: SHELL_SECTIONS.league,
  'God Mode': SHELL_SECTIONS.league,
  '🤖 GM Advisor': SHELL_SECTIONS.league,
});

const LEGACY_MOBILE_ID_TO_SECTION = Object.freeze({
  weekly: SHELL_SECTIONS.hq,
  home: SHELL_SECTIONS.hq,
  roster: SHELL_SECTIONS.team,
  standings: SHELL_SECTIONS.league,
  schedule: SHELL_SECTIONS.league,
  leaders: SHELL_SECTIONS.league,
  trade: SHELL_SECTIONS.league,
  freeagency: SHELL_SECTIONS.league,
  history: SHELL_SECTIONS.league,
  news: SHELL_SECTIONS.news,
});

export function normalizeDashboardTab(tab) {
  return DASHBOARD_TAB_ALIASES[tab] ?? tab;
}

export function getShellSectionForDashboardTab(tab) {
  const normalized = normalizeDashboardTab(tab);
  return TAB_TO_SECTION[normalized] ?? SHELL_SECTIONS.hq;
}

export function normalizeShellSectionId(input) {
  if (!input) return SHELL_SECTIONS.hq;
  if (Object.values(SHELL_SECTIONS).includes(input)) return input;
  return LEGACY_MOBILE_ID_TO_SECTION[input] ?? SHELL_SECTIONS.hq;
}
