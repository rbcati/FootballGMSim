function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

export function computeRestructureOutcome(contract = {}, maxConvertPct = 0.5) {
  const yearsRemaining = Math.max(1, n(contract?.years ?? contract?.yearsRemaining ?? 1));
  const yearsTotal = Math.max(1, n(contract?.yearsTotal, yearsRemaining));
  const baseAnnual = n(contract?.baseAnnual, 0);
  const signingBonus = n(contract?.signingBonus, 0);
  const convertAmount = Math.round(baseAnnual * Math.max(0, Math.min(0.9, maxConvertPct)) * 100) / 100;
  const newBase = Math.round((baseAnnual - convertAmount) * 100) / 100;
  const newSigningBonus = Math.round((signingBonus + convertAmount) * 100) / 100;
  const oldCapHit = baseAnnual + (signingBonus / yearsTotal);
  const newCapHit = newBase + (newSigningBonus / yearsTotal);
  return {
    convertAmount,
    newBase,
    newSigningBonus,
    oldCapHit: Math.round(oldCapHit * 100) / 100,
    newCapHit: Math.round(newCapHit * 100) / 100,
    capSavingsThisYear: Math.round((oldCapHit - newCapHit) * 100) / 100,
    futureAnnualBonusDelta: Math.round((convertAmount / yearsRemaining) * 100) / 100,
  };
}

export function isContractRestructureEligible(player = {}, { currentSeason = null } = {}) {
  const contract = player?.contract ?? player ?? {};
  const yearsRemaining = Math.max(0, n(contract?.years ?? contract?.yearsRemaining ?? 0));
  const baseAnnual = n(contract?.baseAnnual ?? player?.baseAnnual, 0);
  const restructureCount = n(contract?.restructureCount, 0);
  const lastRestructureSeason = n(contract?.lastRestructureSeason, -1);
  const age = n(player?.age, 0);
  const accruedSeasons = n(player?.accruedSeasons ?? player?.serviceYears, 0);
  const veteranEligible = age >= 27 || accruedSeasons >= 4;
  const alreadyRestructuredThisSeason = currentSeason != null && lastRestructureSeason === Number(currentSeason);
  return yearsRemaining >= 2
    && baseAnnual > 0
    && veteranEligible
    && !alreadyRestructuredThisSeason
    && restructureCount < 2;
}

export function shouldPreserveChemistryOnReturn({ releaseRecord, signingTeamId, currentSeason }) {
  if (!releaseRecord) return false;
  if (Number(releaseRecord.teamId) !== Number(signingTeamId)) return false;
  if (Number(releaseRecord.season) !== Number(currentSeason)) return false;
  return true;
}
