export interface PersonalityTraits {
  workEthic: number;
  leadership: number;
  diva: number;
  riskTaker: number;
  discipline: number;
  coachability: number;
  holdoutRisk: number;
  consistency: number;
  offFieldRisk: number;
}

export interface DevelopmentHistory {
  season: number | null;
  age: number;
  ovrBefore: number;
  ovrAfter: number;
  delta: number;
  physical: number;
  passing: number;
  rushingReceiving: number;
  blocking: number;
  defense: number;
  kicking: number;
}
