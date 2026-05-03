import React, { useMemo, useState } from "react";
import { buildLeagueStatsHubModel } from "../utils/leagueStatsHub.js";

const leaderCards = [["Passing yards", "passing", "passYds"],["Passing TD", "passing", "passTd"],["Rushing yards", "rushing", "rushYds"],["Receiving yards", "receiving", "recYds"],["Tackles", "defense", "tkl"],["Sacks", "defense", "sack"],["Interceptions", "defense", "defInt"],["Field goals made", "kicking", "fgm"]];

const defaultSort = { passing: "passYds", rushing: "rushYds", receiving: "recYds", defense: "tkl", kicking: "pts" };

const columns = {
  passing: [["Player","name"],["Team","team"],["Pos","pos"],["G","g"],["Cmp","cmp"],["Att","att"],["Pct","passPct"],["Yds","passYds"],["TD","passTd"],["INT","passInt"],["Y/A","ypa"],["Rate","rate"]],
  rushing: [["Player","name"],["Team","team"],["Pos","pos"],["G","g"],["Att","rushAtt"],["Yds","rushYds"],["Y/A","rushYpa"],["TD","rushTd"],["Long","rushLong"]],
  receiving: [["Player","name"],["Team","team"],["Pos","pos"],["G","g"],["Tgt","tgt"],["Rec","rec"],["Yds","recYds"],["Y/R","recYpr"],["TD","recTd"],["Long","recLong"]],
  defense: [["Player","name"],["Team","team"],["Pos","pos"],["G","g"],["Tkl","tkl"],["Sack","sack"],["TFL","tfl"],["INT","defInt"],["PD","pd"],["FF","ff"],["FR","fr"],["TD","defTd"]],
  kicking: [["Player","name"],["Team","team"],["Pos","pos"],["G","g"],["FGM","fgm"],["FGA","fga"],["FG%","fgPct"],["XPM","xpm"],["XPA","xpa"],["Pts","pts"]],
};

function sourceBadge(source) { if (source === "seasonStats") return "Season totals"; if (source === "gameLogs") return "Aggregated from game logs"; if (source === "gameTeamStats") return "Aggregated from team stat logs"; if (source === "scoreOnly") return "Score-only standings data"; if (source === "partial") return "Partial data"; return "No stats recorded"; }
const fmt = (k, v) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (["passPct", "fgPct"].includes(k)) return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
  if (["ypa", "rushYpa", "recYpr", "rate", "ppg", "ppgAllowed"].includes(k)) return n.toFixed(1);
  return `${Math.round(n)}`;
};

export default function LeagueStats({ league, onPlayerSelect, onTeamSelect }) {
  const model = useMemo(() => buildLeagueStatsHubModel(league), [league]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("passing");
  const [sort, setSort] = useState({ key: defaultSort.passing, dir: "desc" });
  const filtered = (model.playerTables[tab] ?? []).filter((r) => (`${r.name} ${r.team} ${r.pos}`).toLowerCase().includes(search.toLowerCase()));
  const rows = useMemo(() => [...filtered].sort((a, b) => {
    const ak = a?.[sort.key]; const bk = b?.[sort.key];
    const d = typeof ak === "string" ? String(ak).localeCompare(String(bk)) : Number(ak ?? 0) - Number(bk ?? 0);
    return sort.dir === "asc" ? d : -d;
  }), [filtered, sort]);
  const setTabWithSort = (t) => { setTab(t); setSort({ key: defaultSort[t], dir: "desc" }); };
  const clickSort = (key) => setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });

  return <div style={{ display: "grid", gap: 12 }}>
    <div className="card" style={{ padding: 12 }}>
      <strong>League Stats</strong> · Season {league?.seasonId ?? "—"} · Week {league?.week ?? "—"}
      <div style={{fontSize:12,color:'var(--text-muted)'}}>Player stats: {sourceBadge(model.statSources.playerStats)}</div>
      <div style={{fontSize:12,color:'var(--text-muted)'}}>Team stats: {sourceBadge(model.statSources.teamStats)}</div>
      {model.warnings.map((w) => <div key={w} style={{ color: "var(--text-muted)", fontSize: 12 }}>{w}</div>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
      {leaderCards.map(([label, bucket, key]) => <div key={label} className="card" style={{ padding: 10 }}><div>{label}</div>{(model.playerLeaders[bucket] ?? []).map((r,i)=><button key={`${r.playerId}-${i}`} onClick={()=>onPlayerSelect?.(r.playerId)} style={{display:'flex',width:'100%',justifyContent:'space-between'}}><span>{r.name} ({r.team})</span><span>{fmt(key, r[key])}</span></button>)}</div>)}
    </div>
    <div className="card" style={{ padding: 10 }}>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{['passing','rushing','receiving','defense','kicking'].map((t)=><button key={t} onClick={()=>setTabWithSort(t)} style={{fontWeight: tab===t?700:500, textTransform:'capitalize'}}>{t}</button>)}<input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search name/team/pos" /></div>
      <div style={{ overflowX:'auto' }}><table style={{ minWidth: 980, width:'100%' }}><thead><tr>{columns[tab].map(([label,key])=><th key={key}><button onClick={()=>clickSort(key)}>{label}{sort.key===key?(sort.dir==='asc'?' ↑':' ↓'):''}</button></th>)}</tr></thead><tbody>
          {rows.length ? rows.map((r)=><tr key={`${r.playerId}-${tab}`}><td><button onClick={()=>onPlayerSelect?.(r.playerId)}>{r.name}</button></td>{columns[tab].slice(1).map(([,k])=><td key={k}>{fmt(k, r[k])}</td>)}</tr>) : <tr><td colSpan={columns[tab].length}>{tab==='passing'?'No passing stats recorded yet.':tab==='rushing'?'No rushing stats recorded yet.':'No data for this category yet.'}</td></tr>}
      </tbody></table></div>
    </div>
    <div className="card" style={{ padding: 10 }}>
      <strong>Team Rankings</strong>
      {model.teamRankings.offense.length === 0 ? <div>No team ranking data recorded yet.</div> : <>
        {[['Offense',[['Rank','rank'],['Team','team'],['G','g'],['PPG','ppg'],['Total Yds','yds'],['Pass Yds','passYds'],['Rush Yds','rushYds'],['Turnovers','turnovers']]],['Defense',[['Rank','rank'],['Team','team'],['G','g'],['PPG Allowed','ppgAllowed'],['Yds Allowed','ydsAllowed'],['Sacks','sacks'],['Takeaways','takeaways']]],['Discipline',[['Rank','rank'],['Team','team'],['G','g'],['Penalties','penalties'],['Penalty Yds','penaltyYards'],['Giveaways','turnovers'],['Takeaways','takeaways'],['Turnover Margin','turnoverMargin']]]].map(([title,allCols],idx)=>{ const cols = allCols.filter(([,k])=>k==='rank'||k==='team'||k==='g'||model.teamRankingColumns?.[k]); const data = idx===0?model.teamRankings.offense:idx===1?model.teamRankings.defense:model.teamRankings.discipline; return <div key={title} style={{marginTop:8}}><div>{title}</div><div style={{overflowX:'auto'}}><table style={{minWidth:720,width:'100%'}}><thead><tr>{cols.map((c)=><th key={c[1]}>{c[0]}</th>)}</tr></thead><tbody>{data.map((r)=><tr key={`${title}-${r.teamId}`}><td>{r.rank}</td><td>{onTeamSelect?<button onClick={()=>onTeamSelect(r.teamId)}>{r.team}</button>:r.team}</td>{cols.slice(2).map(([,k])=><td key={k}>{fmt(k, r[k])}</td>)}</tr>)}</tbody></table></div></div>})}
      </>}
    </div>
  </div>;
}
