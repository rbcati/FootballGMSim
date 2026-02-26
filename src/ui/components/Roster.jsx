/**
 * Roster.jsx
 *
 * Data-dense ZenGM-style roster viewer combined with a visual depth chart
 * inspired by Pro Football GM 3.
 *
 * Two view modes (toggled by top-right pill tabs):
 *  1. Roster Table — sortable columns (Pos / OVR / Age / Salary), position
 *     filter pills, Scheme Fit indicator, Morale indicator, Release flow.
 *  2. Depth Chart  — visual positional grid showing Starter / Backup / 3rd
 *     string for every position group across Offense, Defense, and Special Teams.
 *
 * Data flow:
 *  Mount / teamId change → actions.getRoster(teamId) → ROSTER_DATA response.
 *  getRoster uses { silent: true } so it NEVER sets busy=true and will never
 *  lock the "Advance Week" button.
 *  Release → actions.releasePlayer() → STATE_UPDATE → optimistic remove + re-fetch.
 *
 * Scheme Fit & Morale are deterministically mocked from player attributes until
 * the worker exposes those fields.  Replace the mock* helpers with real data
 * once available.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import TraitBadge from './TraitBadge';

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITIONS = ['ALL', 'QB', 'WR', 'RB', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'];

// Depth chart layout — each entry defines one positional row.
// `match` is the set of pos strings that map to this group.
const DEPTH_ROWS = [
  // ── Offense ──────────────────────────────────────────────────
  { group: 'OFFENSE', key: 'QB',  label: 'Quarterback',    match: ['QB'],                                slots: 3 },
  { group: 'OFFENSE', key: 'RB',  label: 'Running Back',   match: ['RB', 'HB', 'FB'],                   slots: 3 },
  { group: 'OFFENSE', key: 'WR',  label: 'Wide Receiver',  match: ['WR', 'FL', 'SE'],                   slots: 5 },
  { group: 'OFFENSE', key: 'TE',  label: 'Tight End',      match: ['TE'],                               slots: 3 },
  { group: 'OFFENSE', key: 'OL',  label: 'Offensive Line', match: ['OL', 'OT', 'LT', 'RT', 'OG', 'LG', 'RG', 'C'], slots: 5 },
  // ── Defense ──────────────────────────────────────────────────
  { group: 'DEFENSE', key: 'DE',  label: 'Defensive End',  match: ['DE', 'EDGE'],                       slots: 3 },
  { group: 'DEFENSE', key: 'DT',  label: 'Defensive Tackle',match: ['DT', 'NT', 'IDL'],                 slots: 3 },
  { group: 'DEFENSE', key: 'LB',  label: 'Linebacker',     match: ['LB', 'MLB', 'OLB', 'ILB'],         slots: 4 },
  { group: 'DEFENSE', key: 'CB',  label: 'Cornerback',     match: ['CB', 'DB', 'NCB'],                  slots: 4 },
  { group: 'DEFENSE', key: 'S',   label: 'Safety',         match: ['S', 'SS', 'FS'],                    slots: 3 },
  // ── Special Teams ─────────────────────────────────────────────
  { group: 'SPECIAL', key: 'K',   label: 'Kicker',         match: ['K', 'PK'],                          slots: 1 },
  { group: 'SPECIAL', key: 'P',   label: 'Punter',         match: ['P'],                                slots: 1 },
];

const SLOT_LABELS = ['Starter', 'Backup', '3rd', '4th', '5th'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ovrColor(ovr) {
  if (ovr >= 90) return '#34C759'; // elite  — green
  if (ovr >= 80) return '#30D158'; // great  — green-teal
  if (ovr >= 70) return '#0A84FF'; // solid  — blue
  if (ovr >= 60) return '#FF9F0A'; // average — amber
  return '#FF453A';                 // poor   — red
}

function fmtSalary(annual) {
  if (annual == null) return '—';
  return `$${annual.toFixed(1)}M`;
}

function fmtYears(contract) {
  if (!contract) return '—';
  const rem = contract.yearsRemaining ?? contract.yearsTotal ?? contract.years ?? 1;
  return `${rem}yr`;
}

function indicatorColor(val) {
  if (val >= 85) return '#34C759';
  if (val >= 70) return '#FF9F0A';
  return '#FF453A';
}

/** Small coloured square bar (5 filled / 5 total pips). */
function PipBar({ value, color }) {
  const filled = Math.round((value / 100) * 5);
  return (
    <span style={{ display: 'inline-flex', gap: 2, verticalAlign: 'middle' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            width: 6, height: 6,
            borderRadius: 1,
            background: i < filled ? color : 'var(--hairline)',
            display: 'inline-block',
          }}
        />
      ))}
    </span>
  );
}

function sortPlayers(players, sortKey, sortDir) {
  return [...players].sort((a, b) => {
    let va, vb;
    switch (sortKey) {
      case 'ovr':    va = a.ovr ?? 0;                      vb = b.ovr ?? 0;                     break;
      case 'age':    va = a.age ?? 0;                      vb = b.age ?? 0;                     break;
      case 'salary': va = a.contract?.baseAnnual ?? 0;     vb = b.contract?.baseAnnual ?? 0;    break;
      case 'fit':    va = a.schemeFit ?? 50;               vb = b.schemeFit ?? 50;              break;
      case 'morale': va = a.morale ?? 75;                  vb = b.morale ?? 75;                 break;
      case 'name':   va = a.name ?? '';                    vb = b.name ?? '';                   break;
      default:       va = 0;                               vb = 0;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExtensionModal({ player, actions, teamId, onClose, onComplete }) {
  const [ask, setAsk] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch ask on mount
    actions.getExtensionAsk(player.id).then(resp => {
      if (resp.payload?.ask) setAsk(resp.payload.ask);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [player.id, actions]);

  const handleAccept = async () => {
    if (!ask) return;
    setLoading(true);
    await actions.extendContract(player.id, teamId, ask);
    onComplete();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="card" style={{ width: 400, padding: 'var(--space-6)', boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ marginTop: 0 }}>Extend {player.name}</h3>
        {loading ? (
          <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Negotiating...</div>
        ) : ask ? (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Agent Demand:</p>
            <div style={{
              fontSize: '1.5em', fontWeight: 800, margin: 'var(--space-4) 0',
              color: 'var(--accent)', textAlign: 'center',
              background: 'var(--surface-strong)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)'
            }}>
              {ask.years} Years<br/>
              <span style={{ fontSize: '0.6em', color: 'var(--text)' }}>${ask.baseAnnual}M / yr</span>
            </div>
            <div style={{ fontSize: '0.85em', color: 'var(--text-subtle)', textAlign: 'center', marginBottom: 'var(--space-6)' }}>
              Includes ${ask.signingBonus}M Signing Bonus
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>Reject</button>
              <button className="btn btn-primary" onClick={handleAccept} style={{ background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' }}>
                Accept Deal
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p>Player refuses to negotiate at this time.</p>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CapBar({ capUsed, capTotal, deadCap = 0 }) {
  const usedPct = capTotal > 0 ? Math.min(100, ((capUsed - deadCap) / capTotal) * 100) : 0;
  const deadPct = capTotal > 0 ? Math.min(100, (deadCap / capTotal) * 100) : 0;

  const totalPct = usedPct + deadPct;
  const color = totalPct > 90 ? 'var(--danger)' : totalPct > 75 ? 'var(--warning)' : 'var(--success)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div style={{ flex: 1, height: 8, background: 'var(--hairline)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
        {/* Active Cap */}
        <div style={{ height: '100%', width: `${usedPct}%`, background: color, transition: 'width .3s' }} />
        {/* Dead Cap */}
        {deadPct > 0 && (
          <div style={{ height: '100%', width: `${deadPct}%`, background: 'var(--text-subtle)', transition: 'width .3s' }} />
        )}
      </div>
      <div style={{ textAlign: 'right', lineHeight: 1 }}>
        <span style={{ fontSize: 'var(--text-xs)', color, fontWeight: 700, whiteSpace: 'nowrap' }}>
          ${capUsed?.toFixed(1)}M / ${capTotal?.toFixed(0)}M
        </span>
        {deadCap > 0 && (
          <div style={{ fontSize: 9, color: 'var(--text-subtle)', marginTop: 2 }}>
            (${deadCap.toFixed(1)}M Dead)
          </div>
        )}
      </div>
    </div>
  );
}

function SortTh({ label, sortKey, currentSort, currentDir, onSort, style = {} }) {
  const active = currentSort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        cursor: 'pointer', userSelect: 'none',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontWeight: active ? 700 : 600,
        fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}{active ? (currentDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

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

// ── Roster Table View ─────────────────────────────────────────────────────────

function RosterTable({ players, actions, teamId, onRefetch, onPlayerSelect, phase }) {
  const isResignPhase = phase === 'offseason_resign';
  // Default to EXPIRING view in resign phase
  const [posFilter, setPosFilter] = useState(isResignPhase ? 'EXPIRING' : 'ALL');
  const [sortKey,   setSortKey]   = useState('ovr');
  const [sortDir,   setSortDir]   = useState('desc');
  const [releasing, setReleasing] = useState(null);
  const [extending, setExtending] = useState(null);

  const displayed = useMemo(() => {
    let filtered = players;
    if (posFilter === 'EXPIRING') {
      filtered = players.filter(p => (p.contract?.years || 0) <= 1);
    } else if (posFilter !== 'ALL') {
      filtered = players.filter(p => p.pos === posFilter || DEPTH_ROWS.find(r => r.key === posFilter)?.match.includes(p.pos));
    }
    return sortPlayers(filtered, sortKey, sortDir);
  }, [players, posFilter, sortKey, sortDir]);

  const activeFilters = isResignPhase ? ['EXPIRING', ...POSITIONS] : POSITIONS;

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const handleRelease = async (player) => {
    if (releasing !== player.id) { setReleasing(player.id); return; }

    // Check dead cap
    const c = player.contract;
    const annualBonus = (c?.signingBonus ?? 0) / (c?.yearsTotal || 1);
    const deadCap = annualBonus * (c?.years || 1);

    if (deadCap > 0.5) {
        if (!window.confirm(`Release ${player.name}?\n\nThis will accelerate $${deadCap.toFixed(1)}M of dead cap against your budget.`)) {
            setReleasing(null);
            return;
        }
    }

    setReleasing(null);
    actions.releasePlayer(player.id, teamId);
    onRefetch();
  };

  return (
    <>
      {extending && (
        <ExtensionModal
          player={extending}
          actions={actions}
          teamId={teamId}
          onClose={() => setExtending(null)}
          onComplete={() => { setExtending(null); onRefetch(); }}
        />
      )}
      {/* Position filter pills */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        {activeFilters.map(pos => (
          <button
            key={pos}
            className={`standings-tab${posFilter === pos ? ' active' : ''}`}
            onClick={() => setPosFilter(pos)}
            style={{
                minWidth: 36, padding: '4px 10px',
                ...(pos === 'EXPIRING' ? { borderColor: 'var(--success)', color: 'var(--success)' } : {})
            }}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="standings-table" style={{ width: '100%', minWidth: 700, fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 'var(--space-2)', width: 28, color: 'var(--text-subtle)', fontSize: 'var(--text-xs)' }}>#</th>
                <SortTh label="POS"    sortKey="pos"    currentSort={sortKey} currentDir={sortDir} onSort={handleSort} style={{ textAlign: 'left' }} />
                <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</th>
                <SortTh label="OVR"    sortKey="ovr"    currentSort={sortKey} currentDir={sortDir} onSort={handleSort} style={{ textAlign: 'right', paddingRight: 'var(--space-3)' }} />
                <SortTh label="Age"    sortKey="age"    currentSort={sortKey} currentDir={sortDir} onSort={handleSort} style={{ textAlign: 'right', paddingRight: 'var(--space-3)' }} />
                <SortTh label="$/yr"   sortKey="salary" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} style={{ textAlign: 'right', paddingRight: 'var(--space-3)' }} />
                <th style={{ textAlign: 'right', paddingRight: 'var(--space-3)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Yrs</th>
                <th style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Traits</th>
                <SortTh label="Fit"    sortKey="fit"    currentSort={sortKey} currentDir={sortDir} onSort={handleSort} style={{ textAlign: 'center' }} />
                <SortTh label="Morale" sortKey="morale" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} style={{ textAlign: 'center' }} />
                <th style={{ textAlign: 'center', paddingRight: 'var(--space-3)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                    No players match this filter.
                  </td>
                </tr>
              )}
              {displayed.map((player, idx) => {
                const isReleasing = releasing === player.id;
                const isExpiring  = (player.contract?.years || 0) <= 1;
                const yearsLeft = player.contract?.yearsRemaining ?? player.contract?.years ?? 1;
                const isZeroYears = yearsLeft === 0 || (yearsLeft <= 1 && isResignPhase);
                const fit    = player.schemeFit ?? 50;
                const morale = player.morale ?? 75;
                const fitCol    = indicatorColor(fit);
                const moraleCol = indicatorColor(morale);

                // Highlight row if expiring in resign phase
                const rowStyle = isReleasing
                    ? { background: 'rgba(255,69,58,0.07)' }
                    : (isResignPhase && isExpiring ? { background: 'rgba(52, 199, 89, 0.05)' } : {});

                return (
                  <tr key={player.id} style={rowStyle}>
                    {/* # */}
                    <td style={{ paddingLeft: 'var(--space-2)', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                      {idx + 1}
                    </td>
                    {/* POS */}
                    <td><PosBadge pos={player.pos} /></td>
                    {/* Name */}
                    <td
                      onClick={() => onPlayerSelect && onPlayerSelect(player.id)}
                      style={{ fontWeight: 600, color: 'var(--text)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', cursor: 'pointer' }}
                    >
                      {player.name}
                      {isResignPhase && isZeroYears && (
                        <span style={{
                          marginLeft: 6, padding: '1px 5px', borderRadius: 'var(--radius-pill)',
                          background: 'rgba(255,69,58,0.15)', color: 'var(--danger)',
                          fontSize: 9, fontWeight: 800, letterSpacing: '0.5px',
                          verticalAlign: 'middle',
                        }}>
                          EXPIRING
                        </span>
                      )}
                    </td>
                    {/* OVR */}
                    <td style={{ textAlign: 'right', paddingRight: 'var(--space-3)' }}>
                      <OvrBadge ovr={player.ovr} />
                      {player.progressionDelta != null && player.progressionDelta !== 0 && (
                        <span
                          className={player.progressionDelta > 0 ? 'text-success' : 'text-danger'}
                          style={{ fontSize: 10, fontWeight: 700, marginLeft: 3, whiteSpace: 'nowrap' }}
                        >
                          ({player.progressionDelta > 0 ? '+' : ''}{player.progressionDelta})
                        </span>
                      )}
                    </td>
                    {/* Age */}
                    <td style={{ textAlign: 'right', paddingRight: 'var(--space-3)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                      {player.age}
                    </td>
                    {/* Salary */}
                    <td style={{ textAlign: 'right', paddingRight: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtSalary(player.contract?.baseAnnual)}
                    </td>
                    {/* Years */}
                    <td style={{ textAlign: 'right', paddingRight: 'var(--space-3)', fontSize: 'var(--text-xs)', color: isExpiring ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isExpiring ? 700 : 400 }}>
                      {fmtYears(player.contract)}
                    </td>
                    {/* Traits */}
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {(player.traits || []).map(t => <TraitBadge key={t} traitId={t} />)}
                    </td>
                    {/* Scheme Fit */}
                    <td style={{ textAlign: 'center', padding: '0 var(--space-2)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <PipBar value={fit} color={fitCol} />
                        <span style={{ fontSize: 10, color: fitCol, fontWeight: 700, lineHeight: 1 }}>{fit}</span>
                      </div>
                    </td>
                    {/* Morale */}
                    <td style={{ textAlign: 'center', padding: '0 var(--space-2)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <PipBar value={morale} color={moraleCol} />
                        <span style={{ fontSize: 10, color: moraleCol, fontWeight: 700, lineHeight: 1 }}>{morale}</span>
                      </div>
                    </td>
                    {/* Release / Extend */}
                    <td style={{ textAlign: 'center', paddingRight: 'var(--space-3)' }}>
                      {isReleasing ? (
                        <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'center' }}>
                          <button
                            className="btn btn-danger"
                            style={{ fontSize: 'var(--text-xs)', padding: '2px 10px' }}
                            onClick={() => handleRelease(player)}
                          >
                            Confirm
                          </button>
                          <button
                            className="btn"
                            style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                            onClick={() => setReleasing(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            {isExpiring && (
                                <button
                                    className="btn"
                                    style={{
                                      fontSize: 'var(--text-xs)', padding: '2px 10px',
                                      ...(isResignPhase && isZeroYears
                                        ? { background: 'var(--success)', borderColor: 'var(--success)', color: '#fff', fontWeight: 700 }
                                        : { color: 'var(--success)', borderColor: 'var(--success)' })
                                    }}
                                    onClick={() => setExtending(player)}
                                >
                                    Extend
                                </button>
                            )}
                            <button
                            className="btn"
                            style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                            onClick={() => handleRelease(player)}
                            >
                            Cut
                            </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Depth Chart View ──────────────────────────────────────────────────────────

/** Single player card inside a depth chart slot. */
function DepthCard({ player, isStarter }) {
  if (!player) {
    return (
      <div style={{
        minWidth: 130, padding: '6px 10px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface)',
        border: '1px dashed var(--hairline)',
        color: 'var(--text-subtle)',
        fontSize: 'var(--text-xs)',
        textAlign: 'center',
      }}>
        —
      </div>
    );
  }

  const fit         = player.schemeFit ?? 50;
  const fitCol      = indicatorColor(fit);
  const borderStyle = isStarter
    ? `1px solid var(--accent)`
    : `1px solid var(--hairline)`;

  return (
    <div style={{
      minWidth: 130, maxWidth: 160, padding: '6px 10px',
      borderRadius: 'var(--radius-sm)',
      background: isStarter ? 'var(--accent-muted)' : 'var(--surface)',
      border: borderStyle,
    }}>
      {/* Name + OVR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
          {player.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <OvrBadge ovr={player.ovr} />
          {player.progressionDelta != null && player.progressionDelta !== 0 && (
            <span
              className={player.progressionDelta > 0 ? 'text-success' : 'text-danger'}
              style={{ fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              ({player.progressionDelta > 0 ? '+' : ''}{player.progressionDelta})
            </span>
          )}
        </div>
      </div>
      {/* Age + Fit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ag {player.age}</span>
        <span style={{ fontSize: 10, color: fitCol, fontWeight: 700 }}>◆{fit}</span>
        <PipBar value={fit} color={fitCol} />
      </div>
    </div>
  );
}

function DepthChartView({ players }) {
  // Build a map: posKey → sorted player array (best OVR first)
  const depthMap = useMemo(() => {
    const map = {};
    DEPTH_ROWS.forEach(row => { map[row.key] = []; });
    players.forEach(player => {
      const row = DEPTH_ROWS.find(r => r.match.includes(player.pos));
      if (row) map[row.key].push(player);
    });
    // Sort each group by OVR desc so the best player is always Starter
    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
    });
    return map;
  }, [players]);

  // Group rows by section for the group headers
  const groups = ['OFFENSE', 'DEFENSE', 'SPECIAL'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {groups.map(group => {
        const rows = DEPTH_ROWS.filter(r => r.group === group);
        const maxSlots = Math.max(...rows.map(r => r.slots));

        return (
          <div key={group}>
            {/* Group header */}
            <div style={{
              fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '1.5px', color: 'var(--text-muted)',
              padding: 'var(--space-2) 0', marginBottom: 'var(--space-2)',
              borderBottom: '1px solid var(--hairline)',
            }}>
              {group}
            </div>

            {/* Slot column headers */}
            <div className="table-wrapper">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{
                      textAlign: 'left', padding: '4px 12px 4px 0',
                      fontSize: 'var(--text-xs)', color: 'var(--text-subtle)',
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                      width: 140, whiteSpace: 'nowrap',
                    }}>
                      Position
                    </th>
                    {Array.from({ length: maxSlots }, (_, i) => (
                      <th key={i} style={{
                        padding: '4px 6px',
                        fontSize: 'var(--text-xs)', color: 'var(--text-subtle)',
                        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                        textAlign: 'left', whiteSpace: 'nowrap',
                      }}>
                        {SLOT_LABELS[i] ?? `${i + 1}th`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIdx) => {
                    const depth = depthMap[row.key] ?? [];
                    return (
                      <tr
                        key={row.key}
                        style={{
                          borderTop: rowIdx > 0 ? '1px solid var(--hairline)' : undefined,
                          verticalAlign: 'top',
                        }}
                      >
                        {/* Position label */}
                        <td style={{ padding: '8px 12px 8px 0', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                            {row.label}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 2 }}>
                            {depth.length} on roster
                          </div>
                        </td>
                        {/* Depth slots */}
                        {Array.from({ length: maxSlots }, (_, slotIdx) => {
                          // Only render up to this row's designated slots; hide extras
                          if (slotIdx >= row.slots) {
                            return <td key={slotIdx} />;
                          }
                          return (
                            <td key={slotIdx} style={{ padding: '6px' }}>
                              <DepthCard
                                player={depth[slotIdx] ?? null}
                                isStarter={slotIdx === 0}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Roster({ league, actions, onPlayerSelect }) {
  const teamId = league?.userTeamId;

  const [loading,  setLoading]  = useState(false);
  const [team,     setTeam]     = useState(null);
  const [players,  setPlayers]  = useState([]);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'depth'

  const fetchRoster = useCallback(async () => {
    if (teamId == null || !actions?.getRoster) return;
    setLoading(true);
    try {
      const resp = await actions.getRoster(teamId);
      if (resp?.payload) {
        setTeam(resp.payload.team);
        setPlayers(resp.payload.players ?? []);
      }
    } catch (e) {
      console.error('[Roster] getRoster failed:', e);
    } finally {
      setLoading(false);
    }
  }, [teamId, actions]);

  // Fetch on mount and whenever the user's team or week changes.
  // fetchRoster is stable as long as teamId and actions don't change.
  // Do NOT add league?.teams here — it's a new array reference on every
  // STATE_UPDATE dispatch and would cause a fetch cascade.
  // Post-release refreshes are handled by the explicit onRefetch() callback
  // passed to RosterTable.
  useEffect(() => { fetchRoster(); }, [fetchRoster]);

  if (teamId == null) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
        No team selected.
      </div>
    );
  }

  const capUsed  = team?.capUsed  ?? 0;
  const capTotal = team?.capTotal ?? 255;
  const capRoom  = team?.capRoom  ?? capTotal - capUsed;
  const avgOvr   = players.length
    ? Math.round(players.reduce((s, p) => s + (p.ovr ?? 70), 0) / players.length)
    : 0;

  const isOverLimit = league?.phase === 'preseason' && players.length > 53;

  return (
    <div>
      {/* ── Team cap header ── */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 'var(--space-3)', gap: 'var(--space-4)', flexWrap: 'wrap',
        }}>
          {/* Left: name + player count */}
          <div>
            <span style={{ fontWeight: 800, fontSize: 'var(--text-lg)', color: 'var(--text)' }}>
              {team?.name ?? 'Roster'}
            </span>
            <span style={{
              marginLeft: 'var(--space-3)', fontSize: 'var(--text-sm)',
              color: isOverLimit ? 'var(--danger)' : 'var(--text-muted)',
              fontWeight: isOverLimit ? 700 : 400
            }}>
              {players.length} players {isOverLimit ? '/ 53 (Cut Required)' : ''} · Avg OVR {avgOvr}
            </span>
          </div>

          {/* Right: cap room + view toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>CAP ROOM</div>
              <div style={{
                fontSize: 'var(--text-xl)', fontWeight: 800,
                color: capRoom < 5 ? 'var(--danger)' : capRoom < 15 ? 'var(--warning)' : 'var(--success)',
              }}>
                ${capRoom.toFixed(1)}M
              </div>
            </div>

            {/* View toggle pills */}
            <div className="standings-tabs">
              <button
                className={`standings-tab${viewMode === 'table' ? ' active' : ''}`}
                onClick={() => setViewMode('table')}
                style={{ padding: '4px 14px', fontSize: 'var(--text-xs)' }}
              >
                Roster
              </button>
              <button
                className={`standings-tab${viewMode === 'depth' ? ' active' : ''}`}
                onClick={() => setViewMode('depth')}
                style={{ padding: '4px 14px', fontSize: 'var(--text-xs)' }}
              >
                Depth Chart
              </button>
            </div>
          </div>
        </div>

        {/* Cap bar */}
        <CapBar capUsed={capUsed} capTotal={capTotal} deadCap={team?.deadCap} />

        {/* Legend for indicators */}
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>
            <span style={{ color: '#34C759', fontWeight: 700 }}>◆</span> Scheme Fit &nbsp;
            <span style={{ color: 'var(--text-subtle)' }}>|</span>&nbsp;
            <span style={{ color: '#0A84FF', fontWeight: 700 }}>●</span> Morale
          </span>
        </div>
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading roster…
        </div>
      )}

      {/* ── Table view ── */}
      {!loading && viewMode === 'table' && (
        <RosterTable
          players={players}
          actions={actions}
          teamId={teamId}
          onRefetch={fetchRoster}
          onPlayerSelect={onPlayerSelect}
          phase={league?.phase}
        />
      )}

      {/* ── Depth chart view ── */}
      {!loading && viewMode === 'depth' && (
        <div className="card" style={{ padding: 'var(--space-5)' }}>
          {players.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-8)' }}>
              No players on roster.
            </div>
          ) : (
            <DepthChartView players={players} />
          )}
        </div>
      )}
    </div>
  );
}
