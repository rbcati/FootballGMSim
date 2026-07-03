// statsSchema.js — canonical zeroed stat schemas.
//
// Extracted from src/core/state.js so runtime code (worker, sim, tests) can
// import the stat schema without pulling in the legacy state/persistence
// module. Pure data — this module must stay free of imports and side effects.

// Single source of truth for the full per-season stat schema.
// Season archival (worker.archiveSeason) reads these keys so no tracked field
// is silently dropped from career history. Do not prune fields here.
export function getZeroStats() {
  return {
    // General
    gamesPlayed: 0,

    // Passing
    passYd: 0, passTD: 0, interceptions: 0, passAtt: 0, passComp: 0, sacks: 0,
    dropbacks: 0, longestPass: 0, completionPct: 0, passerRating: 0, sackPct: 0,

    // Rushing
    rushYd: 0, rushTD: 0, rushAtt: 0, fumbles: 0,
    longestRun: 0, yardsPerCarry: 0,

    // Receiving
    recYd: 0, recTD: 0, receptions: 0, targets: 0, drops: 0,
    yardsAfterCatch: 0, longestCatch: 0, routesRun: 0, targetsWithSeparation: 0,
    dropRate: 0, separationRate: 0,

    // Defense
    tackles: 0, forcedFumbles: 0, passesDefended: 0, tacklesForLoss: 0,
    coverageRating: 0, targetsAllowed: 0, completionsAllowed: 0, yardsAllowed: 0, tdsAllowed: 0,
    pressureRating: 0, passRushSnaps: 0, pressures: 0, pressureRate: 0,

    // Offensive Line
    sacksAllowed: 0, tacklesForLossAllowed: 0, protectionGrade: 0,

    // Kicking/Punting
    fgMade: 0, fgAttempts: 0, xpMade: 0, xpAttempts: 0, punts: 0, puntYards: 0,
    fgMissed: 0, longestFG: 0, xpMissed: 0, successPct: 0, avgKickYards: 0,
    avgPuntYards: 0, longestPunt: 0
  };
}

// Zeroed team stat schema used when migrating saves that predate team stats.
export function getZeroTeamStats() {
  return {
    wins: 0, losses: 0, ties: 0,
    ptsFor: 0, ptsAgainst: 0,
    passYds: 0, rushYds: 0,
    passTD: 0, rushTD: 0,
    turnovers: 0,
    sacks: 0,
    // Game specific
    thirdDownAttempts: 0, thirdDownConversions: 0,
    redZoneTrips: 0, redZoneTDs: 0
  };
}
