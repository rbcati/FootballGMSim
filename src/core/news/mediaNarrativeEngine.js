/**
 * mediaNarrativeEngine.js — League Media Desk V1
 *
 * Pure, deterministic module. No Math.random, no UI imports, no worker imports.
 * All outputs are immutable new objects. Inputs are never mutated.
 *
 * Exported API:
 *   MEDIA_STORY_TYPES           — story type constants
 *   MEDIA_STORY_MAX             — default max story count
 *   buildMediaNarratives(league, options) → story[]  — top-level entry point
 *   selectMediaStories(context)           → story[]  — gather + dedup candidates
 *   rankMediaStories(stories, options)    → story[]  — deterministic ranking
 *   buildMediaHeadline(story)             → { headline, dek }
 *   getMediaStoryTypeLabel(type)          → string
 *   makeStableStoryId(...parts)           → string
 *   dedupeMediaStories(stories)           → story[]
 *   extractHotSeatStories(league)         → story[]
 *   extractBlockbusterTradeStories(league) → story[]
 *   extractMandateStories(league)         → story[]
 *   extractPrestigeStories(league)        → story[]
 *   extractPlayoffPushStories(league)     → story[]
 */

// ── Story type constants ───────────────────────────────────────────────────────

export const MEDIA_STORY_TYPES = Object.freeze({
  OWNER_PRESSURE:    'OWNER_PRESSURE',
  BLOCKBUSTER_TRADE: 'BLOCKBUSTER_TRADE',
  MANDATE_SURGE:     'MANDATE_SURGE',
  MANDATE_SLIP:      'MANDATE_SLIP',
  PRESTIGE_HONOR:    'PRESTIGE_HONOR',
  WAIVER_MOVE:       'WAIVER_MOVE',
  PLAYOFF_PUSH:      'PLAYOFF_PUSH',
  LEGACY_MILESTONE:  'LEGACY_MILESTONE',
});

const _TYPE_LABELS = Object.freeze({
  OWNER_PRESSURE:    'Owner Pressure',
  BLOCKBUSTER_TRADE: 'Blockbuster Trade',
  MANDATE_SURGE:     'Surging',
  MANDATE_SLIP:      'Under Pressure',
  PRESTIGE_HONOR:    'League Honor',
  WAIVER_MOVE:       'Waiver Wire',
  PLAYOFF_PUSH:      'Playoff Race',
  LEGACY_MILESTONE:  'Legacy',
});

export const MEDIA_STORY_MAX = 8;

// ── Internal helpers ──────────────────────────────────────────────────────────

function _n(v, fallback = 0) {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function _titleCase(str) {
  return String(str ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Public utilities ──────────────────────────────────────────────────────────

/**
 * Returns a stable deterministic ID from a list of string/number parts.
 * @param {...(string|number)} parts
 * @returns {string}
 */
export function makeStableStoryId(...parts) {
  return parts.map(String).join('-');
}

/**
 * Removes duplicate stories by id, preserving first occurrence.
 * @param {Object[]} stories
 * @returns {Object[]}
 */
export function dedupeMediaStories(stories) {
  const seen = new Set();
  return stories.filter((s) => {
    if (!s?.id || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

/**
 * Returns a short UI label for a story type.
 * @param {string} type
 * @returns {string}
 */
export function getMediaStoryTypeLabel(type) {
  return _TYPE_LABELS[type] ?? (type ? _titleCase(type) : 'Update');
}

// ── Story extractors ──────────────────────────────────────────────────────────

/**
 * Generate OWNER_PRESSURE stories from teams with elevated hot-seat ratings.
 * Only surfaces teams with hotSeatRating >= 60 to avoid noise.
 * @param {Object} league
 * @returns {Object[]}
 */
export function extractHotSeatStories(league) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const season = _n(league?.year ?? league?.season);
  const week = _n(league?.week);
  const stories = [];

  for (const team of teams) {
    const owner = team?.owner;
    if (!owner) continue;

    const rating = _n(owner.hotSeatRating, 25);
    if (rating < 60) continue;

    const mandate = owner.mandate ?? 'MAKE_PLAYOFFS';
    const mandateLabel = _titleCase(mandate);
    const seasonsUnder = _n(owner.seasonsUnderGoal);
    const tone = rating >= 80 ? 'urgent' : 'warning';
    const teamAbbr = team.abbr ?? team.name ?? 'Team';

    const id = makeStableStoryId(
      'owner-pressure',
      team.id ?? teamAbbr,
      season,
      rating >= 80 ? 'high' : 'mid',
    );

    const headline = rating >= 80
      ? `${teamAbbr} Front Office on Hot Seat`
      : `Pressure Mounting on ${teamAbbr}`;

    let dek = `Mandate: ${mandateLabel}. Job-security index at ${rating}/100`;
    if (seasonsUnder > 0) {
      dek += ` — ${seasonsUnder} consecutive season${seasonsUnder === 1 ? '' : 's'} below expectations`;
    }
    dek += '.';

    stories.push({
      id,
      type:            MEDIA_STORY_TYPES.OWNER_PRESSURE,
      priority:        Math.min(95, rating),
      week,
      season,
      teamId:          team.id ?? null,
      secondaryTeamId: null,
      playerId:        null,
      headline,
      dek,
      tone,
      tags:            ['owner-pressure'],
      sourceEventIds:  [],
    });
  }

  return stories.sort(
    (a, b) => b.priority - a.priority || String(a.teamId).localeCompare(String(b.teamId)),
  );
}

/**
 * Generate MANDATE_SLIP and MANDATE_SURGE stories from team win/loss records
 * cross-referenced with owner expectations.
 * @param {Object} league
 * @returns {Object[]}
 */
export function extractMandateStories(league) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const season = _n(league?.year ?? league?.season);
  const week = _n(league?.week);
  const stories = [];

  for (const team of teams) {
    const owner = team?.owner;
    if (!owner?.mandate) continue;

    const wins   = _n(team.wins);
    const losses = _n(team.losses);
    const ties   = _n(team.ties);
    const total  = wins + losses + ties;
    if (total < 4) continue;

    const hotSeatRating = _n(owner.hotSeatRating, 25);
    const seasonsUnder  = _n(owner.seasonsUnderGoal);
    const mandate       = owner.mandate;
    const mandateLabel  = _titleCase(mandate);
    const teamAbbr      = team.abbr ?? team.name ?? 'Team';

    // MANDATE_SLIP: losing teams with consecutive underperformance
    if (losses > wins && seasonsUnder >= 1) {
      const id = makeStableStoryId('mandate-slip', team.id ?? teamAbbr, season);
      stories.push({
        id,
        type:            MEDIA_STORY_TYPES.MANDATE_SLIP,
        priority:        Math.min(80, 55 + seasonsUnder * 5),
        week,
        season,
        teamId:          team.id ?? null,
        secondaryTeamId: null,
        playerId:        null,
        headline:        `${teamAbbr} Falling Short of ${mandateLabel} Mandate`,
        dek:             `At ${wins}-${losses}, ${teamAbbr} trails expectations for a ${seasonsUnder + 1}-season stretch. Front-office security at ${hotSeatRating}/100.`,
        tone:            'warning',
        tags:            ['mandate', 'pressure'],
        sourceEventIds:  [],
      });
    }

    // MANDATE_SURGE: significantly overachieving with low owner pressure
    if (wins > losses + 2 && hotSeatRating < 35) {
      const id = makeStableStoryId('mandate-surge', team.id ?? teamAbbr, season);
      stories.push({
        id,
        type:            MEDIA_STORY_TYPES.MANDATE_SURGE,
        priority:        50,
        week,
        season,
        teamId:          team.id ?? null,
        secondaryTeamId: null,
        playerId:        null,
        headline:        `${teamAbbr} Exceeding ${mandateLabel} Mandate`,
        dek:             `At ${wins}-${losses}, ${teamAbbr} is ahead of owner expectations heading into Week ${week}.`,
        tone:            'positive',
        tags:            ['mandate', 'surge'],
        sourceEventIds:  [],
      });
    }
  }

  return stories.sort(
    (a, b) => b.priority - a.priority || String(a.teamId).localeCompare(String(b.teamId)),
  );
}

/**
 * Generate BLOCKBUSTER_TRADE stories from leaguePulse transaction items and
 * newsItems that carry clear trade signals.
 * @param {Object} league
 * @returns {Object[]}
 */
export function extractBlockbusterTradeStories(league) {
  const season = _n(league?.year ?? league?.season);
  const week   = _n(league?.week);
  const stories = [];
  const seenIds = new Set();

  // Primary source: leaguePulse transaction items
  const pulseItems = Array.isArray(league?.leaguePulse) ? league.leaguePulse : [];
  const tradePulse = pulseItems.filter(
    (p) => p?.type === 'transaction' || p?.source === 'transaction',
  );

  for (const pulse of tradePulse.slice(0, 2)) {
    const id = makeStableStoryId(
      'blockbuster-trade',
      pulse.relatedTeamId ?? 'unk',
      _n(pulse.season, season),
      _n(pulse.week, week),
    );
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    stories.push({
      id,
      type:            MEDIA_STORY_TYPES.BLOCKBUSTER_TRADE,
      priority:        _n(pulse.importance, 60),
      week:            _n(pulse.week, week),
      season:          _n(pulse.season, season),
      teamId:          pulse.relatedTeamId ?? null,
      secondaryTeamId: null,
      playerId:        null,
      headline:        pulse.headline ?? 'Blockbuster Trade',
      dek:             pulse.body ?? 'A significant roster move reshapes the league landscape.',
      tone:            'neutral',
      tags:            ['trade'],
      sourceEventIds:  pulse.id ? [pulse.id] : [],
    });
  }

  // Secondary source: newsItems with clear trade signals
  const newsItems = Array.isArray(league?.newsItems) ? league.newsItems : [];
  const tradeNews = newsItems.filter((n) => {
    if (n?.type !== 'TRANSACTION') return false;
    const text = String(n.text ?? '').toLowerCase();
    return (
      text.includes('trade') ||
      text.includes('traded') ||
      (n.extraData?.fromTeamId != null &&
        n.extraData?.toTeamId != null &&
        n.extraData.fromTeamId !== n.extraData.toTeamId)
    );
  });

  for (const news of tradeNews.slice(0, 2)) {
    const id = makeStableStoryId(
      'trade-news',
      news.id ?? news.teamId ?? 'unk',
      _n(news.week, week),
    );
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    stories.push({
      id,
      type:            MEDIA_STORY_TYPES.BLOCKBUSTER_TRADE,
      priority:        60,
      week:            _n(news.week, week),
      season:          _n(news.year, season),
      teamId:          news.teamId ?? null,
      secondaryTeamId: news.extraData?.toTeamId ?? news.extraData?.fromTeamId ?? null,
      playerId:        news.playerId ?? null,
      headline:        'Trade Activity',
      dek:             news.text ?? 'A roster transaction changes the league landscape.',
      tone:            'neutral',
      tags:            ['trade'],
      sourceEventIds:  news.id ? [news.id] : [],
    });
  }

  return stories.sort((a, b) => b.priority - a.priority);
}

/**
 * Generate PRESTIGE_HONOR stories from currentSeasonHonors.
 * Handles both flat assignment array and grouped summary object shapes.
 * Only surfaces First-Team All-Pro selections to keep volume low.
 * @param {Object} league
 * @returns {Object[]}
 */
export function extractPrestigeStories(league) {
  const honors = league?.currentSeasonHonors;
  if (!honors) return [];

  const season = _n(league?.year ?? league?.season);
  const week   = _n(league?.week);

  // Normalize to flat array regardless of input shape
  let flatHonors = [];
  if (Array.isArray(honors)) {
    flatHonors = honors;
  } else if (honors && typeof honors === 'object') {
    for (const [type, byPos] of Object.entries(honors)) {
      if (byPos && typeof byPos === 'object' && !Array.isArray(byPos)) {
        for (const entries of Object.values(byPos)) {
          if (Array.isArray(entries)) {
            flatHonors.push(...entries.map((e) => ({ ...e, type })));
          }
        }
      } else if (Array.isArray(byPos)) {
        flatHonors.push(...byPos.map((e) => ({ ...e, type })));
      }
    }
  }

  // Surface only First-Team All-Pro selections
  const firstTeam = flatHonors.filter((h) => h.type === 'FIRST_TEAM_ALL_PRO');
  if (firstTeam.length === 0) return [];

  // Group by team (stable key: teamId if available, else teamAbbr)
  const byTeam = new Map();
  for (const h of firstTeam) {
    const key = String(h.teamId ?? h.teamAbbr ?? 'unk');
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(h);
  }

  const stories = [];
  for (const [, hs] of [...byTeam.entries()].slice(0, 2)) {
    const abbr   = hs[0]?.teamAbbr ?? String(hs[0]?.teamId ?? 'Team');
    const teamId = hs[0]?.teamId ?? null;
    const count  = hs.length;
    const firstName = hs[0]?.playerName ?? 'A player';
    const pos = hs[0]?.pos ?? '';

    const id = makeStableStoryId('prestige-honor', teamId ?? abbr, season);

    const headline = count > 1
      ? `${abbr} Places ${count} on First-Team All-Pro`
      : `${firstName} Named First-Team All-Pro`;

    const dek = count > 1
      ? `${abbr} earns ${count} First-Team All-Pro selections this season.`
      : `${firstName}${pos ? ` (${pos})` : ''} of ${abbr} claims the league's top individual honor.`;

    stories.push({
      id,
      type:            MEDIA_STORY_TYPES.PRESTIGE_HONOR,
      priority:        70,
      week,
      season,
      teamId,
      secondaryTeamId: null,
      playerId:        hs[0]?.playerId ?? null,
      headline,
      dek,
      tone:            'positive',
      tags:            ['prestige', 'all-pro'],
      sourceEventIds:  [],
    });
  }

  return stories;
}

/**
 * Generate PLAYOFF_PUSH stories from standings for teams in active contention.
 * Only runs after Week 6 to avoid early-season noise.
 * @param {Object} league
 * @returns {Object[]}
 */
export function extractPlayoffPushStories(league) {
  const standings = Array.isArray(league?.standings) ? league.standings : [];
  const season    = _n(league?.year ?? league?.season);
  const week      = _n(league?.week);
  const stories   = [];

  if (standings.length === 0 || week < 6) return stories;

  // Normalize standing rows (support both tid/id/teamId keys)
  const rows = standings
    .map((s) => ({
      tid:  s.tid ?? s.id ?? s.teamId,
      w:    _n(s.w ?? s.wins),
      l:    _n(s.l ?? s.losses),
      t:    _n(s.t ?? s.ties),
      abbr: s.abbr ?? s.name ?? s.teamName,
      conf: s.conf,
    }))
    .filter((s) => s.tid != null && s.w > s.l);

  if (rows.length < 3) return stories;

  // Sort by win percentage (stable: then by tid string for ties)
  const sorted = [...rows].sort((a, b) => {
    const totA = a.w + a.l + a.t || 1;
    const totB = b.w + b.l + b.t || 1;
    const wpA  = (a.w + a.t * 0.5) / totA;
    const wpB  = (b.w + b.t * 0.5) / totB;
    if (wpB !== wpA) return wpB - wpA;
    return String(a.tid).localeCompare(String(b.tid));
  });

  // Pick the "bubble" contender — team at ~40th percentile of winning teams
  const bubbleIdx  = Math.floor(sorted.length * 0.4);
  const bubbleTeam = sorted[bubbleIdx];

  if (bubbleTeam && bubbleTeam.w >= 4) {
    const id = makeStableStoryId('playoff-push', bubbleTeam.tid, season, week);
    stories.push({
      id,
      type:            MEDIA_STORY_TYPES.PLAYOFF_PUSH,
      priority:        55,
      week,
      season,
      teamId:          bubbleTeam.tid,
      secondaryTeamId: null,
      playerId:        null,
      headline:        `${bubbleTeam.abbr ?? 'Team'} Alive in Playoff Picture`,
      dek:             `At ${bubbleTeam.w}-${bubbleTeam.l}, ${bubbleTeam.abbr ?? 'the team'} is firmly in the postseason picture entering Week ${week}.`,
      tone:            'positive',
      tags:            ['playoff', 'race'],
      sourceEventIds:  [],
    });
  }

  return stories;
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

/**
 * Synthesize candidate stories from all available signals.
 * No mutation of the input context.
 * @param {Object} context  — league/view-state slice
 * @returns {Object[]}      — deduped candidate stories
 */
export function selectMediaStories(context) {
  const league = context ?? {};
  const candidates = [
    ...extractHotSeatStories(league),
    ...extractMandateStories(league),
    ...extractBlockbusterTradeStories(league),
    ...extractPrestigeStories(league),
    ...extractPlayoffPushStories(league),
  ];
  return dedupeMediaStories(candidates);
}

/**
 * Rank stories deterministically by priority, then recency, then id.
 * Returns at most maxCount stories (default MEDIA_STORY_MAX).
 * @param {Object[]} stories
 * @param {{ maxCount?: number }} [options]
 * @returns {Object[]}
 */
export function rankMediaStories(stories, options = {}) {
  const maxCount = _n(options.maxCount, MEDIA_STORY_MAX);
  return [...stories]
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.week !== a.week) return b.week - a.week;
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, maxCount);
}

/**
 * Convert a structured story into a concise headline/dek pair.
 * @param {Object} story
 * @returns {{ headline: string, dek: string }}
 */
export function buildMediaHeadline(story) {
  return {
    headline: story?.headline ?? '',
    dek:      story?.dek ?? '',
  };
}

/**
 * Top-level entry point. Returns a compact, ranked array of media story cards
 * derived purely from existing league state. Immutable and deterministic.
 *
 * @param {Object} league   — league/view-state object (not mutated)
 * @param {{ maxCount?: number }} [options]
 * @returns {Object[]}      — ranked media story cards
 */
export function buildMediaNarratives(league, options = {}) {
  if (!league || typeof league !== 'object') return [];
  const candidates = selectMediaStories(league);
  return rankMediaStories(candidates, options);
}
