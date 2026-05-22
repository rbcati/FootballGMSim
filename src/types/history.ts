export interface ChampionRecord {
  year: number;
  teamId: string;
  teamName: string;
  cityName: string;
  record: string;
  runnerUpId: string;
  runnerUpName: string;
  score: string;
  mvpName: string;
}

export interface SeasonAwardWinner {
  year: number;
  mvpId: string;
  mvpName: string;
  mvpStats: string;
  opoyName: string;
  dpoyName: string;
  oroyName: string;
  droyName: string;
}

export interface HallOfFameMember {
  id: string;
  name: string;
  position: string;
  draftYear: number;
  retirementYear: number;
  indictionYear: number;
  originalTeamId: string;
  careerStats: {
    gamesPlayed: number;
    passingYards?: number;
    passingTds?: number;
    rushingYards?: number;
    rushingTds?: number;
    receptions?: number;
    receivingYards?: number;
    receivingTds?: number;
    tackles?: number;
    sacks?: number;
    interceptions?: number;
  };
  accolades: string[];
}

export interface WeeklyHeadline {
  id: string;
  week: number;
  year: number;
  type: 'INJURY' | 'MILESTONE' | 'UPSET' | 'BLOWOUT' | 'COMEBACK' | 'OVERTIME' | 'STREAK' | 'PERFORMANCE' | 'DEFENSIVE';
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  headlineText: string;
  detailText: string;
  associatedPlayerId?: string;
  associatedTeamId?: string;
}
