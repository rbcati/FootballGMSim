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
    if (error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh',
          color: 'var(--danger)', gap: 'var(--space-4)', padding: 'var(--space-6)', textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem' }}>⚠️</div>
          <h2 style={{ fontSize: 'var(--text-xl)' }}>Initialization Failed</h2>
          <p style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: 'var(--space-2)' }}>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--space-6)' }}>

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 800, letterSpacing: '-0.5px' }}>
          Football GM
        </h1>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          Season {league.seasonId} · Week {league.week} · {league.phase}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={handleAdvanceWeek}
            disabled={busy || simulating}
          >
            {simulating
              ? `Simulating… ${simProgress}%`
              : busy
              ? 'Working…'
              : `Advance Week ${league.week}`}
          </button>
          <button className="btn" onClick={() => actions.save()} disabled={busy}>
            Save
          </button>
          <button className="btn btn-danger" onClick={handleReset} disabled={busy}>
            Reset
          </button>
        </div>
      </header>

      {/* ── Simulation progress bar ────────────────────────────────────── */}
      {simulating && (
        <div
          style={{
            height: 3,
            background: 'var(--hairline)',
            borderRadius: 'var(--radius-pill)',
            marginBottom: 'var(--space-4)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${simProgress}%`,
              background: 'var(--accent)',
              borderRadius: 'var(--radius-pill)',
              transition: 'width 0.15s ease',
            }}
          />
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          style={{
            background: 'var(--error-bg)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {error}
        </div>
      )}

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {notifications.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {notifications.map(n => (
            <div
              key={n.id}
              style={{
                background: n.level === 'warn' ? 'var(--warning-bg)' : 'var(--accent-muted)',
                border: `1px solid ${n.level === 'warn' ? 'var(--warning)' : 'var(--accent)'}`,
                color: n.level === 'warn' ? 'var(--warning-text)' : 'var(--text)',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 'var(--text-sm)',
              }}
            >
              <span>{n.message}</span>
              <button
                onClick={() => actions.dismissNotification(n.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 20,
                  lineHeight: 1,
                  color: 'inherit',
                  opacity: 0.7,
                  padding: '0 var(--space-1)',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Last results ticker ────────────────────────────────────────── */}
      {lastResults && lastResults.length > 0 && (
        <div
          style={{
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-6)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {lastResults.map((r, i) => (
            <span key={i} style={{ marginRight: 'var(--space-6)', color: 'var(--text-muted)' }}>
              {r.homeName}{' '}
              <strong style={{ color: 'var(--text)' }}>{r.homeScore}</strong>
              {' – '}
              <strong style={{ color: 'var(--text)' }}>{r.awayScore}</strong>
              {' '}{r.awayName}
            </span>
          ))}
        </div>
      )}

      {/* ── Main dashboard ─────────────────────────────────────────────── */}
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 'var(--space-4)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          border: '4px solid var(--hairline)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', margin: 0 }}>
        {message}
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StartScreen({ onNewLeague, hasSave, busy }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 'var(--space-5)',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 'var(--text-4xl)',
          fontWeight: 800,
          letterSpacing: '-1px',
          color: 'var(--text)',
        }}
      >
        Football GM
      </h1>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-base)' }}>
        The offline single-player football simulation.
      </p>
      {hasSave && (
        <p style={{ color: 'var(--warning)', fontSize: 'var(--text-sm)', margin: 0 }}>
          Existing save found but could not be loaded.
        </p>
      )}
      <button
        className="btn btn-primary"
        onClick={onNewLeague}
        disabled={busy}
        style={{ fontSize: 'var(--text-lg)', padding: 'var(--space-4) var(--space-10)' }}
      >
        {busy ? 'Generating league…' : 'New League'}
      </button>
    </div>
  );
}
