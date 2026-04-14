export interface EventEffect {
  morale?: number;
  popularity?: number;
  negotiationLeverage?: number;
}

export interface Event {
  id: string;
  type: string;
  category: string;
  headline: string;
  body: string;
  description: string;
  playerId: number | null;
  teamId: number | null;
  staffId: number | null;
  actionLabel?: string | null;
  actionTarget?: string | null;
  effects?: EventEffect | null;
  priority: 'high' | 'medium' | 'low';
  scope: 'team' | 'league';
  phase: string;
  week: number;
  year: number | null;
  timestamp: number;
  tooltip?: string;
}

export interface Award {
  key: string;
  season: number;
  playerId?: number | null;
  coachName?: string | null;
  teamId?: number | null;
  label: string;
}

export interface SocialFeedEntry extends Event {
  dateLabel: string;
  linkedEntityType?: 'player' | 'team' | 'staff' | null;
  linkedEntityId?: number | null;
}
