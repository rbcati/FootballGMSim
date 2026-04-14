export interface CombineResults {
  fortyTime: number;
  benchPress: number;
  verticalLeap: number;
  agility: number;
  broadJump: number;
  pos?: string;
}

export interface ScoutingReport {
  confidence: number;
  low: number;
  high: number;
  estimated: number;
  spread: number;
}

export interface DraftBoardEntry {
  playerId: number | string;
  teamId: number;
  score: number;
  reason: string;
  rank?: number;
}
