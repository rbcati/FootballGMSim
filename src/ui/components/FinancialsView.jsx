/**
 * FinancialsView.jsx — Phase 30: Financial Consequences & Cap Management
 *
 * Dashboard showing:
 *   • Hard Cap usage bar (active cap + dead money vs. $301.2M ceiling)
 *   • Dead Money (Current Year) and Projected Dead Money (Next Year)
 *   • Per-player cap hit table with Restructure action for eligible players
 *   • June 1st rule indicator (which dead-money rule applies given current phase)
 *
 * Data flow:
 *   Mount / teamId change → actions.getRoster(teamId) → local state
 *   Restructure → actions.restructureContract(playerId, teamId) → re-fetch
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getAvailableCap } from '../../data/team-utils.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const HARD_CAP = 301.2;

function fmt(val) {
  if (val == null || isNaN(val)) return '—';
  const sign = val < 0 ? '-' : '';
  return `${sign}$${Math.abs(val).toFixed(2)}M`;
}

function capHitOf(player) {
  const c = player.contract;
  if (!c) return 0;
  return (c.baseAnnual ?? 0) + ((c.signingBonus ?? 0) / (c.yearsTotal || 1));
}

function pct(used, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

/** Phase → human-readable June-1 label */
function june1Label(phase) {
  const post = ['free_agency', 'draft', 'preseason', 'regular', 'playoffs'];
  return post.includes(phase) ? 'Post-June 1' : 'Pre-June 1';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CapBar({ activeCap, deadCap, total }) {
  const activeW = pct(activeCap, total);
  const deadW   = pct(deadCap, total);
  const over    = (activeCap + deadCap) > total;

  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
        <span>Cap Used: {fmt(activeCap + deadCap)} / {fmt(total)}</span>
        <span style={{ color: over ? 'var(--danger)' : 'var(--success)' }}>
          {over ? '⚠ OVER CAP' : `${fmt(total - activeCap - deadCap)} available`}
        </span>
      </div>
      <div style={{
        height: 14,
        borderRadius: 7,
        background: 'var(--bg-secondary, #1e1e2e)',
        overflow: 'hidden',
        display: 'flex',
        border: over ? '1px solid var(--danger)' : '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Active cap */}
        <div style={{
          width: `${activeW}%`,
          background: over ? 'var(--danger)' : 'var(--accent, #0A84FF)',
          transition: 'width 0.3s',
        }} />
        {/* Dead cap */}
        <div style={{
          width: `${deadW}%`,
          background: 'rgba(255,149,0,0.75)',
          transition: 'width 0.3s',
        }} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        <span><span style={{ color: 'var(--accent, #0A84FF)' }}>■</span> Active Cap</span>
        <span><span style={{ color: 'rgba(255,149,0,0.9)' }}>■</span> Dead Money</span>
      </div>
    </div>
  );
}

function StatBox({ label, value, sub, danger }) {
  return (
    <div style={{
      background: 'var(--bg-secondary, #1e1e2e)',
      borderRadius: 8,
      padding: '12px 16px',
      minWidth: 130,
      flex: 1,
      border: danger ? '1px solid var(--danger)' : '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: danger ? 'var(--danger)' : 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FinancialsView({ league, actions }) {
  const [rosterData, setRosterData]       = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [restructuring, setRestructuring] = useState(null); // playerId being restructured
  const [sortCol, setSortCol]             = useState('capHit');
  const [sortDir, setSortDir]             = useState('desc');
  const [notification, setNotification]   = useState(null);

  const teamId = league?.userTeamId;
  const phase  = league?.phase ?? '';

  const fetchRoster = useCallback(async () => {
    if (!teamId || !actions?.getRoster) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await actions.getRoster(teamId);
      if (resp?.payload) setRosterData(resp.payload);
    } catch (e) {
      setError(e.message ?? 'Failed to load roster');
    } finally {
      setLoading(false);
    }
  }, [teamId, actions]);

  useEffect(() => { fetchRoster(); }, [fetchRoster]);

  // Re-fetch when league state changes (after restructure, release, etc.)
  useEffect(() => { fetchRoster(); }, [league?.phase, fetchRoster]);

  const team    = rosterData?.team    ?? {};
  const players = rosterData?.players ?? [];

  const hardCap         = team.capTotal          ?? HARD_CAP;
  const activeCap       = Math.max(0, (team.capUsed ?? 0) - (team.deadCap ?? 0));
  const deadCap         = team.deadCap            ?? 0;
  const deadMoneyNext   = team.deadMoneyNextYear   ?? 0;
  const capUsedTotal    = team.capUsed             ?? 0;
  const capRoom         = Math.round((hardCap - capUsedTotal) * 100) / 100;
  const isOverCap       = capUsedTotal > hardCap;
  const june1           = june1Label(phase);

  // Enrich players with computed cap hit
  const enriched = useMemo(() => players.map(p => ({
    ...p,
    capHit:           capHitOf(p),
    yearsRemaining:   p.contract?.years       ?? p.years      ?? 0,
    baseAnnual:       p.contract?.baseAnnual  ?? p.baseAnnual ?? 0,
    signingBonus:     p.contract?.signingBonus?? 0,
    yearsTotal:       p.contract?.yearsTotal  ?? 1,
    canRestructure:   (p.contract?.years ?? 1) >= 2 &&
                      (p.contract?.baseAnnual ?? p.baseAnnual ?? 0) > 0,
  })), [players]);

  // Sorted player list
  const sorted = useMemo(() => {
    return [...enriched].sort((a, b) => {
      let va = a[sortCol] ?? 0;
      let vb = b[sortCol] ?? 0;
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 :  1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }, [enriched, sortCol, sortDir]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const handleRestructure = async (player) => {
    if (!actions?.restructureContract) return;
    setRestructuring(player.id);
    setNotification(null);
    try {
      const resp = await actions.restructureContract(player.id, teamId);
      if (resp?.payload?.restructureResult) {
        const r = resp.payload.restructureResult;
        setNotification({
          type: 'success',
          message: `Restructured ${r.playerName}: converted $${r.convertAmount?.toFixed(2)}M → saves $${r.capSavingsThisYear?.toFixed(2)}M this year.`,
        });
      } else {
        setNotification({ type: 'success', message: 'Contract restructured.' });
      }
      await fetchRoster();
    } catch (e) {
      setNotification({ type: 'error', message: e.message ?? 'Restructure failed.' });
    } finally {
      setRestructuring(null);
    }
  };

  const SortArrow = ({ col }) =>
    sortCol === col
      ? <span style={{ marginLeft: 4, fontSize: 10 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
      : <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.3 }}>⇅</span>;

  const thStyle = (col) => ({
    padding: '7px 10px',
    textAlign: col === 'name' || col === 'pos' ? 'left' : 'right',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    color: sortCol === col ? 'var(--accent, #0A84FF)' : 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  });

  const tdStyle = (align = 'right') => ({
    padding: '7px 10px',
    textAlign: align,
    fontSize: 13,
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle',
  });

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
      Loading financials…
    </div>
  );

  if (error) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--danger)' }}>
      {error}
    </div>
  );

  return (
    <div style={{ padding: 'var(--space-4)', maxWidth: 900, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 'var(--space-5)' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Cap Management</h2>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px',
          borderRadius: 12, background: 'rgba(255,255,255,0.08)',
          color: 'var(--text-secondary)',
        }}>
          {june1} Rule Active
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px',
          borderRadius: 12,
          background: isOverCap ? 'rgba(255,69,58,0.15)' : 'rgba(52,199,89,0.12)',
          color: isOverCap ? 'var(--danger)' : 'var(--success)',
        }}>
          Hard Cap: ${hardCap.toFixed(1)}M
        </span>
      </div>

      {/* ── Notification ── */}
      {notification && (
        <div style={{
          marginBottom: 'var(--space-4)',
          padding: '10px 16px',
          borderRadius: 8,
          background: notification.type === 'error'
            ? 'rgba(255,69,58,0.1)' : 'rgba(52,199,89,0.1)',
          color: notification.type === 'error' ? 'var(--danger)' : 'var(--success)',
          border: `1px solid ${notification.type === 'error' ? 'rgba(255,69,58,0.3)' : 'rgba(52,199,89,0.3)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16 }}
          >×</button>
        </div>
      )}

      {/* ── Cap Bar ── */}
      <CapBar activeCap={activeCap} deadCap={deadCap} total={hardCap} />

      {/* ── Stat Boxes ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
        <StatBox
          label="Active Cap"
          value={fmt(activeCap)}
          sub={`${players.length} players under contract`}
        />
        <StatBox
          label="Dead Money (Current)"
          value={fmt(deadCap)}
          sub={deadCap > 0 ? 'Released players still on books' : 'No dead cap'}
          danger={deadCap > 10}
        />
        <StatBox
          label="Projected Dead Money (Next Year)"
          value={deadMoneyNext > 0 ? fmt(deadMoneyNext) : '—'}
          sub={deadMoneyNext > 0 ? 'Post-June-1 deferred obligations' : 'None deferred'}
          danger={deadMoneyNext > 5}
        />
        <StatBox
          label="Cap Available"
          value={fmt(capRoom)}
          sub={`vs. $${hardCap}M hard cap`}
          danger={isOverCap}
        />
      </div>

      {/* ── June 1st Explanation ── */}
      <div style={{
        marginBottom: 'var(--space-4)',
        padding: '10px 14px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
        fontSize: 12,
        color: 'var(--text-secondary)',
        borderLeft: '3px solid rgba(255,255,255,0.15)',
      }}>
        <strong style={{ color: 'var(--text-primary)' }}>June 1st Dead Money Rule: </strong>
        {june1 === 'Pre-June 1'
          ? 'Cuts before June 1st accelerate ALL remaining prorated bonus to this year\'s dead cap.'
          : 'Cuts after June 1st: this year\'s prorated bonus hits now; future years defer to next season\'s cap ("Projected Dead Money").'}
        {' '}
        <strong>Restructuring</strong> converts up to 50% of base salary into prorated bonus, saving cap space now.
      </div>

      {/* ── Player Cap Hit Table ── */}
      <div style={{
        background: 'var(--bg-secondary, #1e1e2e)',
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Player Contracts</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {enriched.length} players · Total cap hit: {fmt(enriched.reduce((s, p) => s + p.capHit, 0))}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle('name')} onClick={() => handleSort('name')}>Name<SortArrow col="name" /></th>
                <th style={thStyle('pos')}  onClick={() => handleSort('pos')}>Pos<SortArrow col="pos" /></th>
                <th style={thStyle('ovr')}  onClick={() => handleSort('ovr')}>OVR<SortArrow col="ovr" /></th>
                <th style={thStyle('age')}  onClick={() => handleSort('age')}>Age<SortArrow col="age" /></th>
                <th style={thStyle('baseAnnual')}   onClick={() => handleSort('baseAnnual')}>Base Salary<SortArrow col="baseAnnual" /></th>
                <th style={thStyle('signingBonus')} onClick={() => handleSort('signingBonus')}>Bonus<SortArrow col="signingBonus" /></th>
                <th style={thStyle('yearsRemaining')} onClick={() => handleSort('yearsRemaining')}>Yrs Left<SortArrow col="yearsRemaining" /></th>
                <th style={thStyle('capHit')} onClick={() => handleSort('capHit')}>Cap Hit<SortArrow col="capHit" /></th>
                <th style={{ ...thStyle('name'), textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((player, idx) => {
                const isRestructuring = restructuring === player.id;
                const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
                const isHighCap = player.capHit > 20;

                return (
                  <tr key={player.id} style={{ background: rowBg }}>
                    <td style={{ ...tdStyle('left'), fontWeight: 600 }}>
                      {player.name}
                    </td>
                    <td style={{ ...tdStyle('left') }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.07)',
                      }}>
                        {player.pos}
                      </span>
                    </td>
                    <td style={tdStyle()}>
                      <span style={{
                        fontWeight: 700,
                        color: player.ovr >= 85 ? 'var(--success)' :
                               player.ovr >= 75 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}>
                        {player.ovr}
                      </span>
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-secondary)' }}>
                      {player.age}
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-secondary)' }}>
                      {fmt(player.baseAnnual)}
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-secondary)' }}>
                      {player.signingBonus > 0 ? fmt(player.signingBonus) : '—'}
                    </td>
                    <td style={tdStyle()}>
                      {player.yearsRemaining > 0 ? player.yearsRemaining : '—'}
                    </td>
                    <td style={{
                      ...tdStyle(),
                      fontWeight: 700,
                      color: isHighCap ? '#FF9F0A' : 'var(--text-primary)',
                    }}>
                      {fmt(player.capHit)}
                    </td>
                    <td style={{ ...tdStyle(), textAlign: 'center' }}>
                      {player.canRestructure ? (
                        <button
                          disabled={isRestructuring}
                          onClick={() => handleRestructure(player)}
                          style={{
                            fontSize: 11,
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid rgba(10,132,255,0.4)',
                            background: 'rgba(10,132,255,0.1)',
                            color: 'var(--accent, #0A84FF)',
                            cursor: isRestructuring ? 'wait' : 'pointer',
                            fontWeight: 600,
                            opacity: isRestructuring ? 0.5 : 1,
                          }}
                        >
                          {isRestructuring ? '…' : 'Restructure'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
            No players under contract.
          </div>
        )}
      </div>

      {/* ── RFA Prep Notice ── */}
      <div style={{
        marginTop: 'var(--space-5)',
        padding: '12px 16px',
        borderRadius: 8,
        background: 'rgba(100,210,255,0.06)',
        border: '1px solid rgba(100,210,255,0.2)',
        fontSize: 12,
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: '#64D2FF' }}>Phase 31 — Restricted Free Agency (Upcoming):</strong>
        {' '}Players with 1–3 years of service on expiring contracts will be eligible for RFA tenders
        (Original Round, Second Round, First Round). Placing a tender lets you match any outside offer
        and retain your young stars. Check back during the offseason to protect your core.
      </div>
    </div>
  );
}
