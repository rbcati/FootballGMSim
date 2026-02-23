/**
 * RosterManager.jsx
 *
 * ZenGM-style dense roster data-grid for the user's controlled team.
 *
 * Features:
 *  - Position filter pills (ALL / QB / WR / RB / TE / OL / DL / LB / CB / S)
 *  - Column sort (OVR, Age, Salary, Name)
 *  - Contract details inline: Annual + Years remaining
 *  - Release button with single-click confirmation
 *  - Cap summary bar at the top
 *
 * Data flow:
 *  On mount / teamId change → actions.getRoster(teamId) → ROSTER_DATA response
 *  Release → actions.releasePlayer() → STATE_UPDATE → re-fetch roster
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITIONS = ['ALL', 'QB', 'WR', 'RB', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'];

const SORT_OPTIONS = [
  { key: 'ovr',    label: 'OVR' },
  { key: 'age',    label: 'Age' },
  { key: 'salary', label: 'Salary' },
  { key: 'name',   label: 'Name' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ovrColor(ovr) {
  if (ovr >= 85) return '#34C759';
  if (ovr >= 75) return '#0A84FF';
  if (ovr >= 65) return '#FF9F0A';
  return '#FF453A';
}

function fmtSalary(annual) {
  if (!annual && annual !== 0) return '—';
  return `$${annual.toFixed(1)}M`;
}

function fmtYears(contract) {
  if (!contract) return '—';
  const yrs = contract.yearsTotal ?? contract.years ?? 1;
  const rem = contract.yearsRemaining ?? yrs;
  return `${rem}yr`;
}

function sortPlayers(players, sortKey, sortDir) {
  return [...players].sort((a, b) => {
    let va, vb;
    switch (sortKey) {
      case 'ovr':    va = a.ovr ?? 0; vb = b.ovr ?? 0; break;
      case 'age':    va = a.age ?? 0; vb = b.age ?? 0; break;
      case 'salary': va = a.contract?.baseAnnual ?? 0; vb = b.contract?.baseAnnual ?? 0; break;
      case 'name':   va = a.name ?? ''; vb = b.name ?? ''; break;
      default:       va = 0; vb = 0;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CapBar({ capUsed, capTotal }) {
  const pct = capTotal > 0 ? Math.min(100, (capUsed / capTotal) * 100) : 0;
  const color = pct > 90 ? 'var(--danger)' : pct > 75 ? 'var(--warning)' : 'var(--success)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div style={{ flex: 1, height: 6, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 'var(--text-xs)', color, fontWeight: 700, whiteSpace: 'nowrap' }}>
        ${capUsed?.toFixed(1)}M / ${capTotal?.toFixed(0)}M
      </span>
    </div>
  );
}

function SortHeader({ label, sortKey, currentSort, currentDir, onSort }) {
  const active = currentSort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        textAlign: 'right', paddingRight: 'var(--space-4)',
        cursor: 'pointer', userSelect: 'none',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontWeight: active ? 700 : 600,
        fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px',
      }}
    >
      {label} {active ? (currentDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RosterManager({ league, actions }) {
  const teamId = league?.userTeamId;

  const [loading,    setLoading]    = useState(false);
  const [team,       setTeam]       = useState(null);
  const [players,    setPlayers]    = useState([]);
  const [posFilter,  setPosFilter]  = useState('ALL');
  const [sortKey,    setSortKey]    = useState('ovr');
  const [sortDir,    setSortDir]    = useState('desc');
  const [releasing,  setReleasing]  = useState(null);  // playerId pending confirm

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
      console.error('getRoster failed:', e);
    } finally {
      setLoading(false);
    }
  }, [teamId, actions]);

  useEffect(() => { fetchRoster(); }, [fetchRoster]);

  // Re-fetch after a league state update (sign/release completed)
  useEffect(() => { fetchRoster(); }, [league?.teams]);

  // Filter + sort
  const displayed = useMemo(() => {
    const filtered = posFilter === 'ALL'
      ? players
      : players.filter(p => p.pos === posFilter);
    return sortPlayers(filtered, sortKey, sortDir);
  }, [players, posFilter, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const handleRelease = async (player) => {
    if (releasing !== player.id) {
      setReleasing(player.id);   // first click: enter confirm mode
      return;
    }
    // second click: execute
    setReleasing(null);
    actions.releasePlayer(player.id, teamId);
    // Optimistic update
    setPlayers(prev => prev.filter(p => p.id !== player.id));
  };

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

  return (
    <div>
      {/* Team cap header */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontWeight: 800, fontSize: 'var(--text-lg)', color: 'var(--text)' }}>
              {team?.name ?? 'Roster'}
            </span>
            <span style={{ marginLeft: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {players.length} players · {displayed.length} shown
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>
              CAP ROOM
            </div>
            <div style={{
              fontSize: 'var(--text-xl)', fontWeight: 800,
              color: capRoom < 5 ? 'var(--danger)' : capRoom < 15 ? 'var(--warning)' : 'var(--success)',
            }}>
              ${capRoom.toFixed(1)}M
            </div>
          </div>
        </div>
        <CapBar capUsed={capUsed} capTotal={capTotal} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {/* Position filter */}
        <div className="standings-tabs" style={{ flexWrap: 'wrap' }}>
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
      </div>

      {/* Roster table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading roster…
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="standings-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 'var(--space-5)', textAlign: 'left', width: 40 }}>#</th>
                  <th style={{ textAlign: 'left' }}>POS</th>
                  <th style={{ textAlign: 'left' }}>Name</th>
                  <SortHeader label="OVR"  sortKey="ovr"    currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Age"  sortKey="age"    currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="$/yr" sortKey="salary" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <th style={{ textAlign: 'right', paddingRight: 'var(--space-5)' }}>Yrs</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                      No players found.
                    </td>
                  </tr>
                )}
                {displayed.map((player, idx) => {
                  const isReleasing = releasing === player.id;
                  return (
                    <tr key={player.id} style={isReleasing ? { background: 'rgba(255,69,58,0.07)' } : {}}>
                      <td style={{ paddingLeft: 'var(--space-5)', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                        {idx + 1}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', minWidth: 30,
                          padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                          background: 'var(--surface-strong)',
                          fontSize: 'var(--text-xs)', fontWeight: 700,
                          color: 'var(--text-muted)',
                          textAlign: 'center',
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
                      <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                        {fmtSalary(player.contract?.baseAnnual)}
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 'var(--space-5)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {fmtYears(player.contract)}
                      </td>
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
                          <button
                            className="btn"
                            style={{ fontSize: 'var(--text-xs)', padding: '2px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                            onClick={() => handleRelease(player)}
                          >
                            Release
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
    </div>
  );
}
