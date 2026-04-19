export interface PlayResult {
  quarter: number;
  clock: string;
  down: number;
  distance: number;
  fieldPosition: number;
  yards: number;
  type: 'run' | 'pass' | 'sack' | 'field_goal' | 'touchdown' | 'punt' | 'turnover' | 'play';
  text: string;
  homeScore: number;
  awayScore: number;
  momentum: number;
}

export interface GameState {
  quarter: number;
  clockSeconds: number;
  possession: 'home' | 'away';
  down: number;
  distance: number;
  fieldPosition: number;
  homeScore: number;
  awayScore: number;
  momentum: number;
  timeouts: {
    home: number;
    away: number;
  };
}
