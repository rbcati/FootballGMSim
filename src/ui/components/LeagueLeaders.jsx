import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTeamIdentity } from "../../data/team-utils.js";
import { toFiniteNumber } from "../utils/numberFormatting.js";

function rankBadge(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function LeaderList({ title, statLabel, rows }) {
  return (
    <Card className="card-premium">
      <CardHeader className="py-2 px-3 border-b border-[color:var(--hairline)]" style={{ background: "var(--surface-strong)" }}>
        <CardTitle className="text-xs font-bold uppercase tracking-widest text-[color:var(--text-muted)]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.map((row, idx) => (
          <div key={`${row.id}-${idx}`} style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 10, alignItems: "center", padding: "10px 12px", borderBottom: idx < rows.length - 1 ? "1px solid var(--hairline)" : "none" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: idx < 3 ? "#FFD60A" : "var(--text-subtle)" }}>{rankBadge(idx + 1)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name ?? "Unknown"}</span>
                <Badge variant="outline" style={{ fontSize: 10, padding: "0 6px", background: "var(--surface)", borderColor: "var(--hairline)" }}>{row.pos ?? "?"}</Badge>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{row.teamAbbr ?? "—"}</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 2 }}>{statLabel}</div>
            </div>
            <div style={{ fontWeight: 900, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>{(toFiniteNumber(row.value, 0)).toLocaleString()}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function LeagueLeaders({ league, actions }) {
  const [rostersByTeam, setRostersByTeam] = useState({});
  const currentSeason = league?.year ?? league?.seasonId;
  const isReady = Boolean(league && currentSeason && Array.isArray(league?.teams));
  const teams = league?.teams ?? [];
  const getStat = (player, key) => toFiniteNumber(player?.seasonLog?.[currentSeason]?.[key], 0);

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

  const allPlayers = useMemo(() => {
    const aggregated = [];
    teams.forEach((team) => {
      const loadedRoster = rostersByTeam?.[team?.id];
      const roster = Array.isArray(loadedRoster) ? loadedRoster : (team?.roster ?? []);
      roster.forEach((player) => {
        if (player) aggregated.push({ ...player, teamId: Number(team?.id) });
      });
    });
    return aggregated;
  }, [rostersByTeam, teams]);

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
      const combined = getStat(player, "tackles") + getStat(player, "sacks");
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
      <LeaderList title="Top 10 Passing" statLabel="Pass Yards" rows={topPassing} />
      <LeaderList title="Top 10 Rushing" statLabel="Rush Yards" rows={topRushing} />
      <LeaderList title="Top 10 Defense" statLabel="Tackles + Sacks" rows={topDefense} />
    </div>
  );
}
