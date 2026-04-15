import React, { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "./ScreenSystem.jsx";
import {
  deriveLeaders,
  deriveMomentumNotes,
  deriveQuarterScores,
  deriveScoringSummary,
  deriveTeamTotals,
  describeStatLine,
  getGameDetailSections,
  groupScoringByPeriod,
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
  if (!onSelect || !player.playerId) return <span>{player.name}</span>;
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

function StatCompareRow({ label, homeValue, awayValue, homeWins, awayWins }) {
  return (
    <div className="bs-compare-row">
      <span className={awayWins ? "bs-compare-value bs-compare-value--winner" : "bs-compare-value"}>{awayValue ?? "—"}</span>
      <span className="bs-compare-label">{label}</span>
      <span className={homeWins ? "bs-compare-value bs-compare-value--winner" : "bs-compare-value"}>{homeValue ?? "—"}</span>
    </div>
  );
}

const SECTION_LINKS = [
  { key: "summary", label: "Summary" },
  { key: "team", label: "Team Stats" },
  { key: "players", label: "Players" },
  { key: "scoring", label: "Scoring" },
  { key: "drives", label: "Drives" },
  { key: "plays", label: "Plays" },
];

function compareNumeric(awayValue, homeValue) {
  if (awayValue == null || homeValue == null || Number.isNaN(Number(awayValue)) || Number.isNaN(Number(homeValue))) {
    return { awayWins: false, homeWins: false };
  }
  const awayNum = Number(awayValue);
  const homeNum = Number(homeValue);
  if (awayNum === homeNum) return { awayWins: false, homeWins: false };
  return { awayWins: awayNum > homeNum, homeWins: homeNum > awayNum };
}

function formatRecord(team) {
  return `${team.wins ?? 0}-${team.losses ?? 0}${team.ties ? `-${team.ties}` : ""}`;
}

function TeamStatsSection({ rows }) {
  const grouped = useMemo(() => ([
    { title: "Overview", keys: ["Total Yards", "First Downs"] },
    { title: "Passing & Rushing", keys: ["Pass Yards", "Rush Yards", "Rush YPC"] },
    { title: "Efficiency", keys: ["3rd Down", "Time of Possession"] },
    { title: "Turnovers & Defense", keys: ["Turnovers", "Sacks"] },
  ].map((g) => ({ ...g, rows: rows.filter((row) => g.keys.includes(row.label)) })).filter((g) => g.rows.length > 0)), [rows]);

  if (!rows.length) {
    return <EmptyState title="Team stats unavailable" body="Team totals were not archived for this game." />;
  }

  return (
    <div className="bs-team-groups">
      {grouped.map((group) => (
        <div key={group.title} className="bs-team-group">
          <h5>{group.title}</h5>
          <div className="bs-compare-grid">
            {group.rows.map((row) => {
              const outcome = compareNumeric(row.awayRaw, row.homeRaw);
              return (
                <StatCompareRow
                  key={row.label}
                  label={row.label}
                  awayValue={row.awayValue}
                  homeValue={row.homeValue}
                  awayWins={outcome.awayWins}
                  homeWins={outcome.homeWins}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function sortPlayers(players, sortKey, direction) {
  return [...players].sort((a, b) => {
    const av = Number(a.stats?.[sortKey] ?? 0);
    const bv = Number(b.stats?.[sortKey] ?? 0);
    return direction === "desc" ? bv - av : av - bv;
  });
}

function PlayerCategoryTable({ title, players, cols, onPlayerSelect, emptyText, defaultSort }) {
  const [sort, setSort] = useState({ key: defaultSort ?? cols[0]?.key, direction: "desc" });
  const sortedPlayers = useMemo(() => sortPlayers(players, sort.key, sort.direction), [players, sort]);

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key
      ? { key, direction: prev.direction === "desc" ? "asc" : "desc" }
      : { key, direction: "desc" }));
  };

  if (!players.length) {
    return (
      <section className="bs-subsection">
        <h5>{title}</h5>
        <EmptyState title={`${title} unavailable`} body={emptyText ?? `No ${title.toLowerCase()} available.`} />
      </section>
    );
  }

  return (
    <section className="bs-subsection">
      <h5>{title}</h5>
      <div className="bs-table-wrap">
        <table className="box-score-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              {cols.map((col) => (
                <th key={col.key}>
                  <button className="bs-sort-btn" onClick={() => handleSort(col.key)}>
                    {col.label}{sort.key === col.key ? (sort.direction === "desc" ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((p) => (
              <tr key={`${p.teamId}-${p.playerId}-${title}`}>
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

export function GameBookQuickNav({ activeSection, onJump }) {
  return (
    <nav className="bs-quick-nav" aria-label="Game Book sections" data-testid="gamebook-quick-nav">
      {SECTION_LINKS.map((section) => (
        <button
          key={section.key}
          className={activeSection === section.key ? "bs-nav-pill is-active" : "bs-nav-pill"}
          onClick={() => onJump(section.key)}
          type="button"
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

export default function BoxScore({ gameId, actions, league, onClose, onBack, onPlayerSelect, onTeamSelect, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [game, setGame] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState("summary");
  const [playerTeamFilter, setPlayerTeamFilter] = useState("all");
  const sectionRefs = useRef({});

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
  }, [actions, gameId, league]);

  useEffect(() => {
    if (!game) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.dataset?.section) {
        setActiveSection(visible.target.dataset.section);
      }
    }, { rootMargin: "-20% 0px -60% 0px", threshold: [0.1, 0.3, 0.6] });

    SECTION_LINKS.forEach((section) => {
      const node = sectionRefs.current[section.key];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [game]);

  const jumpToSection = (sectionKey) => {
    setActiveSection(sectionKey);
    sectionRefs.current[sectionKey]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
  const scoringGroups = useMemo(() => groupScoringByPeriod(scoring), [scoring]);
  const momentumNotes = useMemo(() => (Array.isArray(game?.turningPoints) && game.turningPoints.length ? game.turningPoints : deriveMomentumNotes(game?.playLog ?? game?.stats?.playLogs ?? [])), [game]);
  const quarterScores = useMemo(() => deriveQuarterScores(game, game?.playLog ?? game?.stats?.playLogs ?? []), [game]);
  const driveSummary = Array.isArray(game?.driveSummary) ? game.driveSummary : (Array.isArray(game?.drives) ? game.drives : []);
  const playLog = Array.isArray(game?.playLog) ? game.playLog : (Array.isArray(game?.stats?.playLogs) ? game.stats.playLogs : []);
  const hasQuarterData = quarterScores.home.some((value) => value != null) || quarterScores.away.some((value) => value != null);
  const canExpandDetails = scoring.length > 8 || driveSummary.length > 10 || playLog.length > 24;
  const quarterHeaders = useMemo(
    () => Array.from({ length: Math.max(quarterScores.home.length, quarterScores.away.length, 4) }, (_, idx) => (idx < 4 ? `Q${idx + 1}` : `OT${idx - 3}`)),
    [quarterScores],
  );
  const sections = useMemo(() => getGameDetailSections(game ?? {}), [game]);

  const awayPlayers = useMemo(() => toPlayerArray(game?.playerStats?.away ?? game?.stats?.away, game?.awayId), [game]);
  const homePlayers = useMemo(() => toPlayerArray(game?.playerStats?.home ?? game?.stats?.home, game?.homeId), [game]);
  const playerRows = useMemo(() => [...awayPlayers, ...homePlayers], [awayPlayers, homePlayers]);

  const filteredPlayers = useMemo(() => {
    if (playerTeamFilter === "away") return awayPlayers;
    if (playerTeamFilter === "home") return homePlayers;
    return playerRows;
  }, [awayPlayers, homePlayers, playerRows, playerTeamFilter]);

  const teamTotals = useMemo(() => ({
    home: game?.teamStats?.home ?? deriveTeamTotals(game?.playerStats?.home ?? game?.stats?.home),
    away: game?.teamStats?.away ?? deriveTeamTotals(game?.playerStats?.away ?? game?.stats?.away),
  }), [game]);

  const simOutputs = game?.summary?.simOutputs;
  const rushingYpcAway = simOutputs?.away?.rushingYpc ?? ((teamTotals.away?.rushAtt ?? 0) > 0 ? (teamTotals.away?.rushYards ?? 0) / teamTotals.away.rushAtt : null);
  const rushingYpcHome = simOutputs?.home?.rushingYpc ?? ((teamTotals.home?.rushAtt ?? 0) > 0 ? (teamTotals.home?.rushYards ?? 0) / teamTotals.home.rushAtt : null);
  const teamComparisonRows = useMemo(() => {
    const baseRows = buildTeamComparisonRows(teamTotals).map((row) => ({ ...row, awayRaw: null, homeRaw: null }));
    return [
      ...baseRows,
      {
        label: "First Downs",
        awayValue: teamTotals.away?.firstDowns ?? "Unavailable",
        homeValue: teamTotals.home?.firstDowns ?? "Unavailable",
        awayRaw: teamTotals.away?.firstDowns,
        homeRaw: teamTotals.home?.firstDowns,
      },
      {
        label: "Rush YPC",
        awayValue: rushingYpcAway != null ? Number(rushingYpcAway).toFixed(2) : "Unavailable",
        homeValue: rushingYpcHome != null ? Number(rushingYpcHome).toFixed(2) : "Unavailable",
        awayRaw: rushingYpcAway,
        homeRaw: rushingYpcHome,
      },
      {
        label: "Time of Possession",
        awayValue: teamTotals.away?.timePossession ?? "Unavailable",
        homeValue: teamTotals.home?.timePossession ?? "Unavailable",
        awayRaw: teamTotals.away?.timePossession,
        homeRaw: teamTotals.home?.timePossession,
      },
    ];
  }, [rushingYpcAway, rushingYpcHome, teamTotals]);

  const topFacts = useMemo(() => {
    const totalYardEdge = (teamTotals.home?.totalYards ?? 0) - (teamTotals.away?.totalYards ?? 0);
    const turnoverMargin = (teamTotals.away?.turnovers ?? 0) - (teamTotals.home?.turnovers ?? 0);
    const sackEdge = (teamTotals.home?.sacks ?? 0) - (teamTotals.away?.sacks ?? 0);
    return [
      game?.summary?.playerOfGame?.name ? { label: "Player of the Game", value: game.summary.playerOfGame.name } : null,
      momentumNotes[0]?.text ? { label: "Biggest Swing", value: momentumNotes[0].text } : null,
      { label: "Yards Edge", value: totalYardEdge === 0 ? "Even" : `${totalYardEdge > 0 ? homeTeam.abbr : awayTeam.abbr} +${Math.abs(totalYardEdge)}` },
      { label: "Turnover Margin", value: turnoverMargin === 0 ? "Even" : `${turnoverMargin > 0 ? awayTeam.abbr : homeTeam.abbr} +${Math.abs(turnoverMargin)}` },
      { label: "Sacks Edge", value: sackEdge === 0 ? "Even" : `${sackEdge > 0 ? homeTeam.abbr : awayTeam.abbr} +${Math.abs(sackEdge)}` },
    ].filter(Boolean);
  }, [game?.summary?.playerOfGame?.name, homeTeam.abbr, awayTeam.abbr, momentumNotes, teamTotals]);

  const playerTables = useMemo(() => {
    const categories = Object.entries(PLAYER_STATS_TABLES).map(([key, table]) => {
      const rows = filteredPlayers
        .filter((p) => Number(p.stats?.[table.sortBy] ?? 0) > 0 || key === "defense" && ((p.stats?.tackles ?? 0) + (p.stats?.sacks ?? 0) + (p.stats?.interceptions ?? 0) > 0));
      return { key, table, rows };
    });

    const hasKicking = filteredPlayers.some((p) => (p.stats?.fieldGoalsAttempted ?? 0) > 0 || (p.stats?.extraPointsAttempted ?? 0) > 0);
    const hasPunting = filteredPlayers.some((p) => (p.stats?.punts ?? 0) > 0);

    if (hasKicking) {
      categories.push({
        key: "kicking",
        table: {
          title: "Kicking",
          emptyText: "No kicking stats archived for this game.",
          sortBy: "fieldGoalsMade",
          columns: [
            { key: "fieldGoalsMade", label: "FGM" },
            { key: "fieldGoalsAttempted", label: "FGA" },
            { key: "extraPointsMade", label: "XPM" },
            { key: "extraPointsAttempted", label: "XPA" },
          ],
        },
        rows: filteredPlayers.filter((p) => (p.stats?.fieldGoalsAttempted ?? 0) > 0 || (p.stats?.extraPointsAttempted ?? 0) > 0),
      });
    }

    if (hasPunting) {
      categories.push({
        key: "punting",
        table: {
          title: "Punting",
          emptyText: "No punting stats archived for this game.",
          sortBy: "puntYards",
          columns: [
            { key: "punts", label: "Punts" },
            { key: "puntYards", label: "Punt Yds" },
          ],
        },
        rows: filteredPlayers.filter((p) => (p.stats?.punts ?? 0) > 0),
      });
    }

    return categories;
  }, [filteredPlayers]);

  const headerWeek = game?.week ?? gameId?.match(/_w(\d+)_/)?.[1] ?? "—";
  const headerSeason = game?.seasonId ?? gameId?.split('_w')?.[0] ?? "";
  const winningTeamAbbr = Number(game?.awayScore) > Number(game?.homeScore)
    ? awayTeam.abbr
    : Number(game?.homeScore) > Number(game?.awayScore)
      ? homeTeam.abbr
      : null;
  const matchupLabel = `${awayTeam.abbr} @ ${homeTeam.abbr}`;
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
          <h2 style={{ margin: "2px 0 4px" }}>Game Book</h2>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{matchupLabel}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onBack && <button className="btn" onClick={onBack}>Back</button>}
          {!embedded && <button className="btn" onClick={onClose}>Close</button>}
        </div>
      </div>

      {loading && <div className="box-score-container"><EmptyState title="Loading box score…" body="Pulling archived game detail and postgame context." /></div>}
      {!loading && error && !hasAnyPayload && (
        <div className="box-score-container">
          <EmptyState
            title="Result recorded · detailed archive unavailable"
            body={`The final result is saved for standings/history, but this game's full box score archive is unavailable. ${unavailableMessage} (${availability.statusLabel ?? "Archive unavailable"})`}
          />
        </div>
      )}

      {!loading && hasAnyPayload && game && (
        <div className="box-score-container">
          <section className="bs-score-hero">
            <div className="bs-team-col">
              <div className="bs-team-label">Away</div>
              <TeamButton team={awayTeam} onSelect={onTeamSelect} />
              <div className="bs-record">{formatRecord(awayTeam)}</div>
            </div>
            <div className="bs-scoreline-wrap">
              <div className="bs-final-pill">Final</div>
              <div className="bs-scoreline">{game.awayScore} - {game.homeScore}</div>
              <div className="bs-final-context">{winningTeamAbbr ? `${winningTeamAbbr} won` : "Game tied"}</div>
            </div>
            <div className="bs-team-col">
              <div className="bs-team-label">Home</div>
              <TeamButton team={homeTeam} onSelect={onTeamSelect} />
              <div className="bs-record">{formatRecord(homeTeam)}</div>
            </div>
          </section>

          {archiveQuality !== "full" && (
            <section className="bs-section" style={{ marginTop: 4 }} data-testid="archive-status">
              <div className="bs-list-item" style={{ borderColor: "var(--warning)", color: "var(--text-muted)" }}>
                {archiveQuality === "partial"
                  ? "Result recorded. Partial archive: final score and summary are available, but complete drive/play detail was not stored."
                  : "Result recorded. Detailed box score is unavailable for this game, but any recap and context below are still shown."}
              </div>
            </section>
          )}

          <GameBookQuickNav activeSection={activeSection} onJump={jumpToSection} />

          <section className="bs-section" ref={(node) => { sectionRefs.current.summary = node; }} data-section="summary">
            <div className="bs-section-header">
              <h4>Quick summary</h4>
              {canExpandDetails ? <button className="btn" onClick={() => setExpanded((v) => !v)}>{expanded ? "Compact" : "Expand details"}</button> : null}
            </div>
            <div className="bs-list-item" style={{ marginBottom: 10 }}>
              {game?.summary?.storyline ?? game?.recap ?? "A complete box score was archived for this matchup."}
            </div>
            <div className="bs-facts-grid">
              {topFacts.map((fact) => (
                <div key={fact.label} className="bs-fact-chip">
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
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

          {sections.teamComparison && (
            <section className="bs-section" ref={(node) => { sectionRefs.current.team = node; }} data-section="team">
              <h4>Team stats</h4>
              <TeamStatsSection rows={teamComparisonRows} />
            </section>
          )}

          <section className="bs-section" ref={(node) => { sectionRefs.current.players = node; }} data-section="players">
            <div className="bs-section-header">
              <h4>Player stats</h4>
              <div className="bs-segmented" data-testid="player-team-filter">
                <button className={playerTeamFilter === "all" ? "is-active" : ""} onClick={() => setPlayerTeamFilter("all")}>All Players</button>
                <button className={playerTeamFilter === "away" ? "is-active" : ""} onClick={() => setPlayerTeamFilter("away")}>{awayTeam.abbr}</button>
                <button className={playerTeamFilter === "home" ? "is-active" : ""} onClick={() => setPlayerTeamFilter("home")}>{homeTeam.abbr}</button>
              </div>
            </div>
            {playerTables.map((category) => (
              <PlayerCategoryTable
                key={category.key}
                title={category.table.title}
                players={expanded ? category.rows : category.rows.slice(0, 14)}
                cols={category.table.columns}
                onPlayerSelect={onPlayerSelect}
                emptyText={category.table.emptyText}
                defaultSort={category.table.sortBy}
              />
            ))}
          </section>

          {sections.scoringSummary && (
            <section className="bs-section" ref={(node) => { sectionRefs.current.scoring = node; }} data-section="scoring">
              <h4>Scoring summary</h4>
              {!!scoring.length ? (
                <div className="bs-scoring-groups">
                  {scoringGroups.map((group) => (
                    <div key={group.period} className="bs-scoring-group">
                      <h5>{group.period}</h5>
                      <div className="bs-list">
                        {group.items.slice(expanded ? 0 : 8).map((item) => (
                          <div key={item.id} className={`bs-list-item bs-score-item bs-score-${String(item.type).toLowerCase()}`}>
                            <span>Q{item.quarter} · {item.clock}</span>
                            <span><strong>{item.teamAbbr}</strong> · {item.type}</span>
                            <span>{item.runningScore ? `Score ${item.runningScore} · ` : ""}{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No scoring log available" body="Scoring-play logs were not archived for this matchup." />}
            </section>
          )}

          {sections.quarterByQuarter && (
            <section className="bs-section">
              <h4>Quarter-by-quarter</h4>
              {hasQuarterData ? (
                <div className="bs-table-wrap">
                  <table className="box-score-table">
                    <thead><tr><th>Team</th>{quarterHeaders.map((label) => <th key={label}>{label}</th>)}<th className="bs-final-col">Final</th></tr></thead>
                    <tbody>
                      <tr className={Number(game.awayScore) > Number(game.homeScore) ? "bs-winning-row" : ""}><td><TeamButton team={awayTeam} onSelect={onTeamSelect} /></td>{quarterHeaders.map((_, idx) => <td key={`away-q-${idx}`}>{quarterScores.away[idx] ?? "Not archived"}</td>)}<td className="bs-final-col">{game.awayScore}</td></tr>
                      <tr className={Number(game.homeScore) > Number(game.awayScore) ? "bs-winning-row" : ""}><td><TeamButton team={homeTeam} onSelect={onTeamSelect} /></td>{quarterHeaders.map((_, idx) => <td key={`home-q-${idx}`}>{quarterScores.home[idx] ?? "Not archived"}</td>)}<td className="bs-final-col">{game.homeScore}</td></tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="Quarter scores not archived" body="Only the final score was saved for this game." />
              )}
            </section>
          )}

          {sections.driveSummary && (
            <section className="bs-section" ref={(node) => { sectionRefs.current.drives = node; }} data-section="drives">
              <h4>Drive summary</h4>
              {!!driveSummary.length ? (
                <div className="bs-list">
                  {driveSummary.slice(expanded ? 0 : 12).map((drive, idx) => (
                    <div key={`drive-${idx}`} className="bs-list-item bs-drive-item">
                      <span>Q{drive.quarter ?? "—"} · {drive.startClock ?? drive.clock ?? ""}</span>
                      <span><strong>{drive.teamAbbr ?? teamsById?.[Number(drive.teamId)]?.abbr ?? "Drive"}</strong> <em className="bs-drive-badge">{drive.result ?? "Result"}</em></span>
                      <span>{drive.summary ?? `${drive.plays ?? 0} plays · ${drive.yards ?? 0} yds`}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No drive chart available" body="This game was simulated with summary-only detail." />}
            </section>
          )}

          {sections.turningPoints && (
            <section className="bs-section">
              <h4>Turning points</h4>
              {!!momentumNotes.length ?
                <div className="bs-list">
                  {momentumNotes.map((note) => (
                    <div key={note.id} className="bs-list-item"><span>Q{note.quarter}</span><span>{note.text}</span></div>
                  ))}
                </div>
                : <EmptyState title="No turning points available" body="Turning-point annotations are unavailable for this game." />}
            </section>
          )}

          {sections.playLog && (
            <section className="bs-section" ref={(node) => { sectionRefs.current.plays = node; }} data-section="plays">
              <h4>Play log</h4>
              {!!playLog.length ? (
                <div className="bs-list">
                  {playLog.slice(expanded ? 0 : 24).map((play, idx) => (
                    <div key={`play-${idx}`} className="bs-list-item bs-play-item">
                      <span>Q{play.quarter ?? "—"} · {play.clock ?? play.time ?? ""}</span>
                      <span><strong>{teamsById?.[Number(play.teamId)]?.abbr ?? "—"}</strong></span>
                      <span>{play.text ?? "Play event"}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No play log archived" body="Full event-by-event tracking was not available for this game." />}
            </section>
          )}

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
