import React, { useMemo, useState } from "react";
import EmptyState from "./EmptyState.jsx";

const TABS = ["Passing", "Rushing", "Receiving", "Tackles", "Sacks", "Interceptions"];

const CATEGORY_CONFIG = {
  Passing: {
    primaryLabel: "Pass Yds",
    secondaryLabel: "TD / Cmp%",
    getPrimary: (player) => stat(player, ["passingYards", "passYd"]),
    getSecondary: (player) => {
      const td = stat(player, ["touchdowns", "passTD", "passTDs"]);
      const comp = stat(player, ["completions", "passComp"]);
      const att = stat(player, ["attempts", "passAtt"]);
      const pct = att > 0 ? (comp / att) * 100 : 0;
      return `${displayNumber(td)} / ${displayNumber(pct, 1, "%")}`;
    },
  },
  Rushing: {
    primaryLabel: "Rush Yds",
    secondaryLabel: "TD / YPC",
    getPrimary: (player) => stat(player, ["rushingYards", "rushYd", "rushYds"]),
    getSecondary: (player) => {
      const td = stat(player, ["rushingTDs", "rushTD", "rushTDs"]);
      const yds = stat(player, ["rushingYards", "rushYd", "rushYds"]);
      const att = stat(player, ["rushingAttempts", "rushAtt"]);
      const ypc = att > 0 ? yds / att : 0;
      return `${displayNumber(td)} / ${displayNumber(ypc, 1)}`;
    },
  },
  Receiving: {
    primaryLabel: "Rec Yds",
    secondaryLabel: "Rec / TD",
    getPrimary: (player) => stat(player, ["receivingYards", "recYd", "recYds"]),
    getSecondary: (player) => {
      const rec = stat(player, ["receptions"]);
      const td = stat(player, ["receivingTDs", "recTD", "recTDs"]);
      return `${displayNumber(rec)} / ${displayNumber(td)}`;
    },
  },
  Tackles: {
    primaryLabel: "Total Tkl",
    secondaryLabel: "Solo / Ast",
    getPrimary: (player) => {
      const solo = stat(player, ["soloTackles"]);
      const assist = stat(player, ["assistTackles"]);
      const tackles = stat(player, ["totalTackles", "tackles"]);
      return Math.max(tackles, solo + assist);
    },
    getSecondary: (player) => `${displayNumber(stat(player, ["soloTackles"]))} / ${displayNumber(stat(player, ["assistTackles"]))}`,
  },
  Sacks: {
    primaryLabel: "Sacks",
    secondaryLabel: "TFL / FF",
    getPrimary: (player) => stat(player, ["sacks"]),
    getSecondary: (player) => `${displayNumber(stat(player, ["tacklesForLoss", "tfl"]))} / ${displayNumber(stat(player, ["forcedFumbles", "ffum"]))}`,
  },
  Interceptions: {
    primaryLabel: "INT",
    secondaryLabel: "PD / Tkl",
    getPrimary: (player) => stat(player, ["interceptions", "ints"]),
    getSecondary: (player) => `${displayNumber(stat(player, ["passesDefended"]))} / ${displayNumber(stat(player, ["tackles", "totalTackles"]))}`,
  },
};

function stat(player, keys) {
  const source = player?.stats ?? player?.seasonStats ?? player?.totals ?? {};
  const fromSource = keys.reduce((value, key) => (value != null ? value : source?.[key]), null);
  const fromPlayer = keys.reduce((value, key) => (value != null ? value : player?.[key]), null);
  return Number(fromSource ?? fromPlayer ?? 0) || 0;
}

function displayNumber(value, decimals = 0, suffix = "") {
  const safe = Number(value ?? 0) || 0;
  if (safe === 0) return "—";
  return `${safe.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
}

export default function LeagueLeaders({ league, onPlayerSelect, onNavigate }) {
  const [activeTab, setActiveTab] = useState("Passing");
  const teams = Array.isArray(league?.teams) ? league.teams : [];

  const allPlayers = useMemo(
    () =>
      teams.flatMap((team) =>
        (Array.isArray(team?.roster) ? team.roster : []).map((p) => ({
          ...p,
          teamName: team?.name ?? "—",
          teamId: team?.id ?? null,
          isUserTeam: team?.isUserTeam ?? Number(team?.id) === Number(league?.userTeamId),
        })),
      ),
    [teams, league?.userTeamId],
  );

  const rows = useMemo(() => {
    const config = CATEGORY_CONFIG[activeTab] ?? CATEGORY_CONFIG.Passing;
    return allPlayers
      .map((player) => ({
        player,
        primary: config.getPrimary(player) ?? 0,
        secondary: config.getSecondary(player),
      }))
      .sort((a, b) => (b.primary ?? 0) - (a.primary ?? 0))
      .slice(0, 10);
  }, [allPlayers, activeTab]);

  const config = CATEGORY_CONFIG[activeTab] ?? CATEGORY_CONFIG.Passing;

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div className="standings-tabs profile-tab-row" style={{ flexWrap: "nowrap", gap: 6 }}>
        {TABS.map((tab) => (
          <button key={tab} className={`standings-tab${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      <div className="table-wrapper" style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)" }}>
        <table className="standings-table" style={{ width: "100%", minWidth: 680 }}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Rank</th>
              <th>Player</th>
              <th>Team</th>
              <th style={{ textAlign: "right" }}>{config.primaryLabel}</th>
              <th style={{ textAlign: "right" }}>{config.secondaryLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry, index) => (
              <tr
                key={`${entry.player?.id ?? entry.player?.name ?? "player"}-${index}`}
                className="card-enter"
                style={entry.player?.isUserTeam ? { background: "color-mix(in srgb, var(--accent) 10%, transparent)" } : undefined}
              >
                <td>{index + 1}</td>
                <td>
                  <button
                    className="btn btn-link"
                    style={{ padding: 0, minHeight: 0 }}
                    onClick={() => onPlayerSelect?.(entry.player)}
                  >
                    {entry.player?.name ?? "—"}
                  </button>
                </td>
                <td>{entry.player?.teamName ?? "—"}</td>
                <td style={{ textAlign: "right" }}>{displayNumber(entry.primary)}</td>
                <td style={{ textAlign: "right" }}>{entry.secondary ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 0 }}>
                  <EmptyState
                    icon="📊"
                    title="No league leaders yet"
                    subtitle="No players have logged enough stats this season."
                    action="Open league"
                    onAction={() => onNavigate?.("League")}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
