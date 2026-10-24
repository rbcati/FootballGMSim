/** Aggregate-engine TD selection is constrained by already credited participation. */
export function chooseCreditedTouchdown(scorers, receiverOnly, rng) {
  const pool = scorers.filter(({ p, type }) => {
    const g = p.stats.game;
    const catchAvailable = (g.receptions || 0) > (g.recTD || 0);
    const rushAvailable = (g.rushAtt || 0) > (g.rushTD || 0);
    return receiverOnly ? type === 'WR' && catchAvailable
      : type === 'QB' ? rushAvailable : type === 'RB' ? catchAvailable || rushAvailable : catchAvailable;
  });
  if (!pool.length) return null;
  const winner = pool[rng.weightedChoice(pool.map((s) => s.weight))];
  const g = winner.p.stats.game;
  let stat = winner.type === 'QB' ? 'rushTD' : 'recTD';
  if (winner.type === 'RB') {
    const rushAvailable = (g.rushAtt || 0) > (g.rushTD || 0);
    const catchAvailable = (g.receptions || 0) > (g.recTD || 0);
    const chance = Math.max(0, g.rushYd || 0) / Math.max(1, (g.rushYd || 0) + (g.recYd || 0));
    const roll = rng.random(); // Retain the existing RB touchdown-choice draw.
    stat = rushAvailable && (!catchAvailable || roll < chance) ? 'rushTD' : 'recTD';
  }
  return { ...winner, stat };
}
