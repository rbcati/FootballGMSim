import React, { useMemo, useState } from 'react';
import { buildTeamIntelligence, classifyNeedFitForProspect, scoreProspectForTeam } from '../utils/teamIntelligence.js';

const POS_FILTERS = ['ALL', 'QB', 'WR', 'RB', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

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

export default function DraftBigBoard({ league }) {
  const season = league?.year ?? 2025;
  const prospects = Array.isArray(league?.draftClass) ? league?.draftClass : [];
  const [filter, setFilter] = useState('ALL');
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

  const rows = useMemo(() => {
    const list = (Array.isArray(prospects) ? prospects : []).filter((p) => filter === 'ALL' || p?.pos === filter);
    const rankMap = new Map(order.map((id, i) => [id, i]));

    const enriched = list.map((p) => {
      const score = scoreProspectForTeam(p, teamIntel);
      const needFit = classifyNeedFitForProspect(p?.pos, teamIntel);
      return {
        ...p,
        _boardRank: rankMap.has(p?.id) ? rankMap.get(p?.id) + 1 : 999,
        _teamScore: score.score,
        _needFit: needFit,
        _profile: score.profile,
      };
    });

    const bpa = [...enriched].sort((a, b) => getSafeNum(b?.ovr) - getSafeNum(a?.ovr))[0]?.id;
    const bestNeed = [...enriched].sort((a, b) => (b._needFit.bucket === 'Immediate need') - (a._needFit.bucket === 'Immediate need') || getSafeNum(b?.ovr) - getSafeNum(a?.ovr))[0]?.id;
    const bestUpside = [...enriched].sort((a, b) => (getSafeNum(b?.potential) - getSafeNum(b?.ovr)) - (getSafeNum(a?.potential) - getSafeNum(a?.ovr)))[0]?.id;
    const safest = [...enriched].sort((a, b) => (getSafeNum(b?.ovr) - getSafeNum(b?.age) * 0.5) - (getSafeNum(a?.ovr) - getSafeNum(a?.age) * 0.5))[0]?.id;

    enriched.forEach((p) => {
      const tags = [];
      if (p.id === bpa) tags.push('Best player available');
      if (p.id === bestNeed) tags.push('Best need fit');
      if (p.id === bestUpside) tags.push('Best upside swing');
      if (p.id === safest) tags.push('Safest pick');
      p._boardTags = tags;
    });

    enriched.sort((a, b) => {
      if (sort.key === 'rank') {
        return sort.dir === 'asc' ? a._boardRank - b._boardRank : b._boardRank - a._boardRank;
      }
      if (sort.key === 'fit') {
        return sort.dir === 'asc' ? a._teamScore - b._teamScore : b._teamScore - a._teamScore;
      }
      const av = a?.[sort.key] ?? a?.combineResults?.fortyTime ?? 0;
      const bv = b?.[sort.key] ?? b?.combineResults?.fortyTime ?? 0;
      return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av > bv ? -1 : 1);
    });

    return enriched.map((p, idx) => {
      const boardValueDelta = p._boardRank === 999 ? 0 : p._boardRank - (idx + 1);
      return {
        ...p,
        _tier: getBoardTier(idx),
        _valueDelta: boardValueDelta,
      };
    });
  }, [prospects, filter, sort, order, teamIntel]);

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
    <h3>Draft Big Board</h3>
    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
      Needs now: {teamIntel.needsNow.map((n) => n.pos).join(', ') || 'None flagged'} · Later: {teamIntel.needsLater.map((n) => n.pos).join(', ') || 'None'}
    </div>
    <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 10 }}>
      Board runs likely: {likelyRuns.map(([pos, count]) => `${pos} (${count})`).join(' · ') || 'No clear run'}
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      {POS_FILTERS.map((p) => <button key={p} onClick={() => setFilter(p)}>{p}</button>)}
      <button onClick={() => setSort({ key: 'fit', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>Sort Fit</button>
    </div>

    <table style={{ width: '100%' }}>
      <thead><tr><th onClick={() => setSort({ key: 'rank', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>Rank</th><th>Name</th><th>Pos</th><th>Age</th><th onClick={() => setSort({ key: 'ovr', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>OVR</th><th>Need context</th><th>Board intel</th><th /></tr></thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={p?.id} onClick={() => setSelected(p)}>
            <td>{i + 1}<div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{p._tier}</div></td>
            <td>{p?.name}<div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{p?.college ?? '-'}</div></td>
            <td>{p?.pos}</td>
            <td>{p?.age}</td>
            <td>{p?.ovr ?? p?.scoutedOvr ?? 60}<div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>Pot {p?.potential ?? '??'}</div></td>
            <td>{p?._needFit?.bucket}<div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{p?._needFit?.short}</div></td>
            <td>
              {p._boardTags?.length ? p._boardTags[0] : 'Balanced profile'}
              <div style={{ fontSize: 10, color: p._valueDelta > 8 ? '#ef4444' : p._valueDelta < -8 ? '#22c55e' : 'var(--text-subtle)' }}>
                {p._valueDelta > 8 ? 'Reach risk' : p._valueDelta < -8 ? 'Value pocket' : 'Near market value'}
              </div>
            </td>
            <td><button onClick={(e) => { e.stopPropagation(); move(p?.id, -1); }}>↑</button><button onClick={(e) => { e.stopPropagation(); move(p?.id, 1); }}>↓</button></td>
          </tr>
        ))}
      </tbody>
    </table>

    {selected && <div style={{ marginTop: 12, borderTop: '1px solid #374151', paddingTop: 8 }}>
      <strong>{selected?.name}</strong> · {selected?.pos} · Age {selected?.age}<br />
      {selected?.college} · {selected?.hometown ?? 'Unknown'}<br />
      Readiness: {selected?._profile?.readiness ?? 'Unknown'} · Upside: {selected?._profile?.upside ?? 'Unknown'}<br />
      Need fit: {selected?._needFit?.bucket} · {selected?._needFit?.short}<br />
      Board angle: {selected?._boardTags?.join(' · ') || 'No singular board flag'}
    </div>}
  </div>;
}
