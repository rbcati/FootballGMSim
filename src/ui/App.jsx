/**
 * App.jsx  —  Root UI component
 *
 * Rules:
 *  - Owns the worker hook. No other component creates workers.
 *  - Never stores the full league blob in component state.
 *  - All mutations go through actions.*, which call the worker.
 *  - Renders only from the view-model slices the worker sends.
 */

import React, { useEffect, useCallback, useRef, useState, Component } from 'react';
import { useWorker }       from './hooks/useWorker.js';
import LeagueDashboard     from './components/LeagueDashboard.jsx';
import LiveGame            from './components/LiveGame.jsx';
import SaveManager         from './components/SaveManager.jsx';
import NewLeagueSetup      from './components/NewLeagueSetup.jsx';
import { toWorker }        from '../worker/protocol.js';
import { DEFAULT_TEAMS }   from '../data/default-teams.js';

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { state, actions } = useWorker();
  const {
    busy, simulating, simProgress,
    workerReady, hasSave,
    league, lastResults, gameEvents,
    error, notifications,
  } = state;

  const [activeView, setActiveView] = useState('saves');

  // Local guard to prevent rapid-click double submission before 'busy' propagates
  const advancingRef = useRef(false);

  // Reset guard when busy goes back to false
  useEffect(() => {
    if (!busy) advancingRef.current = false;
  }, [busy]);

  // ── Service-Worker update detection ───────────────────────────────────────
  const [swUpdateReady, setSwUpdateReady] = useState(false);
  const swRegRef = useRef(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return;
      swRegRef.current = reg;

      // A waiting SW already exists (e.g. page was already open during install)
      if (reg.waiting) setSwUpdateReady(true);

      // New SW found while page is open
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setSwUpdateReady(true);
          }
        });
      });
    });

    // SW broadcasts UPDATE_AVAILABLE after evicting old caches (see sw.js)
    const onMessage = (event) => {
      if (event.data?.type === 'UPDATE_AVAILABLE') setSwUpdateReady(true);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    // Reload automatically after the new SW takes control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  const handleSwUpdate = () => {
    const reg = swRegRef.current;
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  // Auto-save when user navigates away
  useEffect(() => {
    const handler = () => { if (league) actions.save(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [league, actions.save]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAdvanceWeek = useCallback(() => {
    if (busy || simulating || advancingRef.current) return;

    if (['regular', 'playoffs', 'preseason'].includes(league.phase)) {
      advancingRef.current = true;
      actions.advanceWeek();
    } else if (['offseason_resign', 'offseason'].includes(league.phase)) {
      advancingRef.current = true;
      actions.advanceOffseason();
    } else if (league.phase === 'free_agency') {
      advancingRef.current = true;
      actions.advanceFreeAgencyDay();
    } else if (league.phase === 'draft') {
      // Refresh draft state so the LeagueDashboard auto-navigates to the Draft tab.
      // Note: getDraftState is silent, so busy won't toggle. We don't lock for this.
      actions.getDraftState();
    }
  }, [busy, simulating, actions, league]);

  const handleReset = useCallback(() => {
    if (window.confirm('Reset/Delete your active save? This cannot be undone.')) {
      actions.reset();
    }
  }, [actions]);

  // Expose state and actions to window for E2E testing
  useEffect(() => {
    window.state = state;
    window.gameController = {
      ...actions,
      startNewLeague: () => actions.newLeague(DEFAULT_TEAMS, { userTeamId: 0, name: 'Test League' }),
      advanceWeek: handleAdvanceWeek,
    };
    window.handleGlobalAdvance = handleAdvanceWeek;
  }, [state, actions, handleAdvanceWeek]);

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
    if (activeView === 'new_league') {
      return (
        <ErrorBoundary>
          <NewLeagueSetup actions={actions} onCancel={() => setActiveView('saves')} />
        </ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary>
        <SaveManager actions={actions} onCreate={() => setActiveView('new_league')} />
      </ErrorBoundary>
    );
  }

  // Validate that the league arriving from the worker is fully hydrated before
  // rendering the dashboard. A partially-hydrated league (e.g. loaded from IDB
  // before the schedule is written) causes "Season: " / "Week: " to render blank.
  // Note: schedule is NOT required here — the Schedule tab handles a missing
  // schedule gracefully so we don't lock the user in an infinite spinner when
  // loading a save whose schedule was stored in an older format.
  const leagueReady = league &&
    league.seasonId != null &&
    typeof league.week === 'number' &&
    Array.isArray(league.teams) &&
    league.teams.length > 0;

  if (league && !leagueReady) {
    return <Loading message="Initializing league data…" />;
  }

  const userTeam = (leagueReady ? league : null)?.teams?.find(t => t.id === league.userTeamId);
  const isCutdownRequired = league.phase === 'preseason' && (userTeam?.rosterCount ?? 0) > 53;

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
          {league.year ?? league.seasonId} Season
          {' · '}
          {league.week ? `Week ${league.week}` : 'Offseason'}
          {' · '}
          {league.phase}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={handleAdvanceWeek}
            disabled={busy || simulating || isCutdownRequired}
            title={isCutdownRequired ? "You must cut your roster to 53 players before advancing." : ""}
            style={isCutdownRequired ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
          >
            {simulating
              ? `Simulating… ${simProgress}%`
              : busy
              ? 'Working…'
              : isCutdownRequired
              ? `Cut to 53 (${userTeam?.rosterCount})`
              : league.phase === 'preseason'
              ? 'Start Regular Season'
              : ['offseason_resign', 'offseason'].includes(league.phase)
              ? 'Advance Offseason'
              : league.phase === 'free_agency'
              ? 'Next FA Day'
              : league.phase === 'draft'
              ? 'Draft Active'
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

      {/* ── SW Update Available banner ─────────────────────────────────── */}
      {swUpdateReady && (
        <div
          role="alert"
          style={{
            background: 'var(--accent-muted)',
            border: '1px solid var(--accent)',
            color: 'var(--text)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--text-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
          }}
        >
          <span style={{ flex: 1 }}>
            A new version of Football GM is available.
          </span>
          <button className="btn btn-primary" style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-2) var(--space-4)' }} onClick={handleSwUpdate}>
            Update &amp; Reload
          </button>
          <button
            onClick={() => setSwUpdateReady(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--text-muted)', padding: '0 var(--space-1)' }}
          >
            ×
          </button>
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

      {/* ── Live game viewer (visible during simulation + results) ────── */}
      <LiveGame
        simulating={simulating}
        simProgress={simProgress}
        league={league}
        lastResults={lastResults}
        gameEvents={gameEvents}
      />

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
        league={leagueReady ? league : null}
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
