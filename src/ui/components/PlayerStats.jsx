/**
 * PlayerStats.jsx
 *
 * Dedicated global stats viewer.
 * Fetches all player stats via GET_ALL_PLAYER_STATS.
 * Features position filtering, sortable columns, and dynamic column sets.
 */

import React, { useState, useEffect, useMemo } from "react";
import { ScreenHeader, SectionCard } from "./ScreenSystem.jsx";
import { Badge } from "@/components/ui/badge";

// ── Configuration ─────────────────────────────────────────────────────────────

const POS_FILTERS = [
  "All",
  "QB",
  "RB",
  "WR",
  "TE",
  "OL",
  "DL",
  "LB",
  "DB",
  "K",
  "P",
];

const COLUMNS = {
  // Common columns always shown first
  BASE: [
    { key: "name", label: "Name", align: "left", width: 140 },
    { key: "pos", label: "Pos", align: "center", width: 50 },
    { key: "teamAbbr", label: "Team", align: "center", width: 50 },
    { key: "ovr", label: "OVR", align: "center", width: 50 },
    { key: "age", label: "Age", align: "center", width: 50 },
    { key: "gamesPlayed", label: "GP", align: "center", width: 50 },
  ],
  // Dynamic columns per position group
  QB: [
    { key: "passYards", label: "Yds", align: "right" },
    { key: "passTDs", label: "TD", align: "right" },
    { key: "int", label: "Int", align: "right" },
    { key: "passerRating", label: "Rate", align: "right" },
    { key: "rushYards", label: "Rush Yds", align: "right" },
    { key: "rushTDs", label: "Rush TD", align: "right" },
  ],
  RB: [
    { key: "rushAtt", label: "Att", align: "right" },
    { key: "rushYards", label: "Yds", align: "right" },
    { key: "rushTDs", label: "TD", align: "right" },
    { key: "receptions", label: "Rec", align: "right" },
    { key: "recYards", label: "Rec Yds", align: "right" },
    { key: "recTDs", label: "Rec TD", align: "right" },
  ],
  WR: [
    // Also used for TE
    { key: "receptions", label: "Rec", align: "right" },
    { key: "recYards", label: "Yds", align: "right" },
    { key: "recTDs", label: "TD", align: "right" },
    { key: "rushYards", label: "Rush Yds", align: "right" },
    { key: "rushTDs", label: "Rush TD", align: "right" },
  ],
  DEFENSE: [
    // DL, LB, DB
    { key: "tackles", label: "Tkl", align: "right" },
    { key: "sacks", label: "Sacks", align: "right" },
    { key: "tfl", label: "TFL", align: "right" },
    { key: "defInt", label: "Int", align: "right" },
  ],
  K: [
    // Also used for P
    { key: "fgMade", label: "FGM", align: "right" },
    { key: "fgAtt", label: "FGA", align: "right" },
  ],
  ALL: [
    // Generic summary
    { key: "passYards", label: "Pass Yds", align: "right" },
    { key: "passTDs", label: "Pass TD", align: "right" },
    { key: "rushYards", label: "Rush Yds", align: "right" },
    { key: "rushTDs", label: "Rush TD", align: "right" },
    { key: "recYards", label: "Rec Yds", align: "right" },
    { key: "recTDs", label: "Rec TD", align: "right" },
    { key: "tackles", label: "Tkl", align: "right" },
    { key: "sacks", label: "Sacks", align: "right" },
  ],
};

// Map position filter -> column set key
function getColSet(filter) {
  if (filter === "All") return "ALL";
  if (filter === "WR" || filter === "TE") return "WR";
  if (filter === "DL" || filter === "LB" || filter === "DB") return "DEFENSE";
  if (filter === "K" || filter === "P") return "K";
  return filter; // QB, RB, OL (fallback to default or empty for OL)
}

// ── Helper Components ─────────────────────────────────────────────────────────

function SortTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  style = {},
}) {
  const active = currentSort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        cursor: "pointer",
        userSelect: "none",
        color: active ? "var(--accent)" : "var(--text-muted)",
        fontWeight: active ? 700 : 600,
        fontSize: "var(--text-xs)",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
      {active ? (currentDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}

function PosBadge({ pos }) {
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 32,
        padding: "1px 6px",
        borderRadius: "var(--radius-pill)",
        background: "var(--surface-strong)",
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        color: "var(--text-muted)",
        textAlign: "center",
      }}
    >
      {pos}
    </span>
  );
}

function OvrBadge({ ovr }) {
  let col = "#FF453A";
  if (ovr >= 90) col = "#34C759";
  else if (ovr >= 80) col = "#30D158";
  else if (ovr >= 70) col = "#0A84FF";
  else if (ovr >= 60) col = "#FF9F0A";

  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 32,
        padding: "2px 4px",
        borderRadius: "var(--radius-pill)",
        background: col + "22",
        color: col,
        fontWeight: 800,
        fontSize: "var(--text-xs)",
        textAlign: "center",
      }}
    >
      {ovr}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const PER_GAME_KEYS = new Set(["passYards", "passTDs", "int", "rushAtt", "rushYards", "rushTDs", "receptions", "recYards", "recTDs", "tackles", "sacks", "defInt", "tfl", "fgMade", "fgAtt"]);

export default function PlayerStats({ actions, onPlayerSelect, league, initialFamily = "passing" }) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [posFilter, setPosFilter] = useState("All");
  const [sortKey, setSortKey] = useState("passYards"); // Default sort
  const [sortDir, setSortDir] = useState("desc");
  const [statFamily, setStatFamily] = useState(initialFamily || "passing");
  const [rateMode, setRateMode] = useState("total");
  const [viewMode, setViewMode] = useState("players");

  useEffect(() => {
    if (["passing", "rushing", "receiving", "defense"].includes(initialFamily)) {
      setStatFamily(initialFamily);
    }
  }, [initialFamily]);

  // Fetch data on mount
  useEffect(() => {
    if (!actions) return;
    setLoading(true);
    actions
      .getAllPlayerStats({ silent: true })
      .then((resp) => {
        if (resp.payload?.stats) {
          setStats(resp.payload.stats);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load player stats:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [actions]);

  useEffect(() => {
    if (initialFamily) setStatFamily(initialFamily);
  }, [initialFamily]);

  // Handle Sort
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Filter & Sort
  const displayedStats = useMemo(() => {
    // 1. Filter
    let filtered = stats;
    if (posFilter !== "All") {
      if (["DL", "LB", "DB"].includes(posFilter)) {
        // Broad matching for defense if needed, or strict?
        // Worker sends normalized pos like 'CB', 'S', 'DT', 'DE', 'LB'.
        // Let's do strict matching for simplicity, but handle DB groups.
        if (posFilter === "DB")
          filtered = stats.filter((p) =>
            ["CB", "S", "SS", "FS"].includes(p.pos),
          );
        else if (posFilter === "DL")
          filtered = stats.filter((p) =>
            ["DT", "DE", "DL", "EDGE"].includes(p.pos),
          );
        else
          filtered = stats.filter(
            (p) => p.pos === posFilter || p.pos.includes(posFilter),
          );
      } else {
        filtered = stats.filter((p) => p.pos === posFilter);
      }
    }

    // 2. Sort
    return [...filtered].sort((a, b) => {
      const baseA = a[sortKey] ?? 0;
      const baseB = b[sortKey] ?? 0;
      const valA = rateMode === "per_game" && PER_GAME_KEYS.has(sortKey) ? baseA / Math.max(1, a.gamesPlayed ?? 0) : baseA;
      const valB = rateMode === "per_game" && PER_GAME_KEYS.has(sortKey) ? baseB / Math.max(1, b.gamesPlayed ?? 0) : baseB;

      if (typeof valA === "string") {
        return sortDir === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return sortDir === "asc" ? valA - valB : valB - valA;
    });
  }, [stats, posFilter, sortKey, sortDir, rateMode]);

  // Determine Columns
  const activeColSetKey = getColSet(posFilter);
  const safeWeek = Number(league?.week ?? 1);
  const familyColumns = {
    passing: ["passYards", "passTDs", "int", "passerRating"],
    rushing: ["rushAtt", "rushYards", "rushTDs"],
    receiving: ["receptions", "recYards", "recTDs"],
    defense: ["tackles", "sacks", "defInt", "tfl"],
  };
  useEffect(() => {
    const defaultSortByFamily = {
      passing: "passYards",
      rushing: "rushYards",
      receiving: "recYards",
      defense: "tackles",
    };
    setSortKey((prev) => (familyColumns[statFamily]?.includes(prev) ? prev : defaultSortByFamily[statFamily] ?? "passYards"));
    setSortDir("desc");
  }, [statFamily]);
  const dynCols = (COLUMNS[activeColSetKey] || COLUMNS.ALL).filter((col) =>
    familyColumns[statFamily]?.includes(col.key) || !Object.values(familyColumns).flat().includes(col.key),
  );
  const tableCols = [...COLUMNS.BASE, ...dynCols];
  const teamRows = useMemo(() => {
    const map = new Map();
    for (const row of stats) {
      const teamAbbr = row?.teamAbbr ?? "FA";
      const existing = map.get(teamAbbr) ?? {
        id: teamAbbr,
        name: teamAbbr,
        pos: "TEAM",
        teamAbbr,
        ovr: 0,
        age: 0,
        gamesPlayed: 0,
        passYards: 0,
        passTDs: 0,
        int: 0,
        rushAtt: 0,
        rushYards: 0,
        rushTDs: 0,
        receptions: 0,
        recYards: 0,
        recTDs: 0,
        tackles: 0,
        sacks: 0,
        tfl: 0,
        defInt: 0,
      };
      existing.gamesPlayed = Math.max(existing.gamesPlayed, Number(row?.gamesPlayed ?? 0));
      for (const key of ["passYards","passTDs","int","rushAtt","rushYards","rushTDs","receptions","recYards","recTDs","tackles","sacks","tfl","defInt"]) {
        existing[key] += Number(row?.[key] ?? 0);
      }
      map.set(teamAbbr, existing);
    }
    return [...map.values()];
  }, [stats]);
  const baseRows = useMemo(() => {
    const rows = viewMode === "teams" ? [...teamRows] : [...displayedStats];
    return rows.sort((a, b) => {
      const valA = a?.[sortKey] ?? 0;
      const valB = b?.[sortKey] ?? 0;
      if (typeof valA === "string") {
        return sortDir === "asc" ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
      }
      return sortDir === "asc" ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });
  }, [viewMode, teamRows, displayedStats, sortKey, sortDir]);

  if (loading) {
    return (
      <div
        style={{
          padding: "var(--space-8)",
          textAlign: "center",
          color: "var(--text-muted)",
        }}
      >
        Loading stats...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: "var(--space-6)",
          color: "var(--danger)",
          textAlign: "center",
        }}
      >
        Error loading stats: {error}
      </div>
    );
  }

  return (
    <div className="app-screen-stack">
      <ScreenHeader
        title="Player Stats"
        subtitle="Switch stat families, scan quickly, and drill into player profiles."
        metadata={[
          { label: "Players", value: displayedStats.length },
          { label: "Family", value: statFamily },
          { label: "Mode", value: rateMode === "per_game" ? "Per Game" : "Totals" },
        ]}
      />
      {/* Filters */}
      <SectionCard title="Filters" subtitle="Position, stat family, and output mode.">
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          flexWrap: "wrap",
          marginBottom: "var(--space-4)",
        }}
      >
        {POS_FILTERS.map((pos) => (
          <button
            key={pos}
            className={`standings-tab${posFilter === pos ? " active" : ""}`}
            onClick={() => {
              setPosFilter(pos);
              // Reset sort to something sensible for the new position?
              // Optional: setSortKey('ovr');
            }}
            style={{ minWidth: 40, padding: "4px 10px" }}
          >
            {pos}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
        {[
          ["players", "Players"],
          ["teams", "Teams"],
        ].map(([key, label]) => (
          <button key={key} className={`standings-tab${viewMode === key ? " active" : ""}`} onClick={() => setViewMode(key)}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
        {[["passing", "Passing"], ["rushing", "Rushing"], ["receiving", "Receiving"], ["defense", "Defense"]].map(([key, label]) => (
          <button key={key} className={`standings-tab${statFamily === key ? " active" : ""}`} onClick={() => setStatFamily(key)}>
            {label}
          </button>
        ))}
        <button className={`standings-tab${rateMode === "total" ? " active" : ""}`} onClick={() => setRateMode("total")}>Totals</button>
        <button className={`standings-tab${rateMode === "per_game" ? " active" : ""}`} onClick={() => setRateMode("per_game")}>Per Game</button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
        <Badge variant="outline">Default sort: {sortKey}</Badge>
        {stats.length === 0 ? <Badge variant="secondary">No games logged yet</Badge> : null}
      </div>
      </SectionCard>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          className="table-wrapper"
          style={{
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            maxHeight: "calc(100vh - 250px)",
            overflowY: "auto",
          }}
        >
          <table
            className="standings-table"
            style={{ width: "100%", minWidth: 800 }}
          >
            <thead
              style={{
                position: "sticky",
                top: 0,
                background: "var(--surface)",
                zIndex: 10,
              }}
            >
              <tr>
                <th
                  style={{
                    paddingLeft: "var(--space-5)",
                    width: 40,
                    color: "var(--text-subtle)",
                    fontSize: "var(--text-xs)",
                  }}
                >
                  #
                </th>
                {tableCols.map((col) => (
                  <SortTh
                    key={col.key}
                    label={col.label}
                    sortKey={col.key}
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    style={{
                      textAlign: col.align,
                      width: col.width,
                      paddingRight:
                        col.align === "right" ? "var(--space-4)" : 0,
                    }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {baseRows.length === 0 && (
                <tr>
                  <td
                    colSpan={tableCols.length + 1}
                    style={{
                      textAlign: "center",
                      padding: "var(--space-8)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {safeWeek <= 1
                      ? `Week ${safeWeek}: ${statFamily} stats are still sparse. Sim a week, then check back.`
                      : `No ${statFamily} stats found for this filter.`}
                  </td>
                </tr>
              )}
              {baseRows.slice(0, 500).map((player, idx) => (
                <tr key={player.id}>
                  <td
                    style={{
                      paddingLeft: "var(--space-5)",
                      color: "var(--text-subtle)",
                      fontSize: "var(--text-xs)",
                      fontWeight: 700,
                    }}
                  >
                    {idx + 1}
                  </td>
                  {tableCols.map((col) => {
                    let content = player[col.key];
                    if (rateMode === "per_game" && PER_GAME_KEYS.has(col.key)) {
                      content = Number(content ?? 0) / Math.max(1, Number(player.gamesPlayed ?? 0));
                    }

                    // Formatting special columns
                    if (col.key === "pos")
                      content = <PosBadge pos={player.pos} />;
                    else if (col.key === "ovr")
                      content = <OvrBadge ovr={player.ovr} />;
                    else if (col.key === "name") {
                      content = (
                        <span
                          onClick={() => {
                            if (viewMode === "players" && onPlayerSelect) onPlayerSelect(player.id);
                          }}
                          style={{
                            fontWeight: 600,
                            color: "var(--text)",
                            cursor: viewMode === "players" ? "pointer" : "default",
                          }}
                        >
                          {player.name}
                        </span>
                      );
                    } else if (
                      typeof content === "number" &&
                      content % 1 !== 0
                    ) {
                      content = content.toFixed(1); // Format ratings/averages
                    } else if (
                      typeof content === "number" &&
                      Number.isInteger(content) &&
                      Math.abs(content) >= 1000
                    ) {
                      content = content.toLocaleString(); // Add commas to large integers
                    }

                    return (
                      <td
                        key={col.key}
                        style={{
                          textAlign: col.align,
                          paddingRight:
                            col.align === "right" ? "var(--space-4)" : 0,
                        }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {baseRows.length > 500 && (
                <tr>
                  <td
                    colSpan={tableCols.length + 1}
                    style={{
                      textAlign: "center",
                      padding: "var(--space-4)",
                      color: "var(--text-muted)",
                      fontSize: "var(--text-xs)",
                    }}
                  >
                    Showing top 500 of {baseRows.length} rows. Use
                    filters to see more.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
