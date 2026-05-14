import React, { useMemo, useState } from "react";
import { EmptyState } from "./ScreenSystem.jsx";
import { buildBoxScoreViewModel, buildPlayerStatSections, unwrapBoxScoreResponse } from "../utils/boxScoreViewModel.js";
import useStableRouteRequest from "../hooks/useStableRouteRequest.js";
import { buildGameBookStory } from "../utils/gameBookStory.js";
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

const desc = "desc";
const mdash = "—";

function tableTestId(title) {
  return `game-book-table-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function leaderProfileRole(card) {
  if (["passing", "rushing", "receiving"].includes(card?.key)) return "Top offensive player";
  if (card?.key === "defense") return "Top defensive player";
  return `${card?.label ?? "Box score"} leader`;
}

function BoxScore({ gameId, league, actions, onClose, onBack, onPlayerSelect, onTeamSelect, embedded = false, scheduleGame = null }) {
  const canLoadArchive = Boolean(gameId && typeof actions?.getBoxScore === "function");
  const { data: archiveGame } = useStableRouteRequest({
    requestKey: canLoadArchive ? `boxscore:${gameId}` : null,
    enabled: canLoadArchive,
    cacheScopeKey: league?.id ?? league?.leagueId ?? "global",
    fetcher: () => actions.getBoxScore(gameId),
  });

  const fallbackGame = scheduleGame ?? league?.gameById?.[gameId] ?? null;
  const game = unwrapBoxScoreResponse(archiveGame) ?? fallbackGame;
  const vm = useMemo(() => buildBoxScoreViewModel({ league, game, gameId, scheduleGame: fallbackGame, context: { season: league?.seasonId, week: league?.week } }), [league, game, gameId, fallbackGame]);
  const [sortState, setSortState] = useState({});

  if (!vm || vm.status === "unavailable") {
    return <EmptyState title="Game Book unavailable" body="Game data missing." />;
  }

  const storyBullets = buildGameBookStory(vm);
  const statLeaderCards = vm.statLeaderCards ?? [];
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
  const formatScoreAfter = (score) => {
    if (!score) return mdash;
    if (typeof score === "string") return score;
    if (score.home != null && score.away != null) return `${score.away}-${score.home}`;
    return mdash;
  };

  const teamRows = vm.teamComparisonRows ?? [];
  const dataChips = [
    ["Score", vm.availableData?.finalScore],
    ["Quarter", vm.availableData?.quarterScores],
    ["Team stats", vm.availableData?.teamStats],
    ["Player stats", vm.availableData?.playerStats],
    ["Scoring", vm.availableData?.scoringSummary],
  ];

  const tableSections = buildPlayerStatSections(vm.playerTables, sortState);

  const renderTable = (spec) => {
    const sort = spec.sort ?? { key: spec.defaultSort, dir: desc };
    const away = spec.teams?.away ?? [];
    const home = spec.teams?.home ?? [];
    if (!away.length && !home.length) return null;
    const rows = [[vm.awayTeam, away], [vm.homeTeam, home]];
    return (
      <section key={spec.title} className="bs-section" data-testid={tableTestId(spec.title)}>
        <div className="bs-section-header">
          <h4>{spec.title}</h4>
          <span className="bs-section-count">{spec.showingLabel}</span>
        </div>
        <div className="bs-table-wrap bs-table-wrap--compact">
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
        <div>
          <h2>Game Book</h2>
          <p className="bs-header-subtitle">Final score, leaders, team comparison, and recorded scoring context.</p>
        </div>
        <div className="bs-header-actions">
          {embedded && onBack ? <button type="button" className="btn btn-sm btn-secondary" data-testid="game-book-back-action" onClick={onBack}>Back to flow</button> : null}
          {!embedded && <button type="button" className="btn" onClick={onClose}>Close</button>}
        </div>
      </div>
      <section className="bs-section bs-summary-card">
        <div className="bs-final-hero">
          <div className={vm.winnerSide === "away" ? "bs-final-team is-winner" : "bs-final-team"}>
            <span className="bs-team-kicker">Away</span>
            <strong><TeamButton team={vm.awayTeam} onSelect={onTeamSelect} /></strong>
            <span className="bs-final-score-number">{vm.finalScore.away ?? mdash}</span>
          </div>
          <div className="bs-final-center">
            <span className="bs-final-pill">Final</span>
            <span className="bs-final-margin">{vm.margin != null ? `${vm.margin}-point ${vm.margin === 1 ? "game" : "margin"}` : "Score pending"}</span>
          </div>
          <div className={vm.winnerSide === "home" ? "bs-final-team is-winner" : "bs-final-team"}>
            <span className="bs-team-kicker">Home</span>
            <strong><TeamButton team={vm.homeTeam} onSelect={onTeamSelect} /></strong>
            <span className="bs-final-score-number">{vm.finalScore.home ?? mdash}</span>
          </div>
        </div>
        <h3>{vm.headlineSummary}</h3>
        <div className="bs-scoreline" data-testid="game-book-final-score">{vm.finalScoreLine}</div>
        <div>Week {vm.week ?? mdash} · Season {vm.season ?? mdash}</div>
        <div className="bs-data-chip-row" aria-label="Recorded game data">
          <span className={`status-chip ${QUALITY_BADGE_CLASS[vm.archiveQuality] ?? "muted"}`}>{vm.archiveQuality}</span>
          {dataChips.map(([label, exists]) => <span key={label} className={exists ? "bs-data-chip is-available" : "bs-data-chip"}>{label}</span>)}
        </div>
        {vm.detailWarning ? <p>{vm.detailWarning}</p> : null}
      </section>
      <section className="bs-section" data-testid="game-book-decision-summary">
        <h4>Why this game was decided</h4>
        {storyBullets.length ? <ul>{storyBullets.map((b) => <li key={b}>{b}</li>)}</ul> : <p>No detailed team/player stats were recorded for this game.</p>}
      </section>
      <section className="bs-section" data-testid="game-book-top-performers">
        <div className="bs-section-header">
          <h4>Top performers</h4>
          <span className="bs-section-count">Real box-score leaders only</span>
        </div>
        <div className="bs-leaders-grid">
          {statLeaderCards.map((card) => (
            <article key={card.key} className={card.available ? "bs-leader-card" : "bs-leader-card is-empty"} data-testid={`game-book-leader-${card.key}`}>
              <span className="bs-leader-label">{card.label}</span>
              {card.player && onPlayerSelect ? (
                <button type="button" className="btn-link bs-leader-name" data-testid="game-book-top-performer-link" onClick={() => openGameBookPlayer(card.player, leaderProfileRole(card))}>{card.line}</button>
              ) : <p className="bs-leader-name">{card.line}</p>}
              {card.teamSide ? <span className="bs-leader-team">{card.teamSide === "away" ? vm.awayTeam.abbr : vm.homeTeam.abbr}</span> : <span className="bs-leader-team">Stat group missing</span>}
            </article>
          ))}
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
              <tbody>{teamRows.map((row) => <tr key={row.key ?? row.label}><td>{row.label}</td><td className={row.winner === "away" ? "bs-compare-value--winner" : undefined}>{row.away ?? mdash}</td><td className={row.winner === "home" ? "bs-compare-value--winner" : undefined}>{row.home ?? mdash}</td></tr>)}</tbody>
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
      {tableSections.length ? tableSections.map(renderTable) : (
        <section className="bs-section" data-testid="game-book-player-stats-empty">
          <h4>Player stat tables</h4>
          <p>Player box score rows were not recorded for this game.</p>
        </section>
      )}
    </div>
  );
}

export default BoxScore;
