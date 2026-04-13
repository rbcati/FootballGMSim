import React, { useEffect, useMemo, useState } from "react";
import { EmptyState } from "./ScreenSystem.jsx";
import {
  deriveLeaders,
  deriveMomentumNotes,
  deriveQuarterScores,
  deriveScoringSummary,
  deriveTeamTotals,
  describeStatLine,
  getGameDetailSections,
  toPlayerArray,
} from "../utils/boxScorePresentation.js";
import { buildCompletedGamePresentation, getGameDetailPayload } from "../utils/boxScoreAccess.js";
import { normalizeArchivedGamePayload } from "../../core/gameArchive.js";
import { buildTeamComparisonRows, PLAYER_STATS_TABLES } from "../../core/footballMeta";

function TeamButton({ team, onSelect }) {
  if (!team) return <span>—</span>;
  if (!onSelect) return <span>{team.abbr}</span>;
  return <button className="btn-link" onClick={() => onSelect(team.id)}>{team.abbr}</button>;
}

function PlayerButton({ player, onSelect }) {
  if (!player) return <span>—</span>;
  if (!onSelect) return <span>{player.name}</span>;
  return <button className="btn-link" onClick={() => onSelect(player.playerId)}>{player.name}</button>;
}

function LeaderCard({ label, player, line, onPlayerSelect }) {
  if (!player) return null;
  return (
    <div className="bs-leader-card">
      <div className="bs-leader-label">{label}</div>
      <div className="bs-leader-name"><PlayerButton player={player} onSelect={onPlayerSelect} /></div>
      <div className="bs-leader-line">{line}</div>
    </div>
  );
}

function StatCompareRow({ label, homeValue, awayValue }) {
  return (
    <div className="bs-compare-row">
      <span>{awayValue ?? "—"}</span>
      <span className="bs-compare-label">{label}</span>
      <span>{homeValue ?? "—"}</span>
    </div>
  );
}

function PlayerTable({ title, players, cols, onPlayerSelect, emptyText }) {
  if (!players.length) return (<section className="bs-section"><h4>{title}</h4><EmptyState title={`${title} unavailable`} body={emptyText ?? `No ${title.toLowerCase()} available.`} /></section>);
  return (
    <section className="bs-section">
      <h4>{title}</h4>
      <div className="bs-table-wrap">
        <table className="box-score-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              {cols.map((col) => <th key={col.key}>{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={`${p.teamId}-${p.playerId}`}>
                <td><PlayerButton player={p} onSelect={onPlayerSelect} /></td>
                <td>{p.pos}</td>
                {cols.map((col) => <td key={col.key}>{p.stats?.[col.key] ?? "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BoxScore({ gameId, actions, league, onClose, onBack, onPlayerSelect, onTeamSelect, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [game, setGame] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setGame(null);

    actions?.getBoxScore?.(gameId)
      .then((res) => {
        if (!alive) return;
        const payload = normalizeArchivedGamePayload(res?.game ?? getGameDetailPayload(gameId, league));
        setGame(payload ?? null);
        if (!payload) setError(res?.error ?? "Box score unavailable for this game.");
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message ?? "Unable to load box score.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [actions, gameId]);

  const teamsById = useMemo(() => {
    const map = {};
    const teams = league?.teams ?? [];
    teams.forEach((t) => { map[t.id] = t; });
    return map;
  }, [league?.teams]);

  const homeTeam = teamsById[game?.homeId] ?? { id: game?.homeId, abbr: game?.homeAbbr ?? "HOME", wins: 0, losses: 0, ties: 0 };
  const awayTeam = teamsById[game?.awayId] ?? { id: game?.awayId, abbr: game?.awayAbbr ?? "AWAY", wins: 0, losses: 0, ties: 0 };

  const leaders = useMemo(() => deriveLeaders(game), [game]);
  const scoring = useMemo(() => (game?.scoringSummary?.length ? game.scoringSummary : deriveScoringSummary(game?.playLog ?? game?.stats?.playLogs ?? [], teamsById)), [game, teamsById]);
  const momentumNotes = useMemo(() => (Array.isArray(game?.turningPoints) && game.turningPoints.length ? game.turningPoints : deriveMomentumNotes(game?.playLog ?? game?.stats?.playLogs ?? [])), [game]);
  const quarterScores = useMemo(() => deriveQuarterScores(game, game?.playLog ?? game?.stats?.playLogs ?? []), [game]);
  const driveSummary = Array.isArray(game?.driveSummary) ? game.driveSummary : (Array.isArray(game?.drives) ? game.drives : []);
  const playLog = Array.isArray(game?.playLog) ? game.playLog : (Array.isArray(game?.stats?.playLogs) ? game.stats.playLogs : []);
  const hasQuarterData = quarterScores.home.some((value) => value != null) || quarterScores.away.some((value) => value != null);
  const canExpandDetails = scoring.length > 6 || driveSummary.length > 8 || playLog.length > 20;
  const quarterHeaders = useMemo(
    () => Array.from({ length: Math.max(quarterScores.home.length, quarterScores.away.length, 4) }, (_, idx) => (idx < 4 ? `Q${idx + 1}` : `OT${idx - 3}`)),
    [quarterScores],
  );
  const sections = useMemo(() => getGameDetailSections(game ?? {}), [game]);

  const awayPlayers = useMemo(() => toPlayerArray(game?.playerStats?.away ?? game?.stats?.away, game?.awayId), [game]);
  const homePlayers = useMemo(() => toPlayerArray(game?.playerStats?.home ?? game?.stats?.home, game?.homeId), [game]);
  const playerRows = useMemo(() => [...awayPlayers, ...homePlayers], [awayPlayers, homePlayers]);
  const teamTotals = useMemo(() => ({
    home: game?.teamStats?.home ?? deriveTeamTotals(game?.playerStats?.home ?? game?.stats?.home),
    away: game?.teamStats?.away ?? deriveTeamTotals(game?.playerStats?.away ?? game?.stats?.away),
  }), [game]);

  const topPassers = playerRows.filter((p) => (p.stats?.passAtt ?? 0) > 0).sort((a, b) => (b.stats?.passYd ?? 0) - (a.stats?.passYd ?? 0)).slice(0, 6);
  const topRushers = playerRows.filter((p) => (p.stats?.rushAtt ?? 0) > 0).sort((a, b) => (b.stats?.rushYd ?? 0) - (a.stats?.rushYd ?? 0)).slice(0, 6);
  const topReceivers = playerRows.filter((p) => (p.stats?.receptions ?? 0) > 0).sort((a, b) => (b.stats?.recYd ?? 0) - (a.stats?.recYd ?? 0)).slice(0, 6);
  const topDefenders = playerRows.filter((p) => (p.stats?.tackles ?? 0) + (p.stats?.sacks ?? 0) + (p.stats?.interceptions ?? 0) > 0).sort((a, b) => ((b.stats?.tackles ?? 0) + (b.stats?.sacks ?? 0) * 2 + (b.stats?.interceptions ?? 0) * 2) - ((a.stats?.tackles ?? 0) + (a.stats?.sacks ?? 0) * 2 + (a.stats?.interceptions ?? 0) * 2)).slice(0, 8);
  const teamComparisonRows = buildTeamComparisonRows(teamTotals);

  const headerWeek = game?.week ?? gameId?.match(/_w(\d+)_/)?.[1] ?? "—";
  const headerSeason = game?.seasonId ?? gameId?.split('_w')?.[0] ?? "";
  const availability = buildCompletedGamePresentation(game ?? { gameId }, { source: "game_detail_screen" });
  const archiveQuality = availability.archiveQuality;
  const hasAnyPayload = Boolean(game && (
    game.homeScore != null || game.awayScore != null || game.stats || game.playerStats || game.teamStats || game.recap || game.quarterScores
  ));
  const unavailableMessage = "No data saved for this game.";

  const shell = (
      <div className={`${embedded ? "card" : "modal-content modal-large box-score-modal"}`} onClick={(e) => !embedded && e.stopPropagation()}>
        <div className="box-score-header bs-header-sticky">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Week {headerWeek} · {headerSeason}</div>
            <h2 style={{ margin: "2px 0 8px" }}>Game Book</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {onBack && <button className="btn" onClick={onBack}>Back</button>}
            {!embedded && <button className="btn" onClick={onClose}>Close</button>}
          </div>
        </div>

        {loading && <div className="box-score-container"><EmptyState title="Loading box score…" body="Pulling archived game detail and postgame context." /></div>}
        {!loading && error && !hasAnyPayload && <div className="box-score-container"><EmptyState title="Game archive unavailable" body={`${unavailableMessage} (${availability.statusLabel ?? "Archive unavailable"})`} /></div>}

        {!loading && hasAnyPayload && game && (
          <div className="box-score-container">
            <section className="bs-score-hero">
              <div>
                <TeamButton team={awayTeam} onSelect={onTeamSelect} />
                <div className="bs-record">{awayTeam.wins ?? 0}-{awayTeam.losses ?? 0}{awayTeam.ties ? `-${awayTeam.ties}` : ""}</div>
              </div>
              <div className="bs-scoreline">{game.awayScore} - {game.homeScore}</div>
              <div>
                <TeamButton team={homeTeam} onSelect={onTeamSelect} />
                <div className="bs-record">{homeTeam.wins ?? 0}-{homeTeam.losses ?? 0}{homeTeam.ties ? `-${homeTeam.ties}` : ""}</div>
              </div>
            </section>
            {archiveQuality !== "full" && (
              <section className="bs-section" style={{ marginTop: 4 }} data-testid="archive-status">
                <div className="bs-list-item" style={{ borderColor: "var(--warning)", color: "var(--text-muted)" }}>
                  {archiveQuality === "partial"
                    ? "Partial archive: final score and key summary data are available, but full drive/play detail was not stored."
                    : "Archive missing: only limited matchup context could be recovered for this game."}
                </div>
              </section>
            )}

            <section className="bs-section">
              <div className="bs-section-header">
                <h4>Game recap</h4>
                {canExpandDetails ? <button className="btn" onClick={() => setExpanded((v) => !v)}>{expanded ? "Compact" : "Expand details"}</button> : null}
              </div>
              <div className="bs-list-item" style={{ marginBottom: 10 }}>
                {game?.summary?.storyline ?? game?.recap ?? "A complete box score was archived for this matchup."}
              </div>
              {game?.summary?.simOutputs && (
                <div className="bs-compare-grid" style={{ marginBottom: 10 }}>
                  <StatCompareRow
                    label="QB Rating"
                    awayValue={game.summary.simOutputs?.away?.qbRating?.toFixed?.(1) ?? game.summary.simOutputs?.away?.qbRating ?? "—"}
                    homeValue={game.summary.simOutputs?.home?.qbRating?.toFixed?.(1) ?? game.summary.simOutputs?.home?.qbRating ?? "—"}
                  />
                  <StatCompareRow
                    label="Rush YPC"
                    awayValue={game.summary.simOutputs?.away?.rushingYpc?.toFixed?.(2) ?? game.summary.simOutputs?.away?.rushingYpc ?? "—"}
                    homeValue={game.summary.simOutputs?.home?.rushingYpc?.toFixed?.(2) ?? game.summary.simOutputs?.home?.rushingYpc ?? "—"}
                  />
                  <StatCompareRow
                    label="Turnovers"
                    awayValue={game.summary.simOutputs?.away?.turnovers ?? "—"}
                    homeValue={game.summary.simOutputs?.home?.turnovers ?? "—"}
                  />
                  <StatCompareRow
                    label="Sacks"
                    awayValue={game.summary.simOutputs?.away?.sacks ?? "—"}
                    homeValue={game.summary.simOutputs?.home?.sacks ?? "—"}
                  />
                </div>
              )}
              {game?.summary?.playerOfGame?.name && (
                <div className="bs-list-item" style={{ marginBottom: 10 }}>
                  <strong>Player of the game:</strong> <PlayerButton player={game.summary.playerOfGame} onSelect={onPlayerSelect} />
                </div>
              )}
              <div className="bs-leaders-grid">
                <LeaderCard label="Passing leader" player={leaders.pass} line={describeStatLine(leaders.pass, ["passComp", "passAtt", "passYd", "passTD", "interceptions"])} onPlayerSelect={onPlayerSelect} />
                <LeaderCard label="Rushing leader" player={leaders.rush} line={describeStatLine(leaders.rush, ["rushAtt", "rushYd", "rushTD"])} onPlayerSelect={onPlayerSelect} />
                <LeaderCard label="Receiving leader" player={leaders.receive} line={describeStatLine(leaders.receive, ["receptions", "recYd", "recTD"])} onPlayerSelect={onPlayerSelect} />
                <LeaderCard label="Defensive leader" player={leaders.defense} line={describeStatLine(leaders.defense, ["tackles", "sacks", "interceptions", "forcedFumbles"])} onPlayerSelect={onPlayerSelect} />
              </div>
              {!leaders.pass && !leaders.rush && !leaders.receive && !leaders.defense ? (
                <EmptyState title="Player leaders not archived" body="This legacy game has a final score and recap, but player leader rows were not saved." />
              ) : null}
            </section>

            {sections.teamComparison && <section className="bs-section">
              <h4>Team comparison</h4>
              <div className="bs-compare-grid">
                {teamComparisonRows.map((row) => (
                  <StatCompareRow key={row.label} label={row.label} awayValue={row.awayValue} homeValue={row.homeValue} />
                ))}
              </div>
            </section>}

            <PlayerTable
              title={PLAYER_STATS_TABLES.passing.title}
              players={topPassers}
              cols={PLAYER_STATS_TABLES.passing.columns}
              onPlayerSelect={onPlayerSelect}
              emptyText={PLAYER_STATS_TABLES.passing.emptyText}
            />
            <PlayerTable
              title={PLAYER_STATS_TABLES.rushing.title}
              players={topRushers}
              cols={PLAYER_STATS_TABLES.rushing.columns}
              onPlayerSelect={onPlayerSelect}
              emptyText={PLAYER_STATS_TABLES.rushing.emptyText}
            />
            <PlayerTable
              title={PLAYER_STATS_TABLES.receiving.title}
              players={topReceivers}
              cols={PLAYER_STATS_TABLES.receiving.columns}
              onPlayerSelect={onPlayerSelect}
              emptyText={PLAYER_STATS_TABLES.receiving.emptyText}
            />
            {topDefenders.length > 0 ? (
              <PlayerTable
                title={PLAYER_STATS_TABLES.defense.title}
                players={topDefenders}
                cols={PLAYER_STATS_TABLES.defense.columns}
                onPlayerSelect={onPlayerSelect}
              />
            ) : null}
            {sections.scoringSummary && <section className="bs-section">
              <h4>Scoring summary</h4>
              {!!scoring.length ? (
                <div className="bs-list">
                  {scoring.slice(expanded ? 0 : 6).map((item) => (
                    <div key={item.id} className="bs-list-item">
                      <span>Q{item.quarter} {item.clock}</span>
                      <span><strong>{item.teamAbbr}</strong> · {item.type}</span>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No scoring log available" body="Scoring-play logs were not archived for this matchup." />}
            </section>}

            {sections.quarterByQuarter && <section className="bs-section">
              <h4>Quarter-by-quarter</h4>
              {hasQuarterData ? (
                <div className="bs-table-wrap">
                  <table className="box-score-table">
                    <thead><tr><th>Team</th>{quarterHeaders.map((label) => <th key={label}>{label}</th>)}<th>Final</th></tr></thead>
                    <tbody>
                      <tr><td><TeamButton team={awayTeam} onSelect={onTeamSelect} /></td>{quarterHeaders.map((_, idx) => <td key={`away-q-${idx}`}>{quarterScores.away[idx] ?? "Not archived"}</td>)}<td>{game.awayScore}</td></tr>
                      <tr><td><TeamButton team={homeTeam} onSelect={onTeamSelect} /></td>{quarterHeaders.map((_, idx) => <td key={`home-q-${idx}`}>{quarterScores.home[idx] ?? "Not archived"}</td>)}<td>{game.homeScore}</td></tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="Quarter scores not archived" body="Only the final score was saved for this game." />
              )}
            </section>}
            {sections.driveSummary && <section className="bs-section">
              <h4>Drive summary</h4>
              {!!driveSummary.length ? (
                <div className="bs-list">
                  {driveSummary.slice(expanded ? 0 : 8).map((drive, idx) => (
                    <div key={`drive-${idx}`} className="bs-list-item">
                      <span>Q{drive.quarter ?? "—"} {drive.startClock ?? drive.clock ?? ""}</span>
                      <span>{drive.teamAbbr ?? teamsById?.[Number(drive.teamId)]?.abbr ?? "Drive"}</span>
                      <span>{drive.result ?? drive.summary ?? `${drive.plays ?? 0} plays · ${drive.yards ?? 0} yds`}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No drive chart available" body="This game was simulated with summary-only detail." />}
            </section>}

            {sections.turningPoints && <section className="bs-section">
                <h4>Turning points</h4>
                {!!momentumNotes.length ?
                <div className="bs-list">
                  {momentumNotes.map((note) => (
                    <div key={note.id} className="bs-list-item"><span>Q{note.quarter}</span><span>{note.text}</span></div>
                  ))}
                </div>
              : <EmptyState title="No turning points available" body="Turning-point annotations are unavailable for this game." />}
              </section>}
            {sections.playLog && <section className="bs-section">
              <h4>Play log</h4>
              {!!playLog.length ? (
                <div className="bs-list">
                  {playLog.slice(expanded ? 0 : 20).map((play, idx) => (
                    <div key={`play-${idx}`} className="bs-list-item">
                      <span>Q{play.quarter ?? "—"} {play.clock ?? play.time ?? ""}</span>
                      <span>{teamsById?.[Number(play.teamId)]?.abbr ?? "—"}</span>
                      <span>{play.text ?? "Play event"}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No play log archived" body="Full event-by-event tracking was not available for this game." />}
            </section>}

            {game?.recap && (
              <section className="bs-section">
                <h4>Recap</h4>
                <div className="bs-list-item">{game.recap}</div>
              </section>
            )}
          </div>
        )}
      </div>
  );

  if (embedded) return shell;
  return <div className="modal-overlay" onClick={onClose}>{shell}</div>;
}
