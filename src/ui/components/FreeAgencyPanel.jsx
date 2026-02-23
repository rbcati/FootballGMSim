/**
 * FreeAgencyPanel.jsx
 *
 * ZenGM-style free agency data-grid.
 *
 * Features:
 *  - Full FA pool loaded from worker (players with teamId: null)
 *  - Position filter pills + OVR range slider + name search
 *  - Multi-column sort (OVR, Age, Salary, Position)
 *  - Cap room banner with danger / warning states
 *  - Inline "Sign" → contract offer form (Annual $, Years) → confirm
 *  - Salary cap validation before submitting
 *
 * Data flow:
 *  Mount → actions.getFreeAgents() → FREE_AGENT_DATA
 *  Sign  → actions.signPlayer(playerId, teamId, contract) → STATE_UPDATE
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITIONS = ['ALL', 'QB', 'WR', 'RB', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'];

const POS_MULTIPLIERS = { QB: 2.2, WR: 1.15, RB: 0.7, TE: 1.0, OL: 1.0,
                          DL: 1.0, LB: 0.9, CB: 1.0, S: 0.85 };

// ── Salary helper (mirrors freeagency.js logic, no window dependency) ─────────

function suggestedSalary(ovr, pos, age) {
  const BASE_CAP   = 255;
  const posMult    = POS_MULTIPLIERS[pos] ?? 1.0;

  let basePct;
  if (ovr >= 95)      basePct = 0.18;
  else if (ovr >= 90) basePct = 0.14;
  else if (ovr >= 85) basePct = 0.10;
  else if (ovr >= 80) basePct = 0.07;
  else if (ovr >= 75) basePct = 0.05;
  else if (ovr >= 70) basePct = 0.03;
  else                basePct = 0.015;

  const ageFactor = age <= 26 ? 1.1
                  : age <= 30 ? 1.0
                  : age <= 33 ? 0.85
                  :             0.65;

  return Math.round(BASE_CAP * basePct * posMult * ageFactor * 10) / 10;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ovrColor(ovr) {
  if (ovr >= 85) return '#34C759';
  if (ovr >= 75) return '#0A84FF';
  if (ovr >= 65) return '#FF9F0A';
  return '#FF453A';
}

function sortFA(players, sortKey, sortDir) {
  return [...players].sort((a, b) => {
    let va, vb;
    switch (sortKey) {
      case 'ovr':    va = a.ovr ?? 0;    vb = b.ovr ?? 0;    break;
      case 'age':    va = a.age ?? 0;    vb = b.age ?? 0;    break;
      case 'salary': va = a._ask ?? 0;   vb = b._ask ?? 0;   break;
      case 'pos':    va = a.pos ?? '';   vb = b.pos ?? '';   break;
      case 'name':   va = a.name ?? '';  vb = b.name ?? '';  break;
      default:       va = 0; vb = 0;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1  : -1;
    return 0;
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SortTh({ label, sortKey, current, dir, onSort, right = false }) {
  const active = current === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        textAlign: right ? 'right' : 'left',
        paddingRight: right ? 'var(--space-4)' : undefined,
        cursor: 'pointer', userSelect: 'none',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontWeight: active ? 700 : 600,
        fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px',
      }}
    >
      {label}{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

/** Inline sign form shown in the table row when "Sign" is clicked */
function SignForm({ player, capRoom, onSubmit, onCancel }) {
  const defaultSalary = suggestedSalary(player.ovr, player.pos, player.age);
  const [annual, setAnnual] = useState(defaultSalary);
  const [years,  setYears]  = useState(2);
  const [err,    setErr]    = useState('');

  const handleSubmit = () => {
    const sal = parseFloat(annual);
    if (isNaN(sal) || sal <= 0) { setErr('Invalid salary'); return; }
    if (sal > capRoom + 0.1) { setErr(`Not enough cap room (room: $${capRoom.toFixed(1)}M)`); return; }
    if (years < 1 || years > 7) { setErr('Years must be 1–7'); return; }
    onSubmit({ baseAnnual: sal, yearsTotal: years, signingBonus: 0 });
  };

  return (
    <td colSpan={7} style={{ padding: 'var(--space-3) var(--space-5)', background: 'var(--surface-strong)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text)' }}>
          Sign {player.name}
        </span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
          <span style={{ color: 'var(--text-muted)' }}>$/yr</span>
          <input
            type="number"
            min={0.5} max={60} step={0.5}
            value={annual}
            onChange={e => setAnnual(e.target.value)}
            style={{
              width: 70, background: 'var(--surface)', border: '1px solid var(--hairline)',
              color: 'var(--text)', borderRadius: 'var(--radius-sm)',
              padding: '3px 6px', fontSize: 'var(--text-sm)',
            }}
          />
          <span style={{ color: 'var(--text-muted)' }}>M</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Yrs</span>
          <select
            value={years}
            onChange={e => setYears(Number(e.target.value))}
            style={{
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              color: 'var(--text)', borderRadius: 'var(--radius-sm)',
              padding: '3px 6px', fontSize: 'var(--text-sm)',
            }}
          >
            {[1,2,3,4,5,6,7].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>

        {err && <span style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{err}</span>}

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'auto' }}>
          <button className="btn btn-primary" style={{ fontSize: 'var(--text-xs)', padding: '3px 12px' }} onClick={handleSubmit}>
            Confirm
          </button>
          <button className="btn" style={{ fontSize: 'var(--text-xs)', padding: '3px 10px' }} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </td>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FreeAgencyPanel({ league, actions }) {
  const teamId  = league?.userTeamId;
  const userTeam = useMemo(() => league?.teams?.find(t => t.id === teamId), [league?.teams, teamId]);
  const capRoom  = userTeam?.capRoom ?? 0;
  const capTotal = userTeam?.capTotal ?? 255;

  const [loading,    setLoading]    = useState(false);
  const [faPool,     setFaPool]     = useState([]);
  const [posFilter,  setPosFilter]  = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [ovrMin,     setOvrMin]     = useState(60);
  const [sortKey,    setSortKey]    = useState('ovr');
  const [sortDir,    setSortDir]    = useState('desc');
  const [signing,    setSigning]    = useState(null);   // playerId being signed
  const [signedIds,  setSignedIds]  = useState(new Set());
  const [msgId,      setMsgId]      = useState(null);

  const fetchFA = useCallback(async () => {
    if (!actions?.getFreeAgents) return;
    setLoading(true);
    try {
      const resp = await actions.getFreeAgents();
      if (resp?.payload?.freeAgents) {
        // Attach suggested asking salary for display + sorting
        const enriched = resp.payload.freeAgents.map(p => ({
          ...p,
          _ask: p.contract?.baseAnnual ?? suggestedSalary(p.ovr, p.pos, p.age),
        }));
        setFaPool(enriched);
      }
    } catch (e) {
      console.error('getFreeAgents failed:', e);
    } finally {
      setLoading(false);
    }
  }, [actions]);

  useEffect(() => { fetchFA(); }, [fetchFA]);

  // Re-fetch when the league state updates (a signing was processed)
  useEffect(() => {
    if (league?.teams) fetchFA();
  }, [league?.teams?.find?.(t => t.id === teamId)?.capUsed]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Filter + sort
  const displayed = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = faPool.filter(p => {
      if (signedIds.has(p.id)) return false;
      if (posFilter !== 'ALL' && p.pos !== posFilter) return false;
      if (p.ovr < ovrMin) return false;
      if (q && !p.name?.toLowerCase().includes(q)) return false;
      return true;
    });
    return sortFA(filtered, sortKey, sortDir);
  }, [faPool, posFilter, search, ovrMin, sortKey, sortDir, signedIds]);

  const handleSign = async (player, contract) => {
    setSigning(null);
    // Optimistic update
    setSignedIds(prev => new Set([...prev, player.id]));
    actions.signPlayer(player.id, teamId, contract);
    setMsgId(player.id);
    setTimeout(() => setMsgId(null), 2500);
  };

  return (
    <div>
      {/* Cap room banner */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 2 }}>
              Your Cap Room · {userTeam?.name ?? 'Team'}
            </div>
            <div style={{
              fontSize: 'var(--text-2xl)', fontWeight: 800,
              color: capRoom < 5 ? 'var(--danger)' : capRoom < 15 ? 'var(--warning)' : 'var(--success)',
            }}>
              ${capRoom.toFixed(1)}M
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Used / Total
            </div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text)' }}>
              ${userTeam?.capUsed?.toFixed(1) ?? '—'}M / ${capTotal}M
            </div>
          </div>
        </div>

        {/* Thin cap bar */}
        <div style={{ marginTop: 'var(--space-3)', height: 5, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, ((userTeam?.capUsed ?? 0) / capTotal) * 100)}%`,
            background: capRoom < 5 ? 'var(--danger)' : capRoom < 15 ? 'var(--warning)' : 'var(--success)',
            transition: 'width .3s',
          }} />
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--surface)', border: '1px solid var(--hairline)',
            color: 'var(--text)', borderRadius: 'var(--radius-md)',
            padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sm)',
            width: 160,
          }}
        />

        {/* OVR min */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          OVR ≥
          <select
            value={ovrMin}
            onChange={e => setOvrMin(Number(e.target.value))}
            style={{
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              color: 'var(--text)', borderRadius: 'var(--radius-sm)',
              padding: '3px 6px', fontSize: 'var(--text-sm)',
            }}
          >
            {[60, 65, 70, 75, 80, 85, 90].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      </div>

      {/* Position pills */}
      <div className="standings-tabs" style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {POSITIONS.map(pos => (
          <button
            key={pos}
            className={`standings-tab${posFilter === pos ? ' active' : ''}`}
            onClick={() => setPosFilter(pos)}
            style={{ minWidth: 36, padding: '4px 10px' }}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Success flash */}
      {msgId && (
        <div style={{
          background: 'var(--success)', color: '#fff',
          borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-4)',
          marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', fontWeight: 600,
          animation: 'fadeSlideIn 0.2s ease',
        }}>
          Player signed successfully.
          <style>{`@keyframes fadeSlideIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }`}</style>
        </div>
      )}

      {/* FA pool table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading free agents…
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="standings-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 'var(--space-5)', width: 36 }}>#</th>
                  <SortTh label="POS"  sortKey="pos"    current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Name" sortKey="name"   current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="OVR"  sortKey="ovr"    current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <SortTh label="Age"  sortKey="age"    current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <SortTh label="Ask"  sortKey="salary" current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <th style={{ textAlign: 'center', paddingRight: 'var(--space-3)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                      {loading ? 'Loading…' : 'No free agents match your filters.'}
                    </td>
                  </tr>
                )}
                {displayed.map((player, idx) => {
                  const isSigningThis = signing === player.id;
                  const canAfford     = (player._ask ?? 0) <= capRoom + 0.01;

                  if (isSigningThis) {
                    return (
                      <tr key={player.id} style={{ background: 'var(--surface-strong)' }}>
                        <td style={{ paddingLeft: 'var(--space-5)', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                          {idx + 1}
                        </td>
                        <SignForm
                          player={player}
                          capRoom={capRoom}
                          onSubmit={contract => handleSign(player, contract)}
                          onCancel={() => setSigning(null)}
                        />
                      </tr>
                    );
                  }

                  return (
                    <tr key={player.id}>
                      <td style={{ paddingLeft: 'var(--space-5)', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                        {idx + 1}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', minWidth: 28,
                          padding: '1px 5px', borderRadius: 'var(--radius-pill)',
                          background: 'var(--surface-strong)',
                          fontSize: 'var(--text-xs)', fontWeight: 700,
                          color: 'var(--text-muted)', textAlign: 'center',
                        }}>
                          {player.pos}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text)', fontSize: 'var(--text-sm)' }}>
                        {player.name}
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)' }}>
                        <span style={{
                          display: 'inline-block', width: 32, padding: '2px 0',
                          borderRadius: 'var(--radius-pill)',
                          background: ovrColor(player.ovr) + '22',
                          color: ovrColor(player.ovr),
                          fontWeight: 800, fontSize: 'var(--text-xs)', textAlign: 'center',
                        }}>
                          {player.ovr}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                        {player.age}
                      </td>
                      <td style={{
                        textAlign: 'right', paddingRight: 'var(--space-4)',
                        fontSize: 'var(--text-sm)',
                        color: canAfford ? 'var(--text)' : 'var(--danger)',
                        fontWeight: canAfford ? 500 : 700,
                      }}>
                        ${(player._ask ?? 0).toFixed(1)}M
                      </td>
                      <td style={{ textAlign: 'center', paddingRight: 'var(--space-3)' }}>
                        {capRoom < 2 ? (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', fontWeight: 700 }}>CAP FULL</span>
                        ) : (
                          <button
                            className={`btn ${canAfford ? 'btn-primary' : ''}`}
                            style={{ fontSize: 'var(--text-xs)', padding: '2px 12px' }}
                            onClick={() => setSigning(player.id)}
                          >
                            Sign
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', textAlign: 'right' }}>
        {displayed.length} free agents shown · {faPool.length} total in pool
      </div>
    </div>
  );
}
