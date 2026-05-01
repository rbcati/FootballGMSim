import React, { useMemo, useState } from 'react';
import { buildDraftBoardAnalysis } from '../../core/draft/draftBoardAnalysis.js';

const POS_FILTERS = ['ALL', 'QB', 'WR', 'RB', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
const FILTERS = ['all', 'need', 'starter_path', 'young_upside', 'safe_pick', 'high_risk', 'bargain'];
const SORTS = ['board_rank', 'best_fit', 'ovr', 'potential', 'projected_round', 'scouting_confidence', 'lowest_risk'];

export default function DraftBigBoard({ league, onPlayerSelect }) {
  const prospects = Array.isArray(league?.draftClass) ? league?.draftClass : [];
  const userTeam = league?.teams?.find((t) => t.id === league?.userTeamId) ?? null;
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [activeFilter, setActiveFilter] = useState('all');
  const [viewMode, setViewMode] = useState('board');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('board_rank');
  const [watchlist, setWatchlist] = useState(() => Array.isArray(league?.draftBoard?.shortlist) ? league.draftBoard.shortlist : []);
  const [manualOrder, setManualOrder] = useState([]);

  const analysis = useMemo(() => buildDraftBoardAnalysis({
    team: userTeam,
    roster: userTeam?.roster ?? [],
    prospects,
    draftPicks: league?.draftState?.picks ?? userTeam?.draftPicks ?? [],
    teamBuilder: league?.teamBuilderAnalysis ?? null,
    shortlistIds: watchlist,
    manualOrderIds: manualOrder,
    phase: league?.phase,
  }), [userTeam, prospects, league?.draftState?.picks, league?.teamBuilderAnalysis, league?.phase, watchlist, manualOrder]);

  const visibleProspects = useMemo(() => analysis.prospectRows.filter((p) => {
    if (viewMode === 'watchlist' && !p.isShortlist) return false;
    if (positionFilter !== 'ALL' && p.pos !== positionFilter) return false;
    const needle = search.trim().toLowerCase();
    if (needle && !`${p.name} ${p.pos} ${p.college ?? ''}`.toLowerCase().includes(needle)) return false;
    if (activeFilter === 'need') return p.currentTeamNeedLevel === 'urgent' || p.currentTeamNeedLevel === 'thin';
    if (activeFilter === 'starter_path') return p.roleProjection === 'starter_path';
    if (activeFilter === 'young_upside') return p.roleProjection === 'development_stash';
    if (activeFilter === 'safe_pick') return !p.riskFlags.some((f) => ['injury','raw','unknown_eval'].includes(f));
    if (activeFilter === 'high_risk') return p.riskFlags.length > 0;
    if (activeFilter === 'bargain') return p.pickValueFit === 'bargain';
    return true;
  }).sort((a, b) => {
    if (sortBy === 'best_fit') return b.sortKeys.fitScore - a.sortKeys.fitScore;
    if (sortBy === 'ovr') return (b.sortKeys.ovr ?? -1) - (a.sortKeys.ovr ?? -1);
    if (sortBy === 'potential') return (b.sortKeys.potential ?? -1) - (a.sortKeys.potential ?? -1);
    if (sortBy === 'projected_round') return (a.sortKeys.projectedRound ?? 99) - (b.sortKeys.projectedRound ?? 99);
    if (sortBy === 'scouting_confidence') return (b.sortKeys.scoutingConfidenceRank ?? -1) - (a.sortKeys.scoutingConfidenceRank ?? -1);
    if (sortBy === 'lowest_risk') return (a.sortKeys.riskCount ?? 99) - (b.sortKeys.riskCount ?? 99);
    return a.boardRank - b.boardRank;
  }), [analysis, positionFilter, activeFilter, viewMode, search, sortBy]);

  const moveProspect = (prospectId, dir) => {
    const ids = (manualOrder.length > 0 ? manualOrder : analysis.prospectRows.map((p) => p.prospectId)).filter(Boolean);
    const idx = ids.indexOf(prospectId);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= ids.length) return;
    const clone = [...ids];
    [clone[idx], clone[next]] = [clone[next], clone[idx]];
    setManualOrder(clone);
  };

  return <div className="card-premium" style={{ padding: 12 }}>
    <h3>Draft Board</h3>
    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{league?.phase?.toLowerCase?.()?.includes('draft') ? 'Draft phase active' : 'Planning board (not on the clock)'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
      <div className="stat-box" style={{ padding: 8 }}><div>Biggest need</div><strong>{analysis.summary.biggestNeed?.pos ?? 'Unknown'}</strong></div>
      <div className="stat-box" style={{ padding: 8 }}><div>Best fit</div><strong>{analysis.summary.bestProspectFit?.name ?? 'Unknown'}</strong></div>
      <div className="stat-box" style={{ padding: 8 }}><div>Safest pick</div><strong>{analysis.summary.safestPick?.name ?? 'Unknown'}</strong></div>
      <div className="stat-box" style={{ padding: 8 }}><div>Upside</div><strong>{analysis.summary.highestUpsidePick?.name ?? 'Unknown'}</strong></div>
      <div className="stat-box" style={{ padding: 8 }}><div>Next pick</div><strong>{analysis.summary.nextPick?.label ?? 'Unknown'}</strong></div>
    </div>
    <h4 style={{ marginTop: 10 }}>Team Needs Board</h4>
    {analysis.draftNeeds.slice(0,6).map((n)=><div key={n.pos} style={{fontSize:12, marginBottom:4}}>{n.pos} · {n.needLevel} · {n.targetRoundRange}</div>)}
    <h4 style={{ marginTop: 10 }}>Draft Snapshot</h4>
    <div style={{ fontSize: 12 }}>Class: {analysis.classIdentity.headline}</div>
    <div style={{ fontSize: 12 }}>Strengths: {analysis.classIdentity.strengths.join(', ') || 'Unknown'}</div>
    <div style={{ fontSize: 12 }}>Thin spots: {analysis.classIdentity.thinSpots.join(', ') || 'Unknown'}</div>
    <div style={{ fontSize: 12 }}>Likely early runs: {analysis.classIdentity.likelyEarlyRuns.join(', ') || 'Unknown'}</div>
    <h4 style={{ marginTop: 10 }}>Board Controls</h4>
    <div><button className="btn" onClick={() => setViewMode('board')}>Board</button><button className="btn" onClick={() => setViewMode('watchlist')}>Watchlist</button></div>
    <input aria-label="Search prospects" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / pos / college" style={{ width: '100%', marginTop: 6 }} />
    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{FILTERS.map((f)=><button key={f} className="btn" onClick={()=>setActiveFilter(f)}>{f}</button>)}{POS_FILTERS.map((p)=><button key={p} className="btn" onClick={()=>setPositionFilter(p)}>{p}</button>)}</div>
    <select aria-label="Sort prospects" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>{SORTS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
    <h4 style={{ marginTop: 10 }}>Prospect Board</h4>
    {visibleProspects.length===0 ? <div style={{fontSize:12}}>No prospects available for current filters.</div> : visibleProspects.map((p)=><div key={p.prospectId} className="stat-box" style={{marginBottom:6,padding:8}}><div style={{fontSize:12}}>{p.boardRank}. {p.name} · {p.pos} {p.college ? `· ${p.college}` : ''}</div><div style={{fontSize:11}}>OVR {p.ovr ?? 'N/A'} POT {p.potential ?? 'N/A'} · Round {p.projectedRound ?? 'Unknown'} · Fit {p.fitScore}</div><div style={{fontSize:11}}>{p.comparisonReceipt || p.reason}</div><div><button className="btn" onClick={()=>setWatchlist((prev)=>prev.includes(p.prospectId)?prev.filter((id)=>id!==p.prospectId):[...prev,p.prospectId])}>{p.isShortlist ? 'Unwatch' : 'Watch'}</button><button className="btn" onClick={()=>moveProspect(p.prospectId,-1)}>↑</button><button className="btn" onClick={()=>moveProspect(p.prospectId,1)}>↓</button><button className="btn" onClick={()=>onPlayerSelect?.(p.prospectId)}>Open profile</button></div></div>)}
    <h4 style={{ marginTop: 10 }}>Pick Assets</h4>
    {analysis.pickAssets.length===0 ? <div style={{fontSize:12}}>No user picks available.</div> : analysis.pickAssets.slice(0,6).map((pick)=><div key={pick.pickId} style={{fontSize:12}}>{pick.label} · value {pick.pickValue} · {pick.targetTier}</div>)}
  </div>;
}
