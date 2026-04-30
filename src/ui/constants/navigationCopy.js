export const NAV_LABELS = Object.freeze({
  hq: 'HQ',
  team: 'Team',
  league: 'League',
  news: 'News',
  more: 'More',
});

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
