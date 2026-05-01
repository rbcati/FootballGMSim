import React, { useMemo, useState } from 'react';
import { buildDraftBoardAnalysis } from '../../core/draft/draftBoardAnalysis.js';

const POS_FILTERS = ['ALL', 'QB', 'WR', 'RB', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
const FILTERS = ['all', 'need', 'starter_path', 'young_upside', 'safe_pick', 'high_risk', 'bargain'];

export default function DraftBigBoard({ league, onPlayerSelect }) {
  const prospects = Array.isArray(league?.draftClass) ? league?.draftClass : [];
  const userTeam = league?.teams?.find((t) => t.id === league?.userTeamId) ?? null;
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [activeFilter, setActiveFilter] = useState('all');

  const analysis = useMemo(() => buildDraftBoardAnalysis({
    team: userTeam,
    roster: userTeam?.roster ?? [],
    prospects,
    draftPicks: league?.draftState?.picks ?? userTeam?.draftPicks ?? [],
    teamBuilder: league?.teamBuilderAnalysis ?? null,
    phase: league?.phase,
  }), [userTeam, prospects, league?.draftState?.picks, league?.teamBuilderAnalysis, league?.phase]);

  const visibleProspects = useMemo(() => analysis.prospectRows.filter((p) => {
    if (positionFilter !== 'ALL' && p.pos !== positionFilter) return false;
    if (activeFilter === 'need') return p.currentTeamNeedLevel === 'urgent' || p.currentTeamNeedLevel === 'thin';
    if (activeFilter === 'starter_path') return p.roleProjection === 'starter_path';
    if (activeFilter === 'young_upside') return p.roleProjection === 'development_stash';
    if (activeFilter === 'safe_pick') return !p.riskFlags.some((f) => ['injury','raw','unknown_eval'].includes(f));
    if (activeFilter === 'high_risk') return p.riskFlags.length > 0;
    if (activeFilter === 'bargain') return p.pickValueFit === 'bargain';
    return true;
  }).slice(0, 10), [analysis, positionFilter, activeFilter]);

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
    <h4 style={{ marginTop: 10 }}>Filters</h4>
    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{FILTERS.map((f)=><button key={f} className="btn" onClick={()=>setActiveFilter(f)}>{f}</button>)}{POS_FILTERS.map((p)=><button key={p} className="btn" onClick={()=>setPositionFilter(p)}>{p}</button>)}</div>
    <h4 style={{ marginTop: 10 }}>Prospect Fits</h4>
    {visibleProspects.length===0 ? <div style={{fontSize:12}}>No prospects available for current filters.</div> : visibleProspects.map((p)=><button key={p.prospectId} className="btn" style={{display:'block', width:'100%', textAlign:'left', marginBottom:6}} onClick={()=>onPlayerSelect?.(p.prospectId)}>{p.name} · {p.pos} · Fit {p.fitScore} · {p.recommendation} · {p.pickValueFit} · Scout {p.scoutingConfidence}</button>)}
    <h4 style={{ marginTop: 10 }}>Pick Assets</h4>
    {analysis.pickAssets.length===0 ? <div style={{fontSize:12}}>No user picks available.</div> : analysis.pickAssets.slice(0,6).map((pick)=><div key={pick.pickId} style={{fontSize:12}}>{pick.label} · value {pick.pickValue} · {pick.targetTier}</div>)}
  </div>;
}
