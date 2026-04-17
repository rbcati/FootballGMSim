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

import React, { useEffect, useCallback, useRef, useState, Component, useMemo } from 'react';
import { useWorker }       from './hooks/useWorker.js';
import LeagueDashboard     from './components/LeagueDashboard.jsx';
import LiveGame            from './components/LiveGame.jsx';
import LiveGameView        from './components/LiveGameView.jsx';
import PostGameScreen      from './components/PostGameScreen.jsx';
import SaveSlotManager     from './components/SaveSlotManager.jsx';
import NewLeagueSetup      from './components/NewLeagueSetup.jsx';
import { toWorker }        from '../worker/protocol.js';
import { DEFAULT_TEAMS }   from '../data/default-teams.js';
import MilestoneModal      from './components/MilestoneModal.jsx';
import ThemeToggle         from './components/ThemeToggle.jsx';
import { SettingsProvider, useSettings } from './context/SettingsContext.jsx';
import { ACTION_LABELS } from './constants/navigationCopy.js';
import { buildCompletedGamePresentation, openResolvedBoxScore } from './utils/boxScoreAccess.js';
import { buildOffseasonActionCenter } from './utils/offseasonActionCenter.js';
import { hasMinimumPlayableLeague, summarizeBootstrapState } from './utils/leagueBootstrap.js';
import { clearWeeklyPrepForWeek, pruneWeeklyPrepStorage } from './utils/weeklyPrep.js';
import { buildCanonicalGameId } from '../core/gameIdentity.js';
import { getRecentGames, saveGame } from '../core/archive/gameArchive.ts';

// Increment this when shipping notable UX/bugfix updates so users
// see the in-app changelog popup once per version.
const APP_VERSION = '1.2.1-first-playable-reliability';

// ── GameSimulation Error Boundary ────────────────────────────────────────────
// Prevents a crash inside GameSimulation from killing the whole app.
// On crash, calls onFallback so the week can still advance.
class GameSimErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { crashed: false }; }
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(err, info) {
    console.error('[GameSim] Render crash caught — recovering:', err, info?.componentStack?.slice(0, 200));
  }
  render() {
    if (!this.state.crashed) return this.props.children;
    // Trigger recovery callback once
    setTimeout(() => this.props.onFallback?.(), 50);
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 24,
      }}>
        <div style={{ fontSize: '2rem' }}>🏈</div>
        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#FF453A' }}>Sim viewer crashed</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          The game result was saved. Returning to hub…
        </div>
      </div>
    );
  }
}

// ── LiveGame Error Boundary ───────────────────────────────────────────────────
// LiveGame renders outside TabErrorBoundary — wrap it so crashes don't kill the app.
class LiveGameErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { crashed: false }; }
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(err) { console.error('[LiveGame] Render crash caught:', err); }
  render() {
    if (!this.state.crashed) return this.props.children;
    return null; // silently hide — the ticker still works
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

function AppContent() {
  const { state, actions } = useWorker();
  const {
    busy, simulating, simProgress,
    workerReady, hasSave,
    league, lastResults, lastSimWeek, gameEvents,
    error, notifications,
    batchSim,
    promptUserGame,
    userGameLogs,
    userGameLiveStats,
  } = state;

  const [activeView, setActiveView] = useState('saves');
  const [activeSlot, setActiveSlot] = useState(null);
  const [pendingNewSlot, setPendingNewSlot] = useState(null);
  const [watchMode, setWatchMode] = useState('watch');
  const [externalBoxScoreId, setExternalBoxScoreId] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const { settings, updateSetting } = useSettings();
  const soundEnabled = settings?.soundEnabled ?? true;
  const isWeeklyResultPhase = league?.phase === 'preseason' || league?.phase === 'regular' || league?.phase === 'playoffs';
  const authoritativeResults = useMemo(
    () => (isWeeklyResultPhase && Array.isArray(lastResults) ? lastResults : []),
    [isWeeklyResultPhase, lastResults],
  );

  // Post-game result shown after GameSimulation completes (before advancing week)
  const [postGameResult, setPostGameResult] = useState(null);
  const [initFlow, setInitFlow] = useState(null);
  const archiveMigrationRef = useRef(null);

  // Local guard to prevent rapid-click double submission before 'busy' propagates
  const advancingRef = useRef(false);

  // Reset guard when busy goes back to false
  useEffect(() => {
    if (!busy) advancingRef.current = false;
  }, [busy]);

  // ── Versioned changelog popup ────────────────────────────────────────────────
  useEffect(() => {
    try {
      const seen = localStorage.getItem('gmsim_last_seen_version');
      if (seen !== APP_VERSION) {
        setShowChangelog(true);
        localStorage.setItem('gmsim_last_seen_version', APP_VERSION);
      }
    } catch {
      // non-fatal: if storage fails, just skip the popup
    }
  }, []);

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
    const handler = () => { if (league && activeSlot) actions.saveSlot(activeSlot); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [league, activeSlot, actions]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!league?.seasonId || !league?.schedule?.weeks?.length) return;
    const migrationKey = `footballgm_archive_v53_migrated_${league.seasonId}`;
    if (archiveMigrationRef.current === migrationKey) return;
    archiveMigrationRef.current = migrationKey;
    try {
      const alreadyMigrated = localStorage.getItem(migrationKey) === '1';
      if (alreadyMigrated) return;
      const hasArchive = getRecentGames(1).length > 0;
      if (hasArchive) {
        localStorage.setItem(migrationKey, '1');
        return;
      }
      const completed = [];
      league.schedule.weeks.forEach((weekRow) => {
        (weekRow?.games ?? []).forEach((game) => {
          if (!game?.played) return;
          completed.push({
            seasonId: league.seasonId,
            week: Number(weekRow?.week ?? game?.week ?? 0),
            game,
          });
        });
      });
      completed.slice(-32).forEach(({ seasonId, week, game }) => {
        const homeTeam = league?.teams?.find((team) => Number(team?.id) === Number(game?.home));
        const awayTeam = league?.teams?.find((team) => Number(team?.id) === Number(game?.away));
        const gameId = buildCanonicalGameId({ seasonId, week, homeId: game?.home, awayId: game?.away });
        saveGame(gameId, {
          season: seasonId,
          week,
          homeId: game?.home,
          awayId: game?.away,
          homeAbbr: homeTeam?.abbr ?? 'HME',
          awayAbbr: awayTeam?.abbr ?? 'AWY',
          homeScore: game?.homeScore,
          awayScore: game?.awayScore,
          teamStats: game?.teamStats ?? null,
          playerStats: game?.playerStats ?? null,
          scoringSummary: game?.scoringSummary ?? [],
          driveSummary: game?.driveSummary ?? [],
          quarterScores: game?.quarterScores ?? null,
          recapText: game?.recap ?? game?.summary?.storyline ?? null,
          logs: game?.playLog ?? [],
          summary: game?.summary ?? null,
        });
      });
      localStorage.setItem(migrationKey, '1');
    } catch {
      // non-fatal
    }
  }, [league]);

  const isBatchSimBlocking = !!batchSim && !['cancelled', 'completed', 'idle'].includes(batchSim?.status);

  const handleAdvanceWeek = useCallback(() => {
    if (busy || simulating || advancingRef.current) return;
    if (!league?.phase) return;

    if (['regular', 'playoffs', 'preseason'].includes(league.phase)) {
      advancingRef.current = true;
      actions.advanceWeek();
    } else if (['offseason_resign', 'offseason'].includes(league.phase)) {
      if (league.phase === 'offseason_resign') {
        const actionCenter = buildOffseasonActionCenter(league);
        const unresolvedKey = Number(actionCenter?.unresolved?.keyExpiringContracts ?? 0);
        if (unresolvedKey > 0) {
          const proceed = window.confirm(`You still have ${unresolvedKey} unresolved key re-signing decisions. Advance anyway?`);
          if (!proceed) return;
        }
      }
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
    if (busy || simulating || advancingRef.current || isBatchSimBlocking) return;
    advancingRef.current = true;
    actions.simToPhase(targetPhase);
  }, [busy, simulating, isBatchSimBlocking, actions]);

  const handleCancelBatchSim = useCallback(() => {
    actions.cancelSimToPhase();
  }, [actions]);

  const handleRetryBatchSim = useCallback(() => {
    const target = batchSim?.targetPhase;
    if (!target) return;
    actions.retrySimToPhase(target);
  }, [actions, batchSim]);

  const handleReset = useCallback(() => {
    if (window.confirm('Reset/Delete your active save? This cannot be undone.')) {
      actions.reset();
    }
  }, [actions]);

  // ── Keyboard shortcuts (desktop) ──────────────────────────────────────────
  // Space / Enter  → Advance week (when not busy and no modal open)
  // S              → Manual save
  // ?              → Toggle changelog / help
  useEffect(() => {
    const onKey = (e) => {
      // Skip if focus is inside an input, textarea, or select
      const tag = document.activeElement?.tagName?.toUpperCase();
      if (['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tag)) return;
      // Skip if any modal/overlay is open (postGame, userGamePrompt, etc.)
      if (postGameResult || promptUserGame || userGameLogs) return;
      // Skip if not in an active league
      if (!league) return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (typeof handleAdvanceWeek === 'function') handleAdvanceWeek();
      } else if (e.key === 's' || e.key === 'S') {
        if (!busy && league) {
          if (activeSlot) actions.saveSlot(activeSlot);
        }
      } else if (e.key === '?') {
        setShowChangelog(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [league, busy, postGameResult, promptUserGame, userGameLogs, handleAdvanceWeek, actions]);

  // Expose state and actions to window for E2E testing
  useEffect(() => {
    window.state = state;
    if (actions && typeof handleAdvanceWeek === 'function') {
      window.gameController = {
        ...actions,
        startNewLeague: () => actions.newLeague(DEFAULT_TEAMS, { userTeamId: 0, name: 'Test League' }),
        advanceWeek: handleAdvanceWeek,
      };
      window.handleGlobalAdvance = handleAdvanceWeek;
    }
  }, [state, actions, handleAdvanceWeek]);

  // ── Advance button label ──────────────────────────────────────────────────


  useEffect(() => {
    if (!league || !activeSlot) return;
    const slotNum = activeSlot?.split('_')?.[2];
    if (!slotNum) return;
    const userTeam = Array.isArray(league?.teams) ? league.teams.find(t => t?.id === league?.userTeamId) : null;
    const existingRaw = localStorage.getItem(`footballgm_slot_${slotNum}_meta`);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const nextMeta = {
      name: existing?.name ?? `Franchise ${slotNum}`,
      teamName: userTeam?.name ?? userTeam?.abbr ?? 'Unknown Team',
      record: { wins: userTeam?.wins ?? 0, losses: userTeam?.losses ?? 0 },
      season: league?.season ?? league?.year ?? 1,
      week: league?.week ?? 1,
      lastSaved: new Date().toISOString(),
    };
    localStorage.setItem(`footballgm_slot_${slotNum}_meta`, JSON.stringify(nextMeta));
  }, [league, activeSlot]);

  useEffect(() => {
    if (!league) return;
    pruneWeeklyPrepStorage(league);
  }, [league?.seasonId, league?.year]);

  const previousWeekRef = useRef(null);
  useEffect(() => {
    if (!league) return;
    const marker = `${league?.seasonId ?? league?.year}:${league?.week ?? 0}:${league?.userTeamId ?? 'user'}`;
    const prior = previousWeekRef.current;
    if (prior && prior !== marker) {
      const [seasonId, week, userTeamId] = String(prior).split(':');
      clearWeeklyPrepForWeek({ seasonId, week: Number(week), userTeamId });
    }
    previousWeekRef.current = marker;
  }, [league?.seasonId, league?.year, league?.week, league?.userTeamId]);

  useEffect(() => {
    if (!league || !pendingNewSlot) return;
    actions.saveSlot(pendingNewSlot);
    setActiveSlot(pendingNewSlot);
    setPendingNewSlot(null);
    setInitFlow(null);
  }, [league, pendingNewSlot, actions]);

  useEffect(() => {
    if (!initFlow?.active) return;
    if (hasMinimumPlayableLeague(league)) {
      setInitFlow(null);
      return;
    }
    const timeoutMs = 15000;
    const timer = setTimeout(() => {
      setInitFlow((prev) => prev?.active ? {
        ...prev,
        timedOut: true,
        message: 'Initialization is taking longer than expected. You can retry without losing this slot.',
      } : prev);
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [initFlow, league]);
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
    return `▶ Advance Week ${league.week}`;
  };

  const safePhase = league?.phase ?? null;
  const canUseTopActions = !!safePhase && !(busy || simulating || isBatchSimBlocking);

  const topSecondaryAction = useMemo(() => {
    if (!safePhase) return null;
    if (safePhase === 'regular') {
      return {
        label: 'Sim to Playoffs',
        title: 'Simulate all remaining regular season weeks',
        onClick: () => handleSimToPhase('playoffs'),
        disabled: !canUseTopActions,
      };
    }
    if (safePhase === 'playoffs') {
      return {
        label: 'Sim to Offseason',
        title: 'Simulate remaining playoff games to offseason',
        onClick: () => handleSimToPhase('offseason'),
        disabled: !canUseTopActions,
      };
    }
    if (['offseason_resign', 'offseason', 'free_agency', 'draft'].includes(safePhase)) {
      return {
        label: 'Sim to Season',
        title: 'Simulate through offseason to next preseason',
        onClick: () => handleSimToPhase('preseason'),
        disabled: !canUseTopActions,
      };
    }
    return null;
  }, [safePhase, canUseTopActions, handleSimToPhase]);

  const utilityActions = useMemo(() => {
    const items = [];

    if (safePhase === 'regular') {
      items.push({
        label: 'Sim to Offseason',
        title: 'Simulate through playoffs to offseason',
        onClick: () => handleSimToPhase('offseason'),
        disabled: !canUseTopActions,
      });
    }
    if (safePhase && safePhase !== 'regular' && safePhase !== 'playoffs' && ['offseason_resign', 'offseason', 'free_agency', 'draft'].includes(safePhase)) {
      items.push({
        label: 'Sim to Season',
        title: 'Simulate through offseason to next preseason',
        onClick: () => handleSimToPhase('preseason'),
        disabled: !canUseTopActions,
      });
    }

    items.push(
      { label: 'Save Game', onClick: () => activeSlot && actions.saveSlot(activeSlot), disabled: !activeSlot || busy || isBatchSimBlocking },
      { label: 'Save Slots', onClick: () => setActiveSlot(null), disabled: busy || isBatchSimBlocking },
      { label: 'Reset Franchise', onClick: handleReset, disabled: busy || isBatchSimBlocking, danger: true },
    );

    return items;
  }, [safePhase, canUseTopActions, activeSlot, actions, busy, isBatchSimBlocking, handleReset, handleSimToPhase]);

  const simPhaseLabel = useMemo(() => {
    if (!league?.phase) return 'Initializing';
    const labels = {
      preseason: 'Preseason',
      regular: 'Regular Season',
      playoffs: 'Playoffs',
      offseason_resign: 'Re-signing',
      offseason: 'Offseason',
      free_agency: 'Free Agency',
      draft: 'Draft',
    };
    return labels[league.phase] ?? league.phase;
  }, [league?.phase]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!workerReady) {
    if (error) {
      return (
        <div className="app-error-screen">
          <div className="app-error-icon">⚠️</div>
          <h2 className="app-error-title">Initialization Failed</h2>
          <p className="app-error-detail">{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return <Loading message="Starting game engine…" />;
  }

  if (!league || activeSlot === null) {
    const initTimeoutPanel = initFlow?.timedOut ? (
      <div role="alert" className="app-banner app-banner-error" style={{ marginBottom: 12 }}>
        <span>{initFlow.message}</span>
        <div style={{ display: 'inline-flex', gap: 8, marginLeft: 10 }}>
          {initFlow.mode === 'load' && (
            <button className="btn btn-primary app-banner-btn" onClick={() => actions.loadSlot(initFlow.slotKey)}>
              Retry Load
            </button>
          )}
          {initFlow.mode === 'new' && (
            <button className="btn btn-primary app-banner-btn" onClick={() => setActiveView('new_league')}>
              Retry Setup
            </button>
          )}
          <button className="btn app-banner-btn" onClick={() => { setActiveSlot(null); setActiveView('saves'); }}>
            Back to Slots
          </button>
        </div>
      </div>
    ) : null;
    if (activeView === 'new_league') {
      return (
        <ErrorBoundary contextHint="new-franchise-setup">
          <div className="view fade-in" key="new_league">
            {initTimeoutPanel}
            <NewLeagueSetup
              actions={actions}
              onStartCreate={() => {
                setInitFlow({
                  active: true,
                  mode: 'new',
                  slotKey: pendingNewSlot,
                  timedOut: false,
                  message: '',
                });
              }}
              onCancel={() => setActiveView('saves')}
            />
          </div>
      </ErrorBoundary>
    );
  }
  return (
      <ErrorBoundary contextHint="save-slot-manager">
        <div className="view fade-in" key="save_slot_manager">
          {initTimeoutPanel}
          <SaveSlotManager
            activeSlot={activeSlot}
            onLoad={(slotKey) => {
              setInitFlow({ active: true, mode: 'load', slotKey, timedOut: false, message: '' });
              setActiveSlot(slotKey);
              actions.loadSlot(slotKey);
            }}
            onSave={(slotKey) => { setActiveSlot(slotKey); actions.saveSlot(slotKey); }}
            onDelete={(slotKey) => { actions.deleteSlot(slotKey); if (activeSlot === slotKey) setActiveSlot(null); }}
            onNew={(slotKey) => {
              setInitFlow({ active: false, mode: 'new', slotKey, timedOut: false, message: '' });
              setPendingNewSlot(slotKey);
              setActiveSlot(slotKey);
              setActiveView('new_league');
            }}
          />
        </div>
      </ErrorBoundary>
    );
  }

  const bootstrapSummary = summarizeBootstrapState(league);
  const leagueReady = bootstrapSummary.ready;
  const userTeam = league?.teams?.find(t => t.id === league.userTeamId);
  const isCutdownRequired = league.phase === 'preseason' && (userTeam?.rosterCount ?? 0) > 53;

  const isPostseason = league?.phase === 'playoffs';

  const themeClass = league?.phase ? `theme-${league.phase}` : 'theme-default';

  return (
    <div className={`app-shell ${isPostseason ? 'postseason' : ''} ${themeClass}`} key="league_dashboard" data-testid="app-shell-ready">

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
      <header className="app-header" data-testid="app-shell-header">
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
          <button
            className="btn app-icon-btn"
            onClick={() => updateSetting("soundEnabled", !soundEnabled)}
            title="Toggle sound effects"
            aria-label="Toggle sound effects"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
          <ThemeToggle compact />
          <button
            className="btn btn-primary app-advance-btn app-action-primary"
            onClick={handleAdvanceWeek}
            disabled={busy || simulating || isCutdownRequired || isBatchSimBlocking || !!promptUserGame}
            title={isCutdownRequired ? "You must cut your roster to 53 players before advancing." : ""}
          >
            {getAdvanceLabel()}
          </button>
          {topSecondaryAction && !isBatchSimBlocking && (
            <button
              className="btn app-sim-btn app-action-secondary"
              onClick={topSecondaryAction.onClick}
              disabled={topSecondaryAction.disabled}
              title={topSecondaryAction.title}
            >
              {topSecondaryAction.label}
            </button>
          )}
          <details className="app-overflow-menu">
            <summary className="btn app-overflow-trigger" aria-label="Action menu">
              {ACTION_LABELS.more}
            </summary>
            <div className="app-overflow-list">
              {utilityActions.map((item) => (
                <button
                  key={item.label}
                  className={`app-overflow-item ${item.danger ? 'danger' : ''}`}
                  onClick={item.onClick}
                  disabled={item.disabled}
                  title={item.title || item.label}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </details>
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
      {(simulating || busy) && !isBatchSimBlocking && (
        <div role="status" className="app-banner app-banner-info" style={{ marginTop: 8 }}>
          <span className="app-banner-text">
            {simulating
              ? `Simulating ${simPhaseLabel} · ${simProgress}% complete.`
              : `Processing ${simPhaseLabel} updates…`}
          </span>
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
          <div className="app-batch-detail" style={{ opacity: 0.85, fontSize: 12 }}>
            Status: {batchSim.status || 'running'}
          </div>
          <div className="app-batch-bar">
            <div className="app-batch-bar-fill" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="btn"
              onClick={handleRetryBatchSim}
              disabled={!['cancelled', 'completed'].includes(batchSim.status)}
            >
              Retry
            </button>
            <button
              className="btn btn-danger"
              onClick={handleCancelBatchSim}
              disabled={batchSim.status === 'cancelled' || batchSim.status === 'completed'}
            >
              Cancel
            </button>
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
            New version available. You can keep playing now and update when ready.
          </span>
          <button className="btn btn-primary app-banner-btn" onClick={handleSwUpdate}>
            Update &amp; Restart
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
          <span>{error}</span>
          <button className="btn app-banner-btn" onClick={handleAdvanceWeek} disabled={busy || simulating}>
            Retry
          </button>
        </div>
      )}
      {initFlow?.timedOut && (
        <div role="alert" className="app-banner app-banner-error">
          <span>{initFlow.message}</span>
          <div style={{ display: 'inline-flex', gap: 8, marginLeft: 10 }}>
            {initFlow.mode === 'load' && (
              <button className="btn btn-primary app-banner-btn" onClick={() => actions.loadSlot(initFlow.slotKey)}>
                Retry Load
              </button>
            )}
            {initFlow.mode === 'new' && (
              <button className="btn btn-primary app-banner-btn" onClick={() => setActiveView('new_league')}>
                Retry Setup
              </button>
            )}
            <button className="btn app-banner-btn" onClick={() => setActiveSlot(null)}>
              Back to Slots
            </button>
          </div>
        </div>
      )}
      {!bootstrapSummary.ready && (
        <div role="status" className="app-banner app-banner-info">
          Loading playable league state… {bootstrapSummary.reasons[0] ?? 'Preparing franchise data.'}
        </div>
      )}

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {Array.isArray(notifications) && notifications.length > 0 && (
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
        <LiveGameErrorBoundary>
          <LiveGame
            simulating={simulating}
            simProgress={simProgress}
            league={league}
            lastResults={authoritativeResults}
            simulatedWeek={lastSimWeek}
            gameEvents={gameEvents}
            busy={busy}
            error={error}
            onOpenBoxScore={(gameId) => {
              if (!gameId) return;
              setExternalBoxScoreId(gameId);
            }}
          />
        </LiveGameErrorBoundary>
      )}

      {/* ── Last results ticker ────────────────────────────────────────── */}
      {authoritativeResults.length > 0 && (
        <div className="app-results-ticker">
          {authoritativeResults.map((r, i) => {
            const homeWin = r.homeScore > r.awayScore;
            const isUserGame = r.homeId === league.userTeamId || r.awayId === league.userTeamId;
            const gamePresentation = buildCompletedGamePresentation(r, {
              seasonId: league?.seasonId,
              week: lastSimWeek ?? Math.max(1, (league?.week ?? 1) - 1),
              source: 'app_results_ticker',
            });
            return (
              <button
                key={i}
                type="button"
                className={`app-result-item ${isUserGame ? 'app-result-user' : ''} ${gamePresentation.canOpen ? 'app-result-item-clickable' : ''}`}
                onClick={() => openResolvedBoxScore(r, {
                  seasonId: league?.seasonId,
                  week: lastSimWeek ?? Math.max(1, (league?.week ?? 1) - 1),
                  source: 'app_results_ticker',
                }, setExternalBoxScoreId)}
                aria-disabled={!gamePresentation.canOpen}
                title={gamePresentation.canOpen ? gamePresentation.ctaLabel : gamePresentation.statusLabel}
              >
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
              </button>
            );
          })}
        </div>
      )}

      {/* ── Main dashboard ─────────────────────────────────────────────── */}
      <ErrorBoundary contextHint="first-playable-dashboard">
        <LeagueDashboard
          league={leagueReady ? league : null}
          lastResults={authoritativeResults}
          lastSimWeek={lastSimWeek}
          busy={busy}
          simulating={simulating}
          actions={actions}
          onAdvanceWeek={handleAdvanceWeek}
          notifications={notifications}
          onDismissNotification={actions.dismissNotification}
          externalBoxScoreId={externalBoxScoreId}
          onConsumeExternalBoxScore={() => setExternalBoxScoreId(null)}
          advanceLabel={getAdvanceLabel()}
          advanceDisabled={busy || simulating || isCutdownRequired || isBatchSimBlocking || !!promptUserGame}
        />
      </ErrorBoundary>

      {/* ── Milestone modals (playoff bracket, season complete) ─────── */}
      {leagueReady && league && (
        <MilestoneModal league={league} />
      )}

      {/* ── Simulation Progress Spinner (CSS-only, prevents frozen-UI appearance) ── */}
      {(simulating || busy) && !promptUserGame && !userGameLogs && !isBatchSimBlocking && (
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
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', marginBottom: 2 }}>
                  Choose presentation mode for this game.
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setWatchMode('watch');
                    actions.watchGame();
                  }}
                  disabled={busy}
                  style={{
                    width: '100%', minHeight: 52,
                    fontSize: 'var(--text-base)', fontWeight: 800,
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {busy ? 'Loading...' : '🏈 Watch (Broadcast Pace)'}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setWatchMode('fast');
                    actions.watchGame();
                  }}
                  disabled={busy}
                  style={{
                    width: '100%', minHeight: 48,
                    fontSize: 'var(--text-sm)', fontWeight: 700,
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  ⚡ Fast Watch (Condensed)
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setWatchMode('instant');
                    actions.watchGame();
                  }}
                  disabled={busy}
                  style={{
                    width: '100%', minHeight: 48,
                    fontSize: 'var(--text-sm)', fontWeight: 700,
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  ⏭️ Sim to End (Instant)
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

      {/* ── Live Game Viewer (watch mode foundation) ── */}
      {userGameLogs && (() => {
        // Determine actual home/away from the latest game event for the user's team
        const userEvent = gameEvents?.find(e => e.homeId === league?.userTeamId || e.awayId === league?.userTeamId);
        const weekGames = league?.schedule?.weeks?.find(w => w.week === league?.week)?.games ?? [];
        const userMatchup = weekGames.find(g => Number(g.home) === league?.userTeamId || Number(g.away) === league?.userTeamId);
        const homeId = userEvent?.homeId ?? (userMatchup ? Number(userMatchup.home) : league?.userTeamId);
        const awayId = userEvent?.awayId ?? (userMatchup ? Number(userMatchup.away) : league?.teams?.find(t => t.id !== league?.userTeamId)?.id);
        const homeTeam = league?.teams?.find(t => t.id === homeId) || { abbr: userEvent?.homeAbbr || 'HOME', id: homeId };
        const awayTeam = league?.teams?.find(t => t.id === awayId) || { abbr: userEvent?.awayAbbr || 'AWAY', id: awayId };
        return (
          <GameSimErrorBoundary onFallback={() => {
            // If GameSimulation crashes, recover directly to advancing the week
            actions.clearUserGame();
            setTimeout(() => actions.advanceWeek({ skipUserGame: true }), 200);
          }}>
            <LiveGameView
              logs={userGameLogs}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              initialMode={watchMode}
              onComplete={(scores) => {
                try {
                  // Belt-and-suspenders save immediately on game completion
                  if (activeSlot) actions.saveSlot(activeSlot);
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
                    liveStats: userGameLiveStats || null,
                    seasonId: league?.seasonId,
                    gameId: buildCanonicalGameId({
                      seasonId: league?.seasonId,
                      week: league?.week,
                      homeId: homeTeam?.id,
                      awayId: awayTeam?.id,
                    }),
                  });
                  setWatchMode('watch');
                  actions.clearUserGame();
                } catch (err) {
                  console.error('[App] onComplete failed:', err);
                  setWatchMode('watch');
                  actions.clearUserGame();
                }
              }}
            />
          </GameSimErrorBoundary>
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
          boxScoreGameId={postGameResult.gameId}
          onOpenBoxScore={(gameId) => {
            if (!gameId) return;
            setPostGameResult(null);
            setExternalBoxScoreId(gameId);
          }}
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
          onArchiveReady={(archivePayload) => {
            if (!archivePayload?.gameId) return;
            saveGame(archivePayload.gameId, archivePayload);
          }}
        />
      )}

      {/* ── Version changelog popup ─────────────────────────────────────── */}
      {showChangelog && (
        <div
          onClick={() => setShowChangelog(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'env(safe-area-inset-top, 16px) env(safe-area-inset-right, 16px) env(safe-area-inset-bottom, 16px) env(safe-area-inset-left, 16px)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface-strong, #111827)',
              borderRadius: 'var(--radius-xl, 20px)',
              border: '1px solid var(--hairline)',
              maxWidth: 440,
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: '24px 20px 20px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--accent)' }}>
                  Update Notes
                </div>
                <h2
                  style={{
                    margin: '4px 0 8px',
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                  }}
                >
                  Draft War Room & Live Hub
                </h2>
              </div>
              <button
                onClick={() => setShowChangelog(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 20,
                  lineHeight: 1,
                }}
                aria-label="Close changelog"
              >
                ×
              </button>
            </div>

            <ul
              style={{
                margin: '8px 0 0',
                paddingLeft: 18,
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              <li>Fixed offseason/draft phase sync so "Sim to Season" no longer stalls or throws phase errors.</li>
              <li>Introduced a focused Draft War Room with scouting fog, live ticker, and less dashboard clutter.</li>
              <li>Upgraded the Live Game hub: scoreboard cards now open box scores, and box-score player names open their cards.</li>
              <li>Condensed repetitive Free Agency news and notifications into a single recap to keep feeds readable.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}


// ── Sub-components ────────────────────────────────────────────────────────────

function Loading({ message }) {
  return (
    <div className="app-loading">
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
    this.state = { hasError: false, error: null, componentStack: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    const componentStack = info?.componentStack ?? '';
    this.setState({ componentStack });
    const contextHint = this.props.contextHint ?? 'unknown-screen';
    console.error(`[ErrorBoundary:${contextHint}] Render crash caught`, {
      message: error?.message ?? String(error),
      componentStack,
      stack: error?.stack ?? null,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, componentStack } = this.state;
    const stack = error?.stack ?? String(error);
    const message = error?.message ?? 'Unknown render error';
    const contextHint = this.props.contextHint ?? 'unknown-screen';

    return (
      <div className="app-error-boundary-overlay">
        <div className="app-error-boundary-card">
          <h2 style={{ color: '#ef4444', marginTop: 0 }}>Something went wrong</h2>
          <p style={{ margin: '0 0 1rem' }}>
            A render error occurred. Copy the details below then reload.
          </p>
          <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
            <strong>Context:</strong> <code>{contextHint}</code>
          </div>
          <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
            <strong>Message:</strong> {message}
          </div>
          <details className="app-error-boundary-details">
            <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
              Stack
            </summary>
            {stack}
          </details>
          {componentStack && (
            <details className="app-error-boundary-details" style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
                Component Trace
              </summary>
              {componentStack}
            </details>
          )}
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
