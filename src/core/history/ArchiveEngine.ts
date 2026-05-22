/**
 * ArchiveEngine — seasonal purge and Hall of Fame compression routine.
 *
 * Pure module with no side effects. Call during the season transition
 * (offseason_resign phase) to:
 *  1. Evaluate retired players for HOF qualification.
 *  2. Return a compressed HallOfFameMember payload ready to merge into
 *     the existing hallOfFame.classes / hallOfFame.index structures.
 *  3. Signal which retired players can have their detailed game logs stripped.
 */

import type { HallOfFameMember } from '../../types/history.js';

interface CareerStatsSource {
  gamesPlayed?: number;
  passYds?: number;
  passTDs?: number;
  rushYds?: number;
  rushTDs?: number;
  receptions?: number;
  recYds?: number;
  recTDs?: number;
  tackles?: number;
  sacks?: number;
  interceptions?: number;
  // alternate key shapes tolerated
  passYd?: number;
  passTD?: number;
  rushYd?: number;
  rushTD?: number;
  recYd?: number;
  recTD?: number;
}

interface PlayerAward {
  key?: string;
  label?: string;
  season?: number | string;
}

export interface RetiredPlayerInput {
  id?: string | number;
  name?: string;
  pos?: string;
  position?: string;
  age?: number;
  ovr?: number;
  peakOvr?: number;
  draftYear?: number;
  retirementYear?: number;
  originalTeamId?: string | number;
  teamId?: string | number;
  awards?: PlayerAward[];
  stats?: {
    career?: CareerStatsSource;
  };
  history?: Array<{ ovr?: number; season?: number }>;
}

export interface HOFAppraisalResult {
  qualifies: boolean;
  member: HallOfFameMember | null;
  reason: string;
  stripGameLogs: boolean;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function countAward(awards: PlayerAward[], keys: string[]): number {
  if (!Array.isArray(awards)) return 0;
  return awards.filter((a) => keys.some((k) => String(a?.key ?? a?.label ?? '').toLowerCase().includes(k))).length;
}

function buildAccolades(player: RetiredPlayerInput, inductionYear: number): string[] {
  const awards = player.awards ?? [];
  const accolades: string[] = [];

  const mvpCount = countAward(awards, ['mvp']);
  if (mvpCount > 0) accolades.push(`${mvpCount}x MVP`);

  const ringCount = countAward(awards, ['champion', 'superbowl', 'super_bowl', 'sbmvp', 'sb_mvp']);
  if (ringCount > 0) accolades.push(`${ringCount}x Champion`);

  const allProCount = countAward(awards, ['allpro', 'all_pro', 'all-pro', 'allleague', 'all_league']);
  if (allProCount > 0) accolades.push(`${allProCount}x All-Pro`);

  const opoyCount = countAward(awards, ['opoy', 'offensive_player']);
  if (opoyCount > 0) accolades.push(`${opoyCount}x OPOY`);

  const dpoyCount = countAward(awards, ['dpoy', 'defensive_player']);
  if (dpoyCount > 0) accolades.push(`${dpoyCount}x DPOY`);

  if (accolades.length === 0 && num(player.peakOvr ?? player.ovr, 0) >= 90) {
    accolades.push(`All-Pro ${inductionYear - 1}`);
  }

  return accolades;
}

function seasonsAboveThreshold(player: RetiredPlayerInput, threshold: number): number {
  if (!Array.isArray(player.history)) return 0;
  return player.history.filter((h) => num(h?.ovr, 0) >= threshold).length;
}

function normalizeCareerStats(raw?: CareerStatsSource): HallOfFameMember['careerStats'] {
  if (!raw) return { gamesPlayed: 0 };
  return {
    gamesPlayed: num(raw.gamesPlayed, 0),
    passingYards: num(raw.passYds ?? raw.passYd, 0) || undefined,
    passingTds: num(raw.passTDs ?? raw.passTD, 0) || undefined,
    rushingYards: num(raw.rushYds ?? raw.rushYd, 0) || undefined,
    rushingTds: num(raw.rushTDs ?? raw.rushTD, 0) || undefined,
    receptions: num(raw.receptions, 0) || undefined,
    receivingYards: num(raw.recYds ?? raw.recYd, 0) || undefined,
    receivingTds: num(raw.recTDs ?? raw.recTD, 0) || undefined,
    tackles: num(raw.tackles, 0) || undefined,
    sacks: num(raw.sacks, 0) || undefined,
    interceptions: num(raw.interceptions, 0) || undefined,
  };
}

/**
 * Evaluate a single retired player for HOF qualification.
 *
 * Criteria (any one qualifies):
 *  - Won at least one MVP award
 *  - Won at least one Championship ring
 *  - Maintained OVR >= 85 for 5+ seasons
 */
export function appraiseRetiredPlayer(
  player: RetiredPlayerInput,
  inductionYear: number,
): HOFAppraisalResult {
  const awards = player.awards ?? [];
  const hasMvp = countAward(awards, ['mvp']) >= 1;
  const hasRing = countAward(awards, ['champion', 'superbowl', 'super_bowl', 'sbmvp']) >= 1;
  const eliteSeasons = seasonsAboveThreshold(player, 85);
  const qualifies = hasMvp || hasRing || eliteSeasons >= 5;

  if (!qualifies) {
    return {
      qualifies: false,
      member: null,
      reason: 'Did not meet HOF threshold (no MVP, no ring, < 5 elite seasons)',
      stripGameLogs: true,
    };
  }

  const reasons: string[] = [];
  if (hasMvp) reasons.push('MVP winner');
  if (hasRing) reasons.push('Championship winner');
  if (eliteSeasons >= 5) reasons.push(`${eliteSeasons} elite seasons (OVR 85+)`);

  const member: HallOfFameMember = {
    id: String(player.id ?? ''),
    name: player.name ?? 'Unknown',
    position: player.pos ?? player.position ?? '??',
    draftYear: num(player.draftYear, inductionYear - 10),
    retirementYear: num(player.retirementYear, inductionYear - 1),
    indictionYear: inductionYear,
    originalTeamId: String(player.originalTeamId ?? player.teamId ?? ''),
    careerStats: normalizeCareerStats(player.stats?.career),
    accolades: buildAccolades(player, inductionYear),
  };

  return {
    qualifies: true,
    member,
    reason: reasons.join(', '),
    stripGameLogs: false,
  };
}

export interface SeasonPurgeResult {
  hofInductees: HallOfFameMember[];
  strippablePlayerIds: string[];
}

/**
 * Process a batch of retired players at season end.
 * Returns HOF inductees and a list of player IDs whose detailed logs can be stripped.
 */
export function processSeasonPurge(
  retiredPlayers: RetiredPlayerInput[],
  inductionYear: number,
): SeasonPurgeResult {
  const hofInductees: HallOfFameMember[] = [];
  const strippablePlayerIds: string[] = [];

  for (const player of retiredPlayers) {
    const result = appraiseRetiredPlayer(player, inductionYear);
    if (result.qualifies && result.member) {
      hofInductees.push(result.member);
    }
    if (result.stripGameLogs && player.id != null) {
      strippablePlayerIds.push(String(player.id));
    }
  }

  return { hofInductees, strippablePlayerIds };
}
