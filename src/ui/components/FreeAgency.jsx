/**
 * FreeAgency.jsx
 *
 * Rebuilt ZenGM-style free agency browser.  Matches Roster.jsx aesthetics 1:1:
 *  - Identical OvrBadge / PosBadge / SortTh / PipBar sub-component family
 *  - Cap room banner with colour-coded progress bar (green → amber → red)
 *  - Position filter pills: ALL QB WR RB TE OL DL LB CB S
 *  - Name search + OVR ≥ threshold selector
 *  - Sortable columns: POS / Name / OVR / Age / Ask $/yr / Yrs
 *  - Inline sign form: player row highlights while open, sign form expands
 *    below (two-row pattern identical to Roster.jsx release confirmation)
 *  - Optimistic removal of signed player from FA pool
 *  - Success flash banner
 *
 * Data flow:
 *  Mount → actions.getFreeAgents() [silent] → FREE_AGENT_DATA { freeAgents[] }
 *  Sign  → actions.signPlayer(playerId, userTeamId, contract) → STATE_UPDATE
 *
 * Contract demand:
 *  Defaults computed by suggestedSalary(ovr, pos, age) — same market-rate
 *  formula used by the worker's FA wave.  User may edit both fields before
 *  confirming; cap validation fires on confirm.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITIONS = ['ALL', 'QB', 'WR', 'RB', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'];

const POS_MULTIPLIERS = {
  QB: 2.2, WR: 1.15, RB: 0.7, TE: 1.0, OL: 1.0,
  DL: 1.0, LB: 0.9,  CB: 1.0, S: 0.85,
};

// ── Salary helpers ────────────────────────────────────────────────────────────

/**
 * Market-rate contract demand.
 * OVR/position/age tiers mirror the worker's FA wave logic so suggested
 * values feel coherent with the rest of the simulation.
 *
 * Quick-mock formula (as requested): baseAnnual ≈ OVR × 0.1 for mid-tier
 * players (ovr 70, no position premium).  The full formula below is more
 * realistic but stays well within that spirit.
 */
function suggestedSalary(ovr, pos, age) {
  const BASE_CAP = 255;
  const posMult  = POS_MULTIPLIERS[pos] ?? 1.0;

  let basePct;
  if      (ovr >= 95) basePct = 0.18;
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

/** Age-appropriate default contract length. */
function suggestedYears(age) {
  return age <= 26 ? 3 : age <= 30 ? 2 : 1;
}

// ── Visual helpers ────────────────────────────────────────────────────────────

function ovrColor(ovr) {
  if (ovr >= 90) return '#34C759';
  if (ovr >= 80) return '#30D158';
  if (ovr >= 70) return '#0A84FF';
  if (ovr >= 60) return '#FF9F0A';
  return '#FF453A';
}

function fmtSalary(annual) {
  if (annual == null) return '—';
  return `$${annual.toFixed(1)}M`;
}

function sortFA(players, sortKey, sortDir) {
  return [...players].sort((a, b) => {
    let va, vb;
    switch (sortKey) {
      case 'ovr':    va = a.ovr  ?? 0;  vb = b.ovr  ?? 0;  break;
      case 'age':    va = a.age  ?? 0;  vb = b.age  ?? 0;  break;
      case 'salary': va = a._ask ?? 0;  vb = b._ask ?? 0;  break;
      case 'pos':    va = a.pos  ?? ''; vb = b.pos  ?? ''; break;
      case 'name':   va = a.name ?? ''; vb = b.name ?? ''; break;
      default:       va = 0;            vb = 0;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });
}

// ── Shared sub-components (identical signature & appearance to Roster.jsx) ────

function OvrBadge({ ovr }) {
  const col = ovrColor(ovr);
  return (
    <span style={{
      display: 'inline-block', minWidth: 32, padding: '2px 4px',
      borderRadius: 'var(--radius-pill)',
      background: col + '22', color: col,
      fontWeight: 800, fontSize: 'var(--text-xs)', textAlign: 'center',
    }}>
      {ovr}
    </span>
  );
}

function PosBadge({ pos }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: 32, padding: '1px 6px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-strong)',
      fontSize: 'var(--text-xs)', fontWeight: 700,
      color: 'var(--text-muted)', textAlign: 'center',
    }}>
      {pos}
    </span>
  );
}

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
        whiteSpace: 'nowrap',
      }}
    >
      {label}{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

/** 5-pip mini bar — identical to Roster.jsx. */
function PipBar({ value, color }) {
  const filled = Math.round((value / 100) * 5);
  return (
    <span style={{ display: 'inline-flex', gap: 2, verticalAlign: 'middle' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: 1,
          background: i < filled ? color : 'var(--hairline)',
          display: 'inline-block',
        }} />
      ))}
    </span>
  );
}

// ── Cap banner ────────────────────────────────────────────────────────────────

function CapBanner({ userTeam }) {
  const capRoom  = userTeam?.capRoom  ?? 0;
  const capUsed  = userTeam?.capUsed  ?? 0;
  const capTotal = userTeam?.capTotal ?? 255;
  const pct      = capTotal > 0 ? Math.min(100, (capUsed / capTotal) * 100) : 0;
  const roomCol  = capRoom < 5 ? 'var(--danger)' : capRoom < 15 ? 'var(--warning)' : 'var(--success)';

  return (
    <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-3)',
      }}>
        <div>
          <div style={{
            fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px',
            color: 'var(--text-muted)', marginBottom: 2,
          }}>
            {userTeam?.name ?? 'Your Team'} · Cap Space Available
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: roomCol }}>
            {fmtSalary(capRoom)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>
            Used / Total
          </div>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text)' }}>
            {fmtSalary(capUsed)} / ${capTotal}M
          </div>
        </div>
      </div>
      {/* Cap usage bar */}
      <div style={{ height: 5, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: roomCol, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

// ── Inline sign form ──────────────────────────────────────────────────────────
// Renders as a full-width <td colSpan=7> in its own table row, appearing
// directly below the highlighted player row (two-row pattern from Roster.jsx).

function SignForm({ player, capRoom, onSubmit, onCancel }) {
  const defaultSalary = suggestedSalary(player.ovr, player.pos, player.age);
  const defaultYears  = suggestedYears(player.age);
  const [annual, setAnnual] = useState(defaultSalary);
  const [years,  setYears]  = useState(defaultYears);
  const [err,    setErr]    = useState('');

  const handleConfirm = () => {
    const sal = parseFloat(annual);
    if (isNaN(sal) || sal <= 0) { setErr('Invalid salary.');                           return; }
    if (sal > capRoom + 0.1)    { setErr(`Exceeds cap room (${fmtSalary(capRoom)}).`); return; }
    if (years < 1 || years > 7) { setErr('Years must be 1–7.');                        return; }
    onSubmit({ baseAnnual: sal, yearsTotal: years, signingBonus: 0 });
  };

  return (
    <td colSpan={7} style={{ padding: 'var(--space-3) var(--space-5)', background: 'var(--surface-strong)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>

        {/* Player demand label */}
        <div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text)' }}>
            Sign {player.name}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            Asking {fmtSalary(defaultSalary)} / {defaultYears}yr · Age {player.age}
          </div>
        </div>

        {/* Salary input */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
          <span style={{ color: 'var(--text-muted)' }}>$/yr</span>
          <input
            type="number" min={0.5} max={80} step={0.5}
            value={annual}
            onChange={e => { setAnnual(e.target.value); setErr(''); }}
            style={{
              width: 72, background: 'var(--surface)', border: '1px solid var(--hairline)',
              color: 'var(--text)', borderRadius: 'var(--radius-sm)',
              padding: '3px 6px', fontSize: 'var(--text-sm)',
            }}
          />
          <span style={{ color: 'var(--text-muted)' }}>M</span>
        </label>

        {/* Years select */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Yrs</span>
          <select
            value={years}
            onChange={e => { setYears(Number(e.target.value)); setErr(''); }}
            style={{
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              color: 'var(--text)', borderRadius: 'var(--radius-sm)',
              padding: '3px 6px', fontSize: 'var(--text-sm)',
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>

        {/* Validation error */}
        {err && (
          <span style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            {err}
          </span>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'auto' }}>
          <button
            className="btn btn-primary"
            style={{ fontSize: 'var(--text-xs)', padding: '3px 14px' }}
            onClick={handleConfirm}
          >
            Confirm
          </button>
          <button
            className="btn"
            style={{ fontSize: 'var(--text-xs)', padding: '3px 10px' }}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </td>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FreeAgency({ league, actions, onPlayerSelect }) {
  const teamId   = league?.userTeamId;
  const userTeam = useMemo(
    () => league?.teams?.find(t => t.id === teamId),
    [league?.teams, teamId],
  );
  const capRoom = userTeam?.capRoom ?? 0;

  const [loading,   setLoading]   = useState(false);
  const [faPool,    setFaPool]    = useState([]);
  const [posFilter, setPosFilter] = useState('ALL');
  const [search,    setSearch]    = useState('');
  const [ovrMin,    setOvrMin]    = useState(60);
  const [sortKey,   setSortKey]   = useState('ovr');
  const [sortDir,   setSortDir]   = useState('desc');
  const [signing,   setSigning]   = useState(null);      // playerId currently open
  const [signedIds, setSignedIds] = useState(new Set()); // optimistic removal
  const [flash,     setFlash]     = useState(null);      // success banner text

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchFA = useCallback(async () => {
    if (!actions?.getFreeAgents) return;
    setLoading(true);
    try {
      // Race fetch against a 5-second timeout to prevent stuck loading state
      const fetchPromise = actions.getFreeAgents();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Fetch timeout')), 5000)
      );

      const resp = await Promise.race([fetchPromise, timeoutPromise]);

      if (resp?.payload?.freeAgents) {
        const enriched = resp.payload.freeAgents.map(p => ({
          ...p,
          // _ask: prefer last contract value; fall back to market-rate formula
          _ask: p.contract?.baseAnnual ?? suggestedSalary(p.ovr, p.pos, p.age),
        }));
        setFaPool(enriched);
      }
    } catch (e) {
      console.error('[FreeAgency] getFreeAgents failed:', e);
    } finally {
      setLoading(false);
    }
  // actions is wrapped in useMemo inside useWorker so its reference is stable.
  }, [actions]);

  // Fetch on mount (and if the user's team changes, which is caught by actions
  // being stable and fetchFA not changing).
  useEffect(() => { fetchFA(); }, [fetchFA]);

  // Re-fetch when cap changes — means a sign/release resolved in the worker.
  // We track the *previous* capUsed so we skip the very first time the league
  // loads (capUsed going undefined → a number).  Without this guard the
  // component would double-fetch on mount causing a loading → data → loading
  // → data flash.
  const capUsed        = userTeam?.capUsed;
  const prevCapUsedRef = useRef(undefined);
  useEffect(() => {
    if (capUsed === undefined) return;           // league not loaded yet
    if (prevCapUsedRef.current === undefined) {  // first observed value — skip
      prevCapUsedRef.current = capUsed;
      return;
    }
    if (prevCapUsedRef.current === capUsed) return; // no actual change
    prevCapUsedRef.current = capUsed;
    fetchFA();
  }, [capUsed, fetchFA]);

  // ── Sorting / filtering ────────────────────────────────────────────────────

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const displayed = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = faPool.filter(p => {
      if (signedIds.has(p.id))                         return false;
      if (posFilter !== 'ALL' && p.pos !== posFilter)  return false;
      if (p.ovr < ovrMin)                              return false;
      if (q && !p.name?.toLowerCase().includes(q))     return false;
      return true;
    });
    return sortFA(filtered, sortKey, sortDir);
  }, [faPool, posFilter, search, ovrMin, sortKey, sortDir, signedIds]);

  // ── Sign handler ───────────────────────────────────────────────────────────

  const handleSign = (player, contract) => {
    setSigning(null);
    // Optimistic: remove from local list immediately
    setSignedIds(prev => new Set([...prev, player.id]));
    actions.signPlayer(player.id, teamId, contract);
    setFlash(`${player.name} signed — ${fmtSalary(contract.baseAnnual)} / ${contract.yearsTotal}yr`);
    setTimeout(() => setFlash(null), 3000);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Cap banner */}
      <CapBanner userTeam={userTeam} />

      {/* Success flash */}
      {flash && (
        <div style={{
          background: 'var(--success)', color: '#fff',
          borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-5)',
          marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', fontWeight: 600,
        }}>
          {flash}
        </div>
      )}

      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
        {/* Name search */}
        <input
          type="text" placeholder="Search name…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--surface)', border: '1px solid var(--hairline)',
            color: 'var(--text)', borderRadius: 'var(--radius-md)',
            padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sm)',
            width: 160,
          }}
        />
        {/* OVR threshold */}
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
            {[60, 65, 70, 75, 80, 85, 90].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Position filter pills */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
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
                  <th style={{ paddingLeft: 'var(--space-5)', width: 36, color: 'var(--text-subtle)', fontSize: 'var(--text-xs)' }}>#</th>
                  <SortTh label="POS"      sortKey="pos"    current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Name"     sortKey="name"   current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="OVR"      sortKey="ovr"    current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <SortTh label="Age"      sortKey="age"    current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <SortTh label="Ask $/yr" sortKey="salary" current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <th style={{ textAlign: 'right', paddingRight: 'var(--space-3)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Yrs
                  </th>
                  <th style={{ textAlign: 'center', paddingRight: 'var(--space-3)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Empty state */}
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                      No free agents match your filters.
                    </td>
                  </tr>
                )}

                {displayed.map((player, idx) => {
                  const isSigningThis = signing === player.id;
                  const canAfford     = (player._ask ?? 0) <= capRoom + 0.01;
                  const askYrs        = suggestedYears(player.age);

                  if (isSigningThis) {
                    // Two-row pattern: player info row (highlighted) + sign form row
                    return (
                      <React.Fragment key={player.id}>
                        {/* Highlighted player row */}
                        <tr style={{ background: 'var(--accent)0d' }}>
                          <td style={{ paddingLeft: 'var(--space-5)', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                            {idx + 1}
                          </td>
                          <td><PosBadge pos={player.pos} /></td>
                          <td
                            onClick={() => onPlayerSelect && onPlayerSelect(player.id)}
                            style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          >
                            {player.name}
                          </td>
                          <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)' }}>
                            <OvrBadge ovr={player.ovr} />
                          </td>
                          <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                            {player.age}
                          </td>
                          <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                            {fmtSalary(player._ask)}
                          </td>
                          <td style={{ textAlign: 'right', paddingRight: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            {askYrs}yr
                          </td>
                          <td />
                        </tr>
                        {/* Sign form row */}
                        <tr style={{ background: 'var(--surface-strong)' }}>
                          <td style={{
                            paddingLeft: 'var(--space-5)', color: 'var(--accent)',
                            fontSize: 'var(--text-sm)', verticalAlign: 'middle',
                          }}>
                            ›
                          </td>
                          <SignForm
                            player={player}
                            capRoom={capRoom}
                            onSubmit={contract => handleSign(player, contract)}
                            onCancel={() => setSigning(null)}
                          />
                        </tr>
                      </React.Fragment>
                    );
                  }

                  // Normal player row
                  return (
                    <tr key={player.id}>
                      <td style={{ paddingLeft: 'var(--space-5)', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                        {idx + 1}
                      </td>
                      <td><PosBadge pos={player.pos} /></td>
                      <td
                        onClick={() => onPlayerSelect && onPlayerSelect(player.id)}
                        style={{ fontWeight: 600, color: 'var(--text)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      >
                        {player.name}
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)' }}>
                        <OvrBadge ovr={player.ovr} />
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                        {player.age}
                      </td>
                      <td style={{
                        textAlign: 'right', paddingRight: 'var(--space-4)',
                        fontSize: 'var(--text-sm)',
                        color: canAfford ? 'var(--text)' : 'var(--danger)',
                        fontWeight: canAfford ? 500 : 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {fmtSalary(player._ask)}
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {askYrs}yr
                      </td>
                      <td style={{ textAlign: 'center', paddingRight: 'var(--space-3)' }}>
                        {capRoom < 2 ? (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', fontWeight: 700 }}>
                            CAP FULL
                          </span>
                        ) : (
                          <button
                            className={`btn${canAfford ? ' btn-primary' : ''}`}
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

      {/* Pool count footer */}
      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', textAlign: 'right' }}>
        {displayed.length} shown · {Math.max(0, faPool.length - signedIds.size)} available in pool
      </div>
    </div>
  );
}
