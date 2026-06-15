/**
 * League Pulse / News Timeline System V1
 * Pure deterministic helpers to generate meaningful weekly stories based on existing league state.
 */
import {
  classifyDeadlinePosture,
  getTradeDeadlinePressure,
  buildDeadlinePulseItem,
} from './trades/tradeDeadlinePressure.js';

export const MAX_PULSE_ITEMS = 200;

export const PULSE_TYPES = {
  GAME_RESULT: 'gameResult',
  STANDINGS: 'standings',
  PERFORMANCE: 'performance',
  CONTRACT: 'contract',
  TRANSACTION: 'transaction',
  DRAFT: 'draft',
  RIVALRY: 'rivalry',
  GENERAL: 'general'
};

export const PULSE_IMPORTANCE = {
  CRITICAL: 100,
  HIGH: 75,
  MEDIUM: 50,
  LOW: 25
};

/**
 * Deterministic Dedupe Key Generator
 */
export function buildLeaguePulseDedupeKey(item) {
  return `${item.season}-${item.week}-${item.type}-${item.relatedTeamId || 'X'}-${item.relatedPlayerId || 'X'}-${item.headline}`;
}

/**
 * Merge new items into existing timeline
 */
export function mergeLeaguePulseItems(existingItems = [], newItems = [], options = {}) {
  const maxItems = options.maxTimelineLength || MAX_PULSE_ITEMS;

  // Combine
  let combined = [...newItems, ...existingItems];

  // Dedupe based on unique key, keeping the newest (first encountered)
  const seen = new Set();
  const deduped = [];

  for (const item of combined) {
    if (!item) continue;
    const key = item.dedupeKey || buildLeaguePulseDedupeKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push({ ...item, dedupeKey: key });
    }
  }

  // Sort chronologically (newest first based on season/week, then importance)
  deduped.sort((a, b) => {
    if (a.season !== b.season) return b.season - a.season;
    if (a.week !== b.week) return b.week - a.week;
    return b.importance - a.importance;
  });

  // Prune
  return deduped.slice(0, maxItems);
}

/**
 * Ranks a batch of pulse items specifically for display (e.g. Hub Top 3-5).
 * Weights User Team stories higher, but critical league events can still override them.
 */
export function rankLeaguePulseItems(items = [], userTeamId) {
  return [...items].sort((a, b) => {
    // 1. Calculate weighted scores
    const getScore = (item) => {
      let score = item.importance || PULSE_IMPORTANCE.LOW;
      // Boost user team relevance
      if (userTeamId && String(item.relatedTeamId) === String(userTeamId)) {
        score += 35; // A Medium user story (50+35=85) beats a High league story (75), but not a Critical league story (100)
      }
      return score;
    };

    const scoreA = getScore(a);
    const scoreB = getScore(b);

    if (scoreA !== scoreB) return scoreB - scoreA;

    // 2. Tiebreaker on chronological
    if (a.season !== b.season) return b.season - a.season;
    return b.week - a.week;
  });
}

/**
 * Pure generator function for League Pulse stories
 * Evaluates the provided data to emit a batch of safe, non-hallucinated stories.
 * @param {Object} meta - The current league metadata (season, week, phase, userTeamId)
 * @param {Object} data - Context data needed for generation (games, standings, players, team stats)
 * @returns {Array} Array of new League Pulse items
 */
export function generateLeaguePulseItems(meta, data = {}) {
  const items = [];
  const { season = 1, week = 0, phase = 'regular', userTeamId } = meta;
  const {
    games = [],
    standings = [],
    transactions = [],
    teamCapData = {},
    players = []
  } = data;

  // Safety net
  if (!userTeamId) return items;

  // 1. GAME RESULT STORY
  // Only process if games exist for the exact week. The worker feeds completed
  // result objects shaped { scoreHome/homeScore, scoreAway/awayScore }; the
  // legacy { played, score: { home, away } } shape is a fallback only, and the
  // canonical fields always win over it. A finite score pair IS the
  // completed-game signal — result objects never carried a `played` flag,
  // which is why this story never fired.
  const readScore = (g, side) => {
    const canonical = side === 'home'
      ? (g?.scoreHome ?? g?.homeScore)
      : (g?.scoreAway ?? g?.awayScore);
    const value = Number(canonical ?? (side === 'home' ? g?.score?.home : g?.score?.away));
    return Number.isFinite(value) ? value : null;
  };
  const userGame = games.find(g =>
    (String(g.home) === String(userTeamId) || String(g.away) === String(userTeamId)) &&
    readScore(g, 'home') != null &&
    readScore(g, 'away') != null
  );

  if (userGame) {
    const isHome = String(userGame.home) === String(userTeamId);
    const userScore = isHome ? readScore(userGame, 'home') : readScore(userGame, 'away');
    const oppScore = isHome ? readScore(userGame, 'away') : readScore(userGame, 'home');
    const oppTeamId = isHome ? userGame.away : userGame.home;
    const won = userScore > oppScore;
    const diff = Math.abs(userScore - oppScore);

    let headline = '';
    let body = '';
    let importance = PULSE_IMPORTANCE.HIGH;

    if (won) {
      if (diff >= 14) {
        headline = 'Statement Victory';
        body = `A dominant ${userScore}-${oppScore} performance signals strong momentum.`;
      } else if (diff <= 3) {
        headline = 'Nail-Biter Win';
        body = `The team edged out a tough ${userScore}-${oppScore} victory in the final moments.`;
      } else {
        headline = 'Solid Win';
        body = `The team secured a ${userScore}-${oppScore} win to keep the season on track.`;
      }
    } else {
      if (diff >= 14) {
        headline = 'Tough Blowout Loss';
        body = `A difficult ${userScore}-${oppScore} defeat raises questions heading into next week.`;
        importance = PULSE_IMPORTANCE.MEDIUM; // Lessen the blow of bad news slightly
      } else if (diff <= 3) {
        headline = 'Heartbreaking Loss';
        body = `The team fell just short in a tight ${userScore}-${oppScore} contest.`;
      } else {
        headline = 'Frustrating Defeat';
        body = `The team dropped a ${userScore}-${oppScore} decision. Time to regroup.`;
      }
    }

    if (phase === 'playoffs') {
      headline = `Playoff: ${headline}`;
      importance = PULSE_IMPORTANCE.CRITICAL;
    }

    items.push({
      id: `game-${season}-${week}-${userTeamId}`,
      season,
      week,
      type: PULSE_TYPES.GAME_RESULT,
      headline,
      body,
      importance,
      relatedTeamId: userTeamId,
      source: 'gameResult'
    });
  }

  // 2. STANDINGS PRESSURE
  // Only evaluate after week 3 to avoid early season noise
  if (phase === 'regular' && week >= 3 && standings.length > 0) {
    const userStandings = standings.find(s => String(s.tid) === String(userTeamId));
    if (userStandings) {
      const { w, l } = userStandings;

      if (w === 0 && l >= 3) {
        items.push({
          id: `standings-winless-${season}-${week}-${userTeamId}`,
          season, week, type: PULSE_TYPES.STANDINGS,
          headline: 'Winless Start',
          body: `At 0-${l}, the pressure is mounting to turn the season around.`,
          importance: PULSE_IMPORTANCE.HIGH,
          relatedTeamId: userTeamId,
          source: 'standings'
        });
      } else if (l === 0 && w >= 3) {
        items.push({
          id: `standings-undefeated-${season}-${week}-${userTeamId}`,
          season, week, type: PULSE_TYPES.STANDINGS,
          headline: 'Undefeated Streak',
          body: `A flawless ${w}-0 start has fans dreaming of a deep playoff run.`,
          importance: PULSE_IMPORTANCE.HIGH,
          relatedTeamId: userTeamId,
          source: 'standings'
        });
      } else if (week >= 14 && w >= l + 2) {
        // Late season playoff push
        items.push({
          id: `standings-playoffs-${season}-${week}-${userTeamId}`,
          season, week, type: PULSE_TYPES.STANDINGS,
          headline: 'Playoff Push',
          body: `Sitting at ${w}-${l}, every game is critical for postseason positioning.`,
          importance: PULSE_IMPORTANCE.HIGH,
          relatedTeamId: userTeamId,
          source: 'standings'
        });
      }
    }
  }

  // 3. CAP / CONTRACT PRESSURE
  if (teamCapData && teamCapData[userTeamId]) {
    const cap = teamCapData[userTeamId];
    if (cap.capSpace < 5000000 && phase !== 'playoffs') {
      items.push({
        id: `cap-pressure-${season}-${week}-${userTeamId}`,
        season, week, type: PULSE_TYPES.CONTRACT,
        headline: 'Tight Salary Cap',
        body: 'Cap space is running critically low. Re-signing talent or making moves will require careful management.',
        importance: PULSE_IMPORTANCE.MEDIUM,
        relatedTeamId: userTeamId,
        source: 'contract'
      });
    }
  }

  // 4. PRESEASON / SETUP EXPECTATIONS
  if (phase === 'preseason' && week === 1) {
    items.push({
      id: `preseason-${season}-1-${userTeamId}`,
      season, week, type: PULSE_TYPES.GENERAL,
      headline: `Season ${season} Kickoff`,
      body: 'Training camp is underway. Time to finalize the roster and set the depth chart before Week 1.',
      importance: PULSE_IMPORTANCE.MEDIUM,
      relatedTeamId: userTeamId,
      source: 'general'
    });
  }

  // 5. TRADE DEADLINE PRESSURE
  // Surface a pulse item when approaching or at the trade deadline.
  if (phase === 'regular') {
    const deadlineWeek = Number(data?.deadlineWeek ?? data?.tradeDeadlineWeek ?? 9);
    const userTeamState = data?.standings?.find((s) => String(s.tid) === String(userTeamId)) ?? {};
    const userRoster = data?.userRoster ?? [];
    const userPosture = classifyDeadlinePosture(
      { wins: userTeamState?.w, losses: userTeamState?.l, ties: userTeamState?.t, roster: userRoster },
      { currentSeason: season },
    );
    const pressure = getTradeDeadlinePressure({
      currentWeek: week,
      deadlineWeek,
      teamPosture: userPosture,
    });
    const pulseItem = buildDeadlinePulseItem({
      season,
      week,
      phase:            pressure.phase,
      weeksToDeadline:  pressure.weeksToDeadline,
      deadlineWeek,
      userTeamId,
      userPosture,
    });
    if (pulseItem) items.push(pulseItem);
  }

  // 6. TRANSACTIONS / NOTABLE LEAGUE EVENTS
  // Look at recent transactions if provided
  if (transactions && transactions.length > 0) {
    // Only look at high value transactions (e.g., massive trades or big signings)
    // For V1, we just take the first major trade if it exists and isn't involving the user
    const majorTrade = transactions.find(t => t.type === 'trade' && String(t.teamId) !== String(userTeamId) && t.importance >= PULSE_IMPORTANCE.HIGH);
    if (majorTrade) {
      items.push({
        id: `trade-${season}-${week}-${majorTrade.id || Math.random().toString(36).substring(7)}`,
        season, week, type: PULSE_TYPES.TRANSACTION,
        headline: 'Blockbuster Trade',
        body: majorTrade.summary || 'A significant trade has shaken up the league landscape.',
        importance: PULSE_IMPORTANCE.HIGH,
        relatedTeamId: majorTrade.teamId,
        source: 'transaction'
      });
    }
  }

  // 7. MORALE: Locker Room Watch (player crossed below 35)
  // 8. MORALE: Veteran Presence (veteran leader bonus applied this week)
  // 9. HOLDOUTS: Active holdout tension
  if (Array.isArray(players) && players.length > 0) {
    const userHoldouts = players.filter(
      (p) => p?.holdout?.active && String(p?.teamId) === String(userTeamId),
    );
    if (userHoldouts.length > 0) {
      const holdoutDedupeKey = `holdout_tension_${season}_${week}`;
      if (!items.some((i) => i.dedupeKey === holdoutDedupeKey)) {
        items.push({
          id:            holdoutDedupeKey,
          season,
          week,
          type:          PULSE_TYPES.GENERAL,
          headline:      'Locker Room Tension',
          body:          `${userHoldouts.length} player${userHoldouts.length === 1 ? '' : 's'} on holdout. Resolve disputes before game day.`,
          importance:    80,
          relatedTeamId: String(userTeamId),
          source:        'holdout',
          dedupeKey:     holdoutDedupeKey,
        });
      }
    }
  }

  if (Array.isArray(players) && players.length > 0) {
    const ALERT_THRESHOLD = 35;
    for (const player of players) {
      if (!player?.id || player?.teamId == null) continue;
      const morale = Number(player.morale ?? 70);
      const events = Array.isArray(player.moraleEvents) ? player.moraleEvents : [];

      // 7. Locker Room Watch: player is disgruntled (below alert threshold)
      if (morale < ALERT_THRESHOLD) {
        const dedupeKey = `morale-alert-${player.id}-${season}-${week}`;
        if (!items.some((i) => i.dedupeKey === dedupeKey)) {
          items.push({
            id:            dedupeKey,
            season,
            week,
            type:          PULSE_TYPES.GENERAL,
            headline:      'Locker Room Watch',
            body:          `${player.name ?? 'A player'} (morale ${morale}) is showing signs of discontent.`,
            importance:    PULSE_IMPORTANCE.MEDIUM,
            relatedTeamId: String(player.teamId),
            relatedPlayerId: String(player.id),
            source:        'morale',
            dedupeKey,
          });
        }
      }

      // 8. Veteran Presence: veteran leader bonus applied this exact week
      const hasVeteranBonusThisWeek = events.some(
        (e) => e.type === 'VETERAN_LEADER_BONUS' && e.season === season && e.week === week,
      );
      if (hasVeteranBonusThisWeek) {
        const dedupeKey = `veteran-presence-${player.id}-${season}-${week}`;
        if (!items.some((i) => i.dedupeKey === dedupeKey)) {
          items.push({
            id:            dedupeKey,
            season,
            week,
            type:          PULSE_TYPES.GENERAL,
            headline:      'Veteran Presence',
            body:          `${player.name ?? 'A veteran'} is providing leadership and raising team morale.`,
            importance:    PULSE_IMPORTANCE.LOW,
            relatedTeamId: String(player.teamId),
            relatedPlayerId: String(player.id),
            source:        'morale',
            dedupeKey,
          });
        }
      }
    }
  }

  // Build the dedupe keys
  return items.map(item => ({
    ...item,
    dedupeKey: item.dedupeKey || buildLeaguePulseDedupeKey(item),
    createdAt: Date.now() // Optional, but dedupeKey, season, week manage determinism
  }));
}

export function selectLeaguePulseHighlights(league, options) { return rankLeaguePulseItems(league?.leaguePulse || [], league?.userTeamId).slice(0, options?.limit || 5); }
