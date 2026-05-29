import React, { useMemo, useState } from "react";
import { EmptyState } from "./ScreenSystem.jsx";
import { buildBoxScoreViewModel, buildPlayerStatSections, unwrapBoxScoreResponse } from "../utils/boxScoreViewModel.js";
import useStableRouteRequest from "../hooks/useStableRouteRequest.js";
import { buildGameBookStory } from "../utils/gameBookStory.js";
import { getPlayerProfileId, hasValidPlayerProfileId, openPlayerProfile } from "../utils/playerProfileNavigation.js";
import ReplayableGameFlowViewer from "./ReplayableGameFlowViewer.jsx";
import AdvancedGameStats from "./AdvancedGameStats.jsx";
import { buildBroadcastGameNotes } from "../../core/broadcastNarrative.js";
import { buildReasoningBullets } from "../../core/gameSummary.js";

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
  const displayName = player.name ?? (player.playerId != null ? `Player #${player.playerId}` : 'Player');
  const rawId = getPlayerProfileId(player.playerId ?? player);
  if (!onSelect || !hasValidPlayerProfileId(rawId)) return <span>{displayName}</span>;
  return (
    <button
      type="button"
      className="btn-link"
      data-testid="game-book-player-link"
      onClick={() => openPlayerProfile(rawId, onSelect, { ...context, player, statLine: player?.stats })}
    >
      {displayName}
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

function BoxScore({ gameId, league, actions, onClose, onBack, onPlayerSelect, onTeamSelect, embedded = false, scheduleGame = null, isManualSimRun = false, backLabel = "Back to flow" }) {
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
  const [showAllPlays, setShowAllPlays] = useState(false);
  const [showReplay, setShowReplay] = useState(Boolean(isManualSimRun));
  // Tracks which collapsible sections the user has explicitly expanded.
  // CSS hides .bs-section-body--collapsible on mobile; desktop always shows them.
  const [expandedSections, setExpandedSections] = useState(() => new Set());

  const toggleSection = (key) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!vm || vm.status === "unavailable") {
    return <EmptyState title="Game Book unavailable" body="Game data missing." />;
  }

  const storyBullets = buildGameBookStory(vm);
  // Condensed Executive Summary bullets parsed from the identical
  // gameReasoningFlags tokens the live FinalOverlay uses (single translator).
  const reasoningBullets = buildReasoningBullets(vm.gameReasoningFlags ?? game?.gameReasoningFlags ?? []);
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
    ["Linescore", vm.availableData?.quarterScores],
    ["Team stats", vm.availableData?.teamStats],
    ["Player stats", vm.availableData?.playerStats],
    ["Scoring", vm.availableData?.scoringSummary],
    ["Drives", vm.availableData?.drives],
    ["Plays", vm.availableData?.playByPlay],
    ["Turning points", vm.availableData?.turningPoints],
  ];

  const tableSections = buildPlayerStatSections(vm.playerTables, sortState);
  const gfs = vm.gameFlowSummary ?? null;
  const driveRows = vm.driveSummaryRows ?? [];
  const turningPointRows = vm.turningPointRows ?? [];
  const notablePerformanceRows = vm.notablePerformanceRows ?? [];
  const injuryRows = vm.injuryRows ?? [];
  const playRows = vm.playByPlayRows ?? [];
  const keyPlayRows = playRows.filter((row) => row.isKey);
  const defaultPlayRows = keyPlayRows.slice(0, 12);
  const visiblePlayRows = showAllPlays ? playRows : defaultPlayRows;
  const canTogglePlays = playRows.length > 0 && (showAllPlays || visiblePlayRows.length < playRows.length || keyPlayRows.length === 0);
  const broadcastNotes = useMemo(() => buildBroadcastGameNotes({
    advancedAttribution: vm.advancedAttribution,
    gameFlowSummary: vm.gameFlowSummary,
  }, { maxNotes: 3 }), [vm.advancedAttribution, vm.gameFlowSummary]);

  const playCountLabel = showAllPlays
    ? `Showing all ${playRows.length} recorded plays`
    : keyPlayRows.length
      ? `Showing ${visiblePlayRows.length} key plays`
      : "No key plays detected";

  const renderPlayTags = (tags = []) => tags.length ? (
    <span className="bs-data-chip-row">
      {tags.map((tag) => <span key={tag} className="bs-data-chip is-available">{tag}</span>)}
    </span>
  ) : null;

  const renderTable = (spec) => {
    const isExpanded = expandedSections.has(spec.title);
    const sort = spec.sort ?? { key: spec.defaultSort, dir: desc };
    const away = spec.teams?.away ?? [];
    const home = spec.teams?.home ?? [];
    if (!away.length && !home.length) return null;
    const rows = [[vm.awayTeam, away], [vm.homeTeam, home]];
    return (
      <section key={spec.title} className="bs-section" data-testid={tableTestId(spec.title)} data-expanded={isExpanded}>
        <div className="bs-section-header">
          <button
            type="button"
            className="bs-section-toggle-btn"
            aria-expanded={isExpanded}
            data-testid={`game-book-table-toggle-${spec.key}`}
            onClick={() => toggleSection(spec.title)}
          >
            <h4>{spec.title}</h4>
            <span className="bs-section-count">{spec.showingLabel}</span>
            <span className="bs-section-chevron" aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
          </button>
        </div>
        <div className="bs-section-body bs-section-body--collapsible">
          <div className="bs-table-wrap bs-table-wrap--compact" role="region" aria-label={`${spec.title} player stats — scroll horizontally to view all columns`}>
            <table className="box-score-table">
              <caption className="sr-only">{spec.title} statistics for both teams</caption>
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">Player</th>
                  {spec.cols.map(([key, label]) => (
                    <th key={label} scope="col">
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
        </div>
      </section>
    );
  };

  const renderCollapsibleHeader = (sectionKey, title, countLabel) => {
    const isExp = expandedSections.has(sectionKey);
    return (
      <div className="bs-section-header">
        <button
          type="button"
          className="bs-section-toggle-btn"
          aria-expanded={isExp}
          data-testid={`game-book-section-toggle-${sectionKey}`}
          onClick={() => toggleSection(sectionKey)}
        >
          <h4>{title}</h4>
          {countLabel && <span className="bs-section-count">{countLabel}</span>}
          <span className="bs-section-chevron" aria-hidden="true">{isExp ? "▾" : "▸"}</span>
        </button>
      </div>
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
          {embedded && onBack ? <button type="button" className="btn btn-sm btn-secondary" data-testid="game-book-back-action" onClick={onBack}>{backLabel}</button> : null}
          {!embedded && <button type="button" className="btn" onClick={onClose}>Close</button>}
        </div>
      </div>

      {/* 1. Score summary — always visible */}
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

      {/* 1b. Executive Summary — condensed reasoning diagnostics, near top */}
      {reasoningBullets.length > 0 && (
        <section className="bs-section" data-testid="game-book-executive-summary">
          <div className="bs-section-header">
            <h4>Executive Summary</h4>
            <span className="bs-section-count">Why it played out this way</span>
          </div>
          <ul className="bs-list">
            {reasoningBullets.map((bullet) => (
              <li key={bullet} className="bs-list-item">{bullet}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. Key Performers — always visible near top */}
      <section className="bs-section bs-key-performers" data-testid="game-book-top-performers">
        <div className="bs-section-header">
          <h4>Key Performers</h4>
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

      {/* 3. Decision summary — always visible */}
      <section className="bs-section" data-testid="game-book-decision-summary">
        <h4>Why this game was decided</h4>
        {storyBullets.length ? <ul>{storyBullets.map((b) => <li key={b}>{b}</li>)}</ul> : <p>No detailed team/player stats were recorded for this game.</p>}
      </section>

      {/* 4. Team comparison — collapsible */}
      <section className="bs-section" data-testid="game-book-team-comparison" data-expanded={expandedSections.has("team-comparison")}>
        {renderCollapsibleHeader("team-comparison", "Team comparison", teamRows.length ? `${teamRows.length} stats` : "Not recorded")}
        <div className="bs-section-body bs-section-body--collapsible">
          {teamRows.length ? (
            <div className="bs-table-wrap" role="region" aria-label="Team stat comparison">
              <table className="box-score-table">
                <caption className="sr-only">Side-by-side team statistics: {vm.awayTeam.abbr} vs {vm.homeTeam.abbr}</caption>
                <thead><tr><th scope="col">Stat</th><th scope="col">{vm.awayTeam.abbr}</th><th scope="col">{vm.homeTeam.abbr}</th></tr></thead>
                <tbody>{teamRows.map((row) => <tr key={row.key ?? row.label}><td>{row.label}</td><td className={row.winner === "away" ? "bs-compare-value--winner" : undefined}>{row.away ?? mdash}</td><td className={row.winner === "home" ? "bs-compare-value--winner" : undefined}>{row.home ?? mdash}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p>Team totals were not recorded for this game.</p>}
        </div>
      </section>

      {/* 5. Scoring summary — collapsible */}
      <section className="bs-section" data-testid="game-book-scoring-summary" data-expanded={expandedSections.has("scoring-summary")}>
        {renderCollapsibleHeader("scoring-summary", "Scoring summary", vm.scoringSummary?.length ? `${vm.scoringSummary.length} scores` : "Not recorded")}
        <div className="bs-section-body bs-section-body--collapsible">
          {vm.scoringSummary?.length ? (
            <div className="bs-table-wrap" role="region" aria-label="Scoring summary — scroll horizontally to view all columns">
              <table className="box-score-table">
                <caption className="sr-only">Scoring plays: quarter, time, team, score type, description, and running score</caption>
                <thead><tr><th scope="col">Qtr</th><th scope="col">Time</th><th scope="col">Team</th><th scope="col">Type</th><th scope="col">Description</th><th scope="col">Score</th></tr></thead>
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
        </div>
      </section>

      {/* 6. Quarter scores — collapsible */}
      <section className="bs-section" data-testid="game-book-quarter-scores" data-expanded={expandedSections.has("quarter-scores")}>
        {renderCollapsibleHeader("quarter-scores", "Score by quarter", hasQuarter ? `${qCount} periods` : "Not recorded")}
        <div className="bs-section-body bs-section-body--collapsible">
          {hasQuarter ? (
            <div className="bs-table-wrap" role="region" aria-label="Score by quarter — scroll horizontally for overtime columns">
              <table className="box-score-table">
                <caption className="sr-only">Linescore: quarter-by-quarter scoring for both teams</caption>
                <thead>
                  <tr><th scope="row">Team</th>{headers.map((h) => <th key={h} scope="col">{h}</th>)}<th scope="col">Final</th></tr>
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
        </div>
      </section>

      {/* 7. Broadcast notes — collapsible */}
      {broadcastNotes.length ? (
        <section className="bs-section bs-broadcast-notes" data-testid="game-book-broadcast-notes" data-expanded={expandedSections.has("broadcast-notes")}>
          {renderCollapsibleHeader("broadcast-notes", "Broadcast Notes", `${broadcastNotes.length} notes`)}
          <div className="bs-section-body bs-section-body--collapsible">
            <ul className="bs-list" data-testid="game-book-broadcast-notes-list">
              {broadcastNotes.map((note) => (
                <li key={note.id} className="bs-list-item">
                  <span>{note.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* 8. Game Flow — collapsible */}
      {gfs && (
        <section className="bs-section" data-testid="game-book-game-flow" data-expanded={expandedSections.has("game-flow")}>
          {renderCollapsibleHeader("game-flow", "Game Flow", gfs.scoringTimeline.length ? `${gfs.scoringTimeline.length} scoring plays` : "Derived from sim data")}
          <div className="bs-section-body bs-section-body--collapsible">
            {gfs.scoringTimeline.length ? (
              <ul className="bs-list" aria-label="Scoring flow timeline">
                {gfs.scoringTimeline.map((entry, i) => (
                  <li key={i} className="bs-list-item" data-testid="game-flow-score-entry">
                    <strong>Q{entry.quarter} · {entry.label}</strong>
                    <span>{entry.scoreAfter.away}{mdash}{entry.scoreAfter.home}</span>
                    {entry.description ? <span>{entry.description}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {gfs.teamFlow && (vm.homeTeam?.id != null || vm.awayTeam?.id != null) ? (() => {
              const homeFlow = gfs.teamFlow[String(vm.homeTeam?.id)] ?? gfs.teamFlow[vm.homeTeam?.id] ?? null;
              const awayFlow = gfs.teamFlow[String(vm.awayTeam?.id)] ?? gfs.teamFlow[vm.awayTeam?.id] ?? null;
              if (!homeFlow && !awayFlow) return null;
              const flowRows = [
                ["Scoring Drives", awayFlow?.scoringDrives, homeFlow?.scoringDrives],
                ["Turnovers", awayFlow?.turnovers, homeFlow?.turnovers],
                ["Red Zone (Scr/Trips)", awayFlow ? `${awayFlow.redZoneScores}/${awayFlow.redZoneTrips}` : null, homeFlow ? `${homeFlow.redZoneScores}/${homeFlow.redZoneTrips}` : null],
                ["Explosive Plays", awayFlow?.explosivePlays, homeFlow?.explosivePlays],
              ].filter(([, a, h]) => a != null || h != null);
              return (
                <div className="bs-table-wrap" role="region" aria-label="Team game-flow snapshot" style={{ marginTop: "0.75rem" }}>
                  <table className="box-score-table" data-testid="game-flow-team-snapshot">
                    <caption className="sr-only">Team game-flow snapshot: scoring drives, turnovers, red zone, and explosive plays</caption>
                    <thead>
                      <tr>
                        <th scope="col">Metric</th>
                        <th scope="col">{vm.awayTeam?.abbr ?? "Away"}</th>
                        <th scope="col">{vm.homeTeam?.abbr ?? "Home"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flowRows.map(([label, away, home]) => (
                        <tr key={label} data-testid="game-flow-snapshot-row">
                          <td>{label}</td>
                          <td>{away ?? mdash}</td>
                          <td>{home ?? mdash}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })() : null}
            {gfs.turningPoints.length ? (
              <>
                <h5 style={{ marginTop: "0.75rem", marginBottom: "0.25rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>Key Turning Points</h5>
                <ul className="bs-list" aria-label="Game turning points from play digest">
                  {gfs.turningPoints.map((tp, i) => (
                    <li key={i} className="bs-list-item" data-testid="game-flow-turning-point">
                      <strong>Q{tp.quarter} · {tp.label}</strong>
                      <span>{tp.scoreContext.away}{mdash}{tp.scoreContext.home}</span>
                      {tp.description ? <span>{tp.description}</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </section>
      )}

      {/* 9. Replay — already has its own show/hide toggle, keep compact */}
      {gfs && (
        <section className="bs-section" data-testid="game-book-replay-section">
          <div className="bs-section-header">
            <h4>Replay Game Flow</h4>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              data-testid="game-book-replay-toggle"
              onClick={() => setShowReplay((prev) => !prev)}
              aria-expanded={showReplay}
            >
              {showReplay ? "Hide" : "Replay"}
            </button>
          </div>
          {showReplay && (
            <>
              {isManualSimRun && (
                <div style={{ marginBottom: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    data-testid="game-book-skip-to-box-score"
                    onClick={() => setShowReplay(false)}
                  >
                    Instant Skip to Box Score
                  </button>
                </div>
              )}
              <ReplayableGameFlowViewer
                gameFlowSummary={gfs}
                homeTeam={vm.homeTeam}
                awayTeam={vm.awayTeam}
                finalScore={vm.finalScore}
                initialMode={isManualSimRun ? "playing" : "paused"}
              />
            </>
          )}
        </section>
      )}

      {/* 10. Turning points — collapsible */}
      <section className="bs-section" data-testid="game-book-turning-points" data-expanded={expandedSections.has("turning-points")}>
        {renderCollapsibleHeader("turning-points", "Turning points", turningPointRows.length ? `${turningPointRows.length} moments` : "Not recorded")}
        <div className="bs-section-body bs-section-body--collapsible">
          {turningPointRows.length ? (
            <ul className="bs-list">
              {turningPointRows.map((row) => (
                <li key={row.id} className="bs-list-item" data-testid="game-book-turning-point-row">
                  <strong>{row.teamAbbr ?? "Game"} {row.inferred ? "(inferred)" : ""}</strong>
                  <span>{row.quarter != null ? `Q${row.quarter}` : mdash} {row.clock ?? mdash}</span>
                  <span>{row.text}</span>
                </li>
              ))}
            </ul>
          ) : <p>Turning points were not recorded or safely inferable for this game.</p>}
        </div>
      </section>

      {/* 11. Notable performances — collapsible */}
      {notablePerformanceRows.length ? (
        <section className="bs-section" data-testid="game-book-notable-performances" data-expanded={expandedSections.has("notable-performances")}>
          {renderCollapsibleHeader("notable-performances", "Notable performances", `${notablePerformanceRows.length} recorded`)}
          <div className="bs-section-body bs-section-body--collapsible">
            <ul className="bs-list">
              {notablePerformanceRows.map((row) => (
                <li key={row.id} className="bs-list-item" data-testid="game-book-notable-performance-row">
                  <strong>{row.name}{row.teamAbbr ? ` · ${row.teamAbbr}` : ""}</strong>
                  <span>{row.label}</span>
                  {row.text ? <span>{row.text}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* 12. Injuries — collapsible */}
      {injuryRows.length ? (
        <section className="bs-section" data-testid="game-book-injuries" data-expanded={expandedSections.has("injuries")}>
          {renderCollapsibleHeader("injuries", "Injuries", `${injuryRows.length} recorded`)}
          <div className="bs-section-body bs-section-body--collapsible">
            <ul className="bs-list">
              {injuryRows.map((row) => (
                <li key={row.id} className="bs-list-item" data-testid="game-book-injury-row">
                  <strong>{row.name}{row.teamAbbr ? ` · ${row.teamAbbr}` : ""}</strong>
                  <span>{row.detail}{row.duration != null ? ` · ${row.duration}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* 13. Drive Summary — collapsible */}
      <section className="bs-section" data-testid="game-book-drive-summary" data-expanded={expandedSections.has("drive-summary")}>
        {renderCollapsibleHeader("drive-summary", "Drive Summary", driveRows.length ? `${driveRows.length} drives` : "Not recorded")}
        <div className="bs-section-body bs-section-body--collapsible">
          {driveRows.length ? (
            <div className="bs-table-wrap" role="region" aria-label="Drive summary — scroll horizontally to view all columns">
              <table className="box-score-table">
                <caption className="sr-only">Drive summary: quarter, team, field position, result, plays, yards, and points per drive</caption>
                <thead><tr><th scope="col">Qtr</th><th scope="col">Team</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Result</th><th scope="col">Plays</th><th scope="col">Yards</th><th scope="col">Pts</th></tr></thead>
                <tbody>
                  {driveRows.map((row) => (
                    <tr key={row.id} data-testid="game-book-drive-row">
                      <td>{row.quarter ?? mdash}</td>
                      <td>{row.teamAbbr ?? mdash}</td>
                      <td>{row.startClock ?? mdash}</td>
                      <td>{row.endClock ?? mdash}</td>
                      <td>{row.result ?? row.summary ?? mdash}</td>
                      <td>{row.plays ?? mdash}</td>
                      <td>{row.yards ?? mdash}</td>
                      <td>{row.points ?? mdash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>Drive summary was not recorded for this game.</p>}
        </div>
      </section>

      {/* 14. Play-by-Play — collapsible */}
      <section className="bs-section" data-testid="game-book-play-by-play" data-expanded={expandedSections.has("play-by-play")}>
        {renderCollapsibleHeader("play-by-play", "Key Plays / Play-by-Play", playCountLabel)}
        <div className="bs-section-body bs-section-body--collapsible">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
            {canTogglePlays ? (
              <button type="button" className="btn btn-sm btn-secondary" data-testid="game-book-play-toggle" onClick={() => setShowAllPlays((prev) => !prev)}>
                {showAllPlays ? "Show key plays" : "Show all plays"}
              </button>
            ) : null}
          </div>
          {!playRows.length ? <p>Play-by-play was not recorded for this game.</p> : null}
          {playRows.length && !visiblePlayRows.length ? <p>No key plays were detected in the recorded play log.</p> : null}
          {visiblePlayRows.length ? (
            <ul className="bs-list">
              {visiblePlayRows.map((row) => (
                <li key={row.id} className="bs-list-item" data-testid="game-book-play-row">
                  <strong>{row.teamAbbr ?? "Game"} {row.playType ?? "play"}</strong>
                  <span>{row.quarter != null ? `Q${row.quarter}` : mdash} {row.clock ?? mdash}{row.scoreAfter ? ` · ${formatScoreAfter(row.scoreAfter)}` : ""}</span>
                  <span>{row.text}</span>
                  {renderPlayTags(row.tags)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {/* 15. Game plan impact — collapsible */}
      {vm.prepImpact?.length ? (
        <section className="bs-section" data-expanded={expandedSections.has("prep-impact")}>
          {renderCollapsibleHeader("prep-impact", "Game-plan impact", `${vm.prepImpact.length} items`)}
          <div className="bs-section-body bs-section-body--collapsible">
            <ul>{vm.prepImpact.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul>
          </div>
        </section>
      ) : null}

      {/* 16. Advanced Stats — collapsible wrapper only when attribution data present */}
      {Object.keys(vm.advancedAttribution ?? {}).length > 0 ? (
        <section className="bs-section" data-expanded={expandedSections.has("advanced-stats")}>
          {renderCollapsibleHeader("advanced-stats", "Advanced Stats", "Attribution & advanced")}
          <div className="bs-section-body bs-section-body--collapsible">
            <AdvancedGameStats
              advancedAttribution={vm.advancedAttribution}
              playerTables={vm.playerTables}
              awayTeam={vm.awayTeam}
              homeTeam={vm.homeTeam}
              onPlayerSelect={onPlayerSelect}
              context={{ ...gameContextBase, role: "Advanced Game Stats", returnTo: "game-book" }}
            />
          </div>
        </section>
      ) : (
        <AdvancedGameStats
          advancedAttribution={vm.advancedAttribution}
          playerTables={vm.playerTables}
          awayTeam={vm.awayTeam}
          homeTeam={vm.homeTeam}
          onPlayerSelect={onPlayerSelect}
          context={{ ...gameContextBase, role: "Advanced Game Stats", returnTo: "game-book" }}
        />
      )}

      {/* 17. Player stat tables — each individually collapsible */}
      {tableSections.length ? tableSections.map(renderTable) : (
        <section className="bs-section" data-testid="game-book-player-stats-empty">
          <h4>Player stat tables</h4>
          <p>Player box score rows were not recorded for this game.</p>
        </section>
      )}

      {/* Back to result — sticky footer on mobile for clear navigation */}
      {embedded && onBack ? (
        <div className="bs-section" style={{ textAlign: "center" }} data-testid="game-book-bottom-back">
          <button type="button" className="btn btn-secondary" onClick={onBack}>{backLabel}</button>
        </div>
      ) : null}
    </div>
  );
}

export default BoxScore;
