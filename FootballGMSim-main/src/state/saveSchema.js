export const CURRENT_SAVE_SCHEMA_VERSION = 5.7;

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
  5.2: migrateV52ToV53,
  5.3: migrateV53ToV54,
  5.4: migrateV54ToV55,
  5.5: migrateV55ToV56,
  5.6: migrateV56ToV57,
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

function migrateV52ToV53(meta = {}) {
  return {
    ...meta,
    archiveMigration: {
      ...(meta?.archiveMigration ?? {}),
      v53: true,
      upgradedAt: Date.now(),
    },
    saveVersion: 5.3,
  };
}


function migrateV53ToV54(meta = {}) {
  return {
    ...meta,
    developmentSystem: {
      ...(meta?.developmentSystem ?? {}),
      personalityMentorshipV1: true,
      upgradedAt: Date.now(),
    },
    saveVersion: 5.4,
  };
}


function migrateV54ToV55(meta = {}) {
  const financialSystem = {
    salaryCapModel: 'hard_cap',
    capFloorEnforced: true,
    rookieWageScaleEnabled: true,
    fifthYearOptionEnabled: true,
    restrictedFreeAgencyEnabled: true,
    ownerGoalStyle: meta?.financialSystem?.ownerGoalStyle ?? 'balanced',
    upgradedAt: Date.now(),
    ...(meta?.financialSystem ?? {}),
  };

  const baselineRevenue = {
    ticketSales: 86,
    merchandise: 34,
    broadcasting: 120,
    sponsorships: 39,
    facilityCost: 12,
    ...(meta?.baselineRevenue ?? {}),
  };

  return {
    ...meta,
    financialSystem,
    baselineRevenue,
    saveVersion: 5.5,
  };
}

function migrateV55ToV56(meta = {}) {
  const developmentModel = {
    version: 1,
    lastEvolutionStamp: null,
    ...(meta?.developmentModel ?? {}),
  };
  const weeklyDevelopmentLog = Array.isArray(meta?.weeklyDevelopmentLog) ? meta.weeklyDevelopmentLog : [];
  return {
    ...meta,
    developmentModel,
    weeklyDevelopmentLog,
    saveVersion: 5.6,
  };
}

function migrateV56ToV57(meta = {}) {
  const developmentModel = {
    version: 1,
    lastEvolutionStamp: null,
    lastOffseasonEvolutionKey: null,
    ...(meta?.developmentModel ?? {}),
  };
  return {
    ...meta,
    developmentModel,
    saveVersion: 5.7,
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
