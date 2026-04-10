import { buildNarrativeNewsItems } from './leagueNarratives.js';

const CATEGORY_MAP = {
  standings: 'playoff_race',
  playoff_race: 'playoff_race',
  awards_race: 'awards',
  injury: 'injury',
  injury_fallout: 'injury',
  trade_completed: 'transaction',
  trade_fallout: 'transaction',
  cpu_trade: 'transaction',
  free_agent_signed: 'transaction',
  record_broken: 'league',
  story_standings: 'playoff_race',
  story_playoff_race: 'playoff_race',
  story_awards_race: 'awards',
  story_injury_fallout: 'injury',
  story_trade_fallout: 'transaction',
  story_rivalry: 'rivalry',
  major_result: 'result',
  story_major_result: 'result',
  pregame: 'team',
  story_pregame: 'team',
  coaching_carousel: 'league',
  coaching_transition: 'league',
  coaching_continuity: 'league',
  story_coaching_carousel: 'league',
  story_coaching_transition: 'league',
  story_coaching_continuity: 'league',
  culture: 'team',
};

const CATEGORY_LABEL = {
  team: 'Team',
  league: 'League',
  transaction: 'Transactions',
  playoff_race: 'Playoff Race',
  injury: 'Injuries',
  awards: 'Awards',
  rivalry: 'Rivalry',
  result: 'Featured Result',
};

function classify(item, userTeamId) {
  const raw = String(item?.category ?? item?.type ?? '').toLowerCase();
  const mapped = CATEGORY_MAP[raw] ?? (Number(item?.teamId) === Number(userTeamId) ? 'team' : 'league');
  return {
    bucket: mapped,
    label: CATEGORY_LABEL[mapped] ?? 'League',
    teamRelevant: Number(item?.teamId) === Number(userTeamId),
  };
}

function score(item, index, userTeamId) {
  const priority = item?.priority === 'high' ? 320 : item?.priority === 'medium' ? 190 : 90;
  const relevance = Number(item?.teamId) === Number(userTeamId) ? 90 : 0;
  const storyline = item?.source === 'storyline' ? 70 : 0;
  return priority + relevance + storyline + Math.max(0, 50 - index) + Number(item?.sortWeight ?? 0);
}

export function buildNewsDeskModel(league, { segment = 'all', limit = 60 } = {}) {
  const rawNews = Array.isArray(league?.newsItems) ? league.newsItems : [];
  const storylineNews = buildNarrativeNewsItems(league);
  const userTeamId = Number(league?.userTeamId);

  const merged = [...storylineNews, ...rawNews]
    .map((item, index) => {
      const classified = classify(item, userTeamId);
      return {
        ...item,
        _bucket: classified.bucket,
        _categoryLabel: classified.label,
        _teamRelevant: classified.teamRelevant,
        _score: score(item, index, userTeamId),
      };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

  const filtered = merged.filter((item) => {
    if (segment === 'team') return item._teamRelevant;
    if (segment === 'league') return !item._teamRelevant;
    if (segment === 'transactions') return item._bucket === 'transaction';
    return true;
  });

  const featured = filtered[0] ?? null;
  const topStories = filtered.slice(1, 5);
  const teamStories = filtered.filter((item) => item._teamRelevant).slice(0, 4);
  const leagueStories = filtered.filter((item) => !item._teamRelevant && item._bucket !== 'transaction').slice(0, 4);
  const transactions = filtered.filter((item) => item._bucket === 'transaction').slice(0, 4);

  return {
    merged,
    filtered,
    featured,
    topStories,
    teamStories,
    leagueStories,
    transactions,
    recap: filtered.filter((item) => item._bucket === 'result' || item._bucket === 'playoff_race').slice(0, 3),
  };
}
