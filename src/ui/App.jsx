/**
 * App.jsx  —  Root UI component
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * Mobile UX Improvements Summary
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This update makes Football GM Sim surpass both Zen GM Football and Pocket GM 3:
 *
 * vs Zen GM (play.football-gm.com):
 *  - Fluid mobile layout: all panels stack vertically on <768px (no horizontal overflow)
 *  - 44px minimum touch targets everywhere (Zen GM has cramped 28-32px buttons)
 *  - Bottom tab bar for instant navigation (Zen GM relies on desktop-style sidebar)
 *  - Responsive charts & avatars that scale to viewport (Zen GM uses fixed sizes)
 *
 * vs Pocket GM 3 (iOS):
 *  - System-preference dark mode with high-contrast colors & glass morphism
 *  - Color-coded position badges on player avatars (like Pocket GM's attribute colors)
 *  - Smooth CSS transitions with hardware-accelerated transforms
 *  - Safe-area-inset support for notched phones (matches native iOS feel)
 *  - Buttery scroll with -webkit-overflow-scrolling: touch everywhere
 *
 * Key technical changes:
 *  - TailwindCSS v4 added via @tailwindcss/vite plugin (zero-config)
 *  - Mobile-first responsive classes alongside legacy CSS custom properties
 *  - MobileNav component: bottom tab bar + hamburger slide-in overlay
 *  - ResponsivePlayerAvatar: scales 48→64px on mobile, position color badges
 *  - All worker.js postMessage flows (injuryEvent, gamecast, etc.) untouched
 *  - IndexedDB saves, hard salary cap, drag-and-drop depth charts preserved
 *  - LiveGameViewer fully responsive with stacked scorebug on mobile
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
import GameSimulation      from './components/GameSimulation.jsx';
import PostGameScreen      from './components/PostGameScreen.jsx';
import SaveManager         from './components/SaveManager.jsx';
import NewLeagueSetup      from './components/NewLeagueSetup.jsx';
import { toWorker }        from '../worker/protocol.js';
import { DEFAULT_TEAMS }   from '../data/default-teams.js';
import MilestoneModal      from './components/MilestoneModal.jsx';
import ThemeToggle         from './components/ThemeToggle.jsx';

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { state, actions } = useWorker();
  const {
    busy, simulating, simProgress,
    workerReady, hasSave,
    league, lastResults, gameEvents,
    error, notifications,
    batchSim,
    promptUserGame,
    userGameLogs,
    userGameLiveStats,
  } = state;

  const [activeView, setActiveView] = useState('saves');

  // Post-game result shown after GameSimulation completes (before advancing week)
  const [postGameResult, setPostGameResult] = useState(null);

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

  const handleSimToPhase = useCallback((targetPhase) => {
    if (busy || simulating || advancingRef.current || batchSim) return;
    advancingRef.current = true;
    actions.simToPhase(targetPhase);
  }, [busy, simulating, batchSim, actions]);

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

  // ── Advance button label ──────────────────────────────────────────────────
  const getAdvanceLabel = () => {
    if (batchSim) return `Simulating…`;
    if (simulating) return `Simulating ${simProgress}%`;
    if (busy) return 'Working…';
    if (!league) return 'Advance';
    const isCutdownRequired = league.phase === 'preseason' && ((league?.teams?.find(t => t.id === league.userTeamId)?.rosterCount ?? 0) > 53);
    if (isCutdownRequired) return 'Cut to 53';
    if (league.phase === 'preseason') return '▶ Start Season';
    if (['offseason_resign', 'offseason'].includes(league.phase)) return '▶ Advance';
    if (league.phase === 'free_agency') return '▶ Next FA Day';
    if (league.phase === 'draft') return '▶ Draft';
    if (league.phase === 'playoffs') {
      const roundNames = { 19: 'Wild Card', 20: 'Divisional', 21: 'Conf. Champ', 22: 'Super Bowl' };
      return `▶ ${roundNames[league.week] || `Playoffs Wk ${league.week}`}`;
    }
    return `▶ Sim Week ${league.week}`;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!workerReady) {
    if (error) {
      return (
        <div className="app-error-screen fade-in">
          <div className="app-error-icon">⚠️</div>
          <h2 className="app-error-title">Initialization Failed</h2>
          <p className="app-error-detail">{error}</p>
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
          <div className="view fade-in" key="new_league">
            <NewLeagueSetup actions={actions} onCancel={() => setActiveView('saves')} />
          </div>
        </ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary>
        <div className="view fade-in" key="save_manager">
          <SaveManager actions={actions} onCreate={() => setActiveView('new_league')} />
        </div>
      </ErrorBoundary>
    );
  }

  // Validate that the league arriving from the worker is fully hydrated before
  // rendering the dashboard.
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

  const isPostseason = league?.phase === 'playoffs';

  const themeClass = league?.phase ? `theme-${league.phase}` : 'theme-default';

  return (
    <div className={`app-shell fade-in ${isPostseason ? 'postseason' : ''} ${themeClass}`} key="league_dashboard">

      {/* Phase-based Theming */}
      <style>{`
        .theme-regular {
          --bg: #111;
          --surface: #1e1e2e;
        }
        .theme-playoffs {
          --bg: #0a0a0a;
          --surface: #1a1a1a;
          background: radial-gradient(circle at top, #201800 0%, var(--bg) 100%);
        }
        .theme-draft {
          --bg: #050510;
          --surface: #121222;
          --accent: #ffb703;
          background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
        }
      `}</style>

      {/* Postseason glow bar */}
      {isPostseason && <div className="postseason-glow" />}

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title">Football GM</h1>
          <div className="app-season-info">
            <span className="app-season-year">{league.year ?? league.seasonId}</span>
            <span className="app-season-sep">&middot;</span>
            <span>{league.week ? `Week ${league.week}` : 'Offseason'}</span>
            <span className="app-season-sep">&middot;</span>
            <span className="app-phase-badge">{
              league.phase === 'regular' ? 'Regular Season' :
              league.phase === 'playoffs' ? 'Playoffs' :
              league.phase === 'preseason' ? 'Preseason' :
              league.phase === 'offseason_resign' ? 'Re-Signing' :
              league.phase === 'offseason' ? 'Offseason' :
              league.phase === 'free_agency' ? 'Free Agency' :
              league.phase === 'draft' ? 'Draft' :
              league.phase
            }</span>
            {userTeam && (
              <>
                <span className="app-season-sep">&middot;</span>
                <span className="app-user-record">
                  {userTeam.abbr} ({userTeam.wins ?? 0}-{userTeam.losses ?? 0})
                </span>
              </>
            )}
          </div>
        </div>

        <div className="app-header-actions">
          <ThemeToggle compact />
          <button
            className={`btn btn-primary app-advance-btn ${(busy || simulating || batchSim) ? "pulsing-btn" : ""}`}
            onClick={handleAdvanceWeek}
            disabled={busy || simulating || isCutdownRequired || !!batchSim || !!promptUserGame}
            title={isCutdownRequired ? "You must cut your roster to 53 players before advancing." : ""}
          >
            {getAdvanceLabel()}
          </button>
          {/* Sim to... buttons — show during regular season and playoffs */}
          {league.phase === 'regular' && !batchSim && (
            <>
              <button
                className="btn app-sim-btn"
                onClick={() => handleSimToPhase('playoffs')}
                disabled={busy || simulating}
                title="Simulate all remaining regular season weeks"
              >
                <span className="app-sim-btn-full">Sim to Playoffs</span>
                <span className="app-sim-btn-short">→ PO</span>
              </button>
              <button
                className="btn app-sim-btn"
                onClick={() => handleSimToPhase('offseason')}
                disabled={busy || simulating}
                title="Simulate through playoffs to offseason"
              >
                <span className="app-sim-btn-full">Sim to Offseason</span>
                <span className="app-sim-btn-short">→ Off</span>
              </button>
            </>
          )}
          {league.phase === 'playoffs' && !batchSim && (
            <button
              className="btn app-sim-btn"
              onClick={() => handleSimToPhase('offseason')}
              disabled={busy || simulating}
              title="Simulate remaining playoff games to offseason"
            >
              <span className="app-sim-btn-full">Sim to Offseason</span>
              <span className="app-sim-btn-short">→ Off</span>
            </button>
          )}
          {/* During offseason phases, offer Sim to Season */}
          {['offseason_resign', 'offseason', 'free_agency', 'draft'].includes(league.phase) && !batchSim && (
            <button
              className="btn app-sim-btn"
              onClick={() => handleSimToPhase('preseason')}
              disabled={busy || simulating}
              title="Simulate through offseason to next preseason"
            >
              <span className="app-sim-btn-full">Sim to Season</span>
              <span className="app-sim-btn-short">→ Szn</span>
            </button>
          )}
          <button className="btn app-save-btn" onClick={() => actions.save()} disabled={busy || !!batchSim}>
            Save
          </button>
          <button className="btn btn-danger app-reset-btn" onClick={handleReset} disabled={busy || !!batchSim}>
            Reset
          </button>
        </div>
      </header>

      {/* ── Simulation progress bar ────────────────────────────────────── */}
      {simulating && (
        <div className="app-sim-progress">
          <div
            className="app-sim-progress-fill"
            style={{ width: `${simProgress}%` }}
          />
        </div>
      )}

      {/* ── Batch Sim Overlay ──────────────────────────────────────────── */}
      {batchSim && (
        <div className="app-batch-overlay">
          <div className="app-batch-title">
            Simulating to {batchSim.targetPhase}...
          </div>
          <div className="app-batch-detail">
            {batchSim.phase === 'regular' ? `Week ${batchSim.currentWeek}` :
             batchSim.phase === 'playoffs' ? `Playoffs Week ${batchSim.currentWeek}` :
             batchSim.phase || 'Initializing...'}
          </div>
          <div className="app-batch-bar">
            <div className="app-batch-bar-fill" />
          </div>
          <style>{`
            @keyframes batchSimPulse {
              0%, 100% { opacity: 0.4; transform: translateX(-40%); }
              50% { opacity: 1; transform: translateX(40%); }
            }
          `}</style>
        </div>
      )}

      {/* ── SW Update Available banner ─────────────────────────────────── */}
      {swUpdateReady && (
        <div role="alert" className="app-banner app-banner-info">
          <span className="app-banner-text">
            A new version of Football GM is available.
          </span>
          <button className="btn btn-primary app-banner-btn" onClick={handleSwUpdate}>
            Update &amp; Reload
          </button>
          <button
            onClick={() => setSwUpdateReady(false)}
            className="app-banner-dismiss"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="app-banner app-banner-error">
          {error}
        </div>
      )}

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {notifications.length > 0 && (
        <div className="app-notifications">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`app-notification ${n.level === 'warn' ? 'app-notification-warn' : 'app-notification-info'}`}
            >
              <span>{n.message}</span>
              {n.retryable && (
                <button
                  onClick={() => {
                    actions.dismissNotification(n.id);
                    handleAdvanceWeek();
                  }}
                  className="app-notification-retry"
                  disabled={busy || simulating}
                >
                  Retry
                </button>
              )}
              <button
                onClick={() => actions.dismissNotification(n.id)}
                className="app-notification-dismiss"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Live game viewer (visible during simulation + results) ────── */}
      {/* Hide when user game prompt is active to avoid stale empty state behind modal */}
      {!state.promptUserGame && (
        <LiveGame
          simulating={simulating}
          simProgress={simProgress}
          league={league}
          lastResults={lastResults}
          gameEvents={gameEvents}
        />
      )}

      {/* ── Last results ticker ────────────────────────────────────────── */}
      {lastResults && lastResults.length > 0 && (
        <div className="app-results-ticker">
          {lastResults.map((r, i) => {
            const homeWin = r.homeScore > r.awayScore;
            const isUserGame = r.homeId === league.userTeamId || r.awayId === league.userTeamId;
            return (
              <span key={i} className={`app-result-item ${isUserGame ? 'app-result-user' : ''}`}>
                <span style={{ fontWeight: homeWin ? 700 : 400, color: homeWin ? 'var(--text)' : 'var(--text-muted)' }}>
                  {r.homeName}
                </span>
                {' '}
                <strong>{r.homeScore}</strong>
                {' - '}
                <strong>{r.awayScore}</strong>
                {' '}
                <span style={{ fontWeight: !homeWin ? 700 : 400, color: !homeWin ? 'var(--text)' : 'var(--text-muted)' }}>
                  {r.awayName}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* ── Main dashboard ─────────────────────────────────────────────── */}
      <LeagueDashboard
        league={leagueReady ? league : null}
        busy={busy}
        simulating={simulating}
        actions={actions}
        onAdvanceWeek={handleAdvanceWeek}
        notifications={notifications}
        onDismissNotification={actions.dismissNotification}
      />

      {/* ── Milestone modals (playoff bracket, season complete) ─────── */}
      {leagueReady && league && (
        <MilestoneModal league={league} />
      )}

      {/* ── Simulation Progress Spinner (CSS-only, prevents frozen-UI appearance) ── */}
      {(simulating || busy) && !promptUserGame && !userGameLogs && !batchSim && (
        <div className="app-sim-spinner-overlay">
          <div className="app-sim-spinner" />
          <p className="app-sim-spinner-text">
            {simulating ? `Simulating… ${simProgress}%` : 'Processing…'}
          </p>
          <style>{`
            .app-sim-spinner-overlay {
              position: fixed; top: 0; left: 0; right: 0; bottom: 0;
              z-index: 2500; display: flex; flex-direction: column;
              align-items: center; justify-content: center;
              background: rgba(0,0,0,0.45); pointer-events: none;
            }
            .app-sim-spinner {
              width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.2);
              border-top-color: #0A84FF; border-radius: 50%;
              animation: simSpin 0.7s linear infinite;
            }
            .app-sim-spinner-text {
              color: #fff; font-size: 14px; margin-top: 12px; opacity: 0.9;
            }
            @keyframes simSpin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}

      {/* ── User Game Prompt Modal ── */}
      {promptUserGame && !userGameLogs && (() => {
        const ut = league?.teams?.find(t => t.id === league.userTeamId);
        const weekGames = league?.schedule?.weeks?.find(w => w.week === league.week)?.games ?? [];
        const matchup = weekGames.find(g => Number(g.home) === league.userTeamId || Number(g.away) === league.userTeamId);
        const isHome = matchup ? Number(matchup.home) === league.userTeamId : true;
        const oppId = matchup ? (isHome ? Number(matchup.away) : Number(matchup.home)) : null;
        const opp = oppId != null ? league?.teams?.find(t => t.id === oppId) : null;
        return (
          <div style={{
            position: 'fixed', inset: 0,
            zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
            touchAction: 'manipulation',
          }}>
            <div style={{
              pointerEvents: 'auto',
              background: 'var(--surface-strong, #1e1e2e)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-xl, 20px)',
              padding: '32px 28px',
              maxWidth: 400, width: '90%',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: '2.2rem', fontWeight: 900,
                marginBottom: 8, letterSpacing: '-1px',
                color: 'var(--text)',
              }}>
                {isHome ? `${opp?.abbr ?? '???'} @ ${ut?.abbr ?? 'YOU'}` : `${ut?.abbr ?? 'YOU'} @ ${opp?.abbr ?? '???'}`}
              </div>
              <div style={{
                color: 'var(--text-muted)', fontSize: 'var(--text-sm)',
                marginBottom: 24,
              }}>
                Week {league.week} {league.phase === 'playoffs' ? '· Playoffs' : '· Regular Season'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => actions.watchGame()}
                  disabled={busy}
                  style={{
                    width: '100%', minHeight: 52,
                    fontSize: 'var(--text-base)', fontWeight: 800,
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {busy ? 'Loading...' : '🏈 Watch Game'}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    actions.clearUserGame();
                    actions.advanceWeek({ skipUserGame: true });
                  }}
                  disabled={busy}
                  style={{
                    width: '100%', minHeight: 48,
                    fontSize: 'var(--text-sm)', fontWeight: 600,
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  Simulate (Skip)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Live Game Viewer (premium GameSimulation) ── */}
      {userGameLogs && (() => {
        // Determine actual home/away from the latest game event for the user's team
        const userEvent = gameEvents?.find(e => e.homeId === league.userTeamId || e.awayId === league.userTeamId);
        const weekGames = league?.schedule?.weeks?.find(w => w.week === league.week)?.games ?? [];
        const userMatchup = weekGames.find(g => Number(g.home) === league.userTeamId || Number(g.away) === league.userTeamId);
        const homeId = userEvent?.homeId ?? (userMatchup ? Number(userMatchup.home) : league.userTeamId);
        const awayId = userEvent?.awayId ?? (userMatchup ? Number(userMatchup.away) : league.teams?.find(t => t.id !== league.userTeamId)?.id);
        const homeTeam = league?.teams?.find(t => t.id === homeId) || { abbr: userEvent?.homeAbbr || 'HOME', id: homeId };
        const awayTeam = league?.teams?.find(t => t.id === awayId) || { abbr: userEvent?.awayAbbr || 'AWAY', id: awayId };
        return (
          <GameSimulation
            logs={userGameLogs}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            userTeamId={league?.userTeamId}
            onComplete={(scores) => {
              // Capture final scores + logs for PostGameScreen, then clear the viewer
              setPostGameResult({
                homeTeam,
                awayTeam,
                homeScore: scores?.homeScore ?? 0,
                awayScore: scores?.awayScore ?? 0,
                userTeamId: league?.userTeamId,
                week: league?.week,
                phase: league?.phase,
                logs: userGameLogs || [],
              });
              actions.clearUserGame();
            }}
          />
        );
      })()}

      {/* ── Post-Game Screen (shown after GameSimulation, before advancing) ── */}
      {postGameResult && (
        <PostGameScreen
          homeTeam={postGameResult.homeTeam}
          awayTeam={postGameResult.awayTeam}
          homeScore={postGameResult.homeScore}
          awayScore={postGameResult.awayScore}
          userTeamId={postGameResult.userTeamId}
          week={postGameResult.week}
          phase={postGameResult.phase}
          logs={postGameResult.logs || []}
          onContinue={() => {
            try {
              setPostGameResult(null);
              setTimeout(() => {
                try {
                  actions.advanceWeek({ skipUserGame: true });
                } catch (err) {
                  console.error('[PostGame] advanceWeek failed:', err);
                }
              }, 150);
            } catch (err) {
              console.error('[PostGame] onContinue failed:', err);
              setPostGameResult(null);
            }
          }}
        />
      )}
    </div>
  );
}


// ── Sub-components ────────────────────────────────────────────────────────────

function Loading({ message }) {
  return (
    <div className="app-loading fade-in">
      <div className="app-loading-spinner" />
      <p className="app-loading-text">{message}</p>
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
      <div className="app-error-boundary-overlay">
        <div className="app-error-boundary-card">
          <h2 style={{ color: '#ef4444', marginTop: 0 }}>Something went wrong</h2>
          <p style={{ margin: '0 0 1rem' }}>
            A render error occurred. Copy the details below then reload.
          </p>
          <details className="app-error-boundary-details">
            <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
              Error Details
            </summary>
            {stack}
          </details>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn"
            >
              Dismiss (Risk)
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
