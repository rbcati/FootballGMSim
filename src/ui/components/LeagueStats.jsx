import React, { useMemo, useState } from "react";
import { buildLeagueStatsHubModel } from "../utils/leagueStatsHub.js";

const leaderCards = [
  ["Passing yards", "passing", "passYds"],
  ["Passing TD", "passing", "passTd"],
  ["Rushing yards", "rushing", "rushYds"],
  ["Receiving yards", "receiving", "recYds"],
  ["Tackles", "defense", "tkl"],
  ["Sacks", "defense", "sack"],
  ["Interceptions", "defense", "defInt"],
  ["Field goals made", "kicking", "fgm"],
];

function sourceBadge(source) {
  if (source === "seasonStats") return "Season totals";
  if (source === "gameLogs") return "Aggregated from game logs";
  if (source === "mixed") return "Partial data";
  return "No stats recorded";
}

export default function LeagueStats({ league, onPlayerSelect }) {
  const model = useMemo(() => buildLeagueStatsHubModel(league), [league]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("passing");
  const rows = (model.playerTables[tab] ?? []).filter((r) => (`${r.name} ${r.team} ${r.pos}`).toLowerCase().includes(search.toLowerCase()));
  return <div style={{ display: "grid", gap: 12 }}>
    <div className="card" style={{ padding: 12 }}>
      <strong>League Stats</strong> · Season {league?.seasonId ?? "—"} · Week {league?.week ?? "—"} · <span>{sourceBadge(model.statSources.playerStats)}</span>
      {model.warnings.map((w) => <div key={w} style={{ color: "var(--text-muted)", fontSize: 12 }}>{w}</div>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
      {leaderCards.map(([label, bucket, key]) => <div key={label} className="card" style={{ padding: 10 }}><div>{label}</div>{(model.playerLeaders[bucket] ?? []).slice(0,5).map((r,i)=><button key={`${r.playerId}-${i}`} onClick={()=>onPlayerSelect?.(r.playerId)} style={{display:'flex',width:'100%',justifyContent:'space-between'}}><span>{r.name} ({r.team})</span><span>{r[key] ?? 0}</span></button>)}</div>)}
    </div>
    <div className="card" style={{ padding: 10 }}>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {['passing','rushing','receiving','defense','kicking'].map((t)=><button key={t} onClick={()=>setTab(t)}>{t}</button>)}
        <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search name/team/pos" />
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ minWidth: 760, width:'100%' }}><thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>G</th><th>Yds</th></tr></thead><tbody>
          {rows.length ? rows.map((r)=><tr key={`${r.playerId}-${tab}`}><td><button onClick={()=>onPlayerSelect?.(r.playerId)}>{r.name}</button></td><td>{r.team}</td><td>{r.pos}</td><td>{r.g}</td><td>{tab==='passing'?r.passYds:tab==='rushing'?r.rushYds:tab==='receiving'?r.recYds:tab==='defense'?r.tkl:r.fgm}</td></tr>) : <tr><td colSpan={5}>No data for this category yet.</td></tr>}
        </tbody></table>
      </div>
    </div>
  </div>;
}
