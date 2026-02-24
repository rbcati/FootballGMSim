/**
 * BoxScore.jsx
 *
 * ZenGM-style post-game box score modal.
 *
 * Usage:
 *   <BoxScore gameId="s1_w3_13_0" actions={actions} onClose={() => ...} />
 *
 * On mount it calls actions.getBoxScore(gameId) and renders the result once
 * the worker responds.
 *
 * Layout:
 *   ┌─ Header: away @ home — Final score ──────────────────────────────────┐
 *   │ Team summary stats (Total Yds, Pass Yds, Rush Yds, TOs, 1st Downs)  │
 *   ├─ Tabs: Passing | Rushing | Receiving | Defense ──────────────────────┤
 *   │ Player stat table for selected tab                                   │
 *   └──────────────────────────────────────────────────────────────────────┘
 */

import React, { useState, useEffect, useMemo } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function teamColor(abbr = '') {
  const palette = [
    '#0A84FF', '#34C759', '#FF9F0A', '#FF453A',
    '#5E5CE6', '#64D2FF', '#FFD60A', '#30D158',
    '#FF6961', '#AEC6CF', '#FF6B35', '#B4A0E5',
  ];
  let hash = 0;
  for (let i = 0; i < abbr.length; i++) hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function stat(v, decimals = 0) {
  if (v == null || v === 0) return '—';
  return typeof v === 'number' ? (decimals ? v.toFixed(decimals) : String(v)) : String(v);
}

function pct(comp, att) {
  if (!att) return '—';
  return `${((comp / att) * 100).toFixed(0)}%`;
}

// ── Derive team-level summary stats from per-player boxScore side ─────────────

function deriveTeamStats(side) {
  if (!side) return {};
  const players = Object.values(side);
  const sum = (key) => players.reduce((s, p) => s + (p?.stats?.[key] ?? 0), 0);

  return {
    passYd:       sum('passYd'),
    rushYd:       sum('rushYd'),
    totalYd:      sum('passYd') + sum('rushYd'),
    passAtt:      sum('passAtt'),
    passComp:     sum('passComp'),
    passTD:       sum('passTD'),
    rushAtt:      sum('rushAtt'),
    rushTD:       sum('rushTD'),
    recTD:        sum('recTD'),
    interceptions:sum('interceptions'),
    fumbles:      sum('fumbles'),
    turnovers:    sum('interceptions') + sum('fumbles'),
    sacks:        sum('sacks'),
    firstDowns:   0,               // not tracked in current sim stats
  };
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title }) {
  return (
    <div style={{
      padding: 'var(--space-2) var(--space-4)',
      background: 'var(--surface-strong)',
      borderBottom: '1px solid var(--hairline)',
      fontSize: 'var(--text-xs)',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '1px',
      color: 'var(--text-muted)',
    }}>
      {title}
    </div>
  );
}

// ── Team summary table ────────────────────────────────────────────────────────

function TeamSummaryTable({ homeStats, awayStats, homeAbbr, awayAbbr }) {
  const rows = [
    { label: 'Total Yards',   h: homeStats.totalYd,      a: awayStats.totalYd },
    { label: 'Passing Yards', h: homeStats.passYd,        a: awayStats.passYd },
    { label: 'Rushing Yards', h: homeStats.rushYd,        a: awayStats.rushYd },
    { label: 'Turnovers',     h: homeStats.turnovers,     a: awayStats.turnovers },
    { label: 'Sacks',         h: homeStats.sacks,         a: awayStats.sacks },
    { label: 'Pass Att/Comp', h: `${homeStats.passComp}/${homeStats.passAtt}`, a: `${awayStats.passComp}/${awayStats.passAtt}` },
  ];

  return (
    <div className="table-wrapper">
      <table className="standings-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ width: '40%', paddingLeft: 'var(--space-4)' }}>{awayAbbr}</th>
            <th style={{ textAlign: 'center' }}>Stat</th>
            <th style={{ width: '40%', textAlign: 'right', paddingRight: 'var(--space-4)' }}>{homeAbbr}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, h, a }) => (
            <tr key={label}>
              <td style={{ paddingLeft: 'var(--space-4)', fontWeight: 600, color: 'var(--text)' }}>
                {typeof a === 'number' ? stat(a) : (a === '0/0' ? '—' : a)}
              </td>
              <td style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {label}
              </td>
              <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)', fontWeight: 600, color: 'var(--text)' }}>
                {typeof h === 'number' ? stat(h) : (h === '0/0' ? '—' : h)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Player stat table ─────────────────────────────────────────────────────────

function PlayerTable({ columns, homeRows, awayRows, homeAbbr, awayAbbr }) {
  const renderTable = (rows, teamAbbr) => {
    if (!rows || rows.length === 0) return null;
    return (
      <div style={{ marginBottom: 'var(--space-2)' }}>
        <div style={{
          padding: 'var(--space-2) var(--space-4)',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--hairline)',
          fontSize: 'var(--text-xs)', fontWeight: 700,
          color: teamColor(teamAbbr),
          letterSpacing: '0.5px',
        }}>
          {teamAbbr}
        </div>
        <div className="table-wrapper">
          <table className="standings-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 'var(--space-4)', width: '30%' }}>Player</th>
                {columns.map(c => (
                  <th key={c.key} style={{ textAlign: 'center', minWidth: c.minWidth ?? 40 }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td style={{ paddingLeft: 'var(--space-4)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 'var(--text-sm)' }}>
                      {row.name}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>{row.pos}</div>
                  </td>
                  {columns.map(c => (
                    <td key={c.key} style={{ textAlign: 'center', color: 'var(--text)' }}>
                      {c.format ? c.format(row) : stat(row.stats?.[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      {renderTable(awayRows, awayAbbr)}
      {renderTable(homeRows, homeAbbr)}
      {!awayRows?.length && !homeRows?.length && (
        <p style={{ color: 'var(--text-muted)', padding: 'var(--space-4)', textAlign: 'center', fontSize: 'var(--text-sm)', margin: 0 }}>
          No data available.
        </p>
      )}
    </div>
  );
}

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = ['Passing', 'Rushing', 'Receiving', 'Defense'];

const TAB_CONFIG = {
  Passing: {
    positions: ['QB'],
    sort: (a, b) => (b.stats?.passYd ?? 0) - (a.stats?.passYd ?? 0),
    columns: [
      { key: 'passComp',   label: 'CMP', minWidth: 36 },
      { key: 'passAtt',    label: 'ATT', minWidth: 36 },
      { key: 'passYd',     label: 'YDS', minWidth: 48 },
      { key: 'passTD',     label: 'TD',  minWidth: 32 },
      { key: 'interceptions', label: 'INT', minWidth: 32 },
      { key: '_cmp_pct',   label: 'PCT', minWidth: 44,
        format: (r) => pct(r.stats?.passComp, r.stats?.passAtt) },
      { key: 'sacks',      label: 'SCK', minWidth: 36 },
    ],
  },
  Rushing: {
    positions: ['QB', 'RB', 'FB', 'WR', 'TE'],
    sort: (a, b) => (b.stats?.rushYd ?? 0) - (a.stats?.rushYd ?? 0),
    minStatKey: 'rushAtt',
    columns: [
      { key: 'rushAtt', label: 'ATT', minWidth: 36 },
      { key: 'rushYd',  label: 'YDS', minWidth: 48 },
      { key: 'rushTD',  label: 'TD',  minWidth: 32 },
      { key: '_ypc',    label: 'YPC', minWidth: 44,
        format: (r) => r.stats?.rushAtt ? (r.stats.rushYd / r.stats.rushAtt).toFixed(1) : '—' },
      { key: 'fumbles', label: 'FUM', minWidth: 36 },
    ],
  },
  Receiving: {
    positions: ['WR', 'TE', 'RB', 'FB'],
    sort: (a, b) => (b.stats?.recYd ?? 0) - (a.stats?.recYd ?? 0),
    minStatKey: 'targets',
    columns: [
      { key: 'targets',    label: 'TGT', minWidth: 36 },
      { key: 'receptions', label: 'REC', minWidth: 36 },
      { key: 'recYd',      label: 'YDS', minWidth: 48 },
      { key: 'recTD',      label: 'TD',  minWidth: 32 },
      { key: 'drops',      label: 'DRP', minWidth: 36 },
      { key: 'yardsAfterCatch', label: 'YAC', minWidth: 44 },
    ],
  },
  Defense: {
    positions: ['DE', 'DT', 'LB', 'CB', 'S', 'DL', 'DB'],
    sort: (a, b) => (b.stats?.tackles ?? 0) - (a.stats?.tackles ?? 0),
    minStatKey: 'tackles',
    columns: [
      { key: 'tackles',         label: 'TKL', minWidth: 36 },
      { key: 'tacklesForLoss',  label: 'TFL', minWidth: 36 },
      { key: 'sacks',           label: 'SCK', minWidth: 36 },
      { key: 'passesDefended',  label: 'PD',  minWidth: 36 },
      { key: 'forcedFumbles',   label: 'FF',  minWidth: 36 },
      { key: 'interceptions',   label: 'INT', minWidth: 36 },
    ],
  },
};

function filterAndSortPlayers(side, tabKey) {
  if (!side) return [];
  const cfg   = TAB_CONFIG[tabKey];
  const posSet = new Set(cfg.positions);

  return Object.values(side)
    .filter(p => {
      if (!posSet.has(p.pos)) return false;
      if (cfg.minStatKey) return (p.stats?.[cfg.minStatKey] ?? 0) > 0;
      return true;
    })
    .sort(cfg.sort)
    .slice(0, 10);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BoxScore({ gameId, actions, onClose }) {
  const [game, setGame]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [activeTab, setActiveTab] = useState('Passing');

  // Fetch from worker on mount
  useEffect(() => {
    if (!gameId || !actions?.getBoxScore) return;
    setLoading(true);
    setError(null);
    actions.getBoxScore(gameId)
      .then(result => {
        const g = result?.payload?.game ?? null;
        if (!g) {
          setError(result?.payload?.error ?? 'Game data not available.');
        } else {
          setGame(g);
        }
      })
      .catch(err => setError(err.message ?? 'Failed to load box score.'))
      .finally(() => setLoading(false));
  }, [gameId]);

  // Pre-computed team stats
  const homeStats = useMemo(() => deriveTeamStats(game?.stats?.home), [game]);
  const awayStats  = useMemo(() => deriveTeamStats(game?.stats?.away),  [game]);

  // Player row arrays
  const homeRows = useMemo(() => filterAndSortPlayers(game?.stats?.home, activeTab), [game, activeTab]);
  const awayRows  = useMemo(() => filterAndSortPlayers(game?.stats?.away,  activeTab), [game, activeTab]);

  const homeAbbr = game?.homeAbbr ?? '???';
  const awayAbbr  = game?.awayAbbr  ?? '???';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* ── Modal ── */}
      <div style={{
        position: 'fixed', top: '5vh', left: '50%', transform: 'translateX(-50%)',
        width: 'min(96vw, 820px)', maxHeight: '90vh',
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xl, 0 24px 48px rgba(0,0,0,0.5))',
        display: 'flex', flexDirection: 'column',
        zIndex: 901, overflow: 'hidden',
      }}>
        {/* ── Modal header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
          padding: 'var(--space-4) var(--space-5)',
          background: 'var(--surface-strong)',
          borderBottom: '1px solid var(--hairline)',
          flexShrink: 0,
        }}>
          {game ? (
            <>
              {/* Away score block */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: `${teamColor(awayAbbr)}22`,
                  border: `2px solid ${teamColor(awayAbbr)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 12, color: teamColor(awayAbbr),
                }}>
                  {awayAbbr}
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>{game.awayName}</div>
                  <div style={{
                    fontSize: 'var(--text-2xl)', fontWeight: 800, lineHeight: 1,
                    color: game.awayScore > game.homeScore ? 'var(--text)' : 'var(--text-muted)',
                  }}>
                    {game.awayScore}
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', fontWeight: 700, marginBottom: 4 }}>
                  FINAL
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
                  Week {game.week}
                </div>
              </div>

              {/* Home score block */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>{game.homeName}</div>
                  <div style={{
                    fontSize: 'var(--text-2xl)', fontWeight: 800, lineHeight: 1, textAlign: 'right',
                    color: game.homeScore > game.awayScore ? 'var(--text)' : 'var(--text-muted)',
                  }}>
                    {game.homeScore}
                  </div>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: `${teamColor(homeAbbr)}22`,
                  border: `2px solid ${teamColor(homeAbbr)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 12, color: teamColor(homeAbbr),
                }}>
                  {homeAbbr}
                </div>
              </div>
            </>
          ) : (
            <span style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text)' }}>
              Box Score
            </span>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 22, color: 'var(--text-muted)',
              padding: '0 var(--space-1)', lineHeight: 1, flexShrink: 0,
            }}
            aria-label="Close box score"
          >
            ×
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading box score…
            </div>
          )}

          {!loading && error && (
            <div style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              color: 'var(--danger)',
              background: 'rgba(255,69,58,0.07)',
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 'var(--space-3)' }}>⚠</div>
              <div style={{ fontWeight: 700 }}>{error}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
                Box score data may not be available for older games.
              </div>
            </div>
          )}

          {!loading && game && (
            <>
              {/* Team stats summary */}
              <SectionHeader title="Team Stats" />
              <TeamSummaryTable
                homeStats={homeStats}
                awayStats={awayStats}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
              />

              {/* Player stats by category */}
              <div style={{
                display: 'flex', gap: 0,
                borderTop: '1px solid var(--hairline)',
                borderBottom: '1px solid var(--hairline)',
                marginTop: 'var(--space-2)',
                overflowX: 'auto',
              }}>
                {TABS.map(tab => (
                  <button
                    key={tab}
                    className={`standings-tab${activeTab === tab ? ' active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      borderRadius: 0,
                      borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                      margin: 0,
                      flexShrink: 0,
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <PlayerTable
                columns={TAB_CONFIG[activeTab].columns}
                homeRows={homeRows}
                awayRows={awayRows}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
              />

              {/* No stats warning */}
              {!game.stats && (
                <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  Detailed player stats were not recorded for this game.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
