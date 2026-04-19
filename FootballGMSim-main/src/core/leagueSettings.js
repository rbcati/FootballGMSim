export const DEFAULT_LEAGUE_SETTINGS = Object.freeze({
  leagueSize: 32,
  conferenceCount: 2,
  divisionCountPerConference: 4,
  seasonLength: 17,
  playoffTeams: 14,
  playoffSeeding: 'standard',
  overtimeFormat: 'nfl',
  salaryCap: 301.2,
  capFloor: 210,
  rookieContractYears: 4,
  freeAgencyAggressiveness: 50,
  tradeDifficulty: 50,
  injuryFrequency: 50,
  suspensionFrequency: 50,
  progressionVolatility: 50,
  regressionSeverity: 50,
  scoutingFogStrength: 55,
  ownerPatienceStrictness: 50,
  playerMoodVolatility: 50,
  draftOrderLogic: 'reverse_standings',
  leagueUniverse: 'fictional',
  scheduleBalancePreset: 'balanced',
  difficultyPreset: 'Normal',
  customDifficultyEnabled: false,
  maxContractYears: 6,
  minSalary: 0.75,
  maxSalary: 65,
  tradeDeadlineWeek: 9,
  rosterSize: 53,
  draftRounds: 7,
  prospectPoolSize: 450,
  lotteryEnabled: true,
  waiverBehavior: 'standard',
  freeAgencyNegotiationPace: 'normal',
  progressionEnvironmentStrength: 50,
  draftClassStrength: 50,
  staffImpactStrength: 50,
  useNewSimulationEngine: false,
  revenueSharing: true,
  luxuryTaxRate: 20,
  revealHiddenRatingsForCommissioner: true,
  leagueName: '',
  conferenceNames: ['AFC', 'NFC'],
  divisionNames: ['East', 'North', 'South', 'West'],
});

const CLAMP_RULES = {
  leagueSize: [4, 64],
  conferenceCount: [1, 4],
  divisionCountPerConference: [1, 8],
  seasonLength: [4, 24],
  playoffTeams: [2, 32],
  salaryCap: [50, 1000],
  capFloor: [0, 900],
  rookieContractYears: [1, 7],
  freeAgencyAggressiveness: [0, 100],
  tradeDifficulty: [0, 100],
  injuryFrequency: [0, 100],
  suspensionFrequency: [0, 100],
  progressionVolatility: [0, 100],
  regressionSeverity: [0, 100],
  scoutingFogStrength: [0, 100],
  ownerPatienceStrictness: [0, 100],
  playerMoodVolatility: [0, 100],
  maxContractYears: [1, 10],
  minSalary: [0.1, 20],
  maxSalary: [1, 100],
  tradeDeadlineWeek: [1, 24],
  rosterSize: [20, 90],
  draftRounds: [1, 12],
  prospectPoolSize: [100, 1000],
  progressionEnvironmentStrength: [0, 100],
  draftClassStrength: [0, 100],
  staffImpactStrength: [0, 100],
  luxuryTaxRate: [0, 100],
};

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function normalizeLeagueSettings(partial = {}) {
  const merged = { ...DEFAULT_LEAGUE_SETTINGS, ...(partial || {}) };
  const out = { ...merged };

  for (const [key, [min, max]] of Object.entries(CLAMP_RULES)) {
    out[key] = clampNumber(merged[key], min, max);
  }

  if (out.playoffTeams > out.leagueSize) out.playoffTeams = out.leagueSize;
  if (out.capFloor > out.salaryCap) out.capFloor = out.salaryCap;
  if (out.minSalary > out.maxSalary) out.minSalary = out.maxSalary;
  if (!['nfl', 'college'].includes(String(out.overtimeFormat))) out.overtimeFormat = 'nfl';
  if (!['reverse_standings', 'lottery', 'random'].includes(String(out.draftOrderLogic))) out.draftOrderLogic = 'reverse_standings';
  if (!['fictional', 'historical'].includes(String(out.leagueUniverse))) out.leagueUniverse = 'fictional';
  out.useNewSimulationEngine = Boolean(out.useNewSimulationEngine);

  if (!Array.isArray(out.conferenceNames) || out.conferenceNames.length === 0) {
    out.conferenceNames = [...DEFAULT_LEAGUE_SETTINGS.conferenceNames];
  }
  if (!Array.isArray(out.divisionNames) || out.divisionNames.length === 0) {
    out.divisionNames = [...DEFAULT_LEAGUE_SETTINGS.divisionNames];
  }

  return out;
}

export function getRuleEditType(key) {
  const offseasonOnly = new Set(['seasonLength', 'playoffTeams', 'playoffSeeding', 'draftRounds', 'draftOrderLogic', 'overtimeFormat']);
  const newLeagueOnly = new Set(['leagueSize', 'conferenceCount', 'divisionCountPerConference']);
  if (newLeagueOnly.has(key)) return 'new-league-only';
  if (offseasonOnly.has(key)) return 'offseason-only';
  return 'safe-live-edit';
}
