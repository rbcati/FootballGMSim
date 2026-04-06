import { deriveWeeklyHonors, derivePregameAngles } from './gamePresentation.js';

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getWinPct(team) {
  const wins = safeNum(team?.wins);
  const losses = safeNum(team?.losses);
  const ties = safeNum(team?.ties);
  const games = wins + losses + ties;
  return games > 0 ? (wins + 0.5 * ties) / games : 0;
}

export function computeStreak(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;
  let type = null;
  let count = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const r = results[i];
    if (r !== 'W' && r !== 'L') continue;
    if (type == null) {
      type = r;
      count = 1;
      continue;
    }
    if (r === type) count += 1;
    else break;
  }
  return type ? { type, count } : null;
}

function normalizeTeamId(maybeTeam) {
  if (typeof maybeTeam === 'object' && maybeTeam) return safeNum(maybeTeam.id, null);
  return safeNum(maybeTeam, null);
}

function getTeamMap(league) {
  const map = new Map();
  for (const t of league?.teams ?? []) map.set(t.id, t);
  return map;
}

function rankConference(teams = [], conf) {
  const byConf = teams.filter((t) => String(t.conf) === String(conf));
  const divLeaders = new Map();
  byConf.forEach((team) => {
    const key = String(team.div);
    const existing = divLeaders.get(key);
    if (!existing || getWinPct(team) > getWinPct(existing)) {
      divLeaders.set(key, team);
    }
  });
  const divisionWinners = [...divLeaders.values()].sort((a, b) => getWinPct(b) - getWinPct(a));
  const winnerIds = new Set(divisionWinners.map((t) => t.id));
  const wildcards = byConf.filter((t) => !winnerIds.has(t.id)).sort((a, b) => getWinPct(b) - getWinPct(a));
  const ranked = [...divisionWinners, ...wildcards];
  return ranked.map((team, idx) => ({
    team,
    seed: idx + 1,
    inField: idx < 7,
    bubble: idx === 7,
    gamesBack: 0,
  }));
}

function getUserTeam(league) {
  return (league?.teams ?? []).find((t) => t.id === league?.userTeamId) ?? null;
}

function getNextUserGameContext(league) {
  const userTeamId = league?.userTeamId;
  if (userTeamId == null) return null;

  const weeks = league?.schedule?.weeks ?? [];
  let nextGame = null;
  for (const week of weeks) {
    for (const game of week?.games ?? []) {
      if (game?.played) continue;
      const homeId = normalizeTeamId(game?.home);
      const awayId = normalizeTeamId(game?.away);
      if (homeId === userTeamId || awayId === userTeamId) {
        nextGame = { ...game, week: safeNum(week?.week, 1), homeId, awayId };
        break;
      }
    }
    if (nextGame) break;
  }
  if (!nextGame) return null;

  const oppId = nextGame.homeId === userTeamId ? nextGame.awayId : nextGame.homeId;
  const gamesBefore = [];
  for (const week of weeks) {
    if (safeNum(week?.week) >= nextGame.week) break;
    for (const game of week?.games ?? []) {
      const homeId = normalizeTeamId(game?.home);
      const awayId = normalizeTeamId(game?.away);
      if (homeId === userTeamId || awayId === userTeamId) {
        gamesBefore.push({ ...game, week: safeNum(week?.week), homeId, awayId });
      }
    }
  }
  const previous = gamesBefore[gamesBefore.length - 1] ?? null;
  const alreadyPlayedOpp = gamesBefore.find((g) => (g.homeId === oppId || g.awayId === oppId));

  return {
    nextWeek: nextGame.week,
    oppId,
    rematch: Boolean(alreadyPlayedOpp),
    backToBackOpponent: Boolean(previous && (previous.homeId === oppId || previous.awayId === oppId)),
  };
}

function getAwardLeaders(league) {
  const races = league?.awardRaces?.awards ?? league?.awardsRace?.awards ?? null;
  if (!races) return [];
  const slots = [
    { key: 'mvp', label: 'MVP' },
    { key: 'opoy', label: 'OPOY' },
    { key: 'dpoy', label: 'DPOY' },
    { key: 'oroy', label: 'OROY' },
    { key: 'droy', label: 'DROY' },
  ];
  return slots
    .map((slot) => {
      const board = races?.[slot.key]?.league ?? races?.[slot.key]?.afc ?? races?.[slot.key]?.nfc ?? [];
      const leader = Array.isArray(board) ? board[0] : null;
      const challenger = Array.isArray(board) ? board[1] : null;
      if (!leader) return null;
      return {
        ...slot,
        leader,
        challenger,
      };
    })
    .filter(Boolean);
}

export function buildStorylineCards(league) {
  const cards = [];
  const user = getUserTeam(league);
  if (!league || !user) return cards;
  const streak = computeStreak(user?.recentResults ?? []);
  const teamMap = getTeamMap(league);

  if (streak?.count >= 3) {
    cards.push({
      id: `streak-${streak.type}-${streak.count}`,
      category: 'standings',
      priority: streak.type === 'L' ? 95 : 82,
      tone: streak.type === 'L' ? 'danger' : 'success',
      title: streak.type === 'W' ? `${user.abbr ?? user.name} are rolling (${streak.count}-game win streak)` : `${user.abbr ?? user.name} are slipping (${streak.count} straight losses)`,
      detail: streak.type === 'W' ? 'Momentum is real right now — this week can strengthen your playoff footing.' : 'Every game now changes your playoff odds and locker-room mood.',
      tab: 'Game Plan',
    });
  }

  const next = getNextUserGameContext(league);
  const opp = next ? teamMap.get(next.oppId) : null;
  if (next && opp) {
    if (next.rematch) {
      cards.push({
        id: `rematch-${opp.id}-${next.nextWeek}`,
        category: 'rivalry',
        priority: 78,
        tone: 'warning',
        title: `Rematch week vs ${opp.abbr ?? opp.name}`,
        detail: 'You have already seen this opponent this season. Adjustments matter more than surprises.',
        tab: 'Schedule',
      });
    }
    if (next.backToBackOpponent) {
      cards.push({
        id: `b2b-${opp.id}-${next.nextWeek}`,
        category: 'rivalry',
        priority: 74,
        tone: 'warning',
        title: `Back-to-back test against ${opp.abbr ?? opp.name}`,
        detail: 'Consecutive games against the same team amplify matchup edges and coaching counters.',
        tab: 'Game Plan',
      });
    }
  }

  if (league?.phase === 'regular') {
    const confRank = rankConference(league?.teams ?? [], user.conf);
    const myIdx = confRank.findIndex((e) => e.team.id === user.id);
    if (myIdx >= 0) {
      const mySeed = myIdx + 1;
      if (mySeed <= 9) {
        const edge = confRank[6];
        const behind = confRank[7];
        if (mySeed <= 7 && edge && behind) {
          cards.push({
            id: `playoff-edge-${league.week}`,
            category: 'playoff_race',
            priority: 88,
            tone: 'info',
            title: `Playoff line watch: #${edge.seed} ${edge.team.abbr} vs #${behind.seed} ${behind.team.abbr}`,
            detail: `You are currently #${mySeed} in conference position. One result can swing control of the race.`,
            tab: 'Standings',
          });
        } else if (mySeed > 7) {
          const gapTo7 = confRank[6] ? (getWinPct(confRank[6].team) - getWinPct(user)).toFixed(3) : null;
          cards.push({
            id: `playoff-chase-${league.week}`,
            category: 'playoff_race',
            priority: 90,
            tone: 'danger',
            title: 'Playoff hopes hanging by a thread',
            detail: gapTo7 ? `You are outside the top 7. Gap to #7 seed is ${gapTo7} win%.` : 'You are outside the top 7 and need immediate results.',
            tab: 'Standings',
          });
        }
      }
    }
  }

  const awardLeaders = getAwardLeaders(league);
  if (awardLeaders.length > 0) {
    const mvp = awardLeaders.find((a) => a.key === 'mvp') ?? awardLeaders[0];
    const challenger = mvp.challenger;
    cards.push({
      id: `award-${mvp.key}-${league.week ?? 1}`,
      category: 'awards_race',
      priority: 72,
      tone: 'info',
      title: `${mvp.label} race: ${mvp.leader.name}${mvp.leader.teamAbbr ? ` (${mvp.leader.teamAbbr})` : ''} leads`,
      detail: challenger
        ? `${challenger.name}${challenger.teamAbbr ? ` (${challenger.teamAbbr})` : ''} is the closest challenger right now.`
        : 'No clear challenger has separated yet.',
      tab: 'Award Races',
      awardRace: mvp,
    });
  }

  const injuries = (user?.roster ?? []).filter((p) => p?.injury || safeNum(p?.injuredWeeks) > 0);
  if (injuries.length >= 2) {
    const topInjury = injuries[0];
    cards.push({
      id: `injury-${league.week}-${topInjury?.id ?? 'team'}`,
      category: 'injury_fallout',
      priority: 86,
      tone: 'danger',
      title: `Injury fallout: ${injuries.length} active absences`,
      detail: topInjury?.name ? `${topInjury.pos} ${topInjury.name} is part of a stretched depth chart week.` : 'Depth chart stress is building this week.',
      tab: 'Injuries',
    });
  }

  const offers = Array.isArray(league?.incomingTradeOffers) ? league.incomingTradeOffers : [];
  if (offers.length > 0) {
    const offer = offers[0];
    cards.push({
      id: `trade-${offer.id ?? league.week}`,
      category: 'trade_fallout',
      priority: 70,
      tone: 'info',
      title: `Trade fallout: ${offer.offeringTeamAbbr ?? 'League'} is targeting your roster`,
      detail: offer.reason ?? 'Incoming trade pressure suggests shifting league demand.',
      tab: 'Trades',
    });
  }

  const honors = deriveWeeklyHonors(league);
  if (honors?.statementWin) {
    cards.push({
      id: `statement-week-${honors.week}`,
      category: 'major_result',
      priority: 91,
      tone: 'warning',
      title: `Statement win from Week ${honors.week}`,
      detail: honors.statementWin.detail,
      tab: 'Schedule',
    });
  }

  if (honors?.topScoringGame) {
    const awayId = normalizeTeamId(honors.topScoringGame.away);
    const homeId = normalizeTeamId(honors.topScoringGame.home);
    const away = teamMap.get(awayId);
    const home = teamMap.get(homeId);
    cards.push({
      id: `shootout-week-${honors.week}`,
      category: 'major_result',
      priority: 76,
      tone: 'info',
      title: `Top-scoring game of Week ${honors.week}`,
      detail: `${away?.abbr ?? 'AWY'} ${honors.topScoringGame.awayScore}-${honors.topScoringGame.homeScore} ${home?.abbr ?? 'HME'} set the scoring pace.`,
      tab: 'Schedule',
    });
  }

  if (next) {
    const weekData = (league?.schedule?.weeks ?? []).find((w) => safeNum(w?.week) === next.nextWeek);
    const game = (weekData?.games ?? []).find((g) => {
      const h = normalizeTeamId(g?.home);
      const a = normalizeTeamId(g?.away);
      return h === league?.userTeamId || a === league?.userTeamId;
    });
    const angles = game ? derivePregameAngles({ league, game, week: next.nextWeek }) : [];
    if (angles.length) {
      cards.push({
        id: `pregame-angle-${next.nextWeek}`,
        category: 'pregame',
        priority: 79,
        tone: 'info',
        title: `Pregame focus: ${angles[0].label}`,
        detail: 'Matchup framing is now tied to schedule, standings, and recent form.',
        tab: 'Weekly Hub',
      });
    }
  }

  return cards.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, 6);
}

export function buildNarrativeNewsItems(league) {
  const stories = buildStorylineCards(league);
  const storyItems = stories.map((s, idx) => ({
    id: `story-${s.id}`,
    headline: s.title,
    body: s.detail,
    priority: s.priority >= 88 ? 'high' : s.priority >= 74 ? 'medium' : 'low',
    week: league?.week,
    season: league?.year,
    teamId: league?.userTeamId ?? null,
    type: `story_${s.category}`,
    source: 'storyline',
    category: s.category,
    sortWeight: 500 - idx,
    tab: s.tab,
  }));

  const weekly = deriveWeeklyHonors(league);
  const weeklyItems = [];
  if (weekly?.story) {
    weeklyItems.push({
      id: `weekly-headline-${weekly.week}`,
      headline: `Week ${weekly.week} headline: ${weekly.story.headline}`,
      body: weekly.story.detail,
      priority: weekly.story.tag === 'Upset' ? 'high' : 'medium',
      week: weekly.week,
      season: league?.year,
      teamId: weekly.story.winnerId ?? null,
      type: 'story_major_result',
      source: 'storyline',
      category: 'major_result',
      sortWeight: 540,
      tab: 'Schedule',
    });
  }

  if (weekly?.playerOfWeek) {
    weeklyItems.push({
      id: `weekly-player-${weekly.week}-${weekly.playerOfWeek.playerId ?? 'na'}`,
      headline: `Week ${weekly.week}: Player of the Week — ${weekly.playerOfWeek.name}`,
      body: weekly.playerOfWeek.line
        ? `${weekly.playerOfWeek.pos ?? 'Player'} delivered: ${weekly.playerOfWeek.line}.`
        : 'Top single-game impact of the week.',
      priority: 'medium',
      week: weekly.week,
      season: league?.year,
      teamId: weekly.playerOfWeek.teamId ?? null,
      type: 'story_major_result',
      source: 'storyline',
      category: 'major_result',
      sortWeight: 535,
      tab: 'Schedule',
    });
  }

  return [...weeklyItems, ...storyItems];
}
