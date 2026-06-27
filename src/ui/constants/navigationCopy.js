export const NAV_LABELS = Object.freeze({
  hq: 'HQ',
  team: 'Team',
  league: 'League',
  news: 'News',
  more: 'More',
});

// Short helper text shown under each primary nav section so a new GM can tell
// what lives where without clicking through. Keyed by shell section id.
export const SECTION_SUBTITLES = Object.freeze({
  hq: 'Your weekly command center',
  team: 'Roster, depth chart, staff & finances',
  league: 'Standings, stats, trades, draft & history',
  news: 'Headlines & franchise storylines',
});

// Single source of truth for per-page orientation copy: a clear title and a one
// line "what is this page for" subtitle. Keyed by the canonical dashboard tab
// id (the same string stored in activeTab / listed in NAV_GROUPS). Display only.
export const PAGE_ORIENTATION = Object.freeze({
  HQ: { title: 'Franchise HQ', subtitle: 'Review results, set your plan, then advance the week.' },

  Team: { title: 'Team', subtitle: 'Manage your roster, depth chart, staff, and finances.' },
  'Roster Hub': { title: 'Roster Hub', subtitle: 'Review your players, ratings, and roster needs.' },
  Roster: { title: 'Roster', subtitle: 'Your full player roster.' },
  'Depth Chart': { title: 'Depth Chart', subtitle: 'Set starters and depth before the next game.' },
  'Game Plan': { title: 'Game Plan', subtitle: 'Tune your offensive and defensive schemes for this week.' },
  'Weekly Prep': { title: 'Weekly Prep', subtitle: 'Final checklist before you advance the week.' },
  Training: { title: 'Training', subtitle: 'Set weekly player development focus.' },
  Injuries: { title: 'Injury Report', subtitle: 'Track injured players and recovery timelines.' },
  Staff: { title: 'Coaching Staff', subtitle: 'Manage coaches and their philosophies.' },
  Financials: { title: 'Finances', subtitle: 'Review franchise revenue, expenses, and budget.' },
  'Contract Center': { title: 'Contracts', subtitle: 'Negotiate extensions and manage player deals.' },
  '💰 Cap': { title: 'Salary Cap', subtitle: 'Track cap space, commitments, and dead money.' },

  League: { title: 'League', subtitle: 'Standings, stats, transactions, draft, and history across the league.' },
  Standings: { title: 'Standings', subtitle: 'Division and conference standings and playoff seeding.' },
  Schedule: { title: 'Schedule', subtitle: 'Your full season schedule and upcoming games.' },
  'Weekly Results': { title: 'Weekly Results', subtitle: 'Scores and box scores from the latest week.' },
  Stats: { title: 'League Stats', subtitle: 'Team and player statistical leaders.' },
  Leaders: { title: 'League Leaders', subtitle: 'Statistical leaders by category.' },
  'League Leaders': { title: 'League Leaders', subtitle: 'Statistical leaders by category.' },
  Transactions: { title: 'Trade Center', subtitle: 'Build, evaluate, and propose trades.' },
  'Free Agency': { title: 'Free Agency', subtitle: 'Browse and sign available free agents.' },
  Draft: { title: 'Draft', subtitle: 'Scout prospects and make your picks.' },
  'History Hub': { title: 'History', subtitle: 'Champions, records, awards, and franchise history.' },
  'Draft History': { title: 'Draft History', subtitle: 'Past draft classes and pick outcomes.' },
  History: { title: 'History', subtitle: 'Champions, records, awards, and franchise history.' },
  'Awards & Records': { title: 'Awards & Records', subtitle: 'Season awards and all-time records.' },
  'All-Time Records': { title: 'All-Time Records', subtitle: 'The league record book.' },
  'Season Recap': { title: 'Season Recap', subtitle: 'A look back at the season that was.' },

  News: { title: 'News', subtitle: 'League headlines, storylines, and your franchise pulse.' },
});

// Display-label overrides for sub-nav buttons. The underlying tab id (used for
// routing and test ids) is unchanged — only the visible button text is clarified
// so the label matches its destination. Keyed by canonical tab id.
export const TAB_DISPLAY_LABELS = Object.freeze({
  Transactions: 'Trade',
  'History Hub': 'History',
  '💰 Cap': 'Salary Cap',
  Financials: 'Finances',
  'League Leaders': 'Leaders',
});

export function getPageOrientation(tab) {
  return PAGE_ORIENTATION[tab] ?? null;
}

export function getSectionSubtitle(sectionId) {
  return SECTION_SUBTITLES[sectionId] ?? '';
}

export function getTabDisplayLabel(tab) {
  return TAB_DISPLAY_LABELS[tab] ?? tab;
}

export const ACTION_LABELS = Object.freeze({
  advanceWeek: 'Advance Week',
  advanceFranchise: 'Advance Franchise',
  readyToAdvance: 'Ready to Advance',
  simulating: 'Simulating...',
  working: 'Working...',
  more: 'More',
});

export const SPORT_TIME_COPY = Object.freeze({
  regularUnitLabel: 'Week',
  shorthandUnitLabel: 'Wk',
});

export function formatRegularUnitLabel(value, { short = false } = {}) {
  const prefix = short ? SPORT_TIME_COPY.shorthandUnitLabel : SPORT_TIME_COPY.regularUnitLabel;
  return `${prefix} ${value}`;
}
