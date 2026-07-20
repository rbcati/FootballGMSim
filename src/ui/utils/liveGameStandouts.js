/*
 * Live "Standouts" (game leaders) derived from the CANONICAL box score.
 *
 * The watched-game viewer used to derive its live standouts by re-accumulating
 * the narration play stream. Per #1698/#1699 the canonical player box score is
 * the single leader authority, and #1700 forbids the narration layer from
 * owning leaders. So in canonical mode the viewer reads game leaders straight
 * from the same box score PostGameScreen Leaders use. Drive-level playback has
 * no per-play progression, so these are the game's real totals (fully accurate
 * at the final whistle); they are never fabricated.
 */

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function shortName(row) {
  const raw = String(row?.name ?? '').trim();
  if (!raw) {
    const pos = row?.pos || '';
    return pos ? `${pos}` : 'Player';
  }
  const parts = raw.split(/\s+/);
  return parts.length >= 2 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : raw;
}

function rowsOf(side) {
  if (!side || typeof side !== 'object') return [];
  return Object.values(side).map((row) => ({
    name: row?.name,
    pos: row?.pos,
    stats: row?.stats ?? row ?? {},
  }));
}

function topBy(rows, statKey, minValue = 1) {
  let best = null;
  for (const row of rows) {
    const v = num(row.stats?.[statKey]);
    if (v < minValue) continue;
    if (!best || v > num(best.stats?.[statKey])) best = row;
  }
  return best;
}

/**
 * @param {{home?:Object, away?:Object}} playerStats canonical box score
 * @returns {{qb, rusher, receiver, sacks, picks}} in the shape the viewer renders
 */
export function deriveStandoutsFromBoxScore(playerStats) {
  const rows = [...rowsOf(playerStats?.home), ...rowsOf(playerStats?.away)];
  if (!rows.length) return { qb: null, rusher: null, receiver: null, sacks: null, picks: null };

  const qbRow = topBy(rows, 'passYd', 1);
  const rushRow = topBy(rows, 'rushYd', 1);
  const recRow = topBy(rows, 'recYd', 1);
  const sackRow = topBy(rows, 'sacks', 1);
  // Defensive interceptions only (a passer's `interceptions` are thrown, not
  // takeaways) — mirror the postgame defensive-leader policy.
  const pickRow = rows
    .filter((r) => num(r.stats?.passAtt) === 0 && num(r.stats?.interceptions) >= 1)
    .sort((a, b) => num(b.stats?.interceptions) - num(a.stats?.interceptions))[0] || null;

  return {
    qb: qbRow ? {
      player: shortName(qbRow),
      yds: num(qbRow.stats?.passYd),
      td: num(qbRow.stats?.passTD),
      att: num(qbRow.stats?.passAtt),
      comp: num(qbRow.stats?.passComp),
    } : null,
    rusher: rushRow ? {
      player: shortName(rushRow),
      yds: num(rushRow.stats?.rushYd),
      att: num(rushRow.stats?.rushAtt),
      td: num(rushRow.stats?.rushTD),
    } : null,
    receiver: recRow ? {
      player: shortName(recRow),
      yds: num(recRow.stats?.recYd),
      rec: num(recRow.stats?.receptions ?? recRow.stats?.rec),
      td: num(recRow.stats?.recTD),
    } : null,
    sacks: sackRow ? { player: shortName(sackRow), sacks: num(sackRow.stats?.sacks) } : null,
    picks: pickRow ? { player: shortName(pickRow), picks: num(pickRow.stats?.interceptions) } : null,
  };
}
