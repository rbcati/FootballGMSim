export interface ModPlayer {
  id?: number | string;
  name: string;
  age: number;
  pos: string;
  ovr: number;
  potential?: number;
  teamId?: number | null;
}

export interface CustomRosterFile {
  players: ModPlayer[];
  teams?: Array<{ id: number; name?: string; abbr?: string }>;
}

export interface DraftClassFile {
  prospects: ModPlayer[];
}

export interface LeagueModSettings {
  overtimeFormat?: 'nfl' | 'college';
  playoffTeams?: number;
  draftOrderLogic?: 'reverse_standings' | 'lottery' | 'random';
  injuryFrequency?: number;
  suspensionFrequency?: number;
  leagueUniverse?: 'fictional' | 'historical';
}

export interface LeagueFileExport {
  version: number;
  kind: 'league_file';
  exportedAt: string;
  leagueId: string;
  meta: { name?: string; year?: number; phase?: string; currentWeek?: number };
  settings: LeagueModSettings;
  snapshot: Record<string, unknown>;
  modData?: {
    roster?: CustomRosterFile;
    draftClass?: DraftClassFile;
  };
}
