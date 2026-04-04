import React, { useEffect, useMemo, useState } from "react";
import { getTeamIdentity } from "../../data/team-utils.js";

function LeaderTable({ title, statLabel, rows }) {
  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <div style={{ fontWeight: 800, marginBottom: "var(--space-3)" }}>{title}</div>
      <table className="standings-table" style={{ width: "100%", fontSize: "var(--text-xs)" }}>
        <thead>
          <tr>
            <th>#</th>
            <th style={{ textAlign: "left" }}>Player</th>
            <th>POS</th>
            <th style={{ textAlign: "left" }}>Team</th>
            <th style={{ textAlign: "right" }}>{statLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.id}-${idx}`}>
              <td>{idx + 1}</td>
              <td>{row.name}</td>
              <td>{row.pos}</td>
              <td>{row.teamAbbr}</td>
              <td style={{ textAlign: "right" }}>{Number(row.value || 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LeagueLeaders({ league, actions }) {
  const [rostersByTeam, setRostersByTeam] = useState({});

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!league?.teams?.length || !actions?.getRoster) return;
      const responses = await Promise.all(
        league.teams.map(async (team) => {
          try {
            const resp = await actions.getRoster(team.id);
            return [team.id, resp?.payload?.players ?? []];
          } catch {
            return [team.id, []];
          }
        }),
      );
      if (mounted) setRostersByTeam(Object.fromEntries(responses));
    };
    load();
    return () => {
      mounted = false;
    };
  }, [league?.teams, actions]);

  const currentSeason = league?.year ?? league?.seasonId;

  const allPlayers = useMemo(
    () => Object.entries(rostersByTeam).flatMap(([teamId, players]) =>
      (players || []).map((player) => ({ ...player, teamId: Number(teamId) }))),
    [rostersByTeam],
  );

  const topPassing = useMemo(() => allPlayers
    .map((player) => {
      const season = player?.seasonLog?.[currentSeason] ?? {};
      const team = getTeamIdentity(player.teamId, league?.teams ?? []);
      return { id: player.id, name: player.name, pos: player.pos, teamAbbr: team.abbr, value: season.passYd ?? 0 };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10), [allPlayers, currentSeason, league?.teams]);

  const topRushing = useMemo(() => allPlayers
    .map((player) => {
      const season = player?.seasonLog?.[currentSeason] ?? {};
      const team = getTeamIdentity(player.teamId, league?.teams ?? []);
      return { id: player.id, name: player.name, pos: player.pos, teamAbbr: team.abbr, value: season.rushYd ?? 0 };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10), [allPlayers, currentSeason, league?.teams]);

  const topDefense = useMemo(() => allPlayers
    .map((player) => {
      const season = player?.seasonLog?.[currentSeason] ?? {};
      const team = getTeamIdentity(player.teamId, league?.teams ?? []);
      const combined = Number(season.tackles ?? 0) + Number(season.sacks ?? 0);
      return { id: player.id, name: player.name, pos: player.pos, teamAbbr: team.abbr, value: combined };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10), [allPlayers, currentSeason, league?.teams]);

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <LeaderTable title="Top 10 Passing" statLabel="Pass Yds" rows={topPassing} />
      <LeaderTable title="Top 10 Rushing" statLabel="Rush Yds" rows={topRushing} />
      <LeaderTable title="Top 10 Defense" statLabel="Tkl + Sacks" rows={topDefense} />
    </div>
  );
}
