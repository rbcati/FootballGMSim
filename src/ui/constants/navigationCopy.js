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
  'Hall of Fame': { title: 'Hall of Fame', subtitle: 'The all-time greats enshrined across league history.' },
  'Award Races': { title: 'Award Races', subtitle: 'Who is leading the MVP and other award races right now.' },
  'Team History': { title: 'Team History', subtitle: 'Season-by-season results and franchise records.' },
  Almanac: { title: 'League Almanac', subtitle: 'Champions, leaders, and milestones, year by year.' },
  Postseason: { title: 'Postseason', subtitle: 'Playoff bracket, seeding, and results.' },
  'Mock Draft': { title: 'Mock Draft', subtitle: 'Simulate how the draft board could fall.' },
  Offseason: { title: 'Offseason', subtitle: 'Work through the offseason checklist toward the new season.' },
  Analytics: { title: 'Analytics', subtitle: 'Advanced team and player performance metrics.' },

  News: { title: 'News', subtitle: 'League headlines, storylines, and your franchise pulse.' },
  Story: { title: 'Franchise Story', subtitle: 'Your franchise narrative and major storylines.' },
  'League Pulse': { title: 'League Pulse', subtitle: 'The mood and momentum shifts across the league.' },
  '🤖 GM Advisor': { title: 'GM Advisor', subtitle: 'Suggested next moves for your franchise.' },
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

// Action-phrased labels for the HQ next-action quick links. The underlying tab id
// (used for routing and `section-tab-*` test ids) is unchanged — only the visible
// chip text becomes a verb-first cue ("Check Roster" vs. a bare "Roster Hub") so a
// new GM reads HQ as a weekly to-do list. Keyed by canonical tab id. Display only.
export const HQ_NEXT_ACTIONS = Object.freeze({
  'Weekly Results': 'Review Results',
  Schedule: 'View Schedule',
  'Roster Hub': 'Check Roster',
  'Depth Chart': 'Set Depth Chart',
  Standings: 'View Standings',
  Stats: 'View Stats',
  'Free Agency': 'Check Free Agents',
  Transactions: 'Review Trade Market',
});

export function getNextActionLabel(tab) {
  return HQ_NEXT_ACTIONS[tab] ?? getTabDisplayLabel(tab);
}

// Single source of truth for the visible label of a quick/sub-nav tab button.
// `context` selects the framing without callers branching on it themselves:
//   - in the HQ section, tabs read as verb-first next actions ("Check Roster")
//   - everywhere else they use the standard display label ("Trade", "Finances")
// `context` may be the section id string ('hq') or an object ({ section } /
// { isHQ }). The underlying tab id (routing + `section-tab-*` test ids) is
// unchanged — this only resolves display text.
export function getTabLabel(tab, context = {}) {
  const ctx = typeof context === 'string' ? { section: context } : (context ?? {});
  const isHQ = ctx.isHQ === true || ctx.section === 'hq' || ctx.section === 'HQ';
  return isHQ ? getNextActionLabel(tab) : getTabDisplayLabel(tab);
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
