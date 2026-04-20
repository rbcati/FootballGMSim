import { DEFAULT_LEAGUE_SETTINGS, normalizeLeagueSettings } from './leagueSettings.js';

export function getTradeWindowSnapshot(league = {}) {
  const settings = normalizeLeagueSettings(league?.settings ?? {});
  const deadlineWeek = Number(settings?.tradeDeadlineWeek ?? DEFAULT_LEAGUE_SETTINGS.tradeDeadlineWeek ?? 9);
  const currentWeek = Number(league?.week ?? league?.currentWeek ?? 1);
  const phase = String(league?.phase ?? 'regular');
  const isInSeason = ['preseason', 'regular', 'playoffs'].includes(phase);
  const weeksRemaining = deadlineWeek - currentWeek;
  const commissionerMode = !!league?.commissionerMode;

  return {
    deadlineWeek,
    currentWeek,
    weeksRemaining,
    phase,
    canOverride: commissionerMode,
    isLocked: isInSeason && currentWeek > deadlineWeek,
    isWarningWindow: isInSeason && weeksRemaining >= 0 && weeksRemaining <= 2,
  };
}

export function isTradeWindowOpen(league = {}) {
  const snapshot = getTradeWindowSnapshot(league);
  return !snapshot.isLocked || snapshot.canOverride;
}
