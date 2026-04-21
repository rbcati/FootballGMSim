import React, { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "./ScreenSystem.jsx";
import {
  deriveLeaders,
  deriveMomentumNotes,
  deriveQuarterScores,
  deriveScoringSummary,
  deriveStandoutStorylines,
  deriveTeamLeaders,
  deriveTeamTotals,
  describeStatLine,
  getGameDetailSections,
  groupScoringByPeriod,
  sortScoringSummaryRows,
  toPlayerArray,
} from "../utils/boxScorePresentation.js";
import { buildCompletedGamePresentation, getGameDetailPayload } from "../utils/boxScoreAccess.js";
import { normalizeArchivedGamePayload } from "../../core/gameArchive.js";
import { buildTeamComparisonRows, PLAYER_STATS_TABLES } from "../../core/footballMeta";
import GameDetailV2 from "./game/GameDetailV2.tsx";
import { buildRouteRequestKey, buildLeagueCacheScopeKey } from "../utils/requestLoopGuard.js";
import useStableRouteRequest from "../hooks/useStableRouteRequest.js";

export function TeamButton({ team, onSelect }) {
  if (!team) return <span>—</span>;
  if (!onSelect) return <span>{team.abbr}</span>;
  return <button className="btn-link" onClick={() => onSelect(team.id)}>{team.abbr}</button>;
}

export function PlayerButton({ player, onSelect }) {
  if (!player) return <span>—</span>;
  if (!onSelect || !player.playerId) return <span>{player.name}</span>;
  return <button className="btn-link" onClick={() => onSelect(player.playerId)}>{player.name}</button>;
}

function LeaderCard({ label, player, line, onPlayerSelect, impactSkill }) {
  if (!player) return null;
  return (
    <div className="bs-leader-card">
      <div className="bs-leader-label">{label}</div>
      <div className="bs-leader-name"><PlayerButton player={player} onSelect={onPlayerSelect} /></div>
      <div className="bs-leader-line">{line}</div>
      {impactSkill ? <div className="bs-impact-skill">Impact skill: {impactSkill}</div> : null}
    </div>
  );
}

function StatCompareRow({ label, homeValue, awayValue, homeWins, awayWins, awayRaw, homeRaw }) {
  const awayNum = Number(awayRaw);
  const homeNum = Number(homeRaw);
  const total = Math.max(Math.abs(awayNum) + Math.abs(homeNum), 1);
  const awayPct = Number.isFinite(awayNum) ? Math.max((Math.abs(awayNum) / total) * 100, 2) : 50;
  const homePct = Number.isFinite(homeNum) ? Math.max((Math.abs(homeNum) / total) * 100, 2) : 50;

  return (
    <div className="bs-compare-row-v2">
      <div className="bs-compare-meta">
        <span className={awayWins ? "bs-compare-value is-winner" : "bs-compare-value"}>{awayValue ?? "—"}</span>
        <span className="bs-compare-label">{label}</span>
        <span className={homeWins ? "bs-compare-value is-winner" : "bs-compare-value"}>{homeValue ?? "—"}</span>
      </div>
      <div className="bs-compare-bar-track">
        <div className="bs-compare-bar-fill away" style={{ width: `${awayPct}%`, borderRight: "2px solid var(--bg-card)" }} />
        <div className="bs-compare-bar-fill home" style={{ width: `${homePct}%` }} />
      </div>
    </div>
  );
}

function TeamLeaderCell({ label, player, statKeys, onPlayerSelect }) {
  return (
    <div className="bs-list-item">
      <span>{label}</span>
      <span><PlayerButton player={player} onSelect={onPlayerSelect} /></span>
      <span>{describeStatLine(player, statKeys)}</span>
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
    { title: "Efficiency", keys: ["First Downs", "3rd Down", "Success Rate", "Red Zone", "Time of Possession"] },
    { title: "Offense", keys: ["Total Yards", "Pass Yards", "Rush Yards", "Rush YPC", "Explosive Plays"] },
    { title: "Defense & Discipline", keys: ["Turnovers", "Sacks", "Penalties"] },
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
                  awayRaw={row.awayRaw}
                  homeRaw={row.homeRaw}
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
  const [expanded, setExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState("summary");
  const [playerTeamFilter, setPlayerTeamFilter] = useState("all");
  const sectionRefs = useRef({});
  const requestKey = useMemo(() => buildRouteRequestKey("game", gameId), [gameId]);
  const cacheScopeKey = useMemo(() => buildLeagueCacheScopeKey(league), [league]);
  const fetchBoxScore = React.useCallback(async () => {
    const res = await actions?.getBoxScore?.(gameId);
    const payload = normalizeArchivedGamePayload(res?.game ?? getGameDetailPayload(gameId, league));
    return {
      payload: payload ?? null,
      errorMessage: payload ? null : (res?.error ?? "Box score unavailable for this game."),
    };
  }, [actions, gameId, league]);
  const { data: requestData, loading, error: requestError } = useStableRouteRequest({
    requestKey,
    cacheScopeKey,
    enabled: gameId != null,
    fetcher: fetchBoxScore,
    warnLabel: "BoxScore",
    clearDataOnLoad: true,
  });
  const game = requestData?.payload ?? null;
  const error = requestError?.message ?? requestData?.errorMessage ?? "";

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
  const teamLeaders = useMemo(() => deriveTeamLeaders(game), [game]);
  const hasTeamLeaders = useMemo(() => {
    const all = [teamLeaders?.away, teamLeaders?.home].filter(Boolean);
    return all.some((side) => Object.values(side).some(Boolean));
  }, [teamLeaders]);
  const scoring = useMemo(() => {
    if (game?.scoringSummary?.length) {
      const normalized = game.scoringSummary.map((row, idx) => ({
        ...row,
        sortIndex: idx,
        teamAbbr: row?.teamAbbr ?? teamsById?.[Number(row?.teamId)]?.abbr ?? "—",
      }));
      return sortScoringSummaryRows(normalized);
    }
    return deriveScoringSummary(game?.playLog ?? game?.stats?.playLogs ?? [], teamsById);
  }, [game, teamsById]);
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
    const baseRows = buildTeamComparisonRows(teamTotals);
    return [
      ...baseRows,
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

  const driveStats = useMemo(() => game?.teamDriveStats ?? game?.summary?.teamStats ?? null, [game]);

  const storylineBullets = useMemo(() => deriveStandoutStorylines({
    game,
    awayTeam,
    homeTeam,
    teamTotals,
    driveStats,
  }), [awayTeam, game, homeTeam, teamTotals, driveStats]);

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

            {!!storylineBullets.length && (
              <div className="bs-storylines-box" data-testid="standout-storylines" style={{ marginTop: 16 }}>
                <h5>Standout storylines</h5>
                <ul className="bs-list">
                  {storylineBullets.map((line, idx) => <li key={`storyline-${idx}`} className="bs-list-item">{line}</li>)}
                </ul>
              </div>
            )}
            {!!momentumNotes.length && (
              <div className="bs-storylines-box" style={{ marginTop: 16 }}>
                <h5>Recap narrative</h5>
                <ul className="bs-list">
                  {momentumNotes.slice(0, expanded ? 8 : 4).map((note, idx) => (
                    <li key={`momentum-${idx}`} className="bs-list-item">{note?.text ?? note}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <GameDetailV2 game={game} awayTeam={awayTeam} homeTeam={homeTeam} />

          <section className="bs-section" ref={(node) => { sectionRefs.current.team = node; }} data-section="team">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {sections.quarterByQuarter && (
                <div>
                  <h4>Quarter-by-quarter</h4>
                  {hasQuarterData ? (
                    <div className="bs-table-wrap">
                      <table className="box-score-table">
                        <thead><tr><th>Team</th>{quarterHeaders.map((label) => <th key={label}>{label}</th>)}<th className="bs-final-col">Final</th></tr></thead>
                        <tbody>
                          <tr className={Number(game.awayScore) > Number(game.homeScore) ? "bs-winning-row" : ""}><td><TeamButton team={awayTeam} onSelect={onTeamSelect} /></td>{quarterHeaders.map((_, idx) => <td key={`away-q-${idx}`}>{quarterScores.away[idx] ?? "0"}</td>)}<td className="bs-final-col">{game.awayScore}</td></tr>
                          <tr className={Number(game.homeScore) > Number(game.awayScore) ? "bs-winning-row" : ""}><td><TeamButton team={homeTeam} onSelect={onTeamSelect} /></td>{quarterHeaders.map((_, idx) => <td key={`home-q-${idx}`}>{quarterScores.home[idx] ?? "0"}</td>)}<td className="bs-final-col">{game.homeScore}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState title="Quarter scores not archived" body="Only the final score was saved for this game." />
                  )}
                </div>
              )}

              {sections.teamComparison && (
                <div>
                  <h4>Team comparison</h4>
                  <TeamStatsSection rows={teamComparisonRows} />
                </div>
              )}
            </div>
          </section>

          {hasTeamLeaders && (
            <section className="bs-section" data-testid="team-leaders">
              <h4>Player leaders</h4>
              <div className="bs-team-groups">
                {[{ side: "away", team: awayTeam }, { side: "home", team: homeTeam }].map(({ side, team }) => {
                  const rows = teamLeaders?.[side] ?? {};
                  return (
                    <div key={side} className="bs-team-group">
                      <h5>{team?.abbr ?? side.toUpperCase()}</h5>
                      <div className="bs-list">
                        <TeamLeaderCell label="Passing" player={rows.passing} statKeys={["passComp", "passAtt", "passYd", "passTD", "interceptions"]} onPlayerSelect={onPlayerSelect} />
                        <TeamLeaderCell label="Rushing" player={rows.rushing} statKeys={["rushAtt", "rushYd", "rushTD"]} onPlayerSelect={onPlayerSelect} />
                        <TeamLeaderCell label="Receiving" player={rows.receiving} statKeys={["receptions", "recYd", "recTD"]} onPlayerSelect={onPlayerSelect} />
                        <TeamLeaderCell label="Tackles" player={rows.tackles} statKeys={["tackles", "sacks"]} onPlayerSelect={onPlayerSelect} />
                        <TeamLeaderCell label="Sacks" player={rows.sacks} statKeys={["sacks", "tackles"]} onPlayerSelect={onPlayerSelect} />
                        <TeamLeaderCell label="Interceptions" player={rows.interceptions} statKeys={["interceptions", "passesDefended"]} onPlayerSelect={onPlayerSelect} />
                        <TeamLeaderCell label="Kicking" player={rows.kicking} statKeys={["fieldGoalsMade", "fieldGoalsAttempted", "extraPointsMade", "extraPointsAttempted"]} onPlayerSelect={onPlayerSelect} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

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

          {(sections.driveSummary || sections.playLog) && (
            <section className="bs-section" ref={(node) => { sectionRefs.current.drives = node; }} data-section="drives">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {sections.driveSummary && (
                  <div>
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
                  </div>
                )}
                {sections.playLog && (
                  <div ref={(node) => { sectionRefs.current.plays = node; }} data-section="plays">
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
                  </div>
                )}
              </div>
            </section>
          )}

          {game?.recap && !sections.recap && (
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
