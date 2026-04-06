import React, { useMemo, useState } from 'react';
import { buildTeamIntelligence } from '../utils/teamIntelligence.js';

const POS_FILTERS = ['ALL', 'QB', 'WR', 'RB', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

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
    list.sort((a, b) => {
      if (sort.key === 'rank') {
        const av = rankMap.has(a?.id) ? rankMap.get(a?.id) : 9999;
        const bv = rankMap.has(b?.id) ? rankMap.get(b?.id) : 9999;
        return sort.dir === 'asc' ? av - bv : bv - av;
      }
      const av = a?.[sort.key] ?? a?.combineResults?.fortyTime ?? 0;
      const bv = b?.[sort.key] ?? b?.combineResults?.fortyTime ?? 0;
      return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av > bv ? -1 : 1);
    });
    return list.map((p, idx) => {
      const isNeedFit = teamIntel.needsNow.some((n) => n.pos === p?.pos);
      const upside = (Number(p?.potential ?? p?.pot ?? p?.ovr ?? 60) - Number(p?.ovr ?? 60)) >= 8 || Number(p?.age ?? 30) <= 21;
      const tag = idx < 8 ? 'BPA' : isNeedFit ? 'Need fit' : upside ? 'Upside' : null;
      return { ...p, _draftTag: tag };
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

  return <div className="card-premium" style={{ padding: 16 }}>
    <h3>Draft Big Board</h3>
    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
      Needs now: {teamIntel.needsNow.map((n) => n.pos).join(", ") || "None flagged"} · Later: {teamIntel.needsLater.map((n) => n.pos).join(", ") || "None"}
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      {POS_FILTERS.map((p) => <button key={p} onClick={() => setFilter(p)}>{p}</button>)}
    </div>
    <table style={{ width: '100%' }}>
      <thead><tr><th onClick={() => setSort({ key: 'rank', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>Rank</th><th>Name</th><th>Pos</th><th>Age</th><th onClick={() => setSort({ key: 'scoutedOvr', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>Scout OVR</th><th onClick={() => setSort({ key: 'fortyTime', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>40 Time</th><th>College</th><th /></tr></thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={p?.id} onClick={() => setSelected(p)}>
            <td>{i + 1}</td><td>{p?.name}</td><td>{p?.pos}</td><td>{p?.age}</td><td>~{p?.scoutedOvr ?? 60}</td><td>{p?.combineResults?.fortyTime ?? '-'}</td><td>{p?.college ?? '-'} {p?._draftTag ? `· ${p._draftTag}` : ""}</td>
            <td><button onClick={(e) => { e.stopPropagation(); move(p?.id, -1); }}>↑</button><button onClick={(e) => { e.stopPropagation(); move(p?.id, 1); }}>↓</button></td>
          </tr>
        ))}
      </tbody>
    </table>
    {selected && <div style={{ marginTop: 12, borderTop: '1px solid #374151', paddingTop: 8 }}>
      <strong>{selected?.name}</strong> · {selected?.pos} · Age {selected?.age}<br />
      {selected?.college} · {selected?.hometown ?? 'Unknown'}<br />
      40: {selected?.combineResults?.fortyTime ?? '-'} | Bench: {selected?.combineResults?.bench ?? '-'} | Vertical: {selected?.combineResults?.vertical ?? '-'}<br />
      Scouted OVR: ~{selected?.scoutedOvr ?? 60} · Dev Trait: {(league?.season ?? 1) >= 3 ? (selected?.devTrait ?? 'Normal') : '???'}
    </div>}
  </div>;
}
