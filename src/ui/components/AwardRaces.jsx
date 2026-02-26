/**
 * AwardRaces.jsx
 *
 * Mid-season award projections and All-Pro team display.
 * ZenGM data-dense style: compact rows, minimal padding, nowrap headers,
 * .toLocaleString() for yardage stats, overflow-x-auto for mobile.
 *
 * Sub-tabs: MVP · OPOY · DPOY · OROY · DROY · All-Pro
 */

import React, { useState, useEffect } from 'react';

// ── Configuration ─────────────────────────────────────────────────────────────

const AWARD_TABS = ['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'All-Pro'];

const ALL_PRO_POSITIONS = [
  { pos: 'QB',   count: 1 },
  { pos: 'RB',   count: 2 },
  { pos: 'WR',   count: 3 },
  { pos: 'TE',   count: 1 },
  { pos: 'EDGE', count: 2 },
  { pos: 'DT',   count: 1 },
  { pos: 'LB',   count: 3 },
  { pos: 'CB',   count: 2 },
  { pos: 'S',    count: 1 },
  { pos: 'K',    count: 1 },
  { pos: 'P',    count: 1 },
];

const POS_COLORS = {
  QB: '#0A84FF', RB: '#34C759', WR: '#FF9F0A', TE: '#BF5AF2',
  OL: '#636366', DL: '#FF453A', LB: '#FF6B35', CB: '#64D2FF',
  S:  '#5E5CE6', K:  '#A8A29E', P:  '#A8A29E',
  EDGE: '#FF453A', DT: '#FF453A',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtStat(value) {
  if (value == null) return '—';
  if (typeof value === 'number') {
    if (value % 1 !== 0) return value.toFixed(1);
    if (Math.abs(value) >= 1000) return value.toLocaleString();
  }
  return String(value);
}

function rankBadge(idx) {
  if (idx === 0) return { bg: '#B8860B22', color: '#FFD700', label: '1st' };
  if (idx === 1) return { bg: '#C0C0C022', color: '#C0C0C0', label: '2nd' };
  if (idx === 2) return { bg: '#CD7F3222', color: '#CD7F32', label: '3rd' };
  return { bg: 'transparent', color: 'var(--text-subtle)', label: `${idx + 1}th` };
}

function pickStatKeys(entry) {
  const t = entry?.totals || {};
  const stats = [];

  if ((t.passYd || 0) > 500) stats.push({ label: 'Pass', val: t.passYd }, { label: 'TD', val: t.passTD }, { label: 'Int', val: t.interceptions });
  else if ((t.rushYd || 0) > 200) stats.push({ label: 'Rush', val: t.rushYd }, { label: 'TD', val: t.rushTD }, { label: 'Rec', val: t.receptions });
  else if ((t.recYd || 0) > 200) stats.push({ label: 'Rec', val: t.receptions }, { label: 'Yds', val: t.recYd }, { label: 'TD', val: t.recTD });
  else if ((t.sacks || 0) > 1) stats.push({ label: 'Sck', val: t.sacks }, { label: 'Tkl', val: t.tackles }, { label: 'TFL', val: t.tacklesForLoss });
  else if ((t.interceptions || 0) > 0) stats.push({ label: 'Int', val: t.interceptions }, { label: 'PD', val: t.passesDefended }, { label: 'Tkl', val: t.tackles });
  else if ((t.fgMade || 0) > 0) stats.push({ label: 'FGM', val: t.fgMade }, { label: 'FGA', val: t.fgAttempts });
  else stats.push({ label: 'GP', val: t.gamesPlayed });

  return stats;
}

// ── Candidate Row ─────────────────────────────────────────────────────────────

function CandidateRow({ entry, rank, onPlayerClick }) {
  const badge = rankBadge(rank);
  const posColor = POS_COLORS[entry.pos] || 'var(--text-muted)';
  const stats = pickStatKeys(entry);

  return (
    <tr
      style={{ cursor: 'pointer' }}
      onClick={() => onPlayerClick && onPlayerClick(entry.playerId)}
    >
      <td style={{ width: 32, textAlign: 'center' }}>
        <span style={{
          display: 'inline-block', width: 22, height: 18,
          lineHeight: '18px', borderRadius: 3,
          background: badge.bg, color: badge.color,
          fontWeight: 800, fontSize: 10, textAlign: 'center',
        }}>
          {badge.label}
        </span>
      </td>
      <td style={{ width: 30, textAlign: 'center' }}>
        <span style={{
          display: 'inline-block', padding: '0 4px',
          borderRadius: 3, background: posColor + '22',
          color: posColor, fontWeight: 700, fontSize: 10,
        }}>
          {entry.pos}
        </span>
      </td>
      <td>
        <span className="player-link" style={{ fontWeight: 600, fontSize: 12 }}>
          {entry.name}
        </span>
        <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-subtle)' }}>
          {entry.teamAbbr ?? entry.teamId}
        </span>
      </td>
      {stats.map((s, i) => (
        <td key={i} style={{ textAlign: 'right', fontSize: 11, padding: '2px 5px' }}>
          <span style={{ fontSize: 9, color: 'var(--text-subtle)', marginRight: 3 }}>{s.label}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtStat(s.val)}</span>
        </td>
      ))}
      {/* Pad if fewer than 3 stat columns */}
      {Array.from({ length: Math.max(0, 3 - stats.length) }, (_, i) => (
        <td key={`pad-${i}`} />
      ))}
    </tr>
  );
}

// ── Award Category Panel ──────────────────────────────────────────────────────

function AwardPanel({ title, candidates = [], onPlayerClick }) {
  if (candidates.length === 0) {
    return (
      <div style={{ padding: 'var(--space-4)', color: 'var(--text-muted)', textAlign: 'center', fontSize: 12 }}>
        No data available — play more games.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table className="data-table" style={{ minWidth: 360 }}>
        <thead>
          <tr>
            <th style={{ width: 32, textAlign: 'center' }}>#</th>
            <th style={{ width: 30, textAlign: 'center' }}>Pos</th>
            <th style={{ textAlign: 'left' }}>Player</th>
            <th style={{ textAlign: 'right' }}>Stat 1</th>
            <th style={{ textAlign: 'right' }}>Stat 2</th>
            <th style={{ textAlign: 'right' }}>Stat 3</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => (
            <CandidateRow key={c.playerId ?? i} entry={c} rank={i} onPlayerClick={onPlayerClick} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── All-Pro Team Grid ─────────────────────────────────────────────────────────

function AllProTeam({ allPro = {}, onPlayerClick }) {
  const firstTeam  = allPro?.firstTeam  || {};
  const secondTeam = allPro?.secondTeam || {};

  if (Object.keys(firstTeam).length === 0 && Object.keys(secondTeam).length === 0) {
    return (
      <div style={{ padding: 'var(--space-6)', color: 'var(--text-muted)', textAlign: 'center', fontSize: 12 }}>
        All-Pro voting not yet available. Play more games.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
      {['1st Team', '2nd Team'].map((teamLabel, teamIdx) => {
        const team = teamIdx === 0 ? firstTeam : secondTeam;
        return (
          <div key={teamLabel}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '1px', color: teamIdx === 0 ? 'var(--accent)' : 'var(--text-muted)',
              marginBottom: 'var(--space-2)', borderBottom: `2px solid ${teamIdx === 0 ? 'var(--accent)' : 'var(--hairline)'}`,
              paddingBottom: 'var(--space-1)',
            }}>
              {teamLabel} All-Pro
            </div>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Pos</th>
                    <th style={{ textAlign: 'left' }}>Player</th>
                    <th style={{ textAlign: 'left' }}>Tm</th>
                    <th style={{ textAlign: 'right' }}>OVR</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_PRO_POSITIONS.map(({ pos, count }) => {
                    const entries = team[pos] ?? [];
                    return Array.from({ length: count }, (_, slotIdx) => {
                      const player = entries[slotIdx];
                      return (
                        <tr
                          key={`${pos}-${slotIdx}`}
                          style={{ cursor: player ? 'pointer' : 'default' }}
                          onClick={() => player && onPlayerClick && onPlayerClick(player.playerId)}
                        >
                          <td>
                            {slotIdx === 0 && (
                              <span style={{
                                display: 'inline-block', padding: '0 4px', borderRadius: 3,
                                background: (POS_COLORS[pos] || 'var(--text-muted)') + '22',
                                color: POS_COLORS[pos] || 'var(--text-muted)',
                                fontWeight: 700, fontSize: 10,
                              }}>
                                {pos}
                              </span>
                            )}
                          </td>
                          <td>
                            {player ? (
                              <span className="player-link" style={{ fontSize: 11, fontWeight: 600 }}>
                                {player.name}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>—</span>
                            )}
                          </td>
                          <td style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {player?.teamAbbr ?? ''}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {player ? (() => {
                              const c = player.ovr >= 90 ? '#34C759' : player.ovr >= 80 ? '#0A84FF' : 'var(--text)';
                              return (
                                <span style={{
                                  display: 'inline-block', minWidth: 22, padding: '0 2px', borderRadius: 3,
                                  background: c + '22', color: c, fontWeight: 800, fontSize: 10, textAlign: 'center',
                                }}>
                                  {player.ovr}
                                </span>
                              );
                            })() : ''}
                          </td>
                        </tr>
                      );
                    });
                  }).flat()}
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

export default function AwardRaces({ actions, onPlayerSelect }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('MVP');

  useEffect(() => {
    if (!actions) return;
    setLoading(true);
    actions.getAwardRaces()
      .then(resp => {
        setData(resp.payload ?? resp);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load award races:', err);
        setLoading(false);
      });
  }, [actions]);

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading award projections...
      </div>
    );
  }

  const awards = data?.awards ?? {};
  const allPro = data?.allPro ?? {};
  const week   = data?.week ?? 0;
  const year   = data?.year ?? '?';

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800 }}>
          {year} Award Races
        </h3>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Week {week}
        </span>
      </div>

      {/* ── Tab pills ── */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
        {AWARD_TABS.map(tab => (
          <button
            key={tab}
            className={`standings-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
            style={{ padding: '3px 10px', fontSize: 11 }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Content Card ── */}
      <div className="card" style={{ padding: 'var(--space-3)', overflow: 'hidden' }}>
        {activeTab === 'All-Pro' ? (
          <AllProTeam allPro={allPro} onPlayerClick={onPlayerSelect} />
        ) : (
          <AwardPanel
            title={activeTab}
            candidates={awards[activeTab.toLowerCase()] || awards[activeTab] || []}
            onPlayerClick={onPlayerSelect}
          />
        )}
      </div>
    </div>
  );
}
