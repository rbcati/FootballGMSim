const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function formatMoment(row = {}) {
  const parts = [];
  if (row.quarter != null) parts.push(`Q${row.quarter}`);
  if (row.clock) parts.push(row.clock);
  if (row.teamAbbr) parts.push(row.teamAbbr);
  return parts.length ? `${parts.join(" ")}: ` : "";
}

function formatDriveLine(drive = {}) {
  const details = [];
  if (drive.plays != null) details.push(`${drive.plays} plays`);
  if (drive.yards != null) details.push(`${drive.yards} yards`);
  if (drive.points != null) details.push(`${drive.points} points`);
  const detailText = details.length ? ` (${details.join(", ")})` : "";
  return `${drive.teamAbbr ?? "A team"} finished a drive with ${drive.result ?? "a result"}${detailText}.`;
}

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

  const turningPoint = vm?.turningPointRows?.[0];
  if (turningPoint?.text) {
    const sourceLabel = turningPoint.inferred ? "Inferred turning point" : "Turning point";
    bullets.push(`${sourceLabel}: ${formatMoment(turningPoint)}${turningPoint.text}`);
  }

  const keyDrive = (vm?.driveSummaryRows ?? []).find((drive) => {
    const points = n(drive?.points);
    const result = String(drive?.result ?? "").toLowerCase();
    return (points != null && points > 0) || /td|touchdown|fg|field goal|safety/.test(result);
  });
  if (keyDrive) bullets.push(formatDriveLine(keyDrive));

  const awayScore = n(vm?.finalScore?.away);
  const homeScore = n(vm?.finalScore?.home);
  if (!bullets.length && awayScore != null && homeScore != null) {
    if (awayScore === homeScore) bullets.push(`${away} and ${home} finished tied; no detailed team/player stats were recorded to explain the draw.`);
    else bullets.push(`${winner} won by ${Math.abs(awayScore - homeScore)}; detailed team/player stats were not recorded for deeper explanation.`);
  }
  return bullets;
}
