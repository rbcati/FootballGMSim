import React, { useEffect, useMemo, useState } from "react";
import {
  deriveLeaders,
  deriveMomentumNotes,
  deriveQuarterScores,
  deriveScoringSummary,
  deriveTeamTotals,
  describeStatLine,
  toPlayerArray,
} from "../utils/boxScorePresentation.js";

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
  if (!players.length) return (<section className="bs-section"><h4>{title}</h4><div className="bs-empty">{emptyText ?? `No ${title.toLowerCase()} available.`}</div></section>);
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
        setGame(res?.game ?? null);
        if (!res?.game) setError(res?.error ?? "Box score unavailable for this game.");
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
  const scoring = useMemo(() => deriveScoringSummary(game?.stats?.playLogs ?? [], teamsById), [game, teamsById]);
  const momentumNotes = useMemo(() => deriveMomentumNotes(game?.stats?.playLogs ?? []), [game]);
  const quarterScores = useMemo(() => deriveQuarterScores(game, game?.stats?.playLogs ?? []), [game]);

  const awayPlayers = useMemo(() => toPlayerArray(game?.stats?.away, game?.awayId), [game]);
  const homePlayers = useMemo(() => toPlayerArray(game?.stats?.home, game?.homeId), [game]);
  const playerRows = useMemo(() => [...awayPlayers, ...homePlayers], [awayPlayers, homePlayers]);
  const teamTotals = useMemo(() => ({
    home: deriveTeamTotals(game?.stats?.home),
    away: deriveTeamTotals(game?.stats?.away),
  }), [game]);

  const topPassers = playerRows.filter((p) => (p.stats?.passAtt ?? 0) > 0).sort((a, b) => (b.stats?.passYd ?? 0) - (a.stats?.passYd ?? 0)).slice(0, 6);
  const topRushers = playerRows.filter((p) => (p.stats?.rushAtt ?? 0) > 0).sort((a, b) => (b.stats?.rushYd ?? 0) - (a.stats?.rushYd ?? 0)).slice(0, 6);
  const topReceivers = playerRows.filter((p) => (p.stats?.receptions ?? 0) > 0).sort((a, b) => (b.stats?.recYd ?? 0) - (a.stats?.recYd ?? 0)).slice(0, 6);
  const topDefenders = playerRows.filter((p) => (p.stats?.tackles ?? 0) + (p.stats?.sacks ?? 0) + (p.stats?.interceptions ?? 0) > 0).sort((a, b) => ((b.stats?.tackles ?? 0) + (b.stats?.sacks ?? 0) * 2 + (b.stats?.interceptions ?? 0) * 2) - ((a.stats?.tackles ?? 0) + (a.stats?.sacks ?? 0) * 2 + (a.stats?.interceptions ?? 0) * 2)).slice(0, 8);

  const headerWeek = game?.week ?? gameId?.match(/_w(\d+)_/)?.[1] ?? "—";
  const headerSeason = game?.seasonId ?? gameId?.split('_w')?.[0] ?? "";
  const hasAnyPayload = Boolean(game && (
    game.homeScore != null || game.awayScore != null || game.stats || game.recap || game.quarterScores
  ));
  const unavailableMessage = "No archived postgame data was found for this matchup.";

  const shell = (
      <div className={`${embedded ? "card" : "modal-content modal-large box-score-modal"}`} onClick={(e) => !embedded && e.stopPropagation()}>
        <div className="box-score-header bs-header-sticky">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Week {headerWeek} · {headerSeason}</div>
            <h2 style={{ margin: "2px 0 8px" }}>Final Game Book</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {onBack && <button className="btn" onClick={onBack}>Back</button>}
            {!embedded && <button className="btn" onClick={onClose}>Close</button>}
          </div>
        </div>

        {loading && <div className="box-score-container">Loading box score…</div>}
        {!loading && error && !hasAnyPayload && <div className="box-score-container">{unavailableMessage}</div>}

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

            <section className="bs-section">
              <div className="bs-section-header">
                <h4>Game recap</h4>
                <button className="btn" onClick={() => setExpanded((v) => !v)}>{expanded ? "Compact" : "Expand details"}</button>
              </div>
              <div className="bs-leaders-grid">
                <LeaderCard label="Passing leader" player={leaders.pass} line={describeStatLine(leaders.pass, ["passComp", "passAtt", "passYd", "passTD", "interceptions"])} onPlayerSelect={onPlayerSelect} />
                <LeaderCard label="Rushing leader" player={leaders.rush} line={describeStatLine(leaders.rush, ["rushAtt", "rushYd", "rushTD"])} onPlayerSelect={onPlayerSelect} />
                <LeaderCard label="Receiving leader" player={leaders.receive} line={describeStatLine(leaders.receive, ["receptions", "recYd", "recTD"])} onPlayerSelect={onPlayerSelect} />
                <LeaderCard label="Defensive leader" player={leaders.defense} line={describeStatLine(leaders.defense, ["tackles", "sacks", "interceptions", "forcedFumbles"])} onPlayerSelect={onPlayerSelect} />
              </div>
            </section>

            <section className="bs-section">
              <h4>Team comparison</h4>
              <div className="bs-compare-grid">
                <StatCompareRow label="Total Yards" awayValue={teamTotals.away.totalYards} homeValue={teamTotals.home.totalYards} />
                <StatCompareRow label="Pass Yards" awayValue={teamTotals.away.passYards} homeValue={teamTotals.home.passYards} />
                <StatCompareRow label="Rush Yards" awayValue={teamTotals.away.rushYards} homeValue={teamTotals.home.rushYards} />
                <StatCompareRow label="Turnovers" awayValue={teamTotals.away.turnovers} homeValue={teamTotals.home.turnovers} />
                <StatCompareRow label="Sacks" awayValue={teamTotals.away.sacks} homeValue={teamTotals.home.sacks} />
                <StatCompareRow label="3rd Down" awayValue={`${teamTotals.away.thirdDownMade}/${teamTotals.away.thirdDownAtt}`} homeValue={`${teamTotals.home.thirdDownMade}/${teamTotals.home.thirdDownAtt}`} />
              </div>
            </section>

            <PlayerTable
              title="Passing leaders"
              players={topPassers}
              cols={[{ key: "passComp", label: "Comp" }, { key: "passAtt", label: "Att" }, { key: "passYd", label: "Yds" }, { key: "passTD", label: "TD" }, { key: "interceptions", label: "INT" }]}
              onPlayerSelect={onPlayerSelect}
              emptyText="No passing stats archived for this game."
            />
            <PlayerTable
              title="Rushing leaders"
              players={topRushers}
              cols={[{ key: "rushAtt", label: "Att" }, { key: "rushYd", label: "Yds" }, { key: "rushTD", label: "TD" }, { key: "fumblesLost", label: "FUM" }]}
              onPlayerSelect={onPlayerSelect}
              emptyText="No rushing stats archived for this game."
            />
            <PlayerTable
              title="Receiving leaders"
              players={topReceivers}
              cols={[{ key: "targets", label: "Tgt" }, { key: "receptions", label: "Rec" }, { key: "recYd", label: "Yds" }, { key: "recTD", label: "TD" }]}
              onPlayerSelect={onPlayerSelect}
              emptyText="No receiving stats archived for this game."
            />
            {topDefenders.length > 0 ? (
              <PlayerTable
                title="Defensive leaders"
                players={topDefenders}
                cols={[{ key: "tackles", label: "Tkl" }, { key: "sacks", label: "Sacks" }, { key: "interceptions", label: "INT" }, { key: "passesDefended", label: "PD" }, { key: "forcedFumbles", label: "FF" }]}
                onPlayerSelect={onPlayerSelect}
              />
            ) : null}
            <section className="bs-section">
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
              ) : <div className="bs-empty">No scoring-play log was archived for this matchup.</div>}
            </section>

            <section className="bs-section">
              <h4>Quarter-by-quarter</h4>
              <div className="bs-table-wrap">
                <table className="box-score-table">
                  <thead><tr><th>Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Final</th></tr></thead>
                  <tbody>
                    <tr><td><TeamButton team={awayTeam} onSelect={onTeamSelect} /></td><td>{quarterScores.away[0] ?? "—"}</td><td>{quarterScores.away[1] ?? "—"}</td><td>{quarterScores.away[2] ?? "—"}</td><td>{quarterScores.away[3] ?? "—"}</td><td>{game.awayScore}</td></tr>
                    <tr><td><TeamButton team={homeTeam} onSelect={onTeamSelect} /></td><td>{quarterScores.home[0] ?? "—"}</td><td>{quarterScores.home[1] ?? "—"}</td><td>{quarterScores.home[2] ?? "—"}</td><td>{quarterScores.home[3] ?? "—"}</td><td>{game.homeScore}</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bs-section">
                <h4>Turning points</h4>
                {!!momentumNotes.length ?
                <div className="bs-list">
                  {momentumNotes.map((note) => (
                    <div key={note.id} className="bs-list-item"><span>Q{note.quarter}</span><span>{note.text}</span></div>
                  ))}
                </div>
              : <div className="bs-empty">No turning point annotations available.</div>}
              </section>

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
