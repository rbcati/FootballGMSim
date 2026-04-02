/**
 * AnalyticsHub.jsx — Advanced Analytics Screen
 *
 * Full-featured league analytics with:
 *  - Sortable, filterable player stats leaderboard
 *  - Position, stat-category and min-games-played filters
 *  - Advanced derived stats (yards/game, TD%, completion%, etc.)
 *  - Team-level offensive/defensive efficiency table
 *
 * Fetches data silently (never blocks Advance button).
 */

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useWorker } from "../hooks/useWorker.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function posColor(pos = "") {
  const map = {
    QB:"#0A84FF", RB:"#34C759", WR:"#FF9F0A", TE:"#5E5CE6",
    OL:"#64D2FF", OT:"#64D2FF", OG:"#64D2FF", C:"#64D2FF",
    DL:"#FF453A", DE:"#FF453A", DT:"#FF453A", EDGE:"#FF453A",
    LB:"#FFD60A", CB:"#30D158", S:"#30D158", SS:"#30D158", FS:"#30D158",
    K:"#AEC6CF",  P:"#AEC6CF",
  };
  return map[pos.toUpperCase()] ?? "var(--text-muted)";
}

function fmt(n, dec = 0) {
  if (n == null || isNaN(n)) return "—";
  return dec > 0 ? Number(n).toFixed(dec) : String(Math.round(Number(n)));
}

function pct(num, den) {
  if (!den) return "—";
  return (num / den * 100).toFixed(1) + "%";
}

// ── Column definitions per stat category ──────────────────────────────────────

const PASSING_COLS = [
  { key: "name",         label: "Player",    align: "left",  render: (r) => r.name },
  { key: "teamAbbr",     label: "Team",      align: "left",  render: (r) => r.teamAbbr },
  { key: "gamesPlayed",  label: "G",         align: "right", render: (r) => fmt(r.gamesPlayed) },
  { key: "passYards",    label: "Pass Yds",  align: "right", render: (r) => fmt(r.passYards) },
  { key: "ydsPerGame",   label: "Yds/G",     align: "right", render: (r) => fmt(r.ydsPerGame, 1), derived: true },
  { key: "passTDs",      label: "TD",        align: "right", render: (r) => fmt(r.passTDs) },
  { key: "int",          label: "INT",       align: "right", render: (r) => fmt(r.int) },
  { key: "tdPct",        label: "TD%",       align: "right", render: (r) => r.tdPct != null ? r.tdPct.toFixed(1)+"%" : "—", derived: true },
  { key: "passerRating", label: "RTG",       align: "right", render: (r) => fmt(r.passerRating, 1) },
  { key: "ovr",          label: "OVR",       align: "right", render: (r) => fmt(r.ovr) },
];

const RUSHING_COLS = [
  { key: "name",         label: "Player",    align: "left",  render: (r) => r.name },
  { key: "teamAbbr",     label: "Team",      align: "left",  render: (r) => r.teamAbbr },
  { key: "gamesPlayed",  label: "G",         align: "right", render: (r) => fmt(r.gamesPlayed) },
  { key: "rushYards",    label: "Rush Yds",  align: "right", render: (r) => fmt(r.rushYards) },
  { key: "rushYdsPerGame",label:"Yds/G",     align: "right", render: (r) => fmt(r.rushYdsPerGame, 1), derived: true },
  { key: "rushTDs",      label: "TD",        align: "right", render: (r) => fmt(r.rushTDs) },
  { key: "rushAttempts", label: "Car",       align: "right", render: (r) => fmt(r.rushAttempts) },
  { key: "ypcRush",      label: "YPC",       align: "right", render: (r) => fmt(r.ypcRush, 1), derived: true },
  { key: "ovr",          label: "OVR",       align: "right", render: (r) => fmt(r.ovr) },
];

const RECEIVING_COLS = [
  { key: "name",         label: "Player",    align: "left",  render: (r) => r.name },
  { key: "teamAbbr",     label: "Team",      align: "left",  render: (r) => r.teamAbbr },
  { key: "gamesPlayed",  label: "G",         align: "right", render: (r) => fmt(r.gamesPlayed) },
  { key: "recYards",     label: "Rec Yds",   align: "right", render: (r) => fmt(r.recYards) },
  { key: "recYdsPerGame",label: "Yds/G",     align: "right", render: (r) => fmt(r.recYdsPerGame, 1), derived: true },
  { key: "recTDs",       label: "TD",        align: "right", render: (r) => fmt(r.recTDs) },
  { key: "receptions",   label: "Rec",       align: "right", render: (r) => fmt(r.receptions) },
  { key: "targets",      label: "Tgt",       align: "right", render: (r) => fmt(r.targets) },
  { key: "catchPct",     label: "Ctch%",     align: "right", render: (r) => r.catchPct != null ? r.catchPct.toFixed(1)+"%" : "—", derived: true },
  { key: "ovr",          label: "OVR",       align: "right", render: (r) => fmt(r.ovr) },
];

const DEFENSE_COLS = [
  { key: "name",         label: "Player",    align: "left",  render: (r) => r.name },
  { key: "teamAbbr",     label: "Team",      align: "left",  render: (r) => r.teamAbbr },
  { key: "gamesPlayed",  label: "G",         align: "right", render: (r) => fmt(r.gamesPlayed) },
  { key: "sacks",        label: "Sacks",     align: "right", render: (r) => fmt(r.sacks, 1) },
  { key: "tackles",      label: "Tkl",       align: "right", render: (r) => fmt(r.tackles) },
  { key: "interceptions",label: "INT",       align: "right", render: (r) => fmt(r.interceptions) },
  { key: "forcedFumbles",label: "FF",        align: "right", render: (r) => fmt(r.forcedFumbles) },
  { key: "passDeflections",label:"PD",       align: "right", render: (r) => fmt(r.passDeflections) },
  { key: "ovr",          label: "OVR",       align: "right", render: (r) => fmt(r.ovr) },
];

const STAT_CATEGORIES = [
  { id: "passing",   label: "Passing",   emoji: "🏈", cols: PASSING_COLS,   pos: ["QB"],             sortDefault: "passYards" },
  { id: "rushing",   label: "Rushing",   emoji: "🏃", cols: RUSHING_COLS,   pos: ["RB","QB","WR"],   sortDefault: "rushYards" },
  { id: "receiving", label: "Receiving", emoji: "🙌", cols: RECEIVING_COLS, pos: ["WR","TE","RB"],   sortDefault: "recYards" },
  { id: "defense",   label: "Defense",   emoji: "🛡️", cols: DEFENSE_COLS,   pos: ["LB","CB","S","DE","DT","DL","EDGE","SS","FS"], sortDefault: "sacks" },
];

const POSITIONS = ["ALL","QB","RB","WR","TE","OL","DL","LB","CB","S","K","P"];

// ── Derive computed stats ──────────────────────────────────────────────────────

function enrichStats(rows) {
  return rows.map(r => ({
    ...r,
    ydsPerGame:     r.gamesPlayed > 0 ? r.passYards / r.gamesPlayed : 0,
    tdPct:          r.passAttempts > 0 ? r.passTDs / r.passAttempts * 100 : null,
    rushYdsPerGame: r.gamesPlayed > 0 ? r.rushYards / r.gamesPlayed : 0,
    ypcRush:        r.rushAttempts > 0 ? r.rushYards / r.rushAttempts : null,
    recYdsPerGame:  r.gamesPlayed > 0 ? r.recYards / r.gamesPlayed : 0,
    catchPct:       r.targets > 0 ? r.receptions / r.targets * 100 : null,
  }));
}

// ── Team Efficiency Table ──────────────────────────────────────────────────────

function TeamEfficiencyTable({ league }) {
  if (!league?.teams) return null;
  const sorted = useMemo(() => [...league.teams].sort((a, b) => {
    const ptsDiffA = (a.ptsFor ?? 0) - (a.ptsAgainst ?? 0);
    const ptsDiffB = (b.ptsFor ?? 0) - (b.ptsAgainst ?? 0);
    return ptsDiffB - ptsDiffA;
  }), [league.teams]);

  const maxPts = Math.max(...sorted.map(t => t.ptsFor ?? 0), 1);
  const userTeamId = league.userTeamId;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        fontSize: "0.78rem",
      }}>
        <thead>
          <tr style={{ background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)" }}>
            {["#","Team","W-L","Pts For","Pts Agst","Diff","Off Rtg"].map(h => (
              <th key={h} style={{
                padding: "8px 10px",
                textAlign: h === "Team" ? "left" : "right",
                color: "var(--text-muted)",
                fontWeight: 700,
                fontSize: "0.68rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, i) => {
            const diff = (team.ptsFor ?? 0) - (team.ptsAgainst ?? 0);
            const gp = (team.wins ?? 0) + (team.losses ?? 0) + (team.ties ?? 0);
            const offRtg = gp > 0 ? ((team.ptsFor ?? 0) / gp).toFixed(1) : "—";
            const isUser = team.id === userTeamId;
            return (
              <tr key={team.id} style={{
                background: isUser ? "rgba(10,132,255,0.08)" : (i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"),
                borderBottom: "1px solid var(--hairline)",
                borderLeft: isUser ? "3px solid var(--accent)" : "3px solid transparent",
              }}>
                <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text-muted)", fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: "6px 10px", textAlign: "left", fontWeight: isUser ? 800 : 500, color: isUser ? "var(--accent)" : "var(--text)" }}>
                  {team.abbr} <span style={{ color: "var(--text-subtle)", fontWeight: 400 }}>{team.name?.split(" ").slice(-1)[0]}</span>
                </td>
                <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  {team.wins ?? 0}–{team.losses ?? 0}{(team.ties ?? 0) > 0 ? `–${team.ties}` : ""}
                </td>
                <td style={{ padding: "6px 10px", textAlign: "right", color: "#34C759", fontWeight: 700 }}>{team.ptsFor ?? 0}</td>
                <td style={{ padding: "6px 10px", textAlign: "right", color: "#FF453A" }}>{team.ptsAgainst ?? 0}</td>
                <td style={{ padding: "6px 10px", textAlign: "right", color: diff >= 0 ? "#34C759" : "#FF453A", fontWeight: 700 }}>
                  {diff >= 0 ? "+" : ""}{diff}
                </td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                    <div style={{
                      width: 50, height: 6, borderRadius: 3,
                      background: "var(--hairline)", overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${(team.ptsFor ?? 0) / maxPts * 100}%`,
                        height: "100%", background: "var(--accent)", borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{offRtg}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Sortable Header Cell ───────────────────────────────────────────────────────

function SortTh({ col, sortKey, sortDir, onSort }) {
  const active = sortKey === col.key;
  return (
    <th
      onClick={() => onSort(col.key)}
      style={{
        padding: "8px 10px",
        textAlign: col.align,
        color: active ? "var(--accent)" : "var(--text-muted)",
        fontWeight: 700,
        fontSize: "0.68rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        background: "var(--surface-strong)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      {col.label}
      {active && <span style={{ marginLeft: 3, fontSize: "0.7em" }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

// ── AnalyticsHub ───────────────────────────────────────────────────────────────

export default function AnalyticsHub({ league }) {
  const { actions } = useWorker();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("passing");
  const [posFilter, setPosFilter] = useState("ALL");
  const [minGames, setMinGames] = useState(1);
  const [sortKey, setSortKey] = useState("passYards");
  const [sortDir, setSortDir] = useState("desc");
  const [view, setView] = useState("players"); // "players" | "teams"

  // Fetch player stats on mount
  useEffect(() => {
    setLoading(true);
    actions.getAllPlayerStats({}).then(res => {
      setPlayers(enrichStats(res?.payload?.players ?? res?.payload ?? []));
    }).catch(() => setPlayers([])).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.week, league?.seasonId]);

  const catMeta = useMemo(() => STAT_CATEGORIES.find(c => c.id === category) ?? STAT_CATEGORIES[0], [category]);

  // Update sort key when category changes
  useEffect(() => {
    setSortKey(catMeta.sortDefault);
    setSortDir("desc");
  }, [catMeta]);

  const handleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === "desc" ? "asc" : "desc");
        return key;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

  // Filter & sort
  const rows = useMemo(() => {
    let filtered = players.filter(p => p.gamesPlayed >= minGames);

    if (posFilter !== "ALL") {
      filtered = filtered.filter(p => {
        const pos = (p.pos ?? "").toUpperCase();
        if (posFilter === "OL") return ["OL","OT","OG","C"].includes(pos);
        if (posFilter === "DL") return ["DL","DE","DT","EDGE"].includes(pos);
        if (posFilter === "S")  return ["S","SS","FS"].includes(pos);
        return pos === posFilter;
      });
    } else if (catMeta.pos?.length) {
      // Default: show only relevant positions for each category
      filtered = filtered.filter(p => {
        const pos = (p.pos ?? "").toUpperCase();
        return catMeta.pos.some(cp => {
          if (cp === "OL") return ["OL","OT","OG","C"].includes(pos);
          if (cp === "DL") return ["DL","DE","DT","EDGE"].includes(pos);
          if (cp === "S")  return ["S","SS","FS"].includes(pos);
          return pos === cp;
        });
      });
    }

    // Defense: filter to defensive positions only
    if (category === "defense") {
      filtered = filtered.filter(p => {
        const pos = (p.pos ?? "").toUpperCase();
        return ["LB","CB","S","SS","FS","DE","DT","DL","EDGE"].includes(pos);
      });
    }

    // Sort
    filtered.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (sortDir === "desc") return bv - av;
      return av - bv;
    });

    return filtered.slice(0, 100); // top 100
  }, [players, minGames, posFilter, catMeta, category, sortKey, sortDir]);

  const pillStyle = (active) => ({
    padding: "5px 12px",
    borderRadius: 20,
    border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--hairline)",
    background: active ? "var(--accent-muted, rgba(10,132,255,0.15))" : "transparent",
    color: active ? "var(--accent)" : "var(--text-muted)",
    fontWeight: active ? 700 : 500,
    fontSize: "0.72rem",
    cursor: "pointer",
    transition: "all 0.12s",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 900, letterSpacing: "-0.03em" }}>
            📊 Analytics Hub
          </h2>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 3 }}>
            {league?.year ?? ""} Season · Week {league?.week ?? 1}
          </div>
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {[["players","Players"],["teams","Team Efficiency"]].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} style={pillStyle(view === v)}>{label}</button>
          ))}
        </div>
      </div>

      {view === "teams" ? (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--hairline)",
          borderRadius: "var(--radius-lg)", overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--hairline)", fontWeight: 800, fontSize: "0.85rem" }}>
            Team Offensive Efficiency
          </div>
          <TeamEfficiencyTable league={league} />
        </div>
      ) : (
        <>
          {/* Category tabs */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STAT_CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)} style={pillStyle(category === c.id)}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>

          {/* Filters row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {POSITIONS.map(p => (
                <button key={p} onClick={() => setPosFilter(p)} style={{
                  ...pillStyle(posFilter === p),
                  padding: "4px 9px",
                  fontSize: "0.67rem",
                }}>
                  {p}
                </button>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "auto" }}>
              Min. games:
              <select
                value={minGames}
                onChange={e => setMinGames(Number(e.target.value))}
                style={{
                  background: "var(--surface)", border: "1px solid var(--hairline)",
                  borderRadius: 6, color: "var(--text)", padding: "3px 8px", fontSize: "0.72rem",
                }}
              >
                {[1,2,3,4,5,8,10].map(n => <option key={n} value={n}>{n}+</option>)}
              </select>
            </label>
          </div>

          {/* Stats table */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-lg)", overflow: "hidden",
          }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading stats…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                No stats yet — sim some games first.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead>
                    <tr>
                      <th style={{
                        padding: "8px 10px", textAlign: "right", color: "var(--text-muted)",
                        fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase",
                        background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)",
                      }}>#</th>
                      {catMeta.cols.map(col => (
                        <SortTh key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const isUserTeam = row.teamId === league?.userTeamId;
                      return (
                        <tr key={row.id ?? i} style={{
                          background: isUserTeam ? "rgba(10,132,255,0.06)" : (i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"),
                          borderBottom: "1px solid var(--hairline)",
                          borderLeft: isUserTeam ? "3px solid var(--accent)" : "3px solid transparent",
                        }}>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text-subtle)", fontWeight: 600 }}>
                            {i + 1}
                          </td>
                          {catMeta.cols.map((col, ci) => {
                            const val = col.render(row);
                            const isSortCol = col.key === sortKey;
                            return (
                              <td key={col.key} style={{
                                padding: "6px 10px",
                                textAlign: col.align,
                                fontWeight: ci === 0 ? 700 : (isSortCol ? 700 : 400),
                                color: ci === 0 ? "var(--text)" : (isSortCol ? "var(--accent)" : "var(--text-muted)"),
                                fontVariantNumeric: "tabular-nums",
                                whiteSpace: "nowrap",
                              }}>
                                {ci === 0 ? (
                                  <span>
                                    {val}{" "}
                                    <span style={{
                                      fontSize: "0.65rem",
                                      color: posColor(row.pos),
                                      fontWeight: 700,
                                      background: `${posColor(row.pos)}22`,
                                      padding: "1px 5px",
                                      borderRadius: 4,
                                    }}>{row.pos}</span>
                                  </span>
                                ) : val}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div style={{ fontSize: "0.65rem", color: "var(--text-subtle)", textAlign: "center" }}>
              Showing top {rows.length} players · Click column headers to sort
            </div>
          )}
        </>
      )}
    </div>
  );
}
