const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

export function buildGameBookStory(vm) {
  const bullets = [];
  const away = vm?.awayTeam?.abbr ?? "Away";
  const home = vm?.homeTeam?.abbr ?? "Home";
  const winner = n(vm?.finalScore?.away) > n(vm?.finalScore?.home) ? away : home;
  const loser = winner === away ? home : away;
  const tAway = vm?.teamTotals?.away ?? {};
  const tHome = vm?.teamTotals?.home ?? {};

  const toA = n(tAway.turnovers); const toH = n(tHome.turnovers);
  if (toA != null && toH != null && toA !== toH) bullets.push(`${winner} won the turnover battle ${winner === away ? `${toH}-${toA}` : `${toA}-${toH}`}.`);

  [["totalYards", "total yards"], ["passYards", "passing yards"], ["rushYards", "rushing yards"], ["sacks", "sacks"]].forEach(([k, label]) => {
    const a = n(tAway[k]); const h = n(tHome[k]);
    if (a != null && h != null && a !== h) {
      const lead = Math.abs(a - h);
      bullets.push(`${a > h ? away : home} led by ${lead} ${label}.`);
    }
  });

  const players = [...(vm?.playerTables?.away ?? []), ...(vm?.playerTables?.home ?? [])];
  const qb = [...players].sort((a, b) => (n(b.stats?.passYd) ?? -1) - (n(a.stats?.passYd) ?? -1))[0];
  if (n(qb?.stats?.passYd) > 0) bullets.push(`${qb.name ?? "A QB"} led all passers with ${qb.stats.passYd} passing yards and ${qb.stats?.passTD ?? 0} TD.`);

  const rush = [...players].sort((a, b) => (n(b.stats?.rushYd) ?? -1) - (n(a.stats?.rushYd) ?? -1))[0];
  if (n(rush?.stats?.rushYd) > 0) bullets.push(`${rush.name ?? "A runner"} led all rushers with ${rush.stats.rushYd} yards.`);

  const rec = [...players].sort((a, b) => (n(b.stats?.recYd) ?? -1) - (n(a.stats?.recYd) ?? -1))[0];
  if (n(rec?.stats?.recYd) > 0) bullets.push(`${rec.name ?? "A receiver"} led all receivers with ${rec.stats.recYd} yards.`);

  const lastScore = vm?.scoringSummary?.[vm.scoringSummary.length - 1];
  if (lastScore?.teamAbbr || lastScore?.team) bullets.push(`Last scoring play: ${(lastScore.teamAbbr ?? lastScore.team)} ${lastScore.type ?? "score"} (${lastScore.time ?? lastScore.clock ?? "time unknown"}).`);

  if (!bullets.length && winner && loser) bullets.push(`No detailed team/player stats were recorded for this game.`);
  return bullets;
}
