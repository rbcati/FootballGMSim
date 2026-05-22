/**
 * NewsEngine — pure weekly headline parser for the Franchise Chronicle Engine.
 *
 * Accepts raw game results from the ADVANCE_WEEK pipeline and returns a ranked
 * list of WeeklyHeadline objects (max 6) with no side effects. The caller is
 * responsible for storing headlines in league state.
 *
 * Priority order: Injuries → Blowouts/Comebacks/OT → Upsets → Streaks → Performance → Defensive
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
  sacks?: number;
}

interface PlayerBoxStat {
  id?: string | number;
  name?: string;
  pos?: string;
  teamId?: string | number;
  passYds?: number;
  rushYds?: number;
  recYds?: number;
  passTDs?: number;
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
  boxScore?: { home?: PlayerBoxStat[]; away?: PlayerBoxStat[]; players?: PlayerBoxStat[] };
  quarterScores?: number[][];
  ot?: number | boolean;
  overtimePeriods?: number;
}

interface TeamRecord {
  id?: string | number;
  name?: string;
  abbr?: string;
  wins?: number;
  losses?: number;
  recentResults?: string[];
  conf?: number | string;
  div?: number | string;
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
  teams?: TeamRecord[];
}

const MAX_HEADLINES = 6;

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

function isOvertimeGame(res: GameResult): boolean {
  if (num(res.ot, 0) > 0 || num(res.overtimePeriods, 0) > 0) return true;
  if (Array.isArray(res.quarterScores)) {
    const homeQ = res.quarterScores[0];
    if (Array.isArray(homeQ) && homeQ.length > 4) return true;
  }
  return false;
}

function winStreak(recentResults: string[] | undefined): number {
  if (!Array.isArray(recentResults) || recentResults.length === 0) return 0;
  const rev = [...recentResults].reverse();
  let streak = 0;
  for (const r of rev) {
    if (String(r).toUpperCase() === 'W') streak++;
    else break;
  }
  return streak;
}

function allPlayersFromResult(res: GameResult): PlayerBoxStat[] {
  if (!res.boxScore) return [];
  if (Array.isArray(res.boxScore.players)) return res.boxScore.players;
  const home = Array.isArray(res.boxScore.home) ? res.boxScore.home : [];
  const away = Array.isArray(res.boxScore.away) ? res.boxScore.away : [];
  return [...home, ...away];
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
      if (ovr < 78) continue;

      const injType = inj.type ?? 'injury';
      const pos = player.pos ?? 'Player';
      const name = player.name ?? `Player ${player.id}`;
      const teamRef = num(player.teamId, NaN);
      const severity: WeeklyHeadline['severity'] = inj.seasonEnding ? 'CRITICAL' : duration >= 8 ? 'MAJOR' : 'MINOR';

      const durationText = inj.seasonEnding ? 'for the season' : `${duration} weeks`;
      headlines.push({
        id: headlineId(week, year, `injury-${player.id}`),
        week,
        year,
        type: 'INJURY',
        severity,
        headlineText: inj.seasonEnding
          ? `Disaster: ${name} Out for Season with ${injType.replace(/_/g, ' ')}`
          : `${name} (${pos}) to Miss ${duration} Weeks`,
        detailText: `A significant blow — star ${pos} ${name} suffers a ${injType.replace(/_/g, ' ')}, sidelined ${durationText}.`,
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

// ── Priority 2: Game Drama — Blowouts, Comebacks, OT, Upsets ─────────────────

function extractGameDramaHeadlines(
  results: GameResult[],
  week: number,
  year: number,
  teams: TeamRecord[],
): WeeklyHeadline[] {
  const headlines: WeeklyHeadline[] = [];

  function findTeam(id: number): TeamRecord | undefined {
    return teams.find((t) => num(t.id, -1) === id);
  }

  for (const res of results) {
    const homeScore = num(res.scoreHome ?? res.homeScore, 0);
    const awayScore = num(res.scoreAway ?? res.awayScore, 0);
    const diff = Math.abs(homeScore - awayScore);
    const total = homeScore + awayScore;
    if (total === 0) continue;

    const homeId = teamId(res.home ?? res.homeTeamId);
    const awayId = teamId(res.away ?? res.awayTeamId);
    const homeWon = homeScore >= awayScore;
    const winnerId = homeWon ? homeId : awayId;
    const loserId = homeWon ? awayId : homeId;
    const winnerName = homeWon
      ? teamName(res.home, res.homeTeamName, res.homeTeamAbbr)
      : teamName(res.away, res.awayTeamName, res.awayTeamAbbr);
    const loserName = homeWon
      ? teamName(res.away, res.awayTeamName, res.awayTeamAbbr)
      : teamName(res.home, res.homeTeamName, res.homeTeamAbbr);
    const winScore = Math.max(homeScore, awayScore);
    const loseScore = Math.min(homeScore, awayScore);
    const scoreStr = `${winScore}-${loseScore}`;

    const isOT = isOvertimeGame(res);

    // Blowout check first
    if (diff >= 28) {
      headlines.push({
        id: headlineId(week, year, `blowout-${winnerId}`),
        week,
        year,
        type: 'BLOWOUT',
        severity: diff >= 35 ? 'MAJOR' : 'MINOR',
        headlineText: `${winnerName} Dominates ${loserName} ${scoreStr}`,
        detailText: `A commanding ${diff}-point win — ${winnerName} leaves no doubt in a dominant performance.`,
        associatedTeamId: !isNaN(winnerId) ? String(winnerId) : undefined,
      });
      continue;
    }

    // OT thriller
    if (isOT) {
      headlines.push({
        id: headlineId(week, year, `ot-${winnerId}`),
        week,
        year,
        type: 'OVERTIME',
        severity: 'MAJOR',
        headlineText: `Overtime Thriller: ${winnerName} Outlasts ${loserName} ${scoreStr}`,
        detailText: `An electric finish as ${winnerName} and ${loserName} go to extra time, with ${winnerName} claiming the dramatic ${scoreStr} victory.`,
        associatedTeamId: !isNaN(winnerId) ? String(winnerId) : undefined,
      });
      continue;
    }

    // Comeback detection via quarter scores — won despite trailing by 14+ heading into Q4
    const quarters = res.quarterScores;
    if (Array.isArray(quarters) && quarters.length >= 2 && diff <= 7) {
      const homeThrough3 = (quarters[0] ?? []).slice(0, 3).reduce((s, q) => s + num(q, 0), 0);
      const awayThrough3 = (quarters[1] ?? []).slice(0, 3).reduce((s, q) => s + num(q, 0), 0);
      const q4Deficit = homeWon
        ? awayThrough3 - homeThrough3
        : homeThrough3 - awayThrough3;
      if (q4Deficit >= 10) {
        headlines.push({
          id: headlineId(week, year, `comeback-${winnerId}`),
          week,
          year,
          type: 'COMEBACK',
          severity: 'MAJOR',
          headlineText: `${winnerName} Stuns ${loserName} with ${scoreStr} Fourth-Quarter Comeback`,
          detailText: `Trailing by ${q4Deficit} entering the fourth, ${winnerName} rallied to complete a remarkable ${scoreStr} comeback victory.`,
          associatedTeamId: !isNaN(winnerId) ? String(winnerId) : undefined,
        });
        continue;
      }
    }

    // Major upset: winner had ≥3 fewer wins than loser (and loser had winning record)
    if (diff <= 14) {
      const winnerTeam = findTeam(winnerId);
      const loserTeam = findTeam(loserId);
      if (winnerTeam && loserTeam) {
        const winnerWins = num(winnerTeam.wins, 0);
        const loserWins = num(loserTeam.wins, 0);
        const winGap = loserWins - winnerWins;
        if (winGap >= 3 && loserWins >= 4) {
          headlines.push({
            id: headlineId(week, year, `upset-${winnerId}`),
            week,
            year,
            type: 'UPSET',
            severity: winGap >= 5 ? 'MAJOR' : 'MINOR',
            headlineText: `Upset Alert: ${winnerName} Shocks ${loserName} ${scoreStr}`,
            detailText: `Nobody saw this coming — ${winnerName} (${winnerWins}-${num(winnerTeam.losses)}) topples ${loserName} (${loserWins}-${num(loserTeam.losses)}) in a major upset.`,
            associatedTeamId: !isNaN(winnerId) ? String(winnerId) : undefined,
          });
          continue;
        }
      }
    }

    // Nail-biter: margin ≤ 3
    if (diff <= 3) {
      headlines.push({
        id: headlineId(week, year, `nailbiter-${winnerId}`),
        week,
        year,
        type: 'UPSET',
        severity: 'MINOR',
        headlineText: `${winnerName} Edges ${loserName} in ${scoreStr} Nail-Biter`,
        detailText: `A game decided by the finest of margins as ${winnerName} holds on for a tight ${scoreStr} victory over ${loserName}.`,
        associatedTeamId: !isNaN(winnerId) ? String(winnerId) : undefined,
      });
    }
  }

  return headlines;
}

// ── Priority 3: Win Streaks & Undefeated Watch ────────────────────────────────

function extractStreakHeadlines(
  results: GameResult[],
  week: number,
  year: number,
  teams: TeamRecord[],
): WeeklyHeadline[] {
  const headlines: WeeklyHeadline[] = [];
  const winnerIds = new Set<number>();

  for (const res of results) {
    const homeScore = num(res.scoreHome ?? res.homeScore, 0);
    const awayScore = num(res.scoreAway ?? res.awayScore, 0);
    const winnerId = homeScore >= awayScore
      ? teamId(res.home ?? res.homeTeamId)
      : teamId(res.away ?? res.awayTeamId);
    if (!isNaN(winnerId)) winnerIds.add(winnerId);
  }

  for (const team of teams) {
    const tid = num(team.id, NaN);
    if (isNaN(tid) || !winnerIds.has(tid)) continue;
    const wins = num(team.wins, 0);
    const losses = num(team.losses, 0);
    const streak = winStreak(team.recentResults);
    const name = team.name ?? team.abbr ?? `Team ${tid}`;

    // Undefeated watch: 5+ wins, 0 losses
    if (losses === 0 && wins >= 5) {
      headlines.push({
        id: headlineId(week, year, `undefeated-${tid}`),
        week,
        year,
        type: 'STREAK',
        severity: wins >= 8 ? 'MAJOR' : 'MINOR',
        headlineText: `${name} Stays Perfect at ${wins}-0`,
        detailText: `${name} remains the league's last undefeated team, extending their flawless start to ${wins} wins.`,
        associatedTeamId: String(tid),
      });
      continue;
    }

    // Win streak: 5+ consecutive
    if (streak >= 5) {
      headlines.push({
        id: headlineId(week, year, `streak-${tid}`),
        week,
        year,
        type: 'STREAK',
        severity: streak >= 7 ? 'MAJOR' : 'MINOR',
        headlineText: `${name} Extends Win Streak to ${streak}`,
        detailText: `${name} keeps rolling — their ${streak}-game winning streak is the longest active run in the league.`,
        associatedTeamId: String(tid),
      });
    }
  }

  return headlines;
}

// ── Priority 4: Statistical Milestones & Elite Performances ──────────────────

const CAREER_MILESTONES: Array<{ key: 'rushYds' | 'passYds' | 'recYds'; threshold: number; label: string }> = [
  { key: 'rushYds', threshold: 10000, label: 'career rushing yards' },
  { key: 'passYds', threshold: 40000, label: 'career passing yards' },
  { key: 'recYds', threshold: 10000, label: 'career receiving yards' },
];

function extractPerformanceHeadlines(
  results: GameResult[],
  week: number,
  year: number,
  getPlayer: NonNullable<NewsEngineInput['getPlayer']>,
): WeeklyHeadline[] {
  const headlines: WeeklyHeadline[] = [];

  for (const res of results) {
    const players = allPlayersFromResult(res);
    for (const box of players) {
      const gamePassYds = num(box.passYds, 0);
      const gameRushYds = num(box.rushYds, 0);
      const gameRecYds = num(box.recYds, 0);
      const name = box.name ?? `Player ${box.id}`;
      const teamRef = num(box.teamId, NaN);

      // Elite passing: 400+ yards (was 450 for MILESTONE, lower for PERFORMANCE)
      if (gamePassYds >= 400) {
        const isMilestone = gamePassYds >= 450;
        headlines.push({
          id: headlineId(week, year, `pass-perf-${box.id}`),
          week,
          year,
          type: isMilestone ? 'MILESTONE' : 'PERFORMANCE',
          severity: gamePassYds >= 550 ? 'CRITICAL' : 'MAJOR',
          headlineText: `${name} Throws for ${gamePassYds} Yards in Statement Performance`,
          detailText: `An elite aerial display — ${name} carved up opposing coverage for ${gamePassYds} passing yards.`,
          associatedPlayerId: String(box.id ?? ''),
          associatedTeamId: !isNaN(teamRef) ? String(teamRef) : undefined,
        });
      } else if (gameRushYds >= 150) {
        // Elite rushing: 150+ yards
        const isMilestone = gameRushYds >= 200;
        headlines.push({
          id: headlineId(week, year, `rush-perf-${box.id}`),
          week,
          year,
          type: isMilestone ? 'MILESTONE' : 'PERFORMANCE',
          severity: gameRushYds >= 200 ? 'MAJOR' : 'MINOR',
          headlineText: `${name} Erupts for ${gameRushYds} Rushing Yards`,
          detailText: `A dominant ground performance — ${name} shredded the defense for ${gameRushYds} rushing yards.`,
          associatedPlayerId: String(box.id ?? ''),
          associatedTeamId: !isNaN(teamRef) ? String(teamRef) : undefined,
        });
      } else if (gameRecYds >= 150) {
        // Elite receiving: 150+ yards
        const isMilestone = gameRecYds >= 200;
        headlines.push({
          id: headlineId(week, year, `rec-perf-${box.id}`),
          week,
          year,
          type: isMilestone ? 'MILESTONE' : 'PERFORMANCE',
          severity: gameRecYds >= 200 ? 'MAJOR' : 'MINOR',
          headlineText: `${name} Goes Off for ${gameRecYds} Receiving Yards`,
          detailText: `An unstoppable day through the air — ${name} hauled in ${gameRecYds} receiving yards against the helpless secondary.`,
          associatedPlayerId: String(box.id ?? ''),
          associatedTeamId: !isNaN(teamRef) ? String(teamRef) : undefined,
        });
      }

      // Career milestone crossing
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
                headlineText: `History: ${name} Crosses ${(m.threshold / 1000).toFixed(0)},000 ${m.label.replace(/career /, 'Career ')}`,
                detailText: `A legendary milestone — ${name} surpasses ${(m.threshold / 1000).toFixed(0)},000 ${m.label}, cementing Hall of Fame credentials.`,
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

// ── Priority 5: Defensive Domination ─────────────────────────────────────────

function extractDefensiveHeadlines(
  results: GameResult[],
  week: number,
  year: number,
): WeeklyHeadline[] {
  const headlines: WeeklyHeadline[] = [];

  for (const res of results) {
    const homeScore = num(res.scoreHome ?? res.homeScore, 0);
    const awayScore = num(res.scoreAway ?? res.awayScore, 0);
    const total = homeScore + awayScore;
    if (total === 0) continue;

    // Check turnovers forced by winning defense
    const homeWon = homeScore > awayScore;
    const defStats = homeWon ? res.teamStats?.home : res.teamStats?.away;
    const turnoversForced = num(defStats?.turnovers, 0);
    if (turnoversForced < 4) continue;

    const winnerId = homeWon ? teamId(res.home ?? res.homeTeamId) : teamId(res.away ?? res.awayTeamId);
    const loserName = homeWon
      ? teamName(res.away, res.awayTeamName, res.awayTeamAbbr)
      : teamName(res.home, res.homeTeamName, res.homeTeamAbbr);
    const winnerName = homeWon
      ? teamName(res.home, res.homeTeamName, res.homeTeamAbbr)
      : teamName(res.away, res.awayTeamName, res.awayTeamAbbr);

    headlines.push({
      id: headlineId(week, year, `def-dom-${winnerId}`),
      week,
      year,
      type: 'DEFENSIVE',
      severity: turnoversForced >= 5 ? 'MAJOR' : 'MINOR',
      headlineText: `${winnerName} Defense Suffocates ${loserName} with ${turnoversForced} Takeaways`,
      detailText: `A suffocating defensive performance — ${winnerName} forced ${turnoversForced} turnovers, turning the game into a rout.`,
      associatedTeamId: !isNaN(winnerId) ? String(winnerId) : undefined,
    });
  }

  return headlines;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Parse a week's game results into up to 6 ranked WeeklyHeadline objects.
 * Priority: Injuries → Drama (blowout/OT/comeback/upset) → Streaks → Performance → Defense
 */
export function parseWeeklyHeadlines(input: NewsEngineInput): WeeklyHeadline[] {
  const { results, week, year, getPlayer = () => null, teams = [] } = input;
  if (!Array.isArray(results) || results.length === 0) return [];

  const injuries = extractInjuryHeadlines(results, week, year, getPlayer);
  const drama = extractGameDramaHeadlines(results, week, year, teams);
  const streaks = extractStreakHeadlines(results, week, year, teams);
  const performances = extractPerformanceHeadlines(results, week, year, getPlayer);
  const defensive = extractDefensiveHeadlines(results, week, year);

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
  for (const hl of streaks) add(hl);
  for (const hl of performances) add(hl);
  for (const hl of defensive) add(hl);

  return ranked.slice(0, MAX_HEADLINES);
}
