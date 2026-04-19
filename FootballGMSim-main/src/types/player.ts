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
