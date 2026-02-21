/**
 * App.jsx  —  Root UI component
 *
 * Rules:
 *  - Owns the worker hook. No other component creates workers.
 *  - Never stores the full league blob in component state.
 *  - All mutations go through actions.*, which call the worker.
 *  - Renders only from the view-model slices the worker sends.
 */

import React, { useEffect, useCallback, Component } from 'react';
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

// ── ErrorBoundary ─────────────────────────────────────────────────────────────
// Mirrors the behaviour of legacy/error-boundary.js but as a proper React class
// so it catches render-phase exceptions that worker error messages cannot.

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Render crash caught:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error } = this.state;
    const stack = error?.stack ?? String(error);

    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.8)', display: 'flex',
        justifyContent: 'center', alignItems: 'center',
        zIndex: 10000, fontFamily: 'sans-serif', color: 'white',
      }}>
        <div style={{
          background: '#1f2937', padding: '2rem', borderRadius: 8,
          maxWidth: 600, width: '90%', border: '1px solid #dc2626',
          boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
        }}>
          <h2 style={{ color: '#ef4444', marginTop: 0 }}>Something went wrong</h2>
          <p style={{ margin: '0 0 1rem' }}>
            A render error occurred. Copy the details below then reload.
          </p>
          <details style={{
            margin: '0 0 1rem', background: '#111827', padding: '1rem',
            borderRadius: 4, overflow: 'auto', maxHeight: 200,
            whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85em',
          }}>
            <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
              Error Details
            </summary>
            {stack}
          </details>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                background: 'transparent', border: '1px solid #4b5563',
                color: '#9ca3af', padding: '0.5rem 1rem', borderRadius: 4, cursor: 'pointer',
              }}
            >
              Dismiss (Risk)
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#2563eb', color: 'white', border: 'none',
                padding: '0.5rem 1rem', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
