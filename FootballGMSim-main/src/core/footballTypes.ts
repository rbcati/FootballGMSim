export type TeamStatAttr =
  | 'totalYards'
  | 'passYards'
  | 'rushYards'
  | 'turnovers'
  | 'sacks'
  | 'firstDowns'
  | 'thirdDownMade'
  | 'thirdDownAtt'
  | 'redZoneMade'
  | 'redZoneAtt'
  | 'penalties' | 'successRate' | 'explosivePlays';

export type PrimaryPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';

export type Position = PrimaryPosition | 'KR' | 'PR';

export type AwardKey = 'mvp' | 'opoy' | 'dpoy' | 'oroy' | 'droy' | 'roty' | 'sbMvp' | 'allLeague' | 'allRookie';

export interface AwardPlayer {
  playerId: number | null;
  name: string;
  teamId?: number | null;
  pos?: string;
  value?: number;
}

export interface AwardTeam {
  teamId: number | null;
  name: string;
  abbr?: string;
}

export type Awards = Partial<Record<AwardKey, AwardPlayer | AwardPlayer[] | null>>;

export type RatingKey =
  | 'tha'
  | 'thp'
  | 'spd'
  | 'acc'
  | 'awr'
  | 'cth'
  | 'cit'
  | 'rbk'
  | 'pbk'
  | 'prs'
  | 'prp'
  | 'rns'
  | 'cov'
  | 'kpw'
  | 'kac'
  | 'trk'
  | 'jkm';

export type LegacyRatingKey =
  | 'throwAccuracy'
  | 'throwPower'
  | 'speed'
  | 'acceleration'
  | 'awareness'
  | 'catching'
  | 'catchInTraffic'
  | 'runBlock'
  | 'passBlock'
  | 'passRushSpeed'
  | 'passRushPower'
  | 'runStop'
  | 'coverage'
  | 'kickPower'
  | 'kickAccuracy'
  | 'trucking'
  | 'juking';

export type PlayerRatings = Partial<Record<RatingKey, number>>;
export type LegacyPlayerRatings = Partial<Record<LegacyRatingKey, number>>;
