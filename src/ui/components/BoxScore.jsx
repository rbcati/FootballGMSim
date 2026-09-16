import React, { useEffect, useMemo, useState } from "react";
import { EmptyState } from "./ScreenSystem.jsx";
import { buildGameBookPresentation, unwrapBoxScoreResponse } from "../utils/boxScoreViewModel.js";
import useStableRouteRequest from "../hooks/useStableRouteRequest.js";
import { getPlayerProfileId, hasValidPlayerProfileId, openPlayerProfile } from "../utils/playerProfileNavigation.js";
import { buildReasoningBullets } from "../../core/gameSummary.js";
import { buildLeagueCacheScopeKey } from '../utils/requestLoopGuard.js';

const mdash = "—";

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

const TAB_KEYS = ['passing', 'rushing', 'receiving', 'defense', 'kicking', 'returns'];

function BoxScore({
  gameId,
  league,
  actions,
  onClose,
  onBack,
  onPlayerSelect,
  onTeamSelect,
  embedded = false,
  scheduleGame = null,
  isManualSimRun = false,
  backLabel = "Back to flow",
  presentation = null,
  summarySupplement = null,
}) {
  const [activeTab, setActiveTab] = useState('passing');
  const [activeView, setActiveView] = useState('summary');
  const [activeTeam, setActiveTeam] = useState('away');
  const [activeLineupTeam, setActiveLineupTeam] = useState('away');
  const [activeLineupUnit, setActiveLineupUnit] = useState('offense');

  // A route can reuse this component instance for another game. Reset local
  // disclosure only when game identity changes so no previous game's tab or
  // player category appears while the new canonical record is selected.
  useEffect(() => {
    setActiveView('summary');
    setActiveTab('passing');
    setActiveTeam('away');
    setActiveLineupTeam('away');
    setActiveLineupUnit('offense');
  }, [gameId]);

  const canLoadArchive = Boolean(!presentation && gameId && typeof actions?.getBoxScore === "function");
  const { data: archiveGame } = useStableRouteRequest({
    requestKey: canLoadArchive ? `boxscore:${gameId}` : null,
    enabled: canLoadArchive,
    cacheScopeKey: buildLeagueCacheScopeKey(league),
    fetcher: () => actions.getBoxScore(gameId),
  });

  const fallbackGame = scheduleGame ?? league?.gameById?.[gameId] ?? null;
  const game = unwrapBoxScoreResponse(archiveGame) ?? fallbackGame;
  const vm = useMemo(
    () => presentation ?? buildGameBookPresentation({ league, game, gameId, scheduleGame: fallbackGame, context: { season: league?.seasonId, week: league?.week } }),
    [presentation, league, game, gameId, fallbackGame],
  );

  const dismissHandler = onClose ?? onBack;

  if (!vm || vm.status === "unavailable") {
    return (
      <div className={`bs-sheet${embedded ? " bs-sheet--embedded" : ""}`} data-testid="box-score-sheet">
        {!embedded && <button
          type="button"
          className="bs-sheet-dismiss"
          data-testid="game-book-close"
          onClick={dismissHandler}
          aria-label="Close box score"
        >
          ✕
        </button>}
        <p className="bs-sheet-unavailable">Game data missing.</p>
      </div>
    );
  }

  const rawFlags = vm.gameReasoningFlags ?? game?.gameReasoningFlags ?? [];
  const reasoningBullets = buildReasoningBullets(rawFlags);

  const tableSections = vm.playerStatSections ?? [];
  const activeSection = tableSections.find((s) => s.key === activeTab) ?? null;

  // Score values
  const awayAbbr = vm.awayTeam?.abbr ?? "AWY";
  const homeAbbr = vm.homeTeam?.abbr ?? "HME";
  const awayScore = vm.finalScore?.away ?? mdash;
  const homeScore = vm.finalScore?.home ?? mdash;

  // W/L badge for user's team
  const userId = Number(league?.userTeamId ?? 0);
  const homeTeamId = Number(vm.homeTeam?.id ?? -1);
  const userIsHome = userId > 0 && homeTeamId === userId;
  const numHome = Number(vm.finalScore?.home ?? NaN);
  const numAway = Number(vm.finalScore?.away ?? NaN);
  const scoreDefined = Number.isFinite(numHome) && Number.isFinite(numAway);
  const tied = scoreDefined && numHome === numAway;
  const homeWon = scoreDefined && numHome > numAway;
  const userWon = !tied && userId > 0 && ((userIsHome && homeWon) || (!userIsHome && !homeWon));
  const wlLabel = !userId || !scoreDefined ? "" : tied ? "T" : userWon ? "W" : "L";
  const wlTone = tied ? "info" : userWon ? "ok" : "danger";

  const gameContextBase = {
    source: "game-book",
    gameId: vm.gameId ?? gameId,
    week: vm.week,
    seasonId: vm.season,
    awayTeam: vm.awayTeam,
    homeTeam: vm.homeTeam,
  };

  const renderStatRows = (section) => {
    if (!section) {
      return <p className="bs-sheet-no-stats">No {activeTab} stats recorded.</p>;
    }
    const away = section.teams?.away ?? [];
    const home = section.teams?.home ?? [];
    if (!away.length && !home.length) {
      return <p className="bs-sheet-no-stats">No {activeTab} stats recorded.</p>;
    }
    const cols = section.cols.slice(0, 3);
    const renderTeam = (side, players, team) => <section className={`bs-sheet-team-panel bs-sheet-team-panel--${side}${activeTeam === side ? ' is-active' : ''}`} data-testid={`game-book-team-${side}`} aria-label={`${team.abbr} ${section.title}`}>
      <h3 className="bs-sheet-team-heading">{team.abbr} <span>{section.title}</span></h3>
      {players.length ? <table className="bs-sheet-table" data-testid={`game-book-table-${activeTab}-${side}`} aria-label={`${team.abbr} ${section.title} statistics`}>
        <thead>
          <tr>
            <th scope="col">Player</th>
            {cols.map(([key, label]) => (
              <th key={key} scope="col">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={String(p.playerId)}>
              <td className="bs-sheet-player-cell">
                <PlayerButton
                  player={p}
                  onSelect={onPlayerSelect}
                  context={{ ...gameContextBase, role: section.title, returnTo: "game-book" }}
                />
              </td>
              {cols.map(([key]) => (
                <td key={key}>{p.stats?.[key] ?? mdash}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table> : <p className="bs-sheet-no-stats">No {activeTab} stats recorded for {team.abbr}.</p>}
    </section>;
    return <>
      <div className="bs-sheet-team-switcher" role="tablist" aria-label="Select team statistics">
        {[['away', vm.awayTeam], ['home', vm.homeTeam]].map(([side, team]) => <button key={side} type="button" role="tab" aria-selected={activeTeam === side} className={activeTeam === side ? 'is-active' : ''} onClick={() => setActiveTeam(side)}>{team.abbr}</button>)}
      </div>
      <div className="bs-sheet-team-grid" data-testid={`game-book-table-${activeTab}`}>
        {renderTeam('away', away, vm.awayTeam)}
        {renderTeam('home', home, vm.homeTeam)}
      </div>
    </>;
  };

  // Key leaders — top performers surfaced above dense tables so mobile users
  // answer "who won it" before drilling into full stat sheets.
  const keyLeaders = vm.keyPerformers ?? [];

  // Decisive moments — short, always-visible teaser (turning points, falling
  // back to the first few scoring plays). The exhaustive list lives in the
  // collapsed "Full Scoring Summary" section below.
  const decisiveMoments = vm.decisiveMoments ?? [];
  const scoringSummaryRows = vm.scoringSummary ?? [];
  const teamComparisonRows = vm.teamComparisonRows ?? [];
  const playByPlayRows = vm.playByPlayRows ?? [];
  const specialTeams = vm.specialTeams ?? null;
  const specialTeamsNoteText = (note) => {
    if (note.side === 'home') return `${homeAbbr} — ${note.text}`;
    if (note.side === 'away') return `${awayAbbr} — ${note.text}`;
    return note.text;
  };

  return (
    <div
      className={`bs-sheet${embedded ? " bs-sheet--embedded" : ""}`}
      data-testid="box-score-sheet"
    >
      {/* Single ✕ dismiss — top-right */}
      {!embedded && <button
        type="button"
        className="bs-sheet-dismiss"
        data-testid="game-book-close"
        onClick={dismissHandler}
        aria-label="Close box score"
      >
        ✕
      </button>}

      {/* ── SCORE HERO ~60px — priority 1: what happened ───────────────── */}
      <div className="bs-sheet-hero" data-testid="game-book-score-hero">
        <h1 className="bs-sheet-score-display" aria-label={vm.finalScoreLine}>
          <span className="bs-sheet-abbr"><TeamButton team={vm.awayTeam} onSelect={onTeamSelect} /></span>
          <span className="bs-sheet-pts">{awayScore}</span>
          <span className="bs-sheet-sep">·</span>
          <span className="bs-sheet-pts">{homeScore}</span>
          <span className="bs-sheet-abbr"><TeamButton team={vm.homeTeam} onSelect={onTeamSelect} /></span>
          {wlLabel && (
            <span className={`bs-sheet-wl bs-sheet-wl--${wlTone}`} aria-label={wlLabel === "W" ? "Win" : wlLabel === "L" ? "Loss" : "Tie"}>
              {wlLabel}
            </span>
          )}
        </h1>
        {/* Stable machine-readable test hook; hidden from AT to avoid announcing the heading twice. */}
        <div className="sr-only" aria-hidden="true" data-testid="game-book-final-score">{vm.finalScoreLine}</div>
        <div className="bs-sheet-meta">Week {vm.week ?? mdash} · Season {vm.season ?? mdash}</div>
      </div>

      <div className="bs-sheet-view-tabs" role="tablist" aria-label="Game Book sections">
        {[
          ['summary', 'Summary'],
          ...(teamComparisonRows.length ? [['team-stats', 'Team Stats']] : []),
          ...(tableSections.length ? [['players', 'Players']] : []),
          ...((vm.recordedLineups || vm.playerTables?.away?.length || vm.playerTables?.home?.length) ? [['lineups', vm.recordedLineups ? 'Lineups' : 'Participants']] : []),
          ...(playByPlayRows.length ? [['plays', 'Plays']] : []),
        ].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={activeView === key} className={`bs-sheet-view-tab${activeView === key ? ' is-active' : ''}`} onClick={() => setActiveView(key)}>{label}</button>
        ))}
      </div>

      <div role="tabpanel" data-testid={`game-book-view-${activeView}`}>

      {/* ── KEY LEADERS — priority 2: top performers above dense tables ─── */}
      {activeView === 'summary' && keyLeaders.length > 0 && (
        <div className="bs-sheet-leaders" data-testid="game-book-leaders">
          <div className="bs-sheet-section-title">Key Leaders</div>
          {keyLeaders.map((leader) => (
            <div key={leader.key} className="bs-sheet-leader-row" data-testid={`game-book-leader-${leader.key}`}>
              <span className="bs-sheet-leader-label">{leader.label}</span>
              <span className="bs-sheet-leader-line">{leader.line}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── EXECUTIVE SUMMARY — inline bullets or hidden debug div ──────── */}
      {activeView === 'summary' && reasoningBullets.length > 0 ? (
        <div className="bs-sheet-exec" data-testid="game-book-executive-summary">
          {reasoningBullets.slice(0, 3).map((bullet) => (
            <span key={bullet} className="bs-sheet-exec-bullet">• {bullet}</span>
          ))}
        </div>
      ) : activeView === 'summary' ? (
        /* Debug div: hidden from UI but inspectable during development to verify
           that the gameReasoningFlags array is arriving correctly. The data-flags-count
           attribute surfaces the raw array length so you can confirm the prop plumbing
           without conditionally removing this block. */
        <div
          hidden
          aria-hidden="true"
          data-testid="game-book-exec-debug"
          data-flags-count={String(rawFlags.length)}
        />
      ) : null}

      {/* ── DECISIVE MOMENTS — priority 3: short teaser, always visible ─── */}
      {activeView === 'summary' && decisiveMoments.length > 0 && (
        <div className="bs-sheet-moments" data-testid="game-book-moments">
          <div className="bs-sheet-section-title">Decisive Moments</div>
          {decisiveMoments.map((m, i) => (
            <div key={m.id ?? i} className="bs-sheet-moment-row">
              <span className="bs-sheet-moment-meta">
                {m.periodLabel ?? (m.quarter != null ? `Q${m.quarter}` : "")}{(m.time ?? m.clock) ? ` ${m.time ?? m.clock}` : ""}
              </span>
              <span className="bs-sheet-moment-text">{m.text ?? m.description ?? "Momentum swing"}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── QUARTER BREAKDOWN — honest availability (#1700 review defect #1) ─
          Canonical-ledger games own no chronological quarters, so no quarter
          table is shown; a compact honest note appears instead. Legacy archives
          with genuine stored quarter data still render their linescore. The
          final score + scoring summary below remain fully canonical either way. */}
      {activeView === 'summary' && vm.isCanonicalLedger && !vm.availableData?.quarterScores && (
        <div className="bs-sheet-quarter-unavailable" data-testid="game-book-quarter-unavailable">
          Quarter breakdown unavailable for this game.
        </div>
      )}

      {/* ── FULL SCORING SUMMARY — collapsed, exhaustive list ────────────── */}
      {activeView === 'summary' && scoringSummaryRows.length > 0 && (
        <details className="bs-sheet-details" data-testid="game-book-scoring-summary">
          <summary>Full Scoring Summary ({scoringSummaryRows.length})</summary>
          <div className="bs-sheet-details-body">
            {scoringSummaryRows.map((row) => (
              <div key={row.id} className="bs-sheet-row">
                <span className="bs-sheet-row-meta">
                  {row.periodLabel ?? (row.quarter != null ? `Q${row.quarter}` : "")}{row.time ? ` ${row.time}` : ""}
                </span>
                <span>{[row.teamAbbr, row.type, row.description].filter(Boolean).join(" — ")}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── TEAM STAT COMPARISON — priority 4, collapsed ─────────────────── */}
      {activeView === 'team-stats' && teamComparisonRows.length > 0 && (
        <section className="bs-sheet-details" data-testid="game-book-team-stats" aria-label="Team Stat Comparison">
          <h3 className="bs-sheet-view-heading">Team Stat Comparison</h3>
          <div className="bs-sheet-details-body">
            <div className="bs-sheet-compare-head">
              <span>{awayAbbr}</span>
              <span />
              <span>{homeAbbr}</span>
            </div>
            {teamComparisonRows.map((row) => (
              <div key={row.key} className="bs-sheet-compare-row" data-testid={`game-book-compare-${row.key}`}>
                <span className={`bs-sheet-compare-value${row.winner === "away" ? " is-winner" : ""}`}>{row.away ?? mdash}</span>
                <span className="bs-sheet-compare-label">{row.label}</span>
                <span className={`bs-sheet-compare-value${row.winner === "home" ? " is-winner" : ""}`}>{row.home ?? mdash}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── SPECIAL TEAMS — compact kicking & field-position summary ─────── */}
      {activeView === 'summary' && specialTeams?.hasData && (
        <div className="bs-sheet-leaders" data-testid="game-book-special-teams">
          <div className="bs-sheet-section-title">Special Teams</div>
          <div className="bs-sheet-compare-head">
            <span>{awayAbbr}</span>
            <span />
            <span>{homeAbbr}</span>
          </div>
          {specialTeams.rows.map((row) => (
            <div key={row.key} className="bs-sheet-compare-row" data-testid={`game-book-special-teams-${row.key}`}>
              <span className="bs-sheet-compare-value">{row.away}</span>
              <span className="bs-sheet-compare-label">{row.label}</span>
              <span className="bs-sheet-compare-value">{row.home}</span>
            </div>
          ))}
          {specialTeams.notes.length > 0 && (
            <div className="bs-sheet-exec" data-testid="game-book-special-teams-notes">
              {specialTeams.notes.map((note) => (
                <span key={note.id} className="bs-sheet-exec-bullet">• {specialTeamsNoteText(note)}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {activeView === 'summary' && summarySupplement}

      {/* ── FULL PLAYER STATS — priority 5, collapsed dense tables ───────── */}
      {activeView === 'players' && <section className="bs-sheet-details" data-testid="game-book-player-stats" aria-label="Player Stats">
        <h3 className="bs-sheet-view-heading">Player Stats</h3>
        <p className="bs-sheet-participant-label" data-testid="game-book-participant-label">{vm.gameDayUnits ? 'Game-day lineup recorded' : 'Recorded Participants'}</p>
        <div className="bs-sheet-details-body">
          <div className="bs-sheet-tab-row" data-testid="game-book-stat-tabs" role="tablist" aria-label="Stat category">
            {TAB_KEYS.filter((tab) => tableSections.some((section) => section.key === tab)).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={`bs-sheet-tab${activeTab === tab ? " is-active" : ""}`}
                data-testid={`game-book-tab-${tab}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <div className="bs-sheet-stat-body" data-testid="game-book-stat-body" role="tabpanel">
            {renderStatRows(activeSection)}
          </div>
        </div>
      </section>}

      {activeView === 'lineups' && <section className="bs-sheet-details bs-sheet-lineups" data-testid="game-book-lineups" aria-label={vm.recordedLineups ? 'Recorded game-day lineups' : 'Recorded participants'}>
        <h3 className="bs-sheet-view-heading">{vm.recordedLineups ? 'Recorded Game-day Lineups' : 'Recorded Participants'}</h3>
        <div className="bs-sheet-team-switcher is-lineup" role="tablist" aria-label="Select lineup team">
          {[['away', vm.awayTeam], ['home', vm.homeTeam]].map(([side, team]) => <button key={side} type="button" role="tab" aria-selected={activeLineupTeam === side} className={activeLineupTeam === side ? 'is-active' : ''} onClick={() => setActiveLineupTeam(side)}>{team.abbr}</button>)}
        </div>
        {vm.recordedLineups ? <div className="bs-sheet-lineup-units" role="tablist" aria-label="Select lineup unit">
          {['offense', 'defense'].map((unit) => <button key={unit} type="button" role="tab" aria-selected={activeLineupUnit === unit} className={activeLineupUnit === unit ? 'is-active' : ''} onClick={() => setActiveLineupUnit(unit)}>{unit[0].toUpperCase() + unit.slice(1)}</button>)}
        </div> : null}
        <div className="bs-sheet-lineup-list" data-testid={`game-book-lineup-${activeLineupTeam}-${activeLineupUnit}`}>
          {(vm.recordedLineups?.[activeLineupTeam]?.[activeLineupUnit] ?? vm.playerTables?.[activeLineupTeam] ?? []).map((player) => <div className="bs-sheet-lineup-row" key={String(player.playerId)} data-player-id={String(player.playerId)}>
            <span>{player.pos ?? '—'}</span>
            <PlayerButton player={player} onSelect={onPlayerSelect} context={{ ...gameContextBase, source: 'game-book', role: vm.recordedLineups ? `${activeLineupUnit} lineup` : 'recorded participant', returnTo: 'game-book' }} />
          </div>)}
        </div>
      </section>}

      {/* ── FULL PLAY-BY-PLAY — priority 6, collapsed drive/play log ─────── */}
      {activeView === 'plays' && playByPlayRows.length > 0 && (
        <section className="bs-sheet-details" data-testid="game-book-play-by-play" aria-label="Play-by-Play">
          <h3 className="bs-sheet-view-heading">Play-by-Play ({playByPlayRows.length})</h3>
          <div className="bs-sheet-details-body">
            {playByPlayRows.map((row) => (
              <div key={row.id} className={`bs-sheet-row${row.isKey ? " bs-sheet-row--key" : ""}`}>
                <span className="bs-sheet-row-meta">
                  {row.quarter != null ? `Q${row.quarter}` : ""}{row.clock ? ` ${row.clock}` : ""}
                </span>
                <span>{row.teamAbbr ? `${row.teamAbbr} — ` : ""}{row.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}

export default BoxScore;
