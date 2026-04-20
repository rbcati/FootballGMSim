import React, { useMemo, useState } from 'react';
import { SALARY_CAP_AMOUNT } from '../../core/constants.js';

const safeContract = (player) => player?.contract ?? {
  salary: 2,
  years: 1,
  guaranteed: 0,
  isFranchiseTagged: false,
};

const calcCapSpace = (roster) =>
  SALARY_CAP_AMOUNT - (Array.isArray(roster) ? roster : []).reduce((sum, p) => sum + (safeContract(p)?.salary ?? 2), 0);

function marketRate(pos, ovr) {
  const byOvr = (elite, star, depth) => {
    if ((ovr ?? 0) >= 90) return elite;
    if ((ovr ?? 0) >= 80) return star;
    return depth;
  };
  if (pos === 'QB') return byOvr(40, 27, 6);
  if (pos === 'WR' || pos === 'CB') return byOvr(24, 16, 7);
  if (pos === 'RB') return byOvr(14, 9, 4);
  if (pos === 'OL' || pos === 'DL') return byOvr(21, 13, 6);
  if (pos === 'LB' || pos === 'TE') return byOvr(17, 10, 5);
  if (pos === 'K' || pos === 'P') return 2;
  return byOvr(16, 10, 5);
}

export default function CapManager({ league, actions }) {
  const userTeam = (Array.isArray(league?.teams) ? league?.teams : []).find((t) => t?.id === league?.userTeamId) ?? null;
  const roster = Array.isArray(userTeam?.roster) ? userTeam?.roster : [];
  const deadCap = userTeam?.deadCap ?? 0;
  const used = useMemo(() => roster.reduce((sum, p) => sum + (safeContract(p)?.salary ?? 2), 0), [roster]);
  const capSpace = calcCapSpace(roster) - deadCap;
  const [ext, setExt] = useState(null);
  const [offer, setOffer] = useState({ years: 3, salary: 8, guaranteedPct: 50 });

  const usageColor = used < 150 ? '#34C759' : used <= 185 ? '#FF9F0A' : '#FF453A';

  return (
    <div className="card-premium" style={{ padding: 16 }}>
      <h3>Cap Space: ${capSpace.toFixed(1)}M remaining of $200M</h3>
      <div style={{ height: 10, background: '#1f2937', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${Math.min(100, (used / SALARY_CAP_AMOUNT) * 100)}%`, height: '100%', background: usageColor }} />
      </div>
      <div style={{ marginBottom: 16 }}>Dead Cap: ${Number(deadCap).toFixed(1)}M</div>

      <table style={{ width: '100%', fontSize: 13 }}>
        <thead><tr><th>Name</th><th>Pos</th><th>OVR</th><th>Age</th><th>Salary ($M)</th><th>Yrs</th><th>Actions</th></tr></thead>
        <tbody>
          {roster.map((p) => {
            const contract = safeContract(p);
            return (
              <tr key={p?.id}>
                <td>{p?.name}</td><td>{p?.pos}</td><td>{p?.ovr ?? 0}</td><td>{p?.age ?? 0}</td>
                <td>{(contract?.salary ?? 2).toFixed(1)}</td><td>{contract?.years ?? 1}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => actions?.restructureContract?.(p?.id, userTeam?.id)}>Restructure</button>
                  <button onClick={() => actions?.releasePlayer?.(p?.id, userTeam?.id)}>Release</button>
                  <button onClick={() => { setExt(p); setOffer({ years: 3, salary: Number((contract?.salary ?? 2).toFixed(1)), guaranteedPct: 50 }); }}>Extend</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {ext && (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid #374151', borderRadius: 8 }}>
          <strong>Contract Offer: {ext?.name}</strong>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input type="range" min="1" max="5" value={offer.years} onChange={(e) => setOffer((o) => ({ ...o, years: Number(e.target.value) }))} />
            <input type="range" min="1" max="45" value={offer.salary} onChange={(e) => setOffer((o) => ({ ...o, salary: Number(e.target.value) }))} />
            <input type="range" min="0" max="100" value={offer.guaranteedPct} onChange={(e) => setOffer((o) => ({ ...o, guaranteedPct: Number(e.target.value) }))} />
          </div>
          <div>New cap hit: ${offer.salary.toFixed(1)}M/yr</div>
          <button
            disabled={offer.salary > capSpace || offer.salary < (marketRate(ext?.pos, ext?.ovr) * 0.9)}
            onClick={() => {
              actions?.extendContract?.(ext?.id, userTeam?.id, {
                years: offer.years,
                baseAnnual: offer.salary,
                salary: offer.salary,
                guaranteedPct: offer.guaranteedPct / 100,
                guaranteed: Number((offer.salary * offer.years * (offer.guaranteedPct / 100)).toFixed(1)),
              });
              setExt(null);
            }}
          >
            Sign
          </button>
          <button onClick={() => setExt(null)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
