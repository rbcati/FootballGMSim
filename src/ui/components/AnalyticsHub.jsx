import React, { useEffect, useState, useMemo, useCallback } from "react";

function posColor(pos = "") {
  const map = { QB:"#0A84FF", RB:"#34C759", WR:"#FF9F0A", TE:"#5E5CE6", OL:"#64D2FF", OT:"#64D2FF", OG:"#64D2FF", C:"#64D2FF", DL:"#FF453A", DE:"#FF453A", DT:"#FF453A", EDGE:"#FF453A", LB:"#FFD60A", CB:"#30D158", S:"#30D158", SS:"#30D158", FS:"#30D158", K:"#AEC6CF", P:"#AEC6CF" };
  return map[pos.toUpperCase()] ?? "var(--text-muted)";
}
const fmt = (n, dec = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : (dec > 0 ? Number(n).toFixed(dec) : `${Math.round(Number(n))}`));
const money = (n) => (n == null || Number.isNaN(Number(n)) ? "—" : `$${Number(n).toFixed(1)}M`);

const PASSING_COLS = [
  { key: "name", label: "Player", align: "left", render: (r) => r.name },
  { key: "teamAbbr", label: "Team", align: "left", render: (r) => r.teamAbbr },
  { key: "gamesPlayed", label: "G", align: "right", render: (r) => fmt(r.gamesPlayed) },
  { key: "passYards", label: "Pass Yds", align: "right", render: (r) => fmt(r.passYards) },
  { key: "ydsPerGame", label: "Yds/G", align: "right", render: (r) => fmt(r.ydsPerGame, 1) },
  { key: "passTDs", label: "TD", align: "right", render: (r) => fmt(r.passTDs) },
  { key: "int", label: "INT", align: "right", render: (r) => fmt(r.int) },
  { key: "tdPct", label: "TD%", align: "right", render: (r) => r.tdPct != null ? `${r.tdPct.toFixed(1)}%` : "—" },
  { key: "passerRating", label: "RTG", align: "right", render: (r) => fmt(r.passerRating, 1) },
];
const RUSHING_COLS = [
  { key: "name", label: "Player", align: "left", render: (r) => r.name },
  { key: "teamAbbr", label: "Team", align: "left", render: (r) => r.teamAbbr },
  { key: "gamesPlayed", label: "G", align: "right", render: (r) => fmt(r.gamesPlayed) },
  { key: "rushYards", label: "Rush Yds", align: "right", render: (r) => fmt(r.rushYards) },
  { key: "rushYdsPerGame", label: "Yds/G", align: "right", render: (r) => fmt(r.rushYdsPerGame, 1) },
  { key: "rushTDs", label: "TD", align: "right", render: (r) => fmt(r.rushTDs) },
  { key: "rushAttempts", label: "Car", align: "right", render: (r) => fmt(r.rushAttempts) },
  { key: "ypcRush", label: "YPC", align: "right", render: (r) => fmt(r.ypcRush, 1) },
];
const RECEIVING_COLS = [
  { key: "name", label: "Player", align: "left", render: (r) => r.name },
  { key: "teamAbbr", label: "Team", align: "left", render: (r) => r.teamAbbr },
  { key: "gamesPlayed", label: "G", align: "right", render: (r) => fmt(r.gamesPlayed) },
  { key: "recYards", label: "Rec Yds", align: "right", render: (r) => fmt(r.recYards) },
  { key: "recYdsPerGame", label: "Yds/G", align: "right", render: (r) => fmt(r.recYdsPerGame, 1) },
  { key: "recTDs", label: "TD", align: "right", render: (r) => fmt(r.recTDs) },
  { key: "receptions", label: "Rec", align: "right", render: (r) => fmt(r.receptions) },
  { key: "targets", label: "Tgt", align: "right", render: (r) => fmt(r.targets) },
  { key: "catchPct", label: "Ctch%", align: "right", render: (r) => r.catchPct != null ? `${r.catchPct.toFixed(1)}%` : "—" },
];
const DEFENSE_COLS = [
  { key: "name", label: "Player", align: "left", render: (r) => r.name },
  { key: "teamAbbr", label: "Team", align: "left", render: (r) => r.teamAbbr },
  { key: "gamesPlayed", label: "G", align: "right", render: (r) => fmt(r.gamesPlayed) },
  { key: "sacks", label: "Sacks", align: "right", render: (r) => fmt(r.sacks, 1) },
  { key: "tackles", label: "Tkl", align: "right", render: (r) => fmt(r.tackles) },
  { key: "interceptions", label: "INT", align: "right", render: (r) => fmt(r.interceptions) },
  { key: "forcedFumbles", label: "FF", align: "right", render: (r) => fmt(r.forcedFumbles) },
  { key: "passDeflections", label: "PD", align: "right", render: (r) => fmt(r.passDeflections) },
];

const STAT_CATEGORIES = [
  { id: "passing", label: "Passing", emoji: "🏈", cols: PASSING_COLS, pos: ["QB"], sortDefault: "passYards" },
  { id: "rushing", label: "Rushing", emoji: "🏃", cols: RUSHING_COLS, pos: ["RB", "QB", "WR"], sortDefault: "rushYards" },
  { id: "receiving", label: "Receiving", emoji: "🙌", cols: RECEIVING_COLS, pos: ["WR", "TE", "RB"], sortDefault: "recYards" },
  { id: "defense", label: "Defense", emoji: "🛡️", cols: DEFENSE_COLS, pos: ["LB", "CB", "S", "DE", "DT", "DL", "EDGE", "SS", "FS"], sortDefault: "sacks" },
];
const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];
const txFilters = ["ALL", "SIGN", "RELEASE", "EXTEND", "TRADE", "RESTRUCTURE", "FRANCHISE_TAG"];

function enrichStats(rows) {
  return rows.map((r) => ({
    ...r,
    ydsPerGame: r.gamesPlayed > 0 ? r.passYards / r.gamesPlayed : 0,
    tdPct: r.passAttempts > 0 ? (r.passTDs / r.passAttempts) * 100 : null,
    rushYdsPerGame: r.gamesPlayed > 0 ? r.rushYards / r.gamesPlayed : 0,
    ypcRush: r.rushAttempts > 0 ? r.rushYards / r.rushAttempts : null,
    recYdsPerGame: r.gamesPlayed > 0 ? r.recYards / r.gamesPlayed : 0,
    catchPct: r.targets > 0 ? (r.receptions / r.targets) * 100 : null,
  }));
}

function SortTh({ col, sortKey, sortDir, onSort }) {
  const active = sortKey === col.key;
  return <th onClick={() => onSort(col.key)} style={{ padding: "8px 10px", textAlign: col.align, color: active ? "var(--accent)" : "var(--text-muted)", fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", whiteSpace: "nowrap", background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)" }}>{col.label}{active ? <span style={{ marginLeft: 3, fontSize: "0.7em" }}>{sortDir === "asc" ? "▲" : "▼"}</span> : null}</th>;
}

function TeamAnalyticsTable({ teams = [], userTeamId, onTeamSelect }) {
  const rows = useMemo(() => {
    const base = teams.map((t) => {
      const gp = (t.wins ?? 0) + (t.losses ?? 0) + (t.ties ?? 0);
      const ppg = gp > 0 ? (t.ptsFor ?? 0) / gp : 0;
      const papg = gp > 0 ? (t.ptsAgainst ?? 0) / gp : 0;
      const winPct = gp > 0 ? ((t.wins ?? 0) + 0.5 * (t.ties ?? 0)) / gp : 0;
      return { ...t, gp, ppg, papg, diff: (t.ptsFor ?? 0) - (t.ptsAgainst ?? 0), diffpg: ppg - papg, winPct };
    });
    const rank = (list, key, asc = false) => new Map([...list].sort((a, b) => asc ? (a[key] - b[key]) : (b[key] - a[key])).map((r, i) => [r.id, i + 1]));
    const offRank = rank(base, "ppg");
    const defRank = rank(base, "papg", true);
    const diffRank = rank(base, "diffpg");
    return base.map((t) => ({ ...t, offRank: offRank.get(t.id), defRank: defRank.get(t.id), diffRank: diffRank.get(t.id) })).sort((a, b) => b.diffpg - a.diffpg);
  }, [teams]);

  if (!rows.length) return null;
  return <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}><thead><tr style={{ background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)" }}>{["#", "Team", "W-L", "Win%", "PPG", "PA/G", "Diff/G", "O Rank", "D Rank"].map((h) => <th key={h} style={{ padding: "8px 10px", textAlign: h === "Team" ? "left" : "right", color: "var(--text-muted)", fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead><tbody>{rows.map((team, i) => {const isUser = team.id === userTeamId; return <tr key={team.id} style={{ background: isUser ? "rgba(10,132,255,0.08)" : (i % 2 ? "rgba(255,255,255,0.02)" : "transparent"), borderBottom: "1px solid var(--hairline)", borderLeft: isUser ? "3px solid var(--accent)" : "3px solid transparent" }}><td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text-muted)", fontWeight: 700 }}>{i + 1}</td><td style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700 }}><button className="btn" style={{ padding: 0, border: "none", background: "none", color: isUser ? "var(--accent)" : "var(--text)", cursor: "pointer" }} onClick={() => onTeamSelect?.(team.id)}>{team.abbr}</button> <span style={{ color: "var(--text-subtle)", fontWeight: 400 }}>{team.name?.split(" ").slice(-1)[0]}</span></td><td style={{ padding: "6px 10px", textAlign: "right" }}>{team.wins ?? 0}-{team.losses ?? 0}{(team.ties ?? 0) ? `-${team.ties}` : ""}</td><td style={{ padding: "6px 10px", textAlign: "right" }}>{fmt(team.winPct * 100, 1)}%</td><td style={{ padding: "6px 10px", textAlign: "right", color: "#34C759" }}>{fmt(team.ppg, 1)}</td><td style={{ padding: "6px 10px", textAlign: "right", color: "#FF453A" }}>{fmt(team.papg, 1)}</td><td style={{ padding: "6px 10px", textAlign: "right", color: team.diffpg >= 0 ? "#34C759" : "#FF453A", fontWeight: 700 }}>{team.diffpg >= 0 ? "+" : ""}{fmt(team.diffpg, 1)}</td><td style={{ padding: "6px 10px", textAlign: "right" }}>{team.offRank}</td><td style={{ padding: "6px 10px", textAlign: "right" }}>{team.defRank}</td></tr>;})}</tbody></table></div>;
}

function TeamPositionBreakdown({ players = [], teams = [], selectedTeamId }) {
  const [group, setGroup] = useState("offense");
  const rows = useMemo(() => {
    const map = new Map();
    const include = group === "offense" ? ["QB", "RB", "WR", "TE", "OL", "OT", "OG", "C"] : ["DL", "DE", "DT", "EDGE", "LB", "CB", "S", "SS", "FS"];
    players.forEach((p) => {
      if (selectedTeamId !== "ALL" && Number(p.teamId) !== Number(selectedTeamId)) return;
      const pos = String(p.pos ?? "?").toUpperCase();
      if (!include.includes(pos)) return;
      const key = ["OT", "OG", "C"].includes(pos) ? "OL" : (["DE", "DT", "EDGE"].includes(pos) ? "DL" : (["SS", "FS"].includes(pos) ? "S" : pos));
      if (!map.has(key)) map.set(key, { pos: key, players: 0, totalOvr: 0, passYd: 0, rushYd: 0, recYd: 0, sacks: 0, tackles: 0 });
      const row = map.get(key);
      row.players += 1;
      row.totalOvr += Number(p.ovr ?? 0);
      row.passYd += Number(p.passYards ?? 0);
      row.rushYd += Number(p.rushYards ?? 0);
      row.recYd += Number(p.recYards ?? 0);
      row.sacks += Number(p.sacks ?? 0);
      row.tackles += Number(p.tackles ?? 0);
    });
    return [...map.values()].map((r) => ({ ...r, avgOvr: r.players > 0 ? r.totalOvr / r.players : 0 })).sort((a, b) => b.avgOvr - a.avgOvr);
  }, [players, selectedTeamId, group]);

  return <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 10, padding: 12 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}><strong style={{ fontSize: "0.82rem" }}>Position-group breakdown</strong><div style={{ display: "flex", gap: 6 }}>{[["offense", "Offense"], ["defense", "Defense"]].map(([id, label]) => <button key={id} onClick={() => setGroup(id)} style={{ padding: "4px 9px", fontSize: "0.68rem", borderRadius: 999, border: "1px solid var(--hairline)", background: group === id ? "var(--surface-strong)" : "transparent", color: group === id ? "var(--text)" : "var(--text-muted)" }}>{label}</button>)}</div></div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.73rem" }}><thead><tr>{["Group", "Count", "Avg OVR", group === "offense" ? "Yards" : "Impact"].map((h) => <th key={h} style={{ textAlign: h === "Group" ? "left" : "right", color: "var(--text-muted)", padding: "6px 4px", borderBottom: "1px solid var(--hairline)" }}>{h}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.pos} style={{ borderBottom: "1px solid var(--hairline)" }}><td style={{ padding: "6px 4px", fontWeight: 700 }}>{r.pos}</td><td style={{ padding: "6px 4px", textAlign: "right" }}>{r.players}</td><td style={{ padding: "6px 4px", textAlign: "right" }}>{fmt(r.avgOvr, 1)}</td><td style={{ padding: "6px 4px", textAlign: "right" }}>{group === "offense" ? `${fmt(r.passYd + r.rushYd + r.recYd)} yds` : `${fmt(r.tackles)} tkl · ${fmt(r.sacks, 1)} sacks`}</td></tr>)}</tbody></table></div></div>;
}

function TransactionFeed({ transactions = [], filterType, setFilterType, teamFilter, setTeamFilter, search, setSearch, onPlayerSelect, onTeamSelect, teams }) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (filterType !== "ALL" && tx.type !== filterType) return false;
      if (teamFilter !== "ALL") {
        const tid = Number(teamFilter);
        if (![tx.teamId, tx.fromTeamId, tx.toTeamId].map((n) => Number(n)).includes(tid)) return false;
      }
      if (!q) return true;
      const hay = `${tx.typeLabel} ${tx.playerName ?? ""} ${tx.teamAbbr ?? ""} ${tx.fromTeamAbbr ?? ""} ${tx.toTeamAbbr ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [transactions, filterType, teamFilter, search]);

  const textFor = (tx) => {
    if (tx.type === "TRADE") return `${tx.fromTeamAbbr ?? "??"} ↔ ${tx.toTeamAbbr ?? "??"} trade package completed.`;
    if (tx.type === "SIGN") return `${tx.teamAbbr ?? "??"} signed ${tx.playerPos ?? ""} ${tx.playerName ?? "Unknown"}${tx.totalValue ? ` (${money(tx.totalValue)} total)` : ""}.`;
    if (tx.type === "EXTEND") return `${tx.teamAbbr ?? "??"} extended ${tx.playerName ?? "Unknown"}${tx.totalValue ? ` (${money(tx.totalValue)} total)` : ""}.`;
    if (tx.type === "RELEASE") return `${tx.teamAbbr ?? "??"} released ${tx.playerName ?? "Unknown"}.`;
    if (tx.type === "RESTRUCTURE") return `${tx.teamAbbr ?? "??"} restructured ${tx.playerName ?? "Unknown"} (${money(tx.details?.convertAmount)} converted).`;
    if (tx.type === "FRANCHISE_TAG") return `${tx.teamAbbr ?? "??"} tagged ${tx.playerName ?? "Unknown"}.`;
    return tx.typeLabel;
  };

  return <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 10, padding: 12 }}><div style={{ display: "grid", gap: 8, marginBottom: 10 }}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{txFilters.map((f) => <button key={f} onClick={() => setFilterType(f)} style={{ padding: "4px 9px", fontSize: "0.67rem", borderRadius: 999, border: "1px solid var(--hairline)", background: filterType === f ? "var(--surface-strong)" : "transparent", color: filterType === f ? "var(--text)" : "var(--text-muted)" }}>{f === "ALL" ? "All moves" : f.replaceAll("_", " ")}</button>)}</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 6, color: "var(--text)", padding: "4px 8px", fontSize: 12 }}><option value="ALL">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}</select><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player/team" style={{ flex: 1, minWidth: 180, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 6, color: "var(--text)", padding: "5px 8px", fontSize: 12 }} /></div></div><div style={{ maxHeight: 470, overflowY: "auto", display: "grid", gap: 8 }}>{filtered.length === 0 ? <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No transactions for current filters.</div> : filtered.map((tx) => <div key={tx.id} style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: "8px 10px", background: "rgba(255,255,255,0.01)" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><strong style={{ fontSize: 12 }}>{tx.typeLabel}</strong><span style={{ fontSize: 11, color: "var(--text-muted)" }}>Wk {tx.week ?? "?"}</span></div><div style={{ fontSize: 12, color: "var(--text)" }}>{textFor(tx)}</div><div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>{tx.playerId != null ? <button className="btn" onClick={() => onPlayerSelect?.(tx.playerId)} style={{ padding: "2px 8px", fontSize: 11 }}>Player</button> : null}{tx.teamId != null ? <button className="btn" onClick={() => onTeamSelect?.(tx.teamId)} style={{ padding: "2px 8px", fontSize: 11 }}>Team</button> : null}</div></div>)}</div></div>;
}

export default function AnalyticsHub({ league, actions, onPlayerSelect = null, onTeamSelect = null, onNavigate = null }) {
  const [players, setPlayers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("passing");
  const [posFilter, setPosFilter] = useState("ALL");
  const [minGames, setMinGames] = useState(1);
  const [sortKey, setSortKey] = useState("passYards");
  const [sortDir, setSortDir] = useState("desc");
  const [view, setView] = useState("players");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [txType, setTxType] = useState("ALL");
  const [txTeamFilter, setTxTeamFilter] = useState("ALL");
  const [txSearch, setTxSearch] = useState("");

  useEffect(() => {
    let stale = false;
    setLoading(true);
    const txPromise = actions.getTransactions
      ? actions.getTransactions({ seasonId: league?.seasonId }).catch(() => ({ payload: { transactions: [] } }))
      : Promise.resolve({ payload: { transactions: [] } });
    Promise.all([
      actions.getAllPlayerStats({}).catch(() => ({ payload: { stats: [] } })),
      txPromise,
    ]).then(([statsRes, txRes]) => {
      if (stale) return;
      setPlayers(enrichStats(statsRes?.payload?.players ?? statsRes?.payload?.stats ?? statsRes?.payload ?? []));
      setTransactions(txRes?.payload?.transactions ?? txRes?.payload ?? []);
    }).finally(() => !stale && setLoading(false));
    return () => { stale = true; };
  }, [actions, league?.week, league?.seasonId]);

  const catMeta = useMemo(() => STAT_CATEGORIES.find((c) => c.id === category) ?? STAT_CATEGORIES[0], [category]);
  useEffect(() => { setSortKey(catMeta.sortDefault); setSortDir("desc"); }, [catMeta]);
  const handleSort = useCallback((key) => setSortKey((prev) => { if (prev === key) { setSortDir((d) => d === "desc" ? "asc" : "desc"); return key; } setSortDir("desc"); return key; }), []);

  const rows = useMemo(() => {
    let filtered = players.filter((p) => p.gamesPlayed >= minGames);
    if (teamFilter !== "ALL") filtered = filtered.filter((p) => Number(p.teamId) === Number(teamFilter));
    if (posFilter !== "ALL") {
      filtered = filtered.filter((p) => {
        const pos = (p.pos ?? "").toUpperCase();
        if (posFilter === "OL") return ["OL", "OT", "OG", "C"].includes(pos);
        if (posFilter === "DL") return ["DL", "DE", "DT", "EDGE"].includes(pos);
        if (posFilter === "S") return ["S", "SS", "FS"].includes(pos);
        return pos === posFilter;
      });
    } else if (catMeta.pos?.length) {
      filtered = filtered.filter((p) => {
        const pos = (p.pos ?? "").toUpperCase();
        return catMeta.pos.some((cp) => (cp === "OL" ? ["OL", "OT", "OG", "C"].includes(pos) : cp === "DL" ? ["DL", "DE", "DT", "EDGE"].includes(pos) : cp === "S" ? ["S", "SS", "FS"].includes(pos) : pos === cp));
      });
    }
    filtered.sort((a, b) => sortDir === "desc" ? ((b[sortKey] ?? 0) - (a[sortKey] ?? 0)) : ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)));
    return filtered.slice(0, 100);
  }, [players, minGames, posFilter, catMeta, sortKey, sortDir, teamFilter]);

  const pillStyle = (active) => ({ padding: "5px 12px", borderRadius: 20, border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--hairline)", background: active ? "var(--accent-muted, rgba(10,132,255,0.15))" : "transparent", color: active ? "var(--accent)" : "var(--text-muted)", fontWeight: active ? 700 : 500, fontSize: "0.72rem", cursor: "pointer", whiteSpace: "nowrap" });

  return <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 900 }}>📊 Analytics Hub</h2><div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 3 }}>{league?.year ?? ""} Season · Week {league?.week ?? 1}</div></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[["players", "Players"], ["teams", "Team Analytics"], ["office", "League Office"]].map(([v, label]) => <button key={v} onClick={() => setView(v)} style={pillStyle(view === v)}>{label}</button>)}</div></div>

    {view !== "office" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn" onClick={() => onNavigate?.("Financials")}>Open Financials</button><button className="btn" onClick={() => onNavigate?.("Injuries")}>Open Injury Report</button><button className="btn" onClick={() => onNavigate?.("History")}>Open History</button></div>}

    {view === "teams" ? <>
      <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}><div style={{ padding: "12px 16px", borderBottom: "1px solid var(--hairline)", fontWeight: 800, fontSize: "0.85rem" }}>Team season efficiency + rank context</div><TeamAnalyticsTable teams={league?.teams ?? []} userTeamId={league?.userTeamId} onTeamSelect={onTeamSelect} /></div>
      <TeamPositionBreakdown players={players} teams={league?.teams ?? []} selectedTeamId={teamFilter} />
    </> : view === "office" ? <TransactionFeed transactions={transactions} filterType={txType} setFilterType={setTxType} teamFilter={txTeamFilter} setTeamFilter={setTxTeamFilter} search={txSearch} setSearch={setTxSearch} teams={league?.teams ?? []} onPlayerSelect={onPlayerSelect} onTeamSelect={onTeamSelect} /> : <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{STAT_CATEGORIES.map((c) => <button key={c.id} onClick={() => setCategory(c.id)} style={pillStyle(category === c.id)}>{c.emoji} {c.label}</button>)}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{POSITIONS.map((p) => <button key={p} onClick={() => setPosFilter(p)} style={{ ...pillStyle(posFilter === p), padding: "4px 9px", fontSize: "0.67rem" }}>{p}</button>)}</div><select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 6, color: "var(--text)", padding: "3px 8px", fontSize: "0.72rem" }}><option value="ALL">All teams</option>{(league?.teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}</select><label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "auto" }}>Min. games:<select value={minGames} onChange={(e) => setMinGames(Number(e.target.value))} style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 6, color: "var(--text)", padding: "3px 8px", fontSize: "0.72rem" }}>{[1, 2, 3, 4, 5, 8, 10].map((n) => <option key={n} value={n}>{n}+</option>)}</select></label></div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>{loading ? <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading stats…</div> : rows.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No stats yet — sim some games first.</div> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}><thead><tr><th style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-muted)", fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase", background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)" }}>#</th>{catMeta.cols.map((col) => <SortTh key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />)}</tr></thead><tbody>{rows.map((row, i) => { const isUserTeam = row.teamId === league?.userTeamId; return <tr key={row.id ?? i} style={{ background: isUserTeam ? "rgba(10,132,255,0.06)" : (i % 2 ? "rgba(255,255,255,0.02)" : "transparent"), borderBottom: "1px solid var(--hairline)", borderLeft: isUserTeam ? "3px solid var(--accent)" : "3px solid transparent" }}><td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text-subtle)", fontWeight: 600 }}>{i + 1}</td>{catMeta.cols.map((col, ci) => <td key={col.key} style={{ padding: "6px 10px", textAlign: col.align, fontWeight: ci === 0 ? 700 : 400, color: ci === 0 ? "var(--text)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{ci === 0 ? <button onClick={() => onPlayerSelect?.(row.id)} style={{ background: "none", border: "none", padding: 0, color: "inherit", cursor: "pointer" }}>{col.render(row)} <span style={{ fontSize: "0.65rem", color: posColor(row.pos), fontWeight: 700, background: `${posColor(row.pos)}22`, padding: "1px 5px", borderRadius: 4 }}>{row.pos}</span></button> : col.render(row)}</td>)}</tr>;})}</tbody></table></div>}</div>
    </>}
  </div>;
}
