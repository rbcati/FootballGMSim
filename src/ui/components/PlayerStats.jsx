/**
 * PlayerStats.jsx
 *
 * Dedicated global stats viewer — ZenGM data-dense style.
 * Fetches all player stats via GET_ALL_PLAYER_STATS.
 * Features position filtering, sortable columns, and dynamic column sets.
 *
 * Data-density priorities:
 *  - Minimal cell padding (3-6 px)
 *  - white-space: nowrap on all headers
 *  - .toLocaleString() on large integers (yards, cap)
 *  - overflow-x-auto wrapper for mobile horizontal scroll
 */

import React, { useState, useEffect, useMemo } from 'react';

// ── Configuration ─────────────────────────────────────────────────────────────

const POS_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'];

const COLUMNS = {
  // Common columns always shown first
  BASE: [
    { key: 'name', label: 'Name', align: 'left' },
    { key: 'pos',  label: 'Pos',  align: 'center' },
    { key: 'teamAbbr', label: 'Tm', align: 'center' },
    { key: 'ovr',  label: 'OVR',  align: 'center' },
    { key: 'age',  label: 'Age',  align: 'center' },
    { key: 'gamesPlayed', label: 'GP', align: 'center' },
  ],
  // Dynamic columns per position group
  QB: [
    { key: 'passYards', label: 'Yds', align: 'right' },
    { key: 'passTDs',   label: 'TD',  align: 'right' },
    { key: 'int',       label: 'Int', align: 'right' },
    { key: 'passerRating', label: 'Rate', align: 'right' },
    { key: 'rushYards', label: 'RuYd', align: 'right' },
    { key: 'rushTDs',   label: 'RuTD', align: 'right' },
  ],
  RB: [
    { key: 'rushAtt',   label: 'Att', align: 'right' },
    { key: 'rushYards', label: 'Yds', align: 'right' },
    { key: 'rushTDs',   label: 'TD',  align: 'right' },
    { key: 'receptions',label: 'Rec', align: 'right' },
    { key: 'recYards',  label: 'RcYd', align: 'right' },
    { key: 'recTDs',    label: 'RcTD', align: 'right' },
  ],
  WR: [ // Also used for TE
    { key: 'receptions',label: 'Rec', align: 'right' },
    { key: 'recYards',  label: 'Yds', align: 'right' },
    { key: 'recTDs',    label: 'TD',  align: 'right' },
    { key: 'rushYards', label: 'RuYd', align: 'right' },
    { key: 'rushTDs',   label: 'RuTD', align: 'right' },
  ],
  DEFENSE: [ // DL, LB, DB
    { key: 'tackles',   label: 'Tkl', align: 'right' },
    { key: 'sacks',     label: 'Sack', align: 'right' },
    { key: 'tfl',       label: 'TFL', align: 'right' },
    { key: 'defInt',    label: 'Int', align: 'right' },
  ],
  K: [ // Also used for P
    { key: 'fgMade',    label: 'FGM', align: 'right' },
    { key: 'fgAtt',     label: 'FGA', align: 'right' },
  ],
  ALL: [ // Generic summary
    { key: 'passYards', label: 'PaYd', align: 'right' },
    { key: 'passTDs',   label: 'PaTD', align: 'right' },
    { key: 'rushYards', label: 'RuYd', align: 'right' },
    { key: 'rushTDs',   label: 'RuTD', align: 'right' },
    { key: 'recYards',  label: 'RcYd', align: 'right' },
    { key: 'recTDs',    label: 'RcTD', align: 'right' },
    { key: 'tackles',   label: 'Tkl',  align: 'right' },
    { key: 'sacks',     label: 'Sack', align: 'right' },
  ]
};

// Map position filter -> column set key
function getColSet(filter) {
  if (filter === 'All') return 'ALL';
  if (filter === 'WR' || filter === 'TE') return 'WR';
  if (filter === 'DL' || filter === 'LB' || filter === 'DB') return 'DEFENSE';
  if (filter === 'K' || filter === 'P') return 'K';
  return filter; // QB, RB, OL (fallback to default or empty for OL)
}

// ── Helper: Format cell values ───────────────────────────────────────────────

function fmtCell(value) {
  if (value == null) return '—';
  if (typeof value === 'number') {
    if (value % 1 !== 0) return value.toFixed(1);
    if (Math.abs(value) >= 1000) return value.toLocaleString();
  }
  return value;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PlayerStats({ actions, onPlayerSelect }) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [posFilter, setPosFilter] = useState('All');
  const [sortKey, setSortKey] = useState('passYards');
  const [sortDir, setSortDir] = useState('desc');

  // Fetch data on mount
  useEffect(() => {
    if (!actions) return;
    setLoading(true);
    actions.getAllPlayerStats({ silent: true })
      .then(resp => {
        if (resp.payload?.stats) {
          setStats(resp.payload.stats);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load player stats:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [actions]);

  // Handle Sort
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Filter & Sort
  const displayedStats = useMemo(() => {
    let filtered = stats;
    if (posFilter !== 'All') {
      if (['DL', 'LB', 'DB'].includes(posFilter)) {
        if (posFilter === 'DB') filtered = stats.filter(p => ['CB', 'S', 'SS', 'FS'].includes(p.pos));
        else if (posFilter === 'DL') filtered = stats.filter(p => ['DT', 'DE', 'DL', 'EDGE'].includes(p.pos));
        else filtered = stats.filter(p => p.pos === posFilter || p.pos.includes(posFilter));
      } else {
        filtered = stats.filter(p => p.pos === posFilter);
      }
    }

    return [...filtered].sort((a, b) => {
      const valA = a[sortKey] ?? 0;
      const valB = b[sortKey] ?? 0;
      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
  }, [stats, posFilter, sortKey, sortDir]);

  // Determine Columns
  const activeColSetKey = getColSet(posFilter);
  const dynCols = COLUMNS[activeColSetKey] || COLUMNS.ALL;
  const tableCols = [...COLUMNS.BASE, ...dynCols];

  if (loading) {
    return <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading stats...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--space-6)', color: 'var(--danger)', textAlign: 'center' }}>
        Error loading stats: {error}
      </div>
    );
  }

  return (
    <div>
      {/* Position filter pills */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
        {POS_FILTERS.map(pos => (
          <button
            key={pos}
            className={`standings-tab${posFilter === pos ? ' active' : ''}`}
            onClick={() => setPosFilter(pos)}
            style={{ minWidth: 32, padding: '3px 8px', fontSize: 11 }}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Data-dense table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 0 }}>
        <div style={{
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          maxHeight: 'calc(100vh - 220px)',
          overflowY: 'auto',
        }}>
          <table className="data-table" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 8, textAlign: 'center', width: 28 }}>#</th>
                {tableCols.map(col => {
                  const active = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        textAlign: col.align,
                        color: active ? 'var(--accent)' : undefined,
                        fontWeight: active ? 800 : undefined,
                      }}
                    >
                      {col.label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayedStats.length === 0 && (
                <tr>
                  <td colSpan={tableCols.length + 1} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
                    No players found.
                  </td>
                </tr>
              )}
              {displayedStats.slice(0, 500).map((player, idx) => (
                <tr key={player.id}>
                  <td style={{ paddingLeft: 8, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 10, fontWeight: 700 }}>
                    {idx + 1}
                  </td>
                  {tableCols.map(col => {
                    // Special columns
                    if (col.key === 'name') {
                      return (
                        <td key={col.key} style={{ textAlign: 'left' }}>
                          <span
                            className="player-link"
                            onClick={() => onPlayerSelect && onPlayerSelect(player.id)}
                          >
                            {player.name}
                          </span>
                        </td>
                      );
                    }
                    if (col.key === 'pos') {
                      return (
                        <td key={col.key} style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', padding: '0 4px',
                            borderRadius: 3,
                            background: 'var(--surface-strong)',
                            fontSize: 10, fontWeight: 700,
                            color: 'var(--text-muted)',
                          }}>
                            {player.pos}
                          </span>
                        </td>
                      );
                    }
                    if (col.key === 'ovr') {
                      const ovr = player.ovr ?? 0;
                      let col2 = '#FF453A';
                      if (ovr >= 90) col2 = '#34C759';
                      else if (ovr >= 80) col2 = '#30D158';
                      else if (ovr >= 70) col2 = '#0A84FF';
                      else if (ovr >= 60) col2 = '#FF9F0A';
                      return (
                        <td key={col.key} style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', minWidth: 26, padding: '0 3px',
                            borderRadius: 3,
                            background: col2 + '22', color: col2,
                            fontWeight: 800, fontSize: 11,
                          }}>
                            {ovr}
                          </span>
                        </td>
                      );
                    }

                    const raw = player[col.key];
                    return (
                      <td key={col.key} style={{ textAlign: col.align }}>
                        {fmtCell(raw)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {displayedStats.length > 500 && (
                <tr>
                  <td colSpan={tableCols.length + 1} style={{ textAlign: 'center', padding: 'var(--space-3)', color: 'var(--text-muted)', fontSize: 10 }}>
                    Showing top 500 of {displayedStats.length.toLocaleString()} players. Use filters to narrow.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
