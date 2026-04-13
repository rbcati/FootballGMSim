import type { AwardKey, Position, PrimaryPosition, TeamStatAttr } from './footballTypes';

export type FootballStatColumn = {
  key: string;
  label: string;
};

export const PLAYER_GAME_STATS = [
  'passComp',
  'passAtt',
  'passYd',
  'passTD',
  'interceptions',
  'rushAtt',
  'rushYd',
  'rushTD',
  'fumblesLost',
  'targets',
  'receptions',
  'recYd',
  'recTD',
  'tackles',
  'sacks',
  'passesDefended',
  'forcedFumbles',
] as const;

export const PLAYER_STATS_TABLES: Record<string, { title: string; emptyText: string; sortBy: string; columns: FootballStatColumn[] }> = {
  passing: {
    title: 'Passing leaders',
    emptyText: 'No passing stats archived for this game.',
    sortBy: 'passYd',
    columns: [
      { key: 'passComp', label: 'Comp' },
      { key: 'passAtt', label: 'Att' },
      { key: 'passYd', label: 'Yds' },
      { key: 'passTD', label: 'TD' },
      { key: 'interceptions', label: 'INT' },
    ],
  },
  rushing: {
    title: 'Rushing leaders',
    emptyText: 'No rushing stats archived for this game.',
    sortBy: 'rushYd',
    columns: [
      { key: 'rushAtt', label: 'Att' },
      { key: 'rushYd', label: 'Yds' },
      { key: 'rushTD', label: 'TD' },
      { key: 'fumblesLost', label: 'FUM' },
    ],
  },
  receiving: {
    title: 'Receiving leaders',
    emptyText: 'No receiving stats archived for this game.',
    sortBy: 'recYd',
    columns: [
      { key: 'targets', label: 'Tgt' },
      { key: 'receptions', label: 'Rec' },
      { key: 'recYd', label: 'Yds' },
      { key: 'recTD', label: 'TD' },
    ],
  },
  defense: {
    title: 'Defensive leaders',
    emptyText: 'No defensive stats archived for this game.',
    sortBy: 'impact',
    columns: [
      { key: 'tackles', label: 'Tkl' },
      { key: 'sacks', label: 'Sacks' },
      { key: 'interceptions', label: 'INT' },
      { key: 'passesDefended', label: 'PD' },
      { key: 'forcedFumbles', label: 'FF' },
    ],
  },
};

export const TEAM_STATS_TABLES: { comparison: { key: TeamStatAttr; label: string; formatter?: (value: any, side?: any) => string }[] } = {
  comparison: [
    { key: 'totalYards', label: 'Total Yards' },
    { key: 'passYards', label: 'Pass Yards' },
    { key: 'rushYards', label: 'Rush Yards' },
    { key: 'turnovers', label: 'Turnovers' },
    { key: 'sacks', label: 'Sacks' },
    {
      key: 'thirdDownAtt',
      label: '3rd Down',
      formatter: (_value, side) => (side?.thirdDownAtt != null ? `${side?.thirdDownMade ?? 0}/${side.thirdDownAtt}` : 'Unavailable'),
    },
  ],
};

export const FOOTBALL_POSITIONS: Record<Position, { label: string; primary: boolean; runtimeSupported: boolean }> = {
  QB: { label: 'Quarterback', primary: true, runtimeSupported: true },
  RB: { label: 'Running Back', primary: true, runtimeSupported: true },
  WR: { label: 'Wide Receiver', primary: true, runtimeSupported: true },
  TE: { label: 'Tight End', primary: true, runtimeSupported: true },
  OL: { label: 'Offensive Line', primary: true, runtimeSupported: true },
  DL: { label: 'Defensive Line', primary: true, runtimeSupported: true },
  LB: { label: 'Linebacker', primary: true, runtimeSupported: true },
  CB: { label: 'Cornerback', primary: true, runtimeSupported: true },
  S: { label: 'Safety', primary: true, runtimeSupported: true },
  K: { label: 'Kicker', primary: true, runtimeSupported: true },
  P: { label: 'Punter', primary: true, runtimeSupported: true },
  KR: { label: 'Kick Returner', primary: false, runtimeSupported: false },
  PR: { label: 'Punt Returner', primary: false, runtimeSupported: false },
};

export const PRIMARY_POSITIONS = Object.keys(FOOTBALL_POSITIONS).filter((pos) => FOOTBALL_POSITIONS[pos as Position].primary) as PrimaryPosition[];

export const AWARD_DISPLAY_NAMES: Record<AwardKey, string> = {
  mvp: 'Most Valuable Player',
  opoy: 'Offensive Player of the Year',
  dpoy: 'Defensive Player of the Year',
  oroy: 'Offensive Rookie of the Year',
  droy: 'Defensive Rookie of the Year',
  roty: 'Rookie of the Year',
  sbMvp: 'Finals MVP',
  allLeague: 'All-League',
  allRookie: 'All-Rookie',
};

export const AWARDS_HISTORY_ORDER: AwardKey[] = ['mvp', 'opoy', 'dpoy', 'roty', 'sbMvp'];

export function buildTeamComparisonRows(teamTotals: { away: Record<string, any>; home: Record<string, any> }) {
  return TEAM_STATS_TABLES.comparison.map((row) => ({
    label: row.label,
    awayValue: row.formatter ? row.formatter(teamTotals.away?.[row.key], teamTotals.away) : (teamTotals.away?.[row.key] ?? 'Unavailable'),
    homeValue: row.formatter ? row.formatter(teamTotals.home?.[row.key], teamTotals.home) : (teamTotals.home?.[row.key] ?? 'Unavailable'),
  }));
}

export const FUTURE_COMPOSITE_WEIGHTS = {
  // Metadata-only placeholder for future scouting/summary UI. Not wired into sim logic.
  qbPocketPassing: { tha: 0.45, thp: 0.25, awr: 0.2, pbk: 0.1 },
  edgePressure: { prs: 0.4, prp: 0.35, awr: 0.15, spd: 0.1 },
};
