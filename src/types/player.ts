export interface AttributesV2 {
  release: number;
  routeRunning: number;
  separation: number;
  catchInTraffic: number;
  ballTracking: number;
  throwAccuracyShort: number;
  throwAccuracyDeep: number;
  throwPower: number;
  decisionMaking: number;
  pocketPresence: number;
  passBlockFootwork: number;
  passBlockStrength: number;
  passRush: number;
  pressCoverage: number;
  zoneCoverage: number;
}

export interface Player {
  id: number;
  name: string;
  pos: string;
  teamId?: number | null;
  age?: number;
  ovr?: number;
  ratings?: Record<string, number>;
  attributesV2?: AttributesV2;
}

/**
 * Advanced per-play attribution counters for a single season.
 * Mirrors AdvancedGameStats from richGameSimulator — kept in sync manually.
 */
export interface AdvancedSeasonStats {
  targets: number;
  receptionsAllowed: number;
  coverageTargets: number;
  coverageCompletionsAllowed: number;
  drops: number;
  battedPasses: number;
  sacksAllowed: number;
  sacksMade: number;
}

/**
 * Sparse persistent store for advanced game-attribution counters.
 * Layout: archive[playerId][year] = AdvancedSeasonStats
 * Only years in which a player appeared will have an entry.
 */
export type PlayerAdvancedStatsStore = Record<string, Record<string, AdvancedSeasonStats>>;
