export function buildLatestResultsSummary({ results = [], teamById = {}, limit = 3 } = {}) {
  if (!Array.isArray(results) || results.length === 0) return [];

  return results.slice(0, limit).map((game) => {
    const homeId = Number(game?.homeId);
    const awayId = Number(game?.awayId);
    const homeAbbr = teamById[homeId]?.abbr ?? "?";
    const awayAbbr = teamById[awayId]?.abbr ?? "?";
    return `${awayAbbr} ${game?.awayScore ?? "-"}-${game?.homeScore ?? "-"} ${homeAbbr}`;
  });
}
