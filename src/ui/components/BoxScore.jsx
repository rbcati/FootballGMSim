import React, { useMemo, useState } from "react";
import { EmptyState } from "./ScreenSystem.jsx";
import { buildBoxScoreViewModel } from "../utils/boxScoreViewModel.js";
import useStableRouteRequest from "../hooks/useStableRouteRequest.js";
import { buildGameBookStory } from "../utils/gameBookStory.js";

const QUALITY_BADGE_CLASS = {
  "Full detail": "success",
  "Partial detail": "warning",
  "Score only": "muted",
  "Missing detail": "danger",
};

export function TeamButton({ team, onSelect }) {
  if (!team) return <span>—</span>;
  if (!onSelect || team.id == null) return <span>{team.abbr}</span>;
  return <button className="btn-link" onClick={() => onSelect(team.id)}>{team.abbr}</button>;
}

export function PlayerButton({ player, onSelect }) {
  if (!player) return <span>—</span>;
  if (!onSelect || player.playerId == null) return <span>{player.name ?? "Unknown"}</span>;
  return <button className="btn-link" onClick={() => onSelect(player.playerId)}>{player.name ?? "Unknown"}</button>;
}

const asNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const desc = "desc";

function BoxScore({ gameId, league, actions, onClose, onPlayerSelect, onTeamSelect, embedded = false }) {
  const canLoadArchive = Boolean(gameId && typeof actions?.getBoxScore === "function");
  const { data: archiveGame } = useStableRouteRequest({
    requestKey: canLoadArchive ? `boxscore:${gameId}` : null,
    enabled: canLoadArchive,
    cacheScopeKey: league?.id ?? league?.leagueId ?? "global",
    fetcher: () => actions.getBoxScore(gameId),
  });

  const fallbackGame = league?.gameById?.[gameId] ?? null;
  const game = archiveGame ?? fallbackGame;
  const vm = useMemo(() => buildBoxScoreViewModel({ league, game, gameId, context: { season: league?.seasonId, week: league?.week } }), [league, game, gameId]);
  const [sortState, setSortState] = useState({});

  if (!vm || vm.status === "unavailable") {
    return <EmptyState title="Game Book unavailable" body="Game data missing." />;
  }
  const storyBullets = buildGameBookStory(vm);
  const qHome = vm.quarterScores?.home ?? [];
  const qAway = vm.quarterScores?.away ?? [];
  const qCount = Math.max(qHome.length, qAway.length, 4);
  const hasQuarter = qHome.length || qAway.length;
  const headers = Array.from({ length: qCount }, (_, i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3}`));

  const teamRows = [
    ["Pass Yards", vm.teamTotals?.away?.passYards, vm.teamTotals?.home?.passYards],
    ["Rush Yards", vm.teamTotals?.away?.rushYards, vm.teamTotals?.home?.rushYards],
    ["Total Yards", vm.teamTotals?.away?.totalYards, vm.teamTotals?.home?.totalYards],
    ["Turnovers", vm.teamTotals?.away?.turnovers, vm.teamTotals?.home?.turnovers],
    ["Sacks Allowed", vm.teamTotals?.away?.sacksAllowed, vm.teamTotals?.home?.sacksAllowed],
    ["Penalties", vm.teamTotals?.away?.penalties, vm.teamTotals?.home?.penalties],
    ["First Downs", vm.teamTotals?.away?.firstDowns, vm.teamTotals?.home?.firstDowns],
    ["Time of Possession", vm.teamTotals?.away?.timePossession, vm.teamTotals?.home?.timePossession],
  ].filter(([, a, h]) => a != null || h != null);

  const tables = [
    { title: "Passing", defaultSort: "passYd", cols: [["passComp", "Cmp"], ["passAtt", "Att"], ["passYd", "Yds"], ["passTD", "TD"], ["interceptions", "INT"], ["sacked", "Sck"]], include: (s) => asNum(s.passAtt) > 0 },
    { title: "Rushing", defaultSort: "rushYd", cols: [["rushAtt", "Att"], ["rushYd", "Yds"], ["rushTD", "TD"], ["rushLong", "Long"]], include: (s) => asNum(s.rushAtt) > 0 },
    { title: "Receiving", defaultSort: "recYd", cols: [["targets", "Tgt"], ["receptions", "Rec"], ["recYd", "Yds"], ["recTD", "TD"], ["recLong", "Long"]], include: (s) => asNum(s.receptions) > 0 || asNum(s.targets) > 0 },
    { title: "Defense", defaultSort: "tackles", cols: [["tackles", "Tkl"], ["sacks", "Sack"], ["tfl", "TFL"], ["interceptions", "INT"], ["passesDefended", "PD"], ["forcedFumbles", "FF"], ["fumbleRecoveries", "FR"], ["defTD", "TD"]], include: (s) => asNum(s.tackles) > 0 || asNum(s.sacks) > 0 },
    { title: "Kicking", defaultSort: "points", cols: [["fieldGoalsMade", "FGM"], ["fieldGoalsAttempted", "FGA"], ["fieldGoalPct", "FG%"], ["extraPointsMade", "XPM"], ["extraPointsAttempted", "XPA"], ["points", "Pts"]], include: (s) => asNum(s.fieldGoalsAttempted) > 0 || asNum(s.extraPointsAttempted) > 0 },
    { title: "Punting", defaultSort: "puntYards", cols: [["punts", "Punt"], ["puntYards", "Yds"], ["puntAvg", "Avg"], ["puntLong", "Long"], ["puntsInside20", "In20"]], include: (s) => asNum(s.punts) > 0 },
    { title: "Returns", defaultSort: "returnYards", cols: [["kickReturns", "KR"], ["kickReturnYards", "KR Yds"], ["puntReturns", "PR"], ["puntReturnYards", "PR Yds"], ["returnTD", "TD"]], include: (s) => asNum(s.kickReturns) > 0 || asNum(s.puntReturns) > 0 },
    { title: "Blocking", defaultSort: "passBlockWinRate", cols: [["passBlockWins", "PBW"], ["passBlockAttempts", "PBA"], ["passBlockWinRate", "PBWR"], ["runBlockWins", "RBW"], ["runBlockAttempts", "RBA"], ["runBlockWinRate", "RBWR"]], include: (s) => asNum(s.passBlockAttempts) > 0 || asNum(s.runBlockAttempts) > 0 },
  ];

  const renderTable = (spec) => {
    const sort = sortState[spec.title] ?? { key: spec.defaultSort, dir: desc };
    const sortPlayers = (players) => [...players].sort((a, b) => ((asNum(b.stats?.[sort.key]) ?? -Infinity) - (asNum(a.stats?.[sort.key]) ?? -Infinity)) * (sort.dir === desc ? 1 : -1));
    const away = sortPlayers((vm.playerTables?.away ?? []).filter((p) => spec.include(p.stats ?? {})));
    const home = sortPlayers((vm.playerTables?.home ?? []).filter((p) => spec.include(p.stats ?? {})));
    if (!away.length && !home.length) return null;
    const rows = [[vm.awayTeam, away], [vm.homeTeam, home]];
    return <section key={spec.title} className="bs-section"><h4>{spec.title}</h4><div className="bs-table-wrap"><table className="box-score-table"><thead><tr><th>Team</th><th>Player</th>{spec.cols.map(([key, label]) => <th key={label}><button className="btn-link" onClick={() => setSortState((prev) => ({ ...prev, [spec.title]: { key, dir: prev?.[spec.title]?.key === key && prev?.[spec.title]?.dir === desc ? "asc" : desc } }))}>{label}</button></th>)}</tr></thead><tbody>{rows.map(([team, players]) => players.map((p) => <tr key={`${spec.title}-${team?.id}-${p.playerId}`}><td>{team?.abbr}</td><td><PlayerButton player={p} onSelect={onPlayerSelect} /></td>{spec.cols.map(([key, label]) => <td key={label}>{p.stats?.[key] ?? "—"}</td>)}</tr>))}</tbody></table></div></section>;
  };

  return <div className={embedded ? "card" : "modal-content"}>
    <div className="box-score-header"><h2>Game Book</h2>{!embedded && <button className="btn" onClick={onClose}>Close</button>}</div>
    <section className="bs-section">
      <h3><TeamButton team={vm.awayTeam} onSelect={onTeamSelect} /> vs <TeamButton team={vm.homeTeam} onSelect={onTeamSelect} /></h3>
      <div data-testid="game-book-final-score">{vm.finalScore.away ?? "—"} - {vm.finalScore.home ?? "—"}</div>
      <div>Week {vm.week ?? "—"} · Season {vm.season ?? "—"}</div>
      <span className={`status-chip ${QUALITY_BADGE_CLASS[vm.archiveQuality] ?? "muted"}`}>{vm.archiveQuality}</span>
      {vm.detailWarning ? <p>{vm.detailWarning}</p> : null}
    </section>
    <section className="bs-section"><h4>Why this game was decided</h4>{storyBullets.length ? <ul>{storyBullets.map((b) => <li key={b}>{b}</li>)}</ul> : <p>No detailed team/player stats were recorded for this game.</p>}</section>
    <section className="bs-section"><h4>Score by quarter</h4>{hasQuarter ? <div className="bs-table-wrap"><table className="box-score-table"><thead><tr><th>Team</th>{headers.map((h) => <th key={h}>{h}</th>)}<th>Final</th></tr></thead><tbody><tr><td><TeamButton team={vm.awayTeam} onSelect={onTeamSelect} /></td>{headers.map((_, i) => <td key={`a-${i}`}>{qAway[i] ?? "—"}</td>)}<td>{vm.finalScore.away ?? "—"}</td></tr><tr><td><TeamButton team={vm.homeTeam} onSelect={onTeamSelect} /></td>{headers.map((_, i) => <td key={`h-${i}`}>{qHome[i] ?? "—"}</td>)}<td>{vm.finalScore.home ?? "—"}</td></tr></tbody></table></div> : <p>Quarter-by-quarter scoring was not recorded for this game.</p>}</section>

    <section className="bs-section"><h4>Team comparison</h4>{teamRows.length ? <div className="bs-table-wrap"><table className="box-score-table"><thead><tr><th>Stat</th><th>{vm.awayTeam.abbr}</th><th>{vm.homeTeam.abbr}</th></tr></thead><tbody>{teamRows.map(([label, a, h]) => <tr key={label}><td>{label}</td><td>{a ?? "—"}</td><td>{h ?? "—"}</td></tr>)}</tbody></table></div> : <p>Team totals were not recorded for this game.</p>}</section>

    <section className="bs-section"><h4>Scoring summary</h4>{vm.scoringSummary?.length ? <div className="bs-table-wrap"><table className="box-score-table"><thead><tr><th>Qtr</th><th>Time</th><th>Team</th><th>Type</th><th>Description</th><th>Score</th></tr></thead><tbody>{vm.scoringSummary.map((r, i) => <tr key={i}><td>{r.quarter ?? "—"}</td><td>{r.time ?? r.clock ?? "—"}</td><td>{r.teamAbbr ?? r.team ?? "—"}</td><td>{r.type ?? "—"}</td><td>{r.description ?? r.text ?? "—"}</td><td>{r.scoreAfter ?? "—"}</td></tr>)}</tbody></table></div> : <p>Scoring summary was not recorded for this game.</p>}</section>
    {vm.prepImpact?.length ? <section className="bs-section"><h4>Game-plan impact</h4><ul>{vm.prepImpact.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul></section> : null}
    {tables.map(renderTable)}
  </div>;
}

export default BoxScore;
