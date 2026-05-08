import React, { useMemo, useState } from "react";
import { EmptyState } from "./ScreenSystem.jsx";
import { buildBoxScoreViewModel } from "../utils/boxScoreViewModel.js";
import useStableRouteRequest from "../hooks/useStableRouteRequest.js";
import { buildGameBookStory } from "../utils/gameBookStory.js";
import { getTopPerformers } from "../utils/gameBookHighlights.js";
import { getPlayerProfileId, hasValidPlayerProfileId, openPlayerProfile } from "../utils/playerProfileNavigation.js";

const QUALITY_BADGE_CLASS = {
  "Full detail": "success",
  "Partial detail": "warning",
  "Score only": "muted",
  "Missing detail": "danger",
};

export function TeamButton({ team, onSelect }) {
  if (!team) return <span>—</span>;
  if (!onSelect || team.id == null) return <span>{team.abbr}</span>;
  return <button type="button" className="btn-link" onClick={() => onSelect(team.id)}>{team.abbr}</button>;
}

export function PlayerButton({ player, onSelect, context }) {
  if (!player) return <span>—</span>;
  const rawId = getPlayerProfileId(player.playerId ?? player);
  if (!onSelect || !hasValidPlayerProfileId(rawId)) return <span>{player.name ?? "Unknown"}</span>;
  return (
    <button
      type="button"
      className="btn-link"
      data-testid="game-book-player-link"
      onClick={() => openPlayerProfile(rawId, onSelect, { ...context, player, statLine: player?.stats })}
    >
      {player.name ?? "Unknown"}
    </button>
  );
}

const asNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const desc = "desc";
const mdash = "—";

function tableTestId(title) {
  return `game-book-table-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

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
  const topPerformers = getTopPerformers(vm);
  const gameContextBase = {
    source: "game-book",
    gameId: vm.gameId ?? gameId,
    week: vm.week,
    seasonId: vm.season,
    awayTeam: vm.awayTeam,
    homeTeam: vm.homeTeam,
  };
  const openGameBookPlayer = (player, role) => openPlayerProfile(player?.playerId ?? player?.id, onPlayerSelect, {
    ...gameContextBase,
    role,
    player,
    statLine: player?.stats,
    returnTo: "game-book",
  });
  const qHome = vm.quarterScores?.home ?? [];
  const qAway = vm.quarterScores?.away ?? [];
  const qCount = Math.max(qHome.length, qAway.length, 4);
  const hasQuarter = qHome.length || qAway.length;
  const headers = Array.from({ length: qCount }, (_, i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3}`));
  const teamVal = (side, ...keys) => {
    const stats = vm.teamTotals?.[side] ?? {};
    for (const key of keys) {
      if (stats[key] != null) return stats[key];
    }
    return null;
  };
  const formatScoreAfter = (score) => {
    if (!score) return mdash;
    if (typeof score === "string") return score;
    if (score.home != null && score.away != null) return `${score.away}-${score.home}`;
    return mdash;
  };

  const teamRows = [
    ["Pass Yards", teamVal("away", "passYards", "passYd", "passYds"), teamVal("home", "passYards", "passYd", "passYds")],
    ["Rush Yards", teamVal("away", "rushYards", "rushYd", "rushYds"), teamVal("home", "rushYards", "rushYd", "rushYds")],
    ["Total Yards", teamVal("away", "totalYards"), teamVal("home", "totalYards")],
    ["Turnovers", teamVal("away", "turnovers"), teamVal("home", "turnovers")],
    ["Sacks", teamVal("away", "sacks"), teamVal("home", "sacks")],
    ["Sacks Allowed", teamVal("away", "sacksAllowed"), teamVal("home", "sacksAllowed")],
    ["Penalties", teamVal("away", "penalties"), teamVal("home", "penalties")],
    ["First Downs", teamVal("away", "firstDowns"), teamVal("home", "firstDowns")],
    ["Time of Possession", teamVal("away", "timePossession"), teamVal("home", "timePossession")],
  ].filter(([, a, h]) => a != null || h != null);

  const tables = [
    { title: "Passing", defaultSort: "passYd", cols: [["passComp", "Cmp"], ["passAtt", "Att"], ["passYd", "Yds"], ["passTD", "TD"], ["interceptions", "INT"], ["sacked", "Sck"], ["passerRating", "Rate"]], include: (s) => asNum(s.passAtt) > 0 },
    { title: "Rushing", defaultSort: "rushYd", cols: [["rushAtt", "Att"], ["rushYd", "Yds"], ["rushTD", "TD"], ["fumbles", "Fum"], ["rushLong", "Long"]], include: (s) => asNum(s.rushAtt) > 0 },
    { title: "Receiving", defaultSort: "recYd", cols: [["targets", "Tgt"], ["receptions", "Rec"], ["recYd", "Yds"], ["recTD", "TD"], ["drops", "Drop"], ["recLong", "Long"]], include: (s) => asNum(s.receptions) > 0 || asNum(s.targets) > 0 },
    { title: "Defense", defaultSort: "tackles", cols: [["tackles", "Tkl"], ["sacks", "Sack"], ["tfl", "TFL"], ["interceptions", "INT"], ["passesDefended", "PD"], ["forcedFumbles", "FF"], ["fumbleRecoveries", "FR"], ["defTD", "TD"]], include: (s) => asNum(s.tackles) > 0 || asNum(s.sacks) > 0 },
    { title: "Special Teams", defaultSort: "points", cols: [["fieldGoalsMade", "FGM"], ["fieldGoalsAttempted", "FGA"], ["extraPointsMade", "XPM"], ["extraPointsAttempted", "XPA"], ["punts", "Punt"], ["puntYards", "Punt Yds"], ["kickReturns", "KR"], ["kickReturnYards", "KR Yds"], ["puntReturns", "PR"], ["puntReturnYards", "PR Yds"], ["returnTD", "TD"]], include: (s) => asNum(s.fieldGoalsAttempted) > 0 || asNum(s.extraPointsAttempted) > 0 || asNum(s.punts) > 0 || asNum(s.kickReturns) > 0 || asNum(s.puntReturns) > 0 },
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
    return (
      <section key={spec.title} className="bs-section" data-testid={tableTestId(spec.title)}>
        <h4>{spec.title}</h4>
        <div className="bs-table-wrap">
          <table className="box-score-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Player</th>
                {spec.cols.map(([key, label]) => (
                  <th key={label}>
                    <button type="button" className="btn-link" onClick={() => setSortState((prev) => ({ ...prev, [spec.title]: { key, dir: prev?.[spec.title]?.key === key && prev?.[spec.title]?.dir === desc ? "asc" : desc } }))}>{label}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([team, players]) => players.map((p) => (
                <tr key={`${spec.title}-${team?.id}-${p.playerId}`}>
                  <td>{team?.abbr}</td>
                  <td>
                    <PlayerButton player={p} onSelect={onPlayerSelect} context={{ ...gameContextBase, role: spec.title, returnTo: "game-book" }} />
                  </td>
                  {spec.cols.map(([key, label]) => <td key={label}>{p.stats?.[key] ?? mdash}</td>)}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div className={embedded ? "card" : "modal-content"}>
      <div className="box-score-header">
        <h2>Game Book</h2>
        {!embedded && <button type="button" className="btn" onClick={onClose}>Close</button>}
      </div>
      <section className="bs-section bs-summary-card">
        <h3><TeamButton team={vm.awayTeam} onSelect={onTeamSelect} /> vs <TeamButton team={vm.homeTeam} onSelect={onTeamSelect} /></h3>
        <div className="bs-scoreline" data-testid="game-book-final-score">
          {vm.awayTeam.abbr} {vm.finalScore.away ?? mdash} - {vm.finalScore.home ?? mdash} {vm.homeTeam.abbr}
        </div>
        <div>Week {vm.week ?? mdash} · Season {vm.season ?? mdash}</div>
        <span className={`status-chip ${QUALITY_BADGE_CLASS[vm.archiveQuality] ?? "muted"}`}>{vm.archiveQuality}</span>
        {vm.detailWarning ? <p>{vm.detailWarning}</p> : null}
      </section>
      <section className="bs-section" data-testid="game-book-decision-summary">
        <h4>Why this game was decided</h4>
        {storyBullets.length ? <ul>{storyBullets.map((b) => <li key={b}>{b}</li>)}</ul> : <p>No detailed team/player stats were recorded for this game.</p>}
      </section>
      <section className="bs-section" data-testid="game-book-top-performers">
        <h4>Top performers</h4>
        <div className="bs-leaders-grid">
          <article className="bs-leader-card">
            <span className="bs-leader-label">Offense</span>
            {topPerformers.offensePlayer && onPlayerSelect ? (
              <button type="button" className="btn-link bs-leader-name" data-testid="game-book-top-performer-link" onClick={() => openGameBookPlayer(topPerformers.offensePlayer, "Top offensive player")}>{topPerformers.offense}</button>
            ) : <p className="bs-leader-name">{topPerformers.offense}</p>}
          </article>
          <article className="bs-leader-card">
            <span className="bs-leader-label">Defense</span>
            {topPerformers.defensePlayer && onPlayerSelect ? (
              <button type="button" className="btn-link bs-leader-name" data-testid="game-book-top-performer-link" onClick={() => openGameBookPlayer(topPerformers.defensePlayer, "Top defensive player")}>{topPerformers.defense}</button>
            ) : <p className="bs-leader-name">{topPerformers.defense}</p>}
          </article>
        </div>
      </section>
      <section className="bs-section" data-testid="game-book-quarter-scores">
        <h4>Score by quarter</h4>
        {hasQuarter ? (
          <div className="bs-table-wrap">
            <table className="box-score-table">
              <thead>
                <tr><th>Team</th>{headers.map((h) => <th key={h}>{h}</th>)}<th>Final</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><TeamButton team={vm.awayTeam} onSelect={onTeamSelect} /></td>
                  {headers.map((_, i) => <td key={`a-${i}`}>{qAway[i] ?? mdash}</td>)}
                  <td>{vm.finalScore.away ?? mdash}</td>
                </tr>
                <tr>
                  <td><TeamButton team={vm.homeTeam} onSelect={onTeamSelect} /></td>
                  {headers.map((_, i) => <td key={`h-${i}`}>{qHome[i] ?? mdash}</td>)}
                  <td>{vm.finalScore.home ?? mdash}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : <p>Quarter-by-quarter scoring was not recorded for this game.</p>}
      </section>

      <section className="bs-section" data-testid="game-book-team-comparison">
        <h4>Team comparison</h4>
        {teamRows.length ? (
          <div className="bs-table-wrap">
            <table className="box-score-table">
              <thead><tr><th>Stat</th><th>{vm.awayTeam.abbr}</th><th>{vm.homeTeam.abbr}</th></tr></thead>
              <tbody>{teamRows.map(([label, a, h]) => <tr key={label}><td>{label}</td><td>{a ?? mdash}</td><td>{h ?? mdash}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p>Team totals were not recorded for this game.</p>}
      </section>

      <section className="bs-section" data-testid="game-book-scoring-summary">
        <h4>Scoring summary</h4>
        {vm.scoringSummary?.length ? (
          <div className="bs-table-wrap">
            <table className="box-score-table">
              <thead><tr><th>Qtr</th><th>Time</th><th>Team</th><th>Type</th><th>Description</th><th>Score</th></tr></thead>
              <tbody>
                {vm.scoringSummary.map((r, i) => (
                  <tr key={i}>
                    <td>{r.quarter ?? mdash}</td>
                    <td>{r.time ?? r.clock ?? mdash}</td>
                    <td>{r.teamAbbr ?? r.team ?? mdash}</td>
                    <td>{r.type ?? r.scoreType ?? mdash}</td>
                    <td>{r.description ?? r.text ?? mdash}</td>
                    <td>{formatScoreAfter(r.scoreAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p>Scoring summary was not recorded for this game.</p>}
      </section>
      {vm.prepImpact?.length ? (
        <section className="bs-section"><h4>Game-plan impact</h4><ul>{vm.prepImpact.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul></section>
      ) : null}
      {tables.map(renderTable)}
    </div>
  );
}

export default BoxScore;
