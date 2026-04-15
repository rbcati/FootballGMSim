import React, { useMemo, useState } from 'react';
import { buildTeamIntelligence, classifyNeedFitForProspect, scoreProspectForTeam } from '../utils/teamIntelligence.js';
import {
  classifyPickValue,
  estimateProspectPickWindow,
  getProspectWorkflowTags,
  summarizeDraftClassIdentity,
} from '../utils/draftPresentation.js';

const POS_FILTERS = ['ALL', 'QB', 'WR', 'RB', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];
const BOARD_VIEWS = ['Board', 'Watchlist'];

function getSafeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getBoardTier(index) {
  if (index < 8) return 'Tier 1';
  if (index < 24) return 'Tier 2';
  if (index < 48) return 'Tier 3';
  return 'Tier 4';
}

export default function DraftBigBoard({ league, onPlayerSelect, onNavigate }) {
  const season = league?.year ?? 2025;
  const prospects = Array.isArray(league?.draftClass) ? league?.draftClass : [];
  const [filter, setFilter] = useState('ALL');
  const [view, setView] = useState('Board');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' });
  const [selected, setSelected] = useState(null);
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`footballgm_bigboard_${season}`) ?? '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  const userTeam = league?.teams?.find((t) => t.id === league?.userTeamId);
  const teamIntel = useMemo(() => buildTeamIntelligence(userTeam, { week: league?.week ?? 1 }), [userTeam, league?.week]);
  const classIdentity = useMemo(() => summarizeDraftClassIdentity(prospects), [prospects]);

  const userPicks = useMemo(() => {
    const source = Array.isArray(league?.draftState?.picks) && league?.draftState?.picks.length
      ? league.draftState.picks
      : (userTeam?.draftPicks ?? []);
    return [...source]
      .filter((pick) => Number(pick?.teamId ?? league?.userTeamId) === Number(league?.userTeamId))
      .map((pick) => ({
        round: pick?.round ?? Math.ceil(getSafeNum(pick?.overall, 1) / 32),
        overall: getSafeNum(pick?.overall, (getSafeNum(pick?.round, 1) - 1) * 32 + getSafeNum(pick?.pick, 1)),
      }))
      .filter((pick) => pick.overall > 0)
      .sort((a, b) => a.overall - b.overall)
      .slice(0, 6);
  }, [league?.draftState?.picks, league?.userTeamId, userTeam?.draftPicks]);

  const rows = useMemo(() => {
    const rankMap = new Map(order.map((id, i) => [id, i]));
    const shortlist = new Set((league?.draftBoard?.shortlist ?? []).map((p) => p?.playerId ?? p?.id));

    let list = (Array.isArray(prospects) ? prospects : []).filter((p) => filter === 'ALL' || p?.pos === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => [p?.name, p?.pos, p?.college].some((v) => String(v ?? '').toLowerCase().includes(q)));
    }

    const enriched = list.map((p, idx) => {
      const score = scoreProspectForTeam(p, teamIntel);
      const needFit = classifyNeedFitForProspect(p?.pos, teamIntel);
      const boardRank = rankMap.has(p?.id) ? rankMap.get(p?.id) + 1 : idx + 1;
      const pickWindow = estimateProspectPickWindow(boardRank, prospects.length);
      const pickValue = classifyPickValue({ boardRank, currentPick: userPicks[0]?.overall ?? boardRank });
      const tags = getProspectWorkflowTags({
        prospect: p,
        boardRank,
        teamIntel,
        fitBucket: needFit.bucket,
        valueBucket: pickValue.bucket,
        upcomingUserPicks: userPicks,
      });

      return {
        ...p,
        _isShortlist: shortlist.has(p?.id),
        _boardRank: boardRank,
        _teamScore: score.score,
        _needFit: needFit,
        _profile: score.profile,
        _pickWindow: pickWindow,
        _pickValue: pickValue,
        _workflowTags: tags,
      };
    });

    const filteredByView = view === 'Watchlist' ? enriched.filter((p) => p._isShortlist) : enriched;

    filteredByView.sort((a, b) => {
      if (sort.key === 'rank') {
        return sort.dir === 'asc' ? a._boardRank - b._boardRank : b._boardRank - a._boardRank;
      }
      if (sort.key === 'fit') {
        return sort.dir === 'asc' ? a._teamScore - b._teamScore : b._teamScore - a._teamScore;
      }
      const av = a?.[sort.key] ?? 0;
      const bv = b?.[sort.key] ?? 0;
      return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av > bv ? -1 : 1);
    });

    return filteredByView.map((p, idx) => ({
      ...p,
      _tier: getBoardTier(idx),
      _valueDelta: p._boardRank - (idx + 1),
    }));
  }, [prospects, filter, sort, order, teamIntel, view, search, league?.draftBoard?.shortlist, userPicks]);

  const move = (id, delta) => {
    const arr = [...order.filter((x) => x !== id), id];
    const idx = arr.indexOf(id);
    const next = Math.max(0, Math.min(arr.length - 1, idx + delta));
    arr.splice(idx, 1);
    arr.splice(next, 0, id);
    setOrder(arr);
    localStorage.setItem(`footballgm_bigboard_${season}`, JSON.stringify(arr));
  };

  const likelyRuns = useMemo(() => {
    const topPos = rows.slice(0, 24).map((p) => p.pos).filter(Boolean);
    const counts = new Map();
    topPos.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [rows]);

  return <div className="card-premium" style={{ padding: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ marginBottom: 4 }}>Scouting Board Workspace</h3>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{classIdentity.headline}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => onNavigate?.('Team Hub')}>Team Hub</button>
        <button className="btn" onClick={() => onNavigate?.('Draft Room')}>Draft Room</button>
        <button className="btn" onClick={() => onNavigate?.('Draft')}>Live Draft</button>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, margin: '10px 0 12px' }}>
      <div className="stat-box" style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Class strengths</div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{classIdentity.strengths.join(' · ') || 'Still evaluating'}</div>
      </div>
      <div className="stat-box" style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Thin positions</div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{classIdentity.thinSpots.join(' · ') || 'None flagged'}</div>
      </div>
      <div className="stat-box" style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Likely early run</div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{likelyRuns.map(([pos, count]) => `${pos} (${count})`).join(' · ') || 'No clear run'}</div>
      </div>
      <div className="stat-box" style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Your next picks</div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{userPicks.map((pick) => `R${pick.round} #${pick.overall}`).join(' · ') || 'No picks loaded'}</div>
      </div>
    </div>

    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
      Needs now: {teamIntel.needsNow.map((n) => n.pos).join(', ') || 'None flagged'} · Later: {teamIntel.needsLater.map((n) => n.pos).join(', ') || 'None'}
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
      {BOARD_VIEWS.map((label) => (
        <button key={label} className={`standings-tab${view === label ? ' active' : ''}`} onClick={() => setView(label)}>{label}</button>
      ))}
      {POS_FILTERS.map((p) => <button key={p} className="btn" onClick={() => setFilter(p)}>{p}</button>)}
      <input className="settings-input" placeholder="Find prospect" value={search} onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 200 }} />
      <button className="btn" onClick={() => setSort({ key: 'fit', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>Sort Fit</button>
    </div>

    <table style={{ width: '100%' }}>
      <thead><tr><th onClick={() => setSort({ key: 'rank', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>Rank</th><th>Name</th><th>Pos</th><th>Age</th><th onClick={() => setSort({ key: 'ovr', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>OVR</th><th>Need/BPA</th><th>Range/Value</th><th /></tr></thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={p?.id} onClick={() => setSelected(p)}>
            <td>{i + 1}<div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{p._tier}</div></td>
            <td>
              <button className="btn-link" onClick={(e) => { e.stopPropagation(); onPlayerSelect?.(p?.id); }}>{p?.name}</button>
              <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{p?.college ?? '-'} · {p._workflowTags?.join(' · ') || 'Balanced profile'}</div>
            </td>
            <td>{p?.pos}</td>
            <td>{p?.age}</td>
            <td>{p?.ovr ?? p?.scoutedOvr ?? 60}<div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>Pot {p?.potential ?? '??'}</div></td>
            <td>{p?._needFit?.bucket}<div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{p?._needFit?.short}</div></td>
            <td>
              {p._pickWindow?.label}
              <div style={{ fontSize: 10, color: p._pickValue?.tone === 'risk' ? '#ef4444' : p._pickValue?.tone === 'win' ? '#22c55e' : 'var(--text-subtle)' }}>
                {p._pickValue?.bucket} · {p._pickValue?.detail}
              </div>
            </td>
            <td><button onClick={(e) => { e.stopPropagation(); move(p?.id, -1); }}>↑</button><button onClick={(e) => { e.stopPropagation(); move(p?.id, 1); }}>↓</button></td>
          </tr>
        ))}
      </tbody>
    </table>

    {rows.length === 0 && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-subtle)' }}>No prospects match this scouting filter. Clear position/search filters or switch back to Board.</div>}

    {selected && <div style={{ marginTop: 12, borderTop: '1px solid #374151', paddingTop: 8 }}>
      <strong>{selected?.name}</strong> · {selected?.pos} · Age {selected?.age}<br />
      {selected?.college} · {selected?.hometown ?? 'Unknown'}<br />
      Readiness: {selected?._profile?.readiness ?? 'Unknown'} · Upside: {selected?._profile?.upside ?? 'Unknown'}<br />
      Need fit: {selected?._needFit?.bucket} · {selected?._needFit?.short}<br />
      Draft window: {selected?._pickWindow?.label ?? 'TBD'} · {selected?._pickValue?.bucket}
    </div>}
  </div>;
}
