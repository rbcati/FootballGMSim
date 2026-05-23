export const TEAM_STRATEGIC_POSTURE = Object.freeze({
  CONTENDER: 'CONTENDER',
  REBUILDER: 'REBUILDER',
  NEUTRAL: 'NEUTRAL',
});

export const TEAM_STRATEGY_DEFAULTS = Object.freeze({
  minGamesForClassification: 6,
  contenderWinPctMin: 0.62,
  rebuilderWinPctMax: 0.38,
  contenderAvgAgeMin: 26.8,
  rebuilderAvgAgeMax: 25.6,
  contenderSignalsRequired: 2,
  rebuilderSignalsRequired: 2,
  contenderCapRoomMin: 0,
  rebuilderCapRoomMax: -5,
  immediateStarterOvrThreshold: 82,
  youngPlayerAgeMax: 24,
  upsideDeltaMin: 4,
  agingVeteranAgeMin: 30,
  veteranSalaryBurdenMin: 12,
  farFuturePickYearsOutMin: 2,
});

const num = (v, fb = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

export function getTeamContextSnapshot(teamState = {}, leagueContext = {}, options = {}) {
  const cfg = { ...TEAM_STRATEGY_DEFAULTS, ...options };
  const wins = num(teamState?.wins ?? teamState?.record?.wins, null);
  const losses = num(teamState?.losses ?? teamState?.record?.losses, null);
  const ties = num(teamState?.ties ?? teamState?.record?.ties, 0) ?? 0;
  const gamesPlayedRaw = num(teamState?.gamesPlayed ?? teamState?.record?.gamesPlayed, null);
  const gamesPlayed = gamesPlayedRaw ?? ((wins != null && losses != null) ? (wins + losses + ties) : null);

  const roster = Array.isArray(teamState?.roster) ? teamState.roster : [];
  const rosterAges = roster.map((p) => num(p?.age, null)).filter((age) => age != null);
  const rosterAvgAge = rosterAges.length
    ? (rosterAges.reduce((sum, age) => sum + age, 0) / rosterAges.length)
    : null;

  const capRoom = num(teamState?.capRoom ?? teamState?.cap?.capRoom ?? leagueContext?.capRoom, null);
  const currentSeason = num(leagueContext?.currentSeason ?? leagueContext?.year, null);
  const winPct = (gamesPlayed != null && gamesPlayed > 0 && wins != null)
    ? (wins + (ties * 0.5)) / gamesPlayed
    : null;

  return Object.freeze({
    wins,
    losses,
    ties,
    gamesPlayed,
    winPct,
    rosterAvgAge,
    capRoom,
    currentSeason,
    isSampleReliable: gamesPlayed != null && gamesPlayed >= cfg.minGamesForClassification,
  });
}

export function classifyTeamStrategicPosture(teamState = {}, leagueContext = {}, options = {}) {
  const cfg = { ...TEAM_STRATEGY_DEFAULTS, ...options };
  const snapshot = getTeamContextSnapshot(teamState, leagueContext, cfg);
  if (!snapshot.isSampleReliable || snapshot.winPct == null) {
    return TEAM_STRATEGIC_POSTURE.NEUTRAL;
  }

  let contenderSignals = 0;
  let rebuilderSignals = 0;

  if (snapshot.winPct >= cfg.contenderWinPctMin) contenderSignals += 1;
  if (snapshot.winPct <= cfg.rebuilderWinPctMax) rebuilderSignals += 1;
  if (snapshot.rosterAvgAge != null && snapshot.rosterAvgAge >= cfg.contenderAvgAgeMin) contenderSignals += 1;
  if (snapshot.rosterAvgAge != null && snapshot.rosterAvgAge <= cfg.rebuilderAvgAgeMax) rebuilderSignals += 1;
  if (snapshot.capRoom != null && snapshot.capRoom >= cfg.contenderCapRoomMin) contenderSignals += 1;
  if (snapshot.capRoom != null && snapshot.capRoom <= cfg.rebuilderCapRoomMax) rebuilderSignals += 1;

  if (contenderSignals >= cfg.contenderSignalsRequired && contenderSignals > rebuilderSignals) {
    return TEAM_STRATEGIC_POSTURE.CONTENDER;
  }
  if (rebuilderSignals >= cfg.rebuilderSignalsRequired && rebuilderSignals > contenderSignals) {
    return TEAM_STRATEGIC_POSTURE.REBUILDER;
  }
  return TEAM_STRATEGIC_POSTURE.NEUTRAL;
}

export function applyStrategicValuationModifiers(asset = {}, baseValue = 0, teamPosture = TEAM_STRATEGIC_POSTURE.NEUTRAL, options = {}) {
  const cfg = { ...TEAM_STRATEGY_DEFAULTS, ...options };
  const base = Number(baseValue);
  if (!Number.isFinite(base) || base <= 0) return Math.max(0, base || 0);

  let multiplier = 1;
  if (teamPosture === TEAM_STRATEGIC_POSTURE.REBUILDER) {
    if (asset?.assetType === 'pick') multiplier *= 1.12;
    if (asset?.assetType === 'player') {
      const age = num(asset?.age, 27);
      const ovr = num(asset?.ovr, 70);
      const pot = num(asset?.potential ?? asset?.pot, ovr);
      const salary = num(asset?.salary ?? asset?.baseAnnual ?? asset?.contract?.baseAnnual, 0);
      if (age <= cfg.youngPlayerAgeMax && (pot - ovr) >= cfg.upsideDeltaMin) multiplier *= 1.12;
      if (age >= cfg.agingVeteranAgeMin && salary >= cfg.veteranSalaryBurdenMin) multiplier *= 0.85;
    }
  }

  if (teamPosture === TEAM_STRATEGIC_POSTURE.CONTENDER) {
    if (asset?.assetType === 'pick') {
      const currentSeason = num(options?.currentSeason, null);
      const pickSeason = num(asset?.season ?? asset?.year, null);
      const yearsOut = currentSeason != null && pickSeason != null ? (pickSeason - currentSeason) : 0;
      if (yearsOut >= cfg.farFuturePickYearsOutMin) multiplier *= 0.92;
      else multiplier *= 0.98;
    }
    if (asset?.assetType === 'player') {
      const age = num(asset?.age, 27);
      const ovr = num(asset?.ovr, 70);
      const pot = num(asset?.potential ?? asset?.pot, ovr);
      if (ovr >= cfg.immediateStarterOvrThreshold && age <= 30) multiplier *= 1.1;
      if (age <= 24 && (pot - ovr) >= cfg.upsideDeltaMin + 2 && ovr < cfg.immediateStarterOvrThreshold) multiplier *= 0.95;
    }
  }

  return Math.round(base * multiplier);
}

export function applyStrategicPackageModifiers(packageAssets = [], baseScore = 0, teamPosture = TEAM_STRATEGIC_POSTURE.NEUTRAL, options = {}) {
  if (!Array.isArray(packageAssets) || packageAssets.length === 0) return Number(baseScore) || 0;
  const adjusted = packageAssets.reduce((sum, asset) => {
    const value = Number(asset?.valueScore ?? asset?.value ?? 0);
    return sum + applyStrategicValuationModifiers(asset, value, teamPosture, options);
  }, 0);
  return Number.isFinite(adjusted) && adjusted > 0 ? adjusted : Number(baseScore) || 0;
}
