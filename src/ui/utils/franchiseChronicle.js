function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const CHRONICLE_CAP = 340;

const CANONICAL_EVENT_TYPES = new Set(['game', 'trade', 'contract', 'draft', 'injury', 'milestone', 'custom', 'event']);

const EVENT_TYPE_ALIASES = {
  con: 'contract',
  contract_extension: 'contract',
  contract_signing: 'contract',
  extension: 'contract',
  re_signing: 'contract',
  resigning: 'contract',
  trd: 'trade',
  trade_completed: 'trade',
  draft_pick: 'draft',
  rookie: 'draft',
  hurt: 'injury',
  weekly_event_auto_resolve: 'event',
  weekly_event_decision: 'event',
  weekly_event: 'event',
};

export const CHRONICLE_EVENT_LABELS = {
  game: 'Game',
  trade: 'Trade',
  contract: 'Contract',
  draft: 'Draft',
  injury: 'Injury',
  milestone: 'Milestone',
  custom: 'Event',
  event: 'Event',
};

function normalizeEventType(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, '_').replaceAll('-', '_');
  const aliased = EVENT_TYPE_ALIASES[normalized] ?? normalized;
  return CANONICAL_EVENT_TYPES.has(aliased) ? aliased : null;
}

export function resolveChronicleEventType(entry = {}) {
  const explicit = normalizeEventType(entry?.type);
  if (explicit) return explicit;
  const metaType = normalizeEventType(entry?.meta?.type);
  if (metaType) return metaType;

  const result = String(entry?.result ?? '').trim().toUpperCase();
  const hasScore = Boolean(entry?.score)
    || entry?.homeScore != null
    || entry?.awayScore != null
    || entry?.scoreHome != null
    || entry?.scoreAway != null;
  if (['W', 'L', 'T'].includes(result) || hasScore) return 'game';

  return 'event';
}

function slugify(value, fallback = 'event') {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44);
  return slug || fallback;
}

function compareChronicleEntries(a, b) {
  return (safeNum(a?.season) - safeNum(b?.season))
    || (safeNum(a?.week) - safeNum(b?.week))
    || String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

function ensureUniqueChronicleId(league, baseId) {
  const existing = new Set((league?.franchiseChronicle ?? []).map((entry) => String(entry?.id ?? '')).filter(Boolean));
  let id = String(baseId ?? 'chronicle-event');
  let index = 2;
  while (existing.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }
  return id;
}

function buildEventId({ league, payload, season, week, type }) {
  if (payload?.id) return ensureUniqueChronicleId(league, payload.id);
  const key = payload?.key
    ?? payload?.meta?.eventId
    ?? payload?.meta?.playerId
    ?? payload?.playerId
    ?? payload?.headline
    ?? payload?.summary
    ?? payload?.outcome
    ?? type;
  return ensureUniqueChronicleId(league, `${season}-wk${week}-${type}-${slugify(key, type)}`);
}

function trimText(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function getPlayerName(player) {
  if (!player) return null;
  if (typeof player === 'string') return trimText(player);
  return trimText(player?.name ?? `${player?.firstName ?? ''} ${player?.lastName ?? ''}`) ?? (player?.id != null ? `Player ${player.id}` : null);
}

function normalizePlayerMeta(player) {
  const name = getPlayerName(player);
  if (!name) return null;
  if (typeof player === 'string') return { name };
  return {
    id: player?.id ?? player?.playerId ?? null,
    name,
    pos: player?.pos ?? player?.position ?? null,
    ovr: player?.ovr ?? player?.overall ?? null,
  };
}

function normalizePlayerList(value) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.map(normalizePlayerMeta).filter(Boolean);
}

function normalizeLabelList(value) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows
    .map((item) => {
      if (typeof item === 'string') return trimText(item);
      return trimText(item?.label ?? item?.name ?? item?.abbr ?? item?.teamAbbr ?? item?.teamName);
    })
    .filter(Boolean);
}

function normalizePickLabel(pick) {
  if (!pick) return null;
  if (typeof pick === 'string') return trimText(pick);
  if (pick?.label) return trimText(pick.label);
  const year = pick?.year ?? pick?.season;
  const round = pick?.round ?? pick?.rd;
  const number = pick?.pick ?? pick?.overall ?? pick?.selection;
  const parts = [
    year ? `${year}` : null,
    round ? `Round ${round}` : null,
    number ? `Pick ${number}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function normalizePickLabels(value) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.map(normalizePickLabel).filter(Boolean);
}

function normalizeChronicleEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const type = resolveChronicleEventType(entry);
  const rawType = entry?.type ?? entry?.meta?.type;
  const sourceType = rawType && normalizeEventType(rawType) !== type ? rawType : entry?.meta?.sourceType;
  return {
    ...entry,
    type,
    meta: { ...(entry?.meta ?? {}), ...(sourceType ? { sourceType } : {}), type },
  };
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
    type: 'game',
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
    meta: { type: 'game', gameId: game?.id ?? null },
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


export function logChronicleEvent(league, payload = {}) {
  if (!league || typeof league !== 'object') return null;
  if (!Array.isArray(league.franchiseChronicle)) league.franchiseChronicle = [];

  const week = safeNum(payload?.week, safeNum(league?.week, 1));
  const season = safeNum(payload?.season, safeNum(league?.year, 0));
  const type = resolveChronicleEventType(payload);
  const entry = normalizeChronicleEntry({
    ...payload,
    id: buildEventId({ league, payload, season, week, type }),
    type,
    season,
    week,
    result: payload?.result ?? 'EVT',
    summary: payload?.summary ?? payload?.headline ?? 'Franchise event',
    headline: payload?.headline ?? 'Franchise event update',
    events: Array.isArray(payload?.events) ? payload.events : [payload?.outcome].filter(Boolean),
    standout: payload?.standout ?? null,
    moments: Array.isArray(payload?.moments) ? payload.moments : [],
    meta: { ...(payload?.meta ?? {}), type },
  });

  league.franchiseChronicle.push(entry);
  league.franchiseChronicle = [...league.franchiseChronicle]
    .map(normalizeChronicleEntry)
    .filter(Boolean)
    .sort(compareChronicleEntries)
    .slice(-CHRONICLE_CAP);
  return entry;
}

export function logTradeOutcome(league, payload = {}) {
  const players = normalizePlayerList(payload?.players ?? payload?.player ?? payload?.playerName);
  const incomingPlayers = normalizePlayerList(payload?.incomingPlayers ?? payload?.acquiredPlayers ?? payload?.receivedPlayers);
  const outgoingPlayers = normalizePlayerList(payload?.outgoingPlayers ?? payload?.sentPlayers ?? payload?.tradedPlayers);
  const picks = normalizePickLabels(payload?.picks ?? payload?.draftPicks ?? payload?.pick);
  const incomingPicks = normalizePickLabels(payload?.incomingPicks ?? payload?.acquiredPicks);
  const outgoingPicks = normalizePickLabels(payload?.outgoingPicks ?? payload?.sentPicks);
  const teams = normalizeLabelList(payload?.teams ?? payload?.teamLabels ?? [payload?.fromTeam, payload?.toTeam].filter(Boolean));

  return logChronicleEvent(league, {
    ...payload,
    type: 'trade',
    result: payload?.result ?? 'TRD',
    headline: payload?.headline ?? 'Trade talks concluded',
    summary: payload?.summary ?? payload?.reasoning ?? 'Trade negotiation completed.',
    outcome: payload?.outcome,
    meta: {
      ...(payload?.meta ?? {}),
      players,
      incomingPlayers,
      outgoingPlayers,
      picks,
      incomingPicks,
      outgoingPicks,
      teams,
    },
  });
}

export function logContractOutcome(league, payload = {}) {
  const player = normalizePlayerMeta(payload?.player ?? payload?.playerName);
  const years = payload?.years ?? payload?.contractYears ?? payload?.termYears ?? payload?.contract?.years ?? payload?.contract?.yearsRemaining ?? null;
  const totalValue = payload?.totalValue ?? payload?.contractValue ?? payload?.totalMoney ?? payload?.contract?.totalValue ?? payload?.contract?.value ?? null;
  const aav = payload?.aav ?? payload?.annualValue ?? payload?.contract?.aav ?? payload?.contract?.baseAnnual ?? payload?.contract?.salary ?? null;

  return logChronicleEvent(league, {
    ...payload,
    type: 'contract',
    result: payload?.result ?? 'CON',
    headline: payload?.headline ?? 'Contract negotiation update',
    summary: payload?.summary ?? payload?.outcome ?? 'Contract decision recorded.',
    meta: {
      ...(payload?.meta ?? {}),
      player,
      years,
      totalValue,
      aav,
    },
  });
}

export function logDraftOutcome(league, payload = {}) {
  const player = normalizePlayerMeta(payload?.player ?? payload?.playerName);
  const round = payload?.round ?? payload?.draftRound ?? payload?.pick?.round ?? null;
  const pick = payload?.pickNumber ?? payload?.overallPick ?? payload?.selection ?? payload?.pick?.pick ?? payload?.pick?.overall ?? null;
  const pickLabel = normalizePickLabel(payload?.pickLabel ?? (typeof payload?.pick === 'object' ? payload.pick : null) ?? { year: payload?.season ?? league?.year, round, pick });
  const fallbackSummary = [pickLabel, player?.pos, player?.ovr != null ? `${player.ovr} OVR` : null].filter(Boolean).join(' - ') || 'Draft decision recorded.';

  return logChronicleEvent(league, {
    ...payload,
    type: 'draft',
    result: payload?.result ?? 'DRF',
    headline: payload?.headline ?? (player?.name ? `${player.name} joins the draft class` : 'Draft pick recorded'),
    summary: payload?.summary ?? fallbackSummary,
    meta: {
      ...(payload?.meta ?? {}),
      player,
      round,
      pick,
      pickLabel,
      potential: payload?.potential ?? payload?.pot ?? payload?.player?.potential ?? payload?.player?.pot ?? null,
    },
  });
}

export function logInjuryEvent(league, payload = {}) {
  const player = normalizePlayerMeta(payload?.player ?? payload?.playerName);
  const injury = trimText(payload?.injury ?? payload?.injuryLabel ?? payload?.detail ?? payload?.description ?? payload?.player?.injury?.label);
  const duration = trimText(payload?.duration ?? payload?.durationLabel ?? payload?.weeks ?? payload?.gamesRemaining ?? payload?.player?.injury?.duration);
  const fallbackSummary = [injury, duration].filter(Boolean).join(' - ') || 'Injury event recorded.';

  return logChronicleEvent(league, {
    ...payload,
    type: 'injury',
    result: payload?.result ?? 'INJ',
    headline: payload?.headline ?? (player?.name ? `${player.name} injury update` : 'Injury update'),
    summary: payload?.summary ?? fallbackSummary,
    meta: {
      ...(payload?.meta ?? {}),
      player,
      injury,
      duration,
    },
  });
}

export function logMilestoneEvent(league, payload = {}) {
  const label = trimText(payload?.label ?? payload?.milestone ?? payload?.headline);
  const description = trimText(payload?.description ?? payload?.summary ?? payload?.outcome);
  const unlockedOn = trimText(payload?.unlockedOn ?? payload?.date ?? `${safeNum(payload?.season, safeNum(league?.year, 0))} Week ${safeNum(payload?.week, safeNum(league?.week, 1))}`);

  return logChronicleEvent(league, {
    ...payload,
    type: 'milestone',
    result: payload?.result ?? 'MIL',
    headline: payload?.headline ?? label ?? 'Milestone reached',
    summary: payload?.summary ?? description ?? 'Franchise milestone recorded.',
    meta: {
      ...(payload?.meta ?? {}),
      label,
      description,
      unlockedOn,
    },
  });
}

export function syncFranchiseChronicle(league) {
  if (!league || typeof league !== 'object') return { entries: [], seasonReview: null, badges: [] };
  if (!Array.isArray(league.franchiseChronicle)) league.franchiseChronicle = [];

  league.franchiseChronicle = league.franchiseChronicle
    .map(normalizeChronicleEntry)
    .filter(Boolean);

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
    .map(normalizeChronicleEntry)
    .filter(Boolean)
    .sort(compareChronicleEntries)
    .slice(-CHRONICLE_CAP);

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
