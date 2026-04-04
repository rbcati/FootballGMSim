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
  const currentSeason = league?.year ?? league?.seasonId;
  const isReady = Boolean(league && currentSeason && Array.isArray(league?.teams));
  const teams = league?.teams ?? [];
  const getStat = (player, key) => player?.seasonLog?.[currentSeason]?.[key] ?? 0;

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

  const allPlayers = useMemo(
    () => {
      const aggregated = [];
      teams.forEach((team) => {
        const loadedRoster = rostersByTeam?.[team?.id];
        const roster = Array.isArray(loadedRoster) ? loadedRoster : (team?.roster ?? []);
        roster.forEach((player) => {
          if (player) aggregated.push({ ...player, teamId: Number(team?.id) });
        });
      });
      return aggregated;
    },
    [rostersByTeam, teams],
  );

  const topPassing = useMemo(() => allPlayers
    .map((player) => {
      const team = getTeamIdentity(player.teamId, teams);
      return { id: player.id, name: player.name, pos: player.pos, teamAbbr: team.abbr, value: getStat(player, "passYd") };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10), [allPlayers, currentSeason, teams]);

  const topRushing = useMemo(() => allPlayers
    .map((player) => {
      const team = getTeamIdentity(player.teamId, teams);
      return { id: player.id, name: player.name, pos: player.pos, teamAbbr: team.abbr, value: getStat(player, "rushYd") };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10), [allPlayers, currentSeason, teams]);

  const topDefense = useMemo(() => allPlayers
    .map((player) => {
      const team = getTeamIdentity(player.teamId, teams);
      const combined = Number(getStat(player, "tackles")) + Number(getStat(player, "sacks"));
      return { id: player.id, name: player.name, pos: player.pos, teamAbbr: team.abbr, value: combined };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10), [allPlayers, currentSeason, teams]);

  if (!isReady) {
    return (
      <div className="leaders-empty">
        <p>Stats will appear after Week 1.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <LeaderTable title="Top 10 Passing" statLabel="Pass Yds" rows={topPassing} />
      <LeaderTable title="Top 10 Rushing" statLabel="Rush Yds" rows={topRushing} />
      <LeaderTable title="Top 10 Defense" statLabel="Tkl + Sacks" rows={topDefense} />
    </div>
  );
}
