export const DEFAULT_LEAGUE_ECONOMY = Object.freeze({
  baseSalaryCap: 301.2,
  currentSalaryCap: 301.2,
  annualCapGrowthRate: 0.035,
  annualSalaryInflationRate: 0.025,
  economyHistory: [],
});

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function normalizeLeagueEconomy(raw = {}, { year = null } = {}) {
  const base = num(raw?.baseSalaryCap, DEFAULT_LEAGUE_ECONOMY.baseSalaryCap);
  const current = num(raw?.currentSalaryCap, base);
  const annualCapGrowthRate = Math.max(0, Math.min(0.12, num(raw?.annualCapGrowthRate, DEFAULT_LEAGUE_ECONOMY.annualCapGrowthRate)));
  const annualSalaryInflationRate = Math.max(0, Math.min(0.1, num(raw?.annualSalaryInflationRate, DEFAULT_LEAGUE_ECONOMY.annualSalaryInflationRate)));
  const existingHistory = Array.isArray(raw?.economyHistory) ? raw.economyHistory : [];
  const economyHistory = existingHistory
    .map((row) => ({
      season: Number(row?.season ?? row?.year ?? 0),
      salaryCap: Math.max(50, num(row?.salaryCap, current)),
      capGrowthRate: num(row?.capGrowthRate, annualCapGrowthRate),
      inflationRate: num(row?.inflationRate, annualSalaryInflationRate),
    }))
    .filter((row) => Number.isFinite(row.season) && row.season > 0)
    .slice(-80);

  if (year != null && !economyHistory.some((row) => Number(row.season) === Number(year))) {
    economyHistory.push({
      season: Number(year),
      salaryCap: Math.max(50, current),
      capGrowthRate: annualCapGrowthRate,
      inflationRate: annualSalaryInflationRate,
    });
  }

  return {
    baseSalaryCap: Math.max(50, base),
    currentSalaryCap: Math.max(50, current),
    annualCapGrowthRate,
    annualSalaryInflationRate,
    economyHistory: economyHistory.sort((a, b) => a.season - b.season).slice(-80),
  };
}

export function projectNextSeasonEconomy(economy = {}, nextSeason) {
  const normalized = normalizeLeagueEconomy(economy);
  const nextCap = Math.round((normalized.currentSalaryCap * (1 + normalized.annualCapGrowthRate)) * 100) / 100;
  return normalizeLeagueEconomy({
    ...normalized,
    currentSalaryCap: nextCap,
    economyHistory: [
      ...normalized.economyHistory,
      {
        season: Number(nextSeason),
        salaryCap: nextCap,
        capGrowthRate: normalized.annualCapGrowthRate,
        inflationRate: normalized.annualSalaryInflationRate,
      },
    ],
  });
}

export function getSalaryInflationMultiplier(economy = {}) {
  const normalized = normalizeLeagueEconomy(economy);
  return Math.max(0.85, normalized.currentSalaryCap / Math.max(1, normalized.baseSalaryCap));
}

export function inflateContract(contract = {}, multiplier = 1) {
  const m = Math.max(0.85, Number(multiplier) || 1);
  return {
    ...contract,
    baseAnnual: Math.round((num(contract?.baseAnnual, 0) * m) * 10) / 10,
    signingBonus: Math.round((num(contract?.signingBonus, 0) * m) * 10) / 10,
  };
}
