/**
 * App.jsx  —  Root UI component
 *
 * Rules:
 *  - Owns the worker hook. No other component creates workers.
 *  - Never stores the full league blob in component state.
 *  - All mutations go through actions.*, which call the worker.
 *  - Renders only from the view-model slices the worker sends.
 */

import React, { useEffect, useCallback } from 'react';
import { useWorker }       from './hooks/useWorker.js';
import LeagueDashboard     from './components/LeagueDashboard.jsx';
import { toWorker }        from '../worker/protocol.js';

// Default team set for new-league generation
const DEFAULT_TEAMS = (() => {
  const divs  = ['North', 'South', 'East', 'West'];
  const confs = ['AFC', 'NFC'];
  const CITIES = [
    'Buffalo', 'Miami', 'New England', 'New York Jets',
    'Baltimore', 'Cincinnati', 'Cleveland', 'Pittsburgh',
    'Houston', 'Indianapolis', 'Jacksonville', 'Tennessee',
    'Denver', 'Kansas City', 'Las Vegas', 'Los Angeles Chargers',
    'Dallas', 'New York Giants', 'Philadelphia', 'Washington',
    'Chicago', 'Detroit', 'Green Bay', 'Minnesota',
    'Atlanta', 'Carolina', 'New Orleans', 'Tampa Bay',
    'Arizona', 'Los Angeles Rams', 'San Francisco', 'Seattle',
  ];
  return CITIES.map((name, i) => ({
    id:   i,
    name,
    abbr: name.replace(/\s+/g, '').slice(0, 3).toUpperCase(),
    conf: confs[i < 16 ? 0 : 1],
    div:  divs[Math.floor(i / 4) % 4],
  }));
})();

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { state, actions } = useWorker();
  const {
    busy, simulating, simProgress,
    workerReady, hasSave,
    league, lastResults,
    error, notifications,
  } = state;

  // Auto-save when user navigates away
  useEffect(() => {
    const handler = () => { if (league) actions.save(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [league, actions.save]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNewLeague = useCallback(() => {
    actions.newLeague(DEFAULT_TEAMS, { year: 2025, settings: {} });
  }, [actions]);

  const handleAdvanceWeek = useCallback(() => {
    if (!busy && !simulating) actions.advanceWeek();
  }, [busy, simulating, actions]);

  const handleReset = useCallback(() => {
    if (window.confirm('Reset your save? This cannot be undone.')) {
      actions.reset();
    }
  }, [actions]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!workerReady) {
    return <Loading message="Starting game engine…" />;
  }

  if (!league) {
    return (
      <StartScreen
        onNewLeague={handleNewLeague}
        hasSave={hasSave}
        busy={busy}
      />
    );
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto' }}>
      {/* Top bar */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Football GM</h1>
        <span style={{ color: '#666', fontSize: 13 }}>
          Season {league.seasonId} · Week {league.week} · {league.phase}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={handleAdvanceWeek}
            disabled={busy || simulating}
            style={btnStyle('primary')}
          >
            {simulating
              ? `Simulating… ${simProgress}%`
              : busy
              ? 'Working…'
              : `Advance Week ${league.week}`}
          </button>
          <button onClick={() => actions.save()} disabled={busy} style={btnStyle('secondary')}>
            Save
          </button>
          <button onClick={handleReset} disabled={busy} style={btnStyle('danger')}>
            Reset
          </button>
        </div>
      </header>

      {/* Progress bar */}
      {simulating && (
        <div style={{ height: 4, background: '#e0e0e0', borderRadius: 2, marginBottom: 12 }}>
          <div style={{
            height: '100%', width: `${simProgress}%`,
            background: '#1976d2', borderRadius: 2,
            transition: 'width 0.15s ease',
          }} />
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div role="alert" style={{
          background: '#ffebee', border: '1px solid #e57373',
          color: '#c62828', padding: '10px 14px', borderRadius: 4, marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {/* Notifications */}
      {notifications.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {notifications.map(n => (
            <div key={n.id} style={{
              background: n.level === 'warn' ? '#fff3e0' : '#e3f2fd',
              border: `1px solid ${n.level === 'warn' ? '#ffb300' : '#42a5f5'}`,
              padding: '8px 12px', borderRadius: 4,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{n.message}</span>
              <button
                onClick={() => actions.dismissNotification(n.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Last week results ticker */}
      {lastResults && lastResults.length > 0 && (
        <div style={{
          overflowX: 'auto', whiteSpace: 'nowrap',
          background: '#f5f5f5', padding: '8px 12px',
          borderRadius: 4, marginBottom: 16, fontSize: 13,
        }}>
          {lastResults.map((r, i) => (
            <span key={i} style={{ marginRight: 24 }}>
              {r.homeName} <strong>{r.homeScore}</strong>
              {' – '}
              <strong>{r.awayScore}</strong> {r.awayName}
            </span>
          ))}
        </div>
      )}

      {/* Main dashboard */}
      <LeagueDashboard
        league={league}
        busy={busy}
        actions={actions}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Loading({ message }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 16,
    }}>
      <div style={{
        width: 40, height: 40, border: '4px solid #e0e0e0',
        borderTopColor: '#1976d2', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#666', fontSize: 15 }}>{message}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StartScreen({ onNewLeague, hasSave, busy }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 20, fontFamily: 'system-ui, sans-serif',
    }}>
      <h1 style={{ margin: 0, fontSize: 36 }}>Football GM</h1>
      <p style={{ margin: 0, color: '#555' }}>The offline single-player football simulation.</p>
      {hasSave && (
        <p style={{ color: '#e65100', fontSize: 13 }}>
          Existing save found but could not be loaded.
        </p>
      )}
      <button
        onClick={onNewLeague}
        disabled={busy}
        style={btnStyle('primary', true)}
      >
        {busy ? 'Generating league…' : 'New League'}
      </button>
    </div>
  );
}

// ── Styling helpers ───────────────────────────────────────────────────────────

function btnStyle(variant, large = false) {
  const base = {
    padding: large ? '14px 32px' : '8px 16px',
    fontSize: large ? 18 : 14,
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'opacity 0.15s',
  };
  const variants = {
    primary:   { background: '#1976d2', color: '#fff' },
    secondary: { background: '#e0e0e0', color: '#333' },
    danger:    { background: '#e53935', color: '#fff' },
  };
  return { ...base, ...(variants[variant] ?? variants.secondary) };
}
