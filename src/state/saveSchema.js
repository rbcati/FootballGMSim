export const CURRENT_SAVE_SCHEMA_VERSION = 5.2;

function migratePreVersioned(meta = {}) {
  return {
    ...meta,
    saveVersion: 1,
  };
}

function migrateV1ToV2(meta = {}) {
  return {
    ...meta,
    settings: meta?.settings ?? {},
    saveVersion: 2,
  };
}

function migrateV2ToV3(meta = {}) {
  return {
    ...meta,
    incomingTradeOffers: Array.isArray(meta?.incomingTradeOffers) ? meta.incomingTradeOffers : [],
    commissionerLog: Array.isArray(meta?.commissionerLog) ? meta.commissionerLog : [],
    saveVersion: 3,
  };
}

function migrateV3ToV4(meta = {}) {
  return {
    ...meta,
    schedule: meta?.schedule && Array.isArray(meta?.schedule?.weeks)
      ? meta.schedule
      : { weeks: [] },
    saveVersion: 4,
  };
}

const MIGRATIONS = {
  0: migratePreVersioned,
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
  4: migrateV4ToV5,
  5: migrateV5ToV51,
  5.1: migrateV51ToV52,
};

function migrateV4ToV5(meta = {}) {
  const normalizeResult = (result) => ({
    ...result,
    recapText: result?.recapText ?? null,
    teamDriveStats: result?.teamDriveStats ?? null,
    simSeed: result?.simSeed ?? null,
  });
  const normalizeWeekResults = (weekResults) => (
    Array.isArray(weekResults) ? weekResults.map(normalizeResult) : weekResults
  );
  const normalizedResultsByWeek = Array.isArray(meta?.resultsByWeek)
    ? meta.resultsByWeek.map(normalizeWeekResults)
    : Object.fromEntries(
      Object.entries(meta?.resultsByWeek ?? {}).map(([week, results]) => [week, normalizeWeekResults(results)])
    );
  return {
    ...meta,
    resultsByWeek: normalizedResultsByWeek,
    saveVersion: 5,
  };
}

function migrateV5ToV51(meta = {}) {
  return {
    ...meta,
    // v5.1 is a non-destructive repair marker. Actual repair work (roster/cap
    // hydration) runs in the worker at load-time so no user data is wiped.
    saveVersion: 5.1,
  };
}

function migrateV51ToV52(meta = {}) {
  const salaryCap = Number(meta?.settings?.salaryCap ?? 301.2);
  const economy = {
    baseSalaryCap: salaryCap,
    currentSalaryCap: salaryCap,
    annualCapGrowthRate: 0.035,
    annualSalaryInflationRate: 0.025,
    economyHistory: Array.isArray(meta?.economy?.economyHistory) ? meta.economy.economyHistory : [],
    ...(meta?.economy ?? {}),
  };
  return {
    ...meta,
    economy,
    saveVersion: 5.2,
  };
}

export function migrateSaveMetaToCurrent(meta = {}) {
  const startVersion = Number(meta?.saveVersion ?? 0);
  if (!Number.isFinite(startVersion) || startVersion < 0) {
    throw new Error('Invalid save schema version.');
  }

  let migrated = { ...(meta ?? {}) };
  let version = startVersion;
  while (version < CURRENT_SAVE_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (typeof migrate !== 'function') {
      throw new Error(`No migration available from save schema v${version}.`);
    }
    migrated = migrate(migrated);
    version = Number(migrated?.saveVersion ?? version + 1);
  }

  return { migrated, migratedFrom: startVersion, migratedTo: version };
}
