/**
 * NewsEngine — pure weekly headline parser for the Franchise Chronicle Engine.
 *
 * Accepts raw game results from the ADVANCE_WEEK pipeline and returns a ranked
 * list of WeeklyHeadline objects (max 3) with no side effects. The caller is
 * responsible for storing headlines in league state.
 *
 * Budget: < 15 ms on mobile processors per week.
 */

import type { WeeklyHeadline } from '../../types/history.js';

interface PlayerRef {
  id?: string | number;
  name?: string;
  pos?: string;
  ovr?: number;
  teamId?: string | number;
}

interface InjuryInfo {
  playerId?: string | number;
  type?: string;
  duration?: number;
  seasonEnding?: boolean;
}

interface TeamStats {
  passYds?: number;
  rushYds?: number;
  totalYds?: number;
  turnovers?: number;
}

interface PlayerBoxStat {
  id?: string | number;
  name?: string;
  pos?: string;
  teamId?: string | number;
  passYds?: number;
  rushYds?: number;
  recYds?: number;
}

interface GameResult {
  home?: string | number | { id?: string | number; name?: string; abbr?: string };
  away?: string | number | { id?: string | number; name?: string; abbr?: string };
  homeTeamId?: string | number;
  awayTeamId?: string | number;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  scoreHome?: number;
  homeScore?: number;
  scoreAway?: number;
  awayScore?: number;
  injuries?: InjuryInfo[];
  teamStats?: { home?: TeamStats; away?: TeamStats };
  boxScore?: { players?: PlayerBoxStat[] };
  quarterScores?: number[][];
}

interface PlayerLookup {
  id?: string | number;
  name?: string;
  pos?: string;
  ovr?: number;
  teamId?: string | number;
  stats?: {
    career?: {
      rushYds?: number;
      passYds?: number;
      recYds?: number;
    };
  };
}

export interface NewsEngineInput {
  results: GameResult[];
  week: number;
  year: number;
  getPlayer?: (id: string | number) => PlayerLookup | null | undefined;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function teamId(raw: GameResult['home']): number {
  if (raw == null) return NaN;
  if (typeof raw === 'object') return num(raw.id, NaN);
  return num(raw, NaN);
}

function teamName(raw: GameResult['home'], name: string | undefined, abbr: string | undefined): string {
  if (name) return name;
  if (abbr) return abbr;
  if (raw && typeof raw === 'object') return raw.name ?? raw.abbr ?? 'Team';
  return 'Team';
}

function headlineId(week: number, year: number, suffix: string): string {
  return `headline-${year}-wk${week}-${suffix}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

// ── Priority 1: Severe Injuries ───────────────────────────────────────────────

function extractInjuryHeadlines(
  results: GameResult[],
  week: number,
  year: number,
  getPlayer: NonNullable<NewsEngineInput['getPlayer']>,
): WeeklyHeadline[] {
  const headlines: WeeklyHeadline[] = [];

  for (const res of results) {
    if (!Array.isArray(res.injuries)) continue;
    for (const inj of res.injuries) {
      const duration = num(inj.duration, 0);
      if (duration < 4 && !inj.seasonEnding) continue;
      const player = getPlayer(inj.playerId ?? '');
      if (!player) continue;
      const ovr = num(player.ovr, 0);
      if (ovr < 80) continue;

      const injType = inj.type ?? 'injury';
      const pos = player.pos ?? 'Player';
      const name = player.name ?? `Player ${player.id}`;
      const teamRef = num(player.teamId, NaN);
      const severity: WeeklyHeadline['severity'] = inj.seasonEnding ? 'CRITICAL' : duration >= 8 ? 'MAJOR' : 'MINOR';

      headlines.push({
        id: headlineId(week, year, `injury-${player.id}`),
        week,
        year,
        type: 'INJURY',
        severity,
        headlineText: `${name} Out${inj.seasonEnding ? ' for Season' : ` ${duration} Weeks`} with ${injType.replace(/_/g, ' ')}!`,
        detailText: `A devastating blow as star ${pos} ${name} suffers a ${injType.replace(/_/g, ' ')}, crippling their postseason aspirations.`,
        associatedPlayerId: String(player.id ?? ''),
        associatedTeamId: !isNaN(teamRef) ? String(teamRef) : undefined,
      });
    }
  }

  return headlines.sort((a, b) => {
    const rank = { CRITICAL: 0, MAJOR: 1, MINOR: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}

// ── Priority 2: Blowouts and Comebacks ────────────────────────────────────────

function extractGameDramaHeadlines(
  results: GameResult[],
  week: number,
  year: number,
): WeeklyHeadline[] {
  const headlines: WeeklyHeadline[] = [];

  for (const res of results) {
    const homeScore = num(res.scoreHome ?? res.homeScore, 0);
    const awayScore = num(res.scoreAway ?? res.awayScore, 0);
    const diff = Math.abs(homeScore - awayScore);
    const total = homeScore + awayScore;
    if (total === 0) continue;

    const winnerId = homeScore >= awayScore ? teamId(res.home ?? res.homeTeamId) : teamId(res.away ?? res.awayTeamId);
    const loserId = homeScore >= awayScore ? teamId(res.away ?? res.awayTeamId) : teamId(res.home ?? res.homeTeamId);
    const winnerName = homeScore >= awayScore
      ? teamName(res.home, res.homeTeamName, res.homeTeamAbbr)
      : teamName(res.away, res.awayTeamName, res.awayTeamAbbr);
    const loserName = homeScore >= awayScore
      ? teamName(res.away, res.awayTeamName, res.awayTeamAbbr)
      : teamName(res.home, res.homeTeamName, res.homeTeamAbbr);
    const winScore = Math.max(homeScore, awayScore);
    const loseScore = Math.min(homeScore, awayScore);
    const scoreStr = `${winScore}-${loseScore}`;

    if (diff >= 28) {
      headlines.push({
        id: headlineId(week, year, `blowout-${winnerId}`),
        week,
        year,
        type: 'BLOWOUT',
        severity: diff >= 35 ? 'MAJOR' : 'MINOR',
        headlineText: `${winnerName} Crushes ${loserName} in ${scoreStr} Blowout!`,
        detailText: `A dominant performance as ${winnerName} dismantles ${loserName} by ${diff} points.`,
        associatedTeamId: !isNaN(winnerId) ? String(winnerId) : undefined,
      });
      continue;
    }

    // Comeback detection via quarter scores — team won despite trailing by 14+ in Q4
    const quarters = res.quarterScores;
    if (Array.isArray(quarters) && quarters.length >= 2 && diff <= 3) {
      const homeQ4Cumulative = quarters[0]?.reduce((sum, q) => sum + num(q, 0), 0) ?? 0;
      const awayQ4Cumulative = quarters[1]?.reduce((sum, q) => sum + num(q, 0), 0) ?? 0;

      const homeLeadingAtSomePoint = homeQ4Cumulative - (quarters[0]?.[3] ?? 0);
      const awayLeadingAtSomePoint = awayQ4Cumulative - (quarters[1]?.[3] ?? 0);
      const trailDeficit = Math.abs(homeLeadingAtSomePoint - awayLeadingAtSomePoint);

      if (trailDeficit >= 14) {
        headlines.push({
          id: headlineId(week, year, `comeback-${winnerId}`),
          week,
          year,
          type: 'COMEBACK',
          severity: 'MAJOR',
          headlineText: `${winnerName} Pulls Off Stunning ${scoreStr} Comeback Win!`,
          detailText: `Trailing deep into the fourth quarter, ${winnerName} refused to quit and edged ${loserName} ${scoreStr}.`,
          associatedTeamId: !isNaN(winnerId) ? String(winnerId) : undefined,
        });
        continue;
      }
    }

    // Upset: margin <= 3
    if (diff <= 3) {
      headlines.push({
        id: headlineId(week, year, `upset-${winnerId}`),
        week,
        year,
        type: 'UPSET',
        severity: 'MINOR',
        headlineText: `${winnerName} Edges ${loserName} in Nail-Biter ${scoreStr}!`,
        detailText: `A game decided by the finest of margins as ${winnerName} outlasts ${loserName} ${scoreStr}.`,
        associatedTeamId: !isNaN(winnerId) ? String(winnerId) : undefined,
      });
    }
  }

  return headlines;
}

// ── Priority 3: Statistical Milestones ───────────────────────────────────────

const CAREER_MILESTONES: Array<{ key: 'rushYds' | 'passYds' | 'recYds'; threshold: number; label: string }> = [
  { key: 'rushYds', threshold: 10000, label: 'career rushing yards' },
  { key: 'passYds', threshold: 40000, label: 'career passing yards' },
  { key: 'recYds', threshold: 10000, label: 'career receiving yards' },
];

function extractMilestoneHeadlines(
  results: GameResult[],
  week: number,
  year: number,
  getPlayer: NonNullable<NewsEngineInput['getPlayer']>,
): WeeklyHeadline[] {
  const headlines: WeeklyHeadline[] = [];

  for (const res of results) {
    const players: PlayerBoxStat[] = res.boxScore?.players ?? [];
    for (const box of players) {
      const gamePassYds = num(box.passYds, 0);
      const gameRushYds = num(box.rushYds, 0);
      const gameRecYds = num(box.recYds, 0);
      const name = box.name ?? `Player ${box.id}`;
      const teamRef = num(box.teamId, NaN);

      // Single-game performances
      if (gamePassYds >= 450) {
        headlines.push({
          id: headlineId(week, year, `milestone-passyds-${box.id}`),
          week,
          year,
          type: 'MILESTONE',
          severity: gamePassYds >= 550 ? 'CRITICAL' : 'MAJOR',
          headlineText: `${name} Torches Secondary for ${gamePassYds} Passing Yards!`,
          detailText: `An historic aerial assault as ${name} shreds opposing coverage for ${gamePassYds} yards through the air.`,
          associatedPlayerId: String(box.id ?? ''),
          associatedTeamId: !isNaN(teamRef) ? String(teamRef) : undefined,
        });
      } else if (gameRushYds >= 200) {
        headlines.push({
          id: headlineId(week, year, `milestone-rushyds-${box.id}`),
          week,
          year,
          type: 'MILESTONE',
          severity: gameRushYds >= 250 ? 'CRITICAL' : 'MAJOR',
          headlineText: `${name} Goes Off for ${gameRushYds} Rushing Yards!`,
          detailText: `A dominant ground performance as ${name} bulldozes the opposition for ${gameRushYds} yards on the ground.`,
          associatedPlayerId: String(box.id ?? ''),
          associatedTeamId: !isNaN(teamRef) ? String(teamRef) : undefined,
        });
      } else if (gameRecYds >= 200) {
        headlines.push({
          id: headlineId(week, year, `milestone-recyds-${box.id}`),
          week,
          year,
          type: 'MILESTONE',
          severity: gameRecYds >= 250 ? 'CRITICAL' : 'MAJOR',
          headlineText: `${name} Erupts for ${gameRecYds} Receiving Yards!`,
          detailText: `A spectacular receiving display as ${name} hauls in ${gameRecYds} yards through the air.`,
          associatedPlayerId: String(box.id ?? ''),
          associatedTeamId: !isNaN(teamRef) ? String(teamRef) : undefined,
        });
      }

      // Career milestone crossing — only check when player has a notable game stat
      if (gameRushYds > 0 || gamePassYds > 0 || gameRecYds > 0) {
        const full = box.id != null ? getPlayer(box.id) : null;
        if (full?.stats?.career) {
          const career = full.stats.career;
          for (const m of CAREER_MILESTONES) {
            const careerVal = num(career[m.key], 0);
            const gameVal = m.key === 'rushYds' ? gameRushYds : m.key === 'passYds' ? gamePassYds : gameRecYds;
            const prevVal = careerVal - gameVal;
            if (prevVal < m.threshold && careerVal >= m.threshold) {
              headlines.push({
                id: headlineId(week, year, `career-${m.key}-${box.id}`),
                week,
                year,
                type: 'MILESTONE',
                severity: 'CRITICAL',
                headlineText: `History Made: ${name} Crosses ${(m.threshold / 1000).toFixed(0)},000 ${m.label.replace(/career /, 'Career ')}!`,
                detailText: `An immortal moment as ${name} surpasses the ${(m.threshold / 1000).toFixed(0)},000 ${m.label} threshold, cementing legendary status.`,
                associatedPlayerId: String(box.id ?? ''),
                associatedTeamId: !isNaN(teamRef) ? String(teamRef) : undefined,
              });
            }
          }
        }
      }
    }
  }

  return headlines;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Parse a week's game results into up to 3 ranked WeeklyHeadline objects.
 * Priority order: Injuries → Blowouts/Comebacks → Milestones.
 */
export function parseWeeklyHeadlines(input: NewsEngineInput): WeeklyHeadline[] {
  const { results, week, year, getPlayer = () => null } = input;
  if (!Array.isArray(results) || results.length === 0) return [];

  const injuries = extractInjuryHeadlines(results, week, year, getPlayer);
  const drama = extractGameDramaHeadlines(results, week, year);
  const milestones = extractMilestoneHeadlines(results, week, year, getPlayer);

  const ranked: WeeklyHeadline[] = [];
  const seen = new Set<string>();

  const add = (hl: WeeklyHeadline) => {
    if (!seen.has(hl.id)) {
      seen.add(hl.id);
      ranked.push(hl);
    }
  };

  for (const hl of injuries) add(hl);
  for (const hl of drama) add(hl);
  for (const hl of milestones) add(hl);

  return ranked.slice(0, 3);
}
