// Bounded largest-remainder apportionment. Ties retain the existing QB order.
function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w, index) => {
    const exact = sum ? Math.abs(total) * w / sum : index === 0 ? Math.abs(total) : 0;
    return { index, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const left = Math.abs(total) - shares.reduce((n, s) => n + s.count, 0);
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < left; i++) ranked[i].count++;
  return shares.map((s) => s.count === 0 ? 0 : total < 0 ? -s.count : s.count);
}

/** Preserve aggregate QB workload shares, but yardage requires a completion slot. */
export function attributeAggregatePassing(receptions, yards, completionWeights) {
  if (!Number.isSafeInteger(receptions) || receptions < 0 || !Number.isSafeInteger(yards)
    || (!receptions && yards) || !completionWeights.length
    || completionWeights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new Error(`Stat attribution: invalid aggregate passing ${receptions} catches/${yards} yards`);
  }
  const completions = apportion(receptions, completionWeights);
  const yardage = apportion(yards, completions);
  return completions.map((passComp, i) => ({ passComp, passYd: yardage[i] }));
}
