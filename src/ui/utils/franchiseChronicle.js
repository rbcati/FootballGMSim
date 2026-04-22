function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getUserTeam(league) {
  return (league?.teams ?? []).find((team) => Number(team?.id) === Number(league?.userTeamId)) ?? null;
}

function getPlayedUserGames(league) {
  const userId = Number(league?.userTeamId);
  const rows = [];
  for (const week of [...(league?.schedule?.weeks ?? [])].sort((a, b) => safeNum(a?.week) - safeNum(b?.week))) {
    for (const game of week?.games ?? []) {
      if (!game?.played) continue;
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      if (homeId !== userId && awayId !== userId) continue;
      rows.push({ game, week: safeNum(week?.week, 1), homeId, awayId });
    }
  }
  return rows;
}

function deriveMomentHeadline(game, fallbackLabel) {
  const logs = game?.boxScore?.playLogs;
  if (Array.isArray(logs) && logs.length) {
    const first = logs.find((entry) => typeof entry === 'string' || entry?.text);
    const text = typeof first === 'string' ? first : first?.text;
    if (typeof text === 'string' && text.trim()) {
      const compact = text.replace(/\s+/g, ' ').trim();
      return compact.length > 110 ? `${compact.slice(0, 107).trimEnd()}…` : compact;
    }
  }
  return fallbackLabel;
}

function buildStandingsPosition(league, team) {
  const confTeams = (league?.teams ?? []).filter((candidate) => Number(candidate?.conf) === Number(team?.conf));
  const ranked = [...confTeams].sort((a, b) => {
    const aGames = safeNum(a?.wins) + safeNum(a?.losses) + safeNum(a?.ties);
    const bGames = safeNum(b?.wins) + safeNum(b?.losses) + safeNum(b?.ties);
    const aPct = aGames ? (safeNum(a?.wins) + safeNum(a?.ties) * 0.5) / aGames : 0;
    const bPct = bGames ? (safeNum(b?.wins) + safeNum(b?.ties) * 0.5) / bGames : 0;
    if (bPct !== aPct) return bPct - aPct;
    return safeNum(b?.ptsFor) - safeNum(a?.ptsFor);
  });
  const index = ranked.findIndex((candidate) => Number(candidate?.id) === Number(team?.id));
  return index >= 0 ? index + 1 : null;
}

function resolveStandout(game, team) {
  const playerOfGame = game?.summary?.playerOfGame;
  if (playerOfGame?.name) {
    return {
      name: playerOfGame.name,
      detail: playerOfGame?.statLine ?? playerOfGame?.summary ?? 'Player of the game',
    };
  }
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const best = [...roster].sort((a, b) => safeNum(b?.ovr) - safeNum(a?.ovr))[0];
  return best
    ? { name: `${best?.firstName ?? ''} ${best?.lastName ?? ''}`.trim() || best?.name || `Player ${best?.id}`, detail: `${best?.pos ?? 'POS'} · ${safeNum(best?.ovr)} OVR` }
    : null;
}

function findFranchiseEvents(league, week, team) {
  const abbr = String(team?.abbr ?? '').toUpperCase();
  const headlines = (league?.newsItems ?? [])
    .filter((item) => safeNum(item?.week ?? item?.meta?.week ?? week) === week)
    .map((item) => item?.headline ?? item?.title ?? '')
    .filter((line) => typeof line === 'string' && line.trim());

  return headlines
    .filter((line) => !abbr || line.toUpperCase().includes(abbr))
    .slice(0, 3);
}

function formatResult({ won, tied, awayAbbr, homeAbbr, awayScore, homeScore }) {
  if (tied) return `T ${awayAbbr} ${awayScore}-${homeScore} ${homeAbbr}`;
  return `${won ? 'W' : 'L'} ${awayAbbr} ${awayScore}-${homeScore} ${homeAbbr}`;
}

function buildChronicleEntry({ league, team, week, game }) {
  const homeAbbr = game?.home?.abbr ?? 'HOME';
  const awayAbbr = game?.away?.abbr ?? 'AWAY';
  const homeScore = safeNum(game?.homeScore ?? game?.score?.home);
  const awayScore = safeNum(game?.awayScore ?? game?.score?.away);
  const userIsHome = Number(game?.home?.id ?? game?.home) === Number(team?.id);
  const won = userIsHome ? homeScore > awayScore : awayScore > homeScore;
  const tied = homeScore === awayScore;
  const result = tied ? 'T' : won ? 'W' : 'L';
  const fallbackHeadline = won
    ? `${team?.abbr ?? team?.name ?? 'Team'} closes out ${awayAbbr} ${awayScore}-${homeScore} ${homeAbbr}`
    : `${team?.abbr ?? team?.name ?? 'Team'} drops a tough one ${awayAbbr} ${awayScore}-${homeScore} ${homeAbbr}`;

  return {
    id: `${safeNum(league?.seasonId, league?.year)}-wk${week}-${game?.id ?? `${awayAbbr}-${homeAbbr}`}`,
    season: safeNum(league?.year, safeNum(league?.seasonId, 0)),
    week,
    result,
    score: { away: awayScore, home: homeScore, awayAbbr, homeAbbr },
    summary: formatResult({ won, tied, awayAbbr, homeAbbr, awayScore, homeScore }),
    headline: deriveMomentHeadline(game, fallbackHeadline),
    standingsPosition: buildStandingsPosition(league, team),
    standout: resolveStandout(game, team),
    events: findFranchiseEvents(league, week, team),
    moments: Array.isArray(game?.boxScore?.playLogs)
      ? game.boxScore.playLogs.slice(-3).map((entry, idx) => ({ id: `m-${week}-${idx}`, text: typeof entry === 'string' ? entry : entry?.text ?? 'Key moment' }))
      : [],
  };
}

function buildSeasonInReview(league, team) {
  const games = safeNum(team?.wins) + safeNum(team?.losses) + safeNum(team?.ties);
  const regularSeasonComplete = games >= 17 || String(league?.phase ?? '').toLowerCase().includes('offseason');
  if (!regularSeasonComplete) return null;

  const breakout = [...(team?.roster ?? [])]
    .sort((a, b) => safeNum(b?.stats?.recYd ?? b?.stats?.passYd ?? b?.stats?.rushYd) - safeNum(a?.stats?.recYd ?? a?.stats?.passYd ?? a?.stats?.rushYd))[0];
  const breakoutYards = breakout ? safeNum(breakout?.stats?.recYd ?? breakout?.stats?.passYd ?? breakout?.stats?.rushYd) : 0;
  const divisionTitle = buildStandingsPosition(league, team) === 1;

  return {
    season: safeNum(league?.year, safeNum(league?.seasonId, 0)),
    text: `${safeNum(league?.year, 0)} Season: ${safeNum(team?.wins)}-${safeNum(team?.losses)}${safeNum(team?.ties) ? `-${safeNum(team?.ties)}` : ''}${divisionTitle ? ', Division Leaders' : ''}.${breakout ? ` Breakout star: ${breakout?.pos ?? 'Player'} ${breakout?.lastName ?? breakout?.name ?? ''} ${breakoutYards} yds.` : ''}`,
  };
}

export const CHRONICLE_BADGES = [
  { id: 'first_playoff_berth', label: 'First Playoff Berth', description: 'Reach the postseason for the first time.' },
  { id: 'ten_win_season', label: '10-Win Season', description: 'Finish a season with 10+ wins.' },
  { id: 'draft_steal', label: 'Draft Steal Found', description: 'Start a rookie selected outside round 1 at 80+ OVR.' },
  { id: 'cap_wizard', label: 'Cap Wizard', description: 'Carry positive cap room while 3+ starters are re-signed.' },
];

function deriveBadgeState(league, team, chronicle) {
  const rookies = (team?.roster ?? []).filter((player) => safeNum(player?.yearsPro, 0) <= 1);
  const expiring = (team?.roster ?? []).filter((player) => safeNum(player?.contract?.yearsRemaining ?? player?.contract?.years, 0) <= 1 && safeNum(player?.ovr) >= 75);

  const unlocked = {
    first_playoff_berth: Boolean(team?.playoffAppearances ?? team?.playoffSeed ?? team?.madePlayoffs),
    ten_win_season: safeNum(team?.wins) >= 10,
    draft_steal: rookies.some((player) => safeNum(player?.draft?.round, 9) >= 2 && safeNum(player?.ovr) >= 80),
    cap_wizard: safeNum(team?.capRoom, safeNum(team?.salaryCap, 0) - safeNum(team?.payroll, 0)) > 0 && expiring.length >= 3,
  };

  return CHRONICLE_BADGES.map((badge) => ({
    ...badge,
    unlocked: Boolean(unlocked[badge.id]),
    unlockedOn: unlocked[badge.id] ? `${safeNum(league?.year, 0)} Week ${safeNum(league?.week, 1)}` : null,
  }));
}

export function syncFranchiseChronicle(league) {
  if (!league || typeof league !== 'object') return { entries: [], seasonReview: null, badges: [] };
  if (!Array.isArray(league.franchiseChronicle)) league.franchiseChronicle = [];

  const team = getUserTeam(league);
  if (!team) return { entries: [], seasonReview: null, badges: [] };

  const existing = new Set(league.franchiseChronicle.map((entry) => entry?.id).filter(Boolean));
  for (const row of getPlayedUserGames(league)) {
    const entry = buildChronicleEntry({ league, team, week: row.week, game: row.game });
    if (!existing.has(entry.id)) {
      league.franchiseChronicle.push(entry);
      existing.add(entry.id);
    }
  }

  league.franchiseChronicle = [...league.franchiseChronicle]
    .sort((a, b) => (safeNum(a?.season) - safeNum(b?.season)) || (safeNum(a?.week) - safeNum(b?.week)))
    .slice(-340);

  const seasonReview = buildSeasonInReview(league, team);
  if (seasonReview) {
    if (!Array.isArray(league.franchiseSeasonReviews)) league.franchiseSeasonReviews = [];
    const hasReview = league.franchiseSeasonReviews.some((entry) => safeNum(entry?.season) === safeNum(seasonReview?.season));
    if (!hasReview) league.franchiseSeasonReviews.push(seasonReview);
  }

  const badges = deriveBadgeState(league, team, league.franchiseChronicle);
  return {
    entries: league.franchiseChronicle,
    seasonReview: seasonReview ?? [...(league.franchiseSeasonReviews ?? [])].slice(-1)[0] ?? null,
    badges,
  };
}
