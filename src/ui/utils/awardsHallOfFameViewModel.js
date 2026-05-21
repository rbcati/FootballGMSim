const AWARD_KEYS_ALL = [
  'mvp', 'opoy', 'dpoy', 'roty', 'sbMvp',
  'oroy', 'droy', 'bestQB', 'bestRB', 'bestWrTe', 'bestDefensivePlayer', 'bestKicker',
];

const AWARD_LABEL_MAP = {
  mvp: 'Most Valuable Player',
  opoy: 'Offensive Player of the Year',
  dpoy: 'Defensive Player of the Year',
  roty: 'Rookie of the Year',
  oroy: 'Offensive Rookie of the Year',
  droy: 'Defensive Rookie of the Year',
  sbMvp: 'Finals MVP',
  bestQB: 'Best QB',
  bestRB: 'Best RB',
  bestWrTe: 'Best WR/TE',
  bestDefensivePlayer: 'Best Defensive Player',
  bestKicker: 'Best Kicker',
};

/**
 * Flatten archived seasons into a deterministic list of award rows.
 * Sorted newest-first, then by canonical award key order within a year.
 */
export function normalizeAwardsRows(archivedSeasons) {
  if (!Array.isArray(archivedSeasons)) return [];
  const rows = [];

  for (const season of archivedSeasons) {
    if (!season) continue;
    const year = season.year;
    if (year == null) continue;

    if (season.champion?.abbr || season.champion?.name) {
      rows.push({
        id: `${year}-champion`,
        year,
        awardKey: 'champion',
        awardLabel: 'Champion',
        playerId: null,
        playerName: season.champion.name ?? season.champion.abbr,
        position: null,
        team: season.champion.name ?? season.champion.abbr,
        teamAbbr: season.champion.abbr ?? null,
        summary: null,
      });
    }

    for (let i = 0; i < AWARD_KEYS_ALL.length; i++) {
      const key = AWARD_KEYS_ALL[i];
      const award = season.awards?.[key];
      if (!award?.name) continue;
      rows.push({
        id: `${year}-${key}`,
        year,
        awardKey: key,
        awardLabel: AWARD_LABEL_MAP[key] ?? key,
        playerId: award.playerId ?? null,
        playerName: award.name,
        position: award.pos ?? null,
        team: award.teamName ?? award.teamAbbr ?? null,
        teamAbbr: award.teamAbbr ?? null,
        summary: null,
      });
    }
  }

  return rows.sort((a, b) => {
    const yearDiff = b.year - a.year;
    if (yearDiff !== 0) return yearDiff;
    const ai = a.awardKey === 'champion' ? -1 : AWARD_KEYS_ALL.indexOf(a.awardKey);
    const bi = b.awardKey === 'champion' ? -1 : AWARD_KEYS_ALL.indexOf(b.awardKey);
    return ai - bi;
  });
}

/**
 * Flatten HOF classes + players array into a deduplicated list of inductee rows.
 * Classes take priority for dedup; players array fills in any not already seen.
 * Sorted newest class first, then by legacyScore descending.
 */
export function normalizeHofRows(hofClasses, hofPlayers) {
  const rows = [];
  const seen = new Set();

  for (const cls of hofClasses ?? []) {
    if (!cls) continue;
    const year = cls.year ?? null;
    for (const inductee of cls.inductees ?? []) {
      if (!inductee?.playerId) continue;
      const key = String(inductee.playerId);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: `hof-cls-${inductee.playerId}`,
        inductionYear: year,
        playerId: inductee.playerId,
        playerName: inductee.name ?? null,
        position: inductee.pos ?? null,
        team: inductee.primaryTeamAbbr ?? null,
        teamAbbr: inductee.primaryTeamAbbr ?? null,
        classLabel: year != null ? `Class of ${year}` : 'Hall of Fame',
        legacyScore: inductee.legacyScore ?? inductee.score ?? null,
        tier: inductee.tier ?? null,
        careerSummary: inductee.careerSummary ?? inductee.awardsSummary ?? null,
      });
    }
  }

  for (const player of hofPlayers ?? []) {
    if (!player?.playerId) continue;
    const key = String(player.playerId);
    if (seen.has(key)) continue;
    seen.add(key);
    const year = player.inductionYear ?? null;
    rows.push({
      id: `hof-pl-${player.playerId}`,
      inductionYear: year,
      playerId: player.playerId,
      playerName: player.name ?? null,
      position: player.pos ?? null,
      team: player.primaryTeamAbbr ?? null,
      teamAbbr: player.primaryTeamAbbr ?? null,
      classLabel: year != null ? `Class of ${year}` : 'Hall of Fame',
      legacyScore: player.legacyScore ?? player.score ?? null,
      tier: player.tier ?? null,
      careerSummary: player.careerSummary ?? null,
    });
  }

  return rows.sort((a, b) => {
    const yearDiff = (b.inductionYear ?? 0) - (a.inductionYear ?? 0);
    if (yearDiff !== 0) return yearDiff;
    return (b.legacyScore ?? 0) - (a.legacyScore ?? 0);
  });
}
