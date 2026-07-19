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
import PostGameSummary    from './components/PostGameSummary.jsx';
import SaveSlotManager     from './components/SaveSlotManager.jsx';
import NewLeagueSetup      from './components/NewLeagueSetup.jsx';
import { toWorker }        from '../worker/protocol.js';
import { DEFAULT_TEAMS }   from '../data/default-teams.js';
import MilestoneModal      from './components/MilestoneModal.jsx';
import ThemeToggle         from './components/ThemeToggle.jsx';
import EventDecisionModal from './components/EventDecisionModal.jsx';
import { SettingsProvider, useSettings } from './context/SettingsContext.jsx';
import { ACTION_LABELS, formatRegularUnitLabel } from './constants/navigationCopy.js';
import { buildCompletedGamePresentation, openResolvedBoxScore } from './utils/boxScoreAccess.js';
import { capVisibleNotifications, getDisplayableNotifications } from './utils/notificationsDisplay.js';
import { buildOffseasonActionCenter } from './utils/offseasonActionCenter.js';
import {
  hasMinimumPlayableLeague,
  shouldFinalizeNewSlotBootstrap,
  shouldShowNewFranchiseBootstrapGate,
  summarizeBootstrapState,
} from './utils/leagueBootstrap.js';
import { clearWeeklyPrepForWeek, pruneWeeklyPrepStorage } from './utils/weeklyPrep.js';
import { buildCanonicalGameId } from '../core/gameIdentity.js';
import { readStrictFinalScore } from '../core/gameArchive.js';
import { getRecentGames, saveGame } from '../core/archive/gameArchive.ts';
import { applyEventDecision } from './utils/franchiseEvents.js';
import { logChronicleEvent } from './utils/franchiseChronicle.js';
import { getBootViewStateValidation, getPlayableLeagueValidation } from '../state/leagueInit.ts';
import { setLegacyState } from '../state/legacyStateBridge.js';

// Increment this when shipping notable UX/bugfix updates so users
// see the in-app changelog popup once per version.
const APP_VERSION = '1.2.1-first-playable-reliability';
const ACTIVE_SLOT_STORAGE_KEY = 'footballgm_active_slot_v1';
const VALID_SLOT_KEYS = new Set(['save_slot_1', 'save_slot_2', 'save_slot_3']);

function readStoredActiveSlot() {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(ACTIVE_SLOT_STORAGE_KEY);
    return VALID_SLOT_KEYS.has(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStoredActiveSlot(slotKey) {
  if (typeof window === 'undefined') return;
  try {
    if (VALID_SLOT_KEYS.has(slotKey)) {
      window.localStorage.setItem(ACTIVE_SLOT_STORAGE_KEY, slotKey);
    } else {
      window.localStorage.removeItem(ACTIVE_SLOT_STORAGE_KEY);
    }
  } catch {
    // Persistence is best-effort; slot selection still works in memory.
  }
}

function readStoredSlotMeta(slotKey) {
  if (typeof window === 'undefined' || !VALID_SLOT_KEYS.has(slotKey)) return null;
  const slotNum = slotKey?.split('_')?.[2];
  if (!slotNum) return null;
  try {
    const raw = window.localStorage.getItem(`footballgm_slot_${slotNum}_meta`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

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

function safeSkipScore(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function buildWatchPostGameResult({
  canonicalFinal,
  viewerScores,
  homeTeam,
  awayTeam,
  userTeamId,
  week,
  phase,
  logs = [],
  liveStats = null,
  playerStats = null,
  gameReasoningFlags = [],
  seasonId,
} = {}) {
  const completedFinal = readStrictFinalScore({ score: canonicalFinal }) ?? readStrictFinalScore({
    homeScore: viewerScores?.homeScore,
    awayScore: viewerScores?.awayScore,
  });
  if (!completedFinal) return null;
  return {
    homeTeam,
    awayTeam,
    homeScore: completedFinal.home,
    awayScore: completedFinal.away,
    userTeamId,
    week,
    phase,
    logs,
    liveStats,
    playerStats,
    gameReasoningFlags,
    seasonId,
    gameId: buildCanonicalGameId({
      seasonId,
      week,
      homeId: homeTeam?.id,
      awayId: awayTeam?.id,
    }),
  };
}

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
    userGamePlayerStats,
    userGameReasoningFlags,
    lastWorkerMessageType,
  } = state;

  const [activeView, setActiveView] = useState('saves');
  const [activeSlot, setActiveSlot] = useState(() => readStoredActiveSlot());
  const [pendingNewSlot, setPendingNewSlot] = useState(null);
  const [watchMode, setWatchMode] = useState('watch');
  const [userTendency, setUserTendency] = useState('BALANCED');
  const [externalBoxScoreId, setExternalBoxScoreId] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showWeeklyEventModal, setShowWeeklyEventModal] = useState(false);
  const [simConfirmTarget, setSimConfirmTarget] = useState(null);
  const { settings, updateSetting } = useSettings();
  const soundEnabled = settings?.soundEnabled ?? true;
  const isWeeklyResultPhase = league?.phase === 'preseason' || league?.phase === 'regular' || league?.phase === 'playoffs';
  const authoritativeResults = useMemo(
    () => (isWeeklyResultPhase && Array.isArray(lastResults) ? lastResults : []),
    [isWeeklyResultPhase, lastResults],
  );
  const unresolvedWeeklyEvent = useMemo(
    () => (league?.pendingWeeklyEvents ?? []).find((event) => event?.state !== 'resolved') ?? null,
    [league?.pendingWeeklyEvents],
  );

  // Post-game result shown after GameSimulation watch mode completes
  const [postGameResult, setPostGameResult] = useState(null);
  const [postGameRecovery, setPostGameRecovery] = useState(null);
  // Stash preserves postGameResult while the user browses Game Book, so it can be restored on return.
  const [postGameResultStash, setPostGameResultStash] = useState(null);
  // Skip-mode summary shown after advanceWeek({ skipUserGame: true }) completes
  const [skipGameSummary, setSkipGameSummary] = useState(null);
  const lastShownSkipWeekRef = useRef(null);
  const [initFlow, setInitFlow] = useState(null);
  const [bootRequestId, setBootRequestId] = useState(null);
  const [safeStarterWarning, setSafeStarterWarning] = useState('');
  const [bootDiagnostics, setBootDiagnostics] = useState([]);
  const isBootDebugEnabled = import.meta.env.DEV || (typeof window !== 'undefined' && localStorage.getItem('DEBUG_BOOT') === '1');
  const pushBootDiag = useCallback((stage, extra = {}) => {
    if (!isBootDebugEnabled) return;
    const row = { stage, ts: Date.now(), ...extra };
    setBootDiagnostics((prev) => [...prev.slice(-40), row]);
    console.log('[BOOT_TRACE]', row);
  }, [isBootDebugEnabled]);
  const archiveMigrationRef = useRef(null);
  const safeStarterInFlightRef = useRef(false);
  const autoLoadActiveSlotRef = useRef(false);
  const leagueReady = hasMinimumPlayableLeague(league);
  const isNewFranchiseBootstrapping = shouldShowNewFranchiseBootstrapGate({
    league,
    pendingNewSlot,
    initFlowMode: initFlow?.mode,
    initFlowActive: initFlow?.active,
  });
  const loadingSlot = initFlow?.active ? initFlow?.slotKey ?? null : null;

  useEffect(() => {
    writeStoredActiveSlot(activeSlot);
  }, [activeSlot]);

  useEffect(() => {
    if (!workerReady || leagueReady || pendingNewSlot || initFlow?.active || autoLoadActiveSlotRef.current) return;

    const slotKey = activeSlot ?? readStoredActiveSlot();
    if (!slotKey) return;

    const slotMeta = readStoredSlotMeta(slotKey);
    if (!slotMeta?.lastSaved) {
      writeStoredActiveSlot(null);
      if (activeSlot === slotKey) setActiveSlot(null);
      return;
    }

    autoLoadActiveSlotRef.current = true;
    setActiveSlot(slotKey);
    setInitFlow({ active: true, mode: 'load', slotKey, timedOut: false, message: '' });
    actions.loadSlot(slotKey).catch((err) => {
      setInitFlow((prev) => prev?.slotKey === slotKey ? {
        ...prev,
        active: true,
        timedOut: true,
        message: `Failed to load franchise: ${err?.message ?? 'unknown error'}`,
      } : prev);
    });
  }, [workerReady, leagueReady, pendingNewSlot, initFlow?.active, activeSlot, actions]);

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
    const handler = () => { if (leagueReady && activeSlot) actions.saveSlot(activeSlot); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [leagueReady, activeSlot, actions]);

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
    if (unresolvedWeeklyEvent) {
      setShowWeeklyEventModal(true);
      return;
    }

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
  }, [busy, simulating, actions, league, unresolvedWeeklyEvent]);

  const handleResolveWeeklyEvent = useCallback((choiceId) => {
    if (!league || !unresolvedWeeklyEvent || !choiceId) return;
    const resolved = applyEventDecision(unresolvedWeeklyEvent, choiceId);
    if (!resolved) return;
    Object.assign(unresolvedWeeklyEvent, resolved, { lastCheckedWeek: league?.week ?? 1 });
    logChronicleEvent(league, {
      week: league?.week,
      season: league?.year,
      type: 'weekly_event_decision',
      headline: unresolvedWeeklyEvent?.headline ?? 'Franchise event resolved',
      summary: `${resolved?.choiceLabel ?? 'Decision'} selected`,
      outcome: resolved?.outcome,
      meta: { eventId: unresolvedWeeklyEvent?.id, choiceId },
    });
    setShowWeeklyEventModal(false);
  }, [league, unresolvedWeeklyEvent]);

  const handleSimToPhase = useCallback((targetPhase) => {
    if (busy || simulating || advancingRef.current || isBatchSimBlocking) return;
    advancingRef.current = true;
    actions.simToPhase(targetPhase);
  }, [busy, simulating, isBatchSimBlocking, actions]);

  const handleRequestSimToPhase = useCallback((targetPhase) => {
    if (busy || simulating || advancingRef.current || isBatchSimBlocking) return;
    setSimConfirmTarget(targetPhase);
  }, [busy, simulating, isBatchSimBlocking]);

  const handleCancelBatchSim = useCallback(() => {
    actions.cancelSimToPhase();
  }, [actions]);

  const handleRetryBatchSim = useCallback(() => {
    const target = batchSim?.targetPhase;
    if (!target) return;
    actions.retrySimToPhase(target);
  }, [actions, batchSim]);

  const handleReset = useCallback(() => {
    if (window.confirm('Reset Franchise? This permanently deletes your current save and starts over. This cannot be undone.')) {
      actions.reset();
    }
  }, [actions]);

  const handleSafeReset = useCallback(() => {
    if (bootRequestId) {
      actions.invalidateBootRequestId(bootRequestId);
    }
    actions.setActiveBootRequestId(null);
    safeStarterInFlightRef.current = false;
    setBootRequestId(null);
    setPendingNewSlot(null);
    setInitFlow(null);
    setActiveSlot(null);
    setActiveView('saves');
  }, [actions, bootRequestId]);

  // ── Skip-mode post-game summary ──────────────────────────────────────────
  // After advanceWeek({ skipUserGame: true }), WEEK_COMPLETE fires with lastResults.
  // Show a PostGameSummary overlay so the user sees the final score.
  useEffect(() => {
    if (simulating) return;
    if (!Array.isArray(lastResults) || lastResults.length === 0) return;
    if (userGameLogs) return; // watch mode handles its own PostGameScreen
    if (postGameResult) return; // watch-mode overlay already up
    if (!league?.userTeamId) return;

    const simWeek = lastSimWeek ?? Math.max(1, (league?.week ?? 1) - 1);
    if (lastShownSkipWeekRef.current === simWeek) return; // already shown for this week

    const userResult = lastResults.find(
      (r) => Number(r?.homeId) === Number(league.userTeamId) || Number(r?.awayId) === Number(league.userTeamId),
    );
    if (!userResult) return;

    const teams = Array.isArray(league?.teams) ? league.teams : [];
    const homeTeam = teams.find((t) => Number(t?.id) === Number(userResult.homeId));
    const awayTeam = teams.find((t) => Number(t?.id) === Number(userResult.awayId));

    const homeScore = safeSkipScore(userResult.homeScore ?? userResult.scoreHome, 0);
    const awayScore = safeSkipScore(userResult.awayScore ?? userResult.scoreAway, 0);
    const userIsHome = Number(userResult.homeId) === Number(league.userTeamId);
    const userScore = userIsHome ? homeScore : awayScore;
    const oppScore = userIsHome ? awayScore : homeScore;
    const diff = userScore - oppScore;
    const momentumChange = diff > 14 ? 3 : diff > 0 ? 2 : diff === 0 ? 0 : diff > -14 ? -2 : -3;

    // Collect newly injured players from user roster
    const userTeam = teams.find((t) => Number(t?.id) === Number(league.userTeamId));
    const injuries = (userTeam?.roster ?? [])
      .filter((p) => safeSkipScore(p?.injuryWeeksRemaining ?? p?.injuredWeeks ?? p?.injury?.gamesRemaining, 0) > 0)
      .sort((a, b) => safeSkipScore(b?.ovr) - safeSkipScore(a?.ovr))
      .slice(0, 3);

    const gameId = userResult.gameId ?? buildCanonicalGameId({
      seasonId: league?.seasonId,
      week: simWeek,
      homeId: userResult.homeId,
      awayId: userResult.awayId,
    });

    const resolvedHomeAbbr = homeTeam?.abbr ?? userResult.homeName?.slice(0, 3) ?? 'HOME';
    const resolvedAwayAbbr = awayTeam?.abbr ?? userResult.awayName?.slice(0, 3) ?? 'AWAY';

    lastShownSkipWeekRef.current = simWeek;
    setSkipGameSummary({
      homeScore,
      awayScore,
      homeTeam: homeTeam ?? { id: userResult.homeId, abbr: resolvedHomeAbbr },
      awayTeam: awayTeam ?? { id: userResult.awayId, abbr: resolvedAwayAbbr },
      homeAbbr: resolvedHomeAbbr,
      awayAbbr: resolvedAwayAbbr,
      userTeamId: league.userTeamId,
      week: simWeek,
      phase: league.phase,
      momentumChange,
      injuries,
      gameId,
    });

    // Archive the user's completed game immediately so Franchise HQ's
    // "Last Result" card always reflects the real score — not a stale
    // placeholder or a different team's result from the migration batch.
    try {
      saveGame(gameId, {
        season: league?.seasonId,
        week: simWeek,
        homeId: userResult.homeId,
        awayId: userResult.awayId,
        homeAbbr: resolvedHomeAbbr,
        awayAbbr: resolvedAwayAbbr,
        homeScore,
        awayScore,
        teamStats: userResult.teamStats ?? null,
        playerStats: userResult.playerStats ?? null,
        scoringSummary: Array.isArray(userResult.scoringSummary) ? userResult.scoringSummary : [],
        recap: userResult.recap ?? userResult.recapText ?? null,
        summary: userResult.summary ?? null,
        timestamp: Date.now(),
      });
    } catch {
      // archive save is best-effort; game result is still correct in league state
    }
  }, [simulating, lastResults, lastSimWeek, userGameLogs, postGameResult, league]);

  // ── Auto-dismiss routine info notices ─────────────────────────────────────
  // Post-sim info notices ("Weekly simulation ran…", "development updated…")
  // previously piled up as permanent full-width cards over the weekly results.
  // Info-level, non-retryable notices now dismiss themselves; warnings and
  // retryable notices persist until the user acts on them.
  const autoDismissTimersRef = useRef(new Map());
  useEffect(() => {
    const timers = autoDismissTimersRef.current;
    (notifications ?? []).forEach((n) => {
      if (!n || n.level === 'warn' || n.retryable || timers.has(n.id)) return;
      timers.set(n.id, setTimeout(() => {
        timers.delete(n.id);
        actions.dismissNotification(n.id);
      }, 7000));
    });
    return undefined;
  }, [notifications, actions]);
  useEffect(() => () => {
    autoDismissTimersRef.current.forEach((t) => clearTimeout(t));
    autoDismissTimersRef.current.clear();
  }, []);

  // ── Keyboard shortcuts (desktop) ──────────────────────────────────────────
  // Space / Enter  → Advance week (when not busy and no modal open)
  // S              → Manual save
  // ?              → Toggle changelog / help
  useEffect(() => {
    const onKey = (e) => {
      // Skip if focus is inside an input, textarea, or select
      const tag = document.activeElement?.tagName?.toUpperCase();
      if (['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tag)) return;
      // Skip if any modal/overlay is open (postGame, skipSummary, userGamePrompt, etc.)
      if (postGameResult || skipGameSummary || promptUserGame || userGameLogs) return;
      // Skip if not in an active league
      if (!league) return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (typeof handleAdvanceWeek === 'function') handleAdvanceWeek();
      } else if (e.key === 's' || e.key === 'S') {
        if (!busy && leagueReady) {
          if (activeSlot) actions.saveSlot(activeSlot);
        }
      } else if (e.key === '?') {
        setShowChangelog(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [league, busy, leagueReady, postGameResult, skipGameSummary, promptUserGame, userGameLogs, handleAdvanceWeek, actions, activeSlot]);

  // Expose state and actions to window for E2E testing
  useEffect(() => {
    setLegacyState(state);
    if (actions && typeof handleAdvanceWeek === 'function') {
      window.gameController = {
        ...actions,
        startNewLeague: () => actions.newLeague(DEFAULT_TEAMS, { userTeamId: 0, name: 'Test League' }),
        advanceWeek: handleAdvanceWeek,
        // Route straight into the Game Book screen — used by E2E to exercise
        // both the canonical open path and the missing-game recovery path.
        openBoxScore: (gameId) => setExternalBoxScoreId(gameId),
      };
      window.handleGlobalAdvance = handleAdvanceWeek;
    }
  }, [state, actions, handleAdvanceWeek]);

  // ── Advance button label ──────────────────────────────────────────────────


  useEffect(() => {
    if (!leagueReady || !activeSlot) return;
    const slotNum = activeSlot?.split('_')?.[2];
    if (!slotNum) return;
    const userTeam = Array.isArray(league?.teams) ? league.teams.find(t => t?.id === league?.userTeamId) : null;
    let existing = {};
    try {
      const existingRaw = localStorage.getItem(`footballgm_slot_${slotNum}_meta`);
      existing = existingRaw ? JSON.parse(existingRaw) : {};
    } catch {
      existing = {};
    }
    const nextMeta = {
      name: existing?.name ?? `Franchise ${slotNum}`,
      teamName: userTeam?.name ?? userTeam?.abbr ?? 'Unknown Team',
      record: { wins: userTeam?.wins ?? 0, losses: userTeam?.losses ?? 0 },
      season: league?.season ?? league?.year ?? 1,
      week: league?.week ?? 1,
      lastSaved: new Date().toISOString(),
    };
    localStorage.setItem(`footballgm_slot_${slotNum}_meta`, JSON.stringify(nextMeta));
  }, [leagueReady, league, activeSlot]);

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
    console.info('[BuildMarker]', {
      appVersion: APP_VERSION,
      buildTime: import.meta.env.VITE_BUILD_TIME ?? 'unknown',
      commitSha: import.meta.env.VITE_GIT_SHA ?? 'unknown',
    });
  }, []);

  useEffect(() => {
    if (safeStarterInFlightRef.current) return;
    if (!shouldFinalizeNewSlotBootstrap({ league, pendingNewSlot })) return;
    // Only save and finalize if the league is actually playable.
    if (hasMinimumPlayableLeague(league)) {
      actions.saveSlot(pendingNewSlot);
      setActiveSlot(pendingNewSlot);
      setPendingNewSlot(null);
      setInitFlow(null);
      setBootRequestId(null);
      pushBootDiag('league_state_set', { hasLeague: true });
    }
  }, [league, pendingNewSlot, actions, pushBootDiag]);

  useEffect(() => {
    if (!initFlow?.active) return;
    if (hasMinimumPlayableLeague(league)) {
      setInitFlow(null);
      return;
    }
    const timeoutMs = 15000;
    const timer = setTimeout(() => {
      // Set active: false so the slot stops showing "Loading franchise state…"
      // while the error banner is visible. The user can retry via the banner.
      setInitFlow((prev) => prev?.active ? {
        ...prev,
        active: false,
        timedOut: true,
        message: 'Initialization is taking longer than expected. You can retry without losing this slot.',
      } : prev);
      pushBootDiag('bootstrap_gate_result', { timedOut: true });
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [initFlow, league, pushBootDiag]);

  const handleSafeStarterLeague = useCallback(async () => {
    const slotKey = pendingNewSlot ?? initFlow?.slotKey;
    if (!slotKey) {
      setInitFlow((prev) => prev ? {
        ...prev,
        timedOut: true,
        message: 'Safe starter needs a selected franchise slot. Return to slots and try again.',
      } : prev);
      return;
    }

    if (bootRequestId) {
      actions.invalidateBootRequestId(bootRequestId);
    }
    const safeBootRequestId = `safe_boot_${Date.now()}`;
    safeStarterInFlightRef.current = true;
    setBootRequestId(safeBootRequestId);
    actions.setActiveBootRequestId(safeBootRequestId);
    pushBootDiag('fallback_worker_commit_requested', {
      slotKey,
      invalidatedBootRequestId: bootRequestId,
      safeBootRequestId,
      userTeamId: initFlow?.userTeamId,
    });

    try {
      const response = await actions.useSafeStarterLeague(slotKey, {
        bootRequestId: safeBootRequestId,
        userTeamId: initFlow?.userTeamId,
        name: initFlow?.leagueName,
        year: initFlow?.year,
        difficulty: initFlow?.difficulty,
        salaryCap: initFlow?.salaryCap,
      });
      const viewValidation = getBootViewStateValidation(response?.payload);
      const fullValidation = getPlayableLeagueValidation(response?.payload);
      pushBootDiag('fallback_worker_commit_result', {
        slotKey,
        safeBootRequestId,
        uiBootValid: viewValidation.valid,
        uiBootReasons: viewValidation.reasons,
        fullSimValidForViewSnapshot: fullValidation.valid,
        fullSimReasonsForViewSnapshot: fullValidation.reasons,
      });
      setActiveSlot(slotKey);
      setPendingNewSlot(null);
      setInitFlow(null);
      setBootRequestId(null);
      setSafeStarterWarning('Loaded a safe starter league because normal franchise setup did not respond.');
      setActiveView('league_dashboard');
    } catch (err) {
      pushBootDiag('fallback_worker_commit_failed', {
        slotKey,
        safeBootRequestId,
        message: err?.message ?? 'unknown',
      });
      setInitFlow((prev) => prev ? {
        ...prev,
        timedOut: true,
        message: `Safe starter failed: ${err?.message ?? 'unknown error'}`,
      } : prev);
    } finally {
      safeStarterInFlightRef.current = false;
      actions.setActiveBootRequestId(null);
    }
  }, [actions, pendingNewSlot, initFlow, bootRequestId, pushBootDiag]);
  const getAdvanceLabel = () => {
    if (batchSim) return `Simulating…`;
    if (simulating) return `Simulating ${simProgress}%`;
    if (busy) return 'Working…';
    if (!league) return 'Advance';
    const isCutdownRequired = (league?.phase === 'preseason') && ((league?.teams?.find((t) => t.id === league?.userTeamId)?.rosterCount ?? 0) > 53);
    if (isCutdownRequired) return 'Cut to 53';
    if (league.phase === 'preseason') return '▶ Start Season';
    if (['offseason_resign', 'offseason'].includes(league.phase)) return '▶ Advance';
    if (league.phase === 'free_agency') return '▶ Next FA Day';
    if (league.phase === 'draft') return '▶ Draft';
    if (league.phase === 'playoffs') {
      const roundNames = { 19: 'Wild Card', 20: 'Divisional', 21: 'Conf. Champ', 22: 'Super Bowl' };
      return `▶ ${roundNames[league.week] || `Playoffs Wk ${league.week}`}`;
    }
    return `▶ Advance ${formatRegularUnitLabel(league.week)}`;
  };

  const safePhase = league?.phase ?? null;
  const canUseTopActions = !!safePhase && !(busy || simulating || isBatchSimBlocking);
  const retryLabel = initFlow?.mode === 'load' ? 'Retry Load' : initFlow?.mode === 'new' ? 'Retry' : 'Reload App';
  const handlePrimaryRetry = () => {
    if (initFlow?.mode === 'load' && initFlow?.slotKey) {
      setInitFlow((prev) => prev ? { ...prev, active: true, timedOut: false, message: '' } : prev);
      actions.loadSlot(initFlow.slotKey).catch((err) => {
        setInitFlow((prev) => prev ? {
          ...prev,
          active: true,
          timedOut: true,
          message: `Failed to load franchise: ${err?.message ?? 'unknown error'}`,
        } : prev);
      });
      return;
    }
    if (initFlow?.mode === 'new') {
      setActiveView('new_league');
      return;
    }
    window.location.reload();
  };

  const topSecondaryAction = useMemo(() => {
    if (!safePhase) return null;
    if (safePhase === 'regular') {
      return {
        label: 'Sim to Playoffs',
        title: 'Simulate all remaining regular season weeks',
        onClick: () => handleRequestSimToPhase('playoffs'),
        disabled: !canUseTopActions,
      };
    }
    if (safePhase === 'playoffs') {
      return {
        label: 'Sim to Offseason',
        title: 'Simulate remaining playoff games to offseason',
        onClick: () => handleRequestSimToPhase('offseason'),
        disabled: !canUseTopActions,
      };
    }
    if (['offseason_resign', 'offseason', 'free_agency', 'draft'].includes(safePhase)) {
      return {
        label: 'Sim to Season',
        title: 'Simulate through offseason to next preseason',
        onClick: () => handleRequestSimToPhase('preseason'),
        disabled: !canUseTopActions,
      };
    }
    return null;
  }, [safePhase, canUseTopActions, handleRequestSimToPhase]);

  const utilityActions = useMemo(() => {
    const items = [];

    if (safePhase === 'regular') {
      items.push({
        label: 'Sim to Offseason',
        title: 'Simulate through playoffs to offseason',
        onClick: () => handleRequestSimToPhase('offseason'),
        disabled: !canUseTopActions,
      });
    }
    if (safePhase && safePhase !== 'regular' && safePhase !== 'playoffs' && ['offseason_resign', 'offseason', 'free_agency', 'draft'].includes(safePhase)) {
      items.push({
        label: 'Sim to Season',
        title: 'Simulate through offseason to next preseason',
        onClick: () => handleRequestSimToPhase('preseason'),
        disabled: !canUseTopActions,
      });
    }

    items.push(
      { label: 'Quick Save', onClick: () => activeSlot && actions.saveSlot(activeSlot), disabled: !activeSlot || busy || isBatchSimBlocking },
      { label: 'Manage Saves', onClick: () => setActiveSlot(null), disabled: busy || isBatchSimBlocking },
      { label: 'Reset Franchise', onClick: handleReset, disabled: busy || isBatchSimBlocking, danger: true },
    );

    return items;
  }, [safePhase, canUseTopActions, activeSlot, actions, busy, isBatchSimBlocking, handleReset, handleRequestSimToPhase]);

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

  const shouldShowNewLeagueSetup = activeView === 'new_league' && !initFlow?.active && !leagueReady;

  if (shouldShowNewLeagueSetup || (!leagueReady && !pendingNewSlot) || activeSlot === null) {
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
              Retry
            </button>
          )}
          <button className="btn app-banner-btn" onClick={handleSafeReset}>
            Safe Reset
          </button>
        </div>
      </div>
    ) : null;
    if (shouldShowNewLeagueSetup) {
      return (
        <ErrorBoundary contextHint="new-franchise-setup">
          <div className="view fade-in" key="new_league" data-testid="app-new-league-setup">
            {initTimeoutPanel}
            <NewLeagueSetup
              actions={actions}
              onStartCreate={(requestId, createMeta = {}) => {
                setBootRequestId(requestId);
                pushBootDiag('new_league_setup_submit', { requestId, pendingNewSlot, ...createMeta });
                setInitFlow({
                  active: true,
                  mode: 'new',
                  slotKey: pendingNewSlot,
                  timedOut: false,
                  message: '',
                  ...createMeta,
                });
              }}
              onCreateError={(err) => {
                pushBootDiag('ui_received_ERROR', { message: err?.message ?? 'unknown' });
                setInitFlow((prev) => prev ? {
                  ...prev,
                  active: true,
                  timedOut: true,
                  message: `Failed to create league: ${err?.message ?? 'unknown error'}`,
                } : prev);
              }}
              onCancel={() => {
                setPendingNewSlot(null);
                setInitFlow(null);
                setActiveSlot(null);
                setActiveView('saves');
              }}
            />
          </div>
      </ErrorBoundary>
    );
  }
  return (
      <ErrorBoundary contextHint="save-slot-manager">
        <div className="view fade-in" key="save_slot_manager" data-testid="app-save-slots">
          {initTimeoutPanel}
          <SaveSlotManager
            activeSlot={activeSlot}
            loadingSlot={loadingSlot}
            loadingLabel={initFlow?.mode === 'load' ? 'Loading franchise state…' : 'Preparing franchise setup…'}
            onLoad={(slotKey) => {
              setInitFlow({ active: true, mode: 'load', slotKey, timedOut: false, message: '' });
              setActiveSlot(slotKey);
              actions.loadSlot(slotKey).catch((err) => {
                setInitFlow((prev) => prev?.slotKey === slotKey ? {
                  ...prev,
                  active: true,
                  timedOut: true,
                  message: `Failed to load franchise: ${err?.message ?? 'unknown error'}`,
                } : prev);
              });
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

  const shellLeague = leagueReady ? league : null;
  const safeWeek = shellLeague?.week ?? null;
  const safeYear = shellLeague?.year ?? shellLeague?.seasonId ?? null;
  const safeUserTeamId = shellLeague?.userTeamId ?? null;
  const bootstrapSummary = summarizeBootstrapState(league);
  const bootViewValidation = getBootViewStateValidation(league);
  const fullSimValidationForUiState = getPlayableLeagueValidation(league);
  const userTeam = Array.isArray(shellLeague?.teams)
    ? shellLeague.teams.find((t) => Number(t?.id) === Number(safeUserTeamId))
    : null;
  const isCutdownRequired = (safePhase === 'preseason') && (userTeam?.rosterCount ?? 0) > 53;

  const isPostseason = safePhase === 'playoffs';

  const themeClass = safePhase ? `theme-${safePhase}` : 'theme-default';

  if (isNewFranchiseBootstrapping) {
    return (
      <div className="app-loading" data-testid="app-bootstrap-loading">
        <div className="app-loading-spinner" />
        <p className="app-loading-text">
          Still setting up your franchise… {bootstrapSummary.reasons[0] ?? 'Preparing franchise data.'}
        </p>
        {initFlow?.timedOut && (
          <div role="alert" className="app-banner app-banner-error" style={{ marginTop: 12 }}>
            <span>{initFlow.message}</span>
            <div style={{ display: 'inline-flex', gap: 8, marginLeft: 10 }}>
              <button data-testid="app-bootstrap-retry" className="btn btn-primary app-banner-btn" onClick={() => setActiveView('new_league')}>
                Retry
              </button>
              <button data-testid="app-bootstrap-safe-starter" className="btn btn-primary app-banner-btn" onClick={handleSafeStarterLeague}>
                Use Safe Starter League
              </button>
              <button data-testid="app-bootstrap-back-to-slots" className="btn app-banner-btn" onClick={handleSafeReset}>
                Safe Reset
              </button>
            </div>
          </div>
        )}
        {isBootDebugEnabled && (
          <details style={{ marginTop: 12, color: '#fff', width: '95%', maxWidth: 720 }}>
            <summary>Boot diagnostics</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({
              latest: bootDiagnostics[bootDiagnostics.length - 1] ?? null,
              workerResponseArrived: !!league || !!error,
              fullStateArrived: !!league,
              errorArrived: !!error,
              activeSlot,
              pendingNewSlot,
              initFlow,
              bootRequestId,
              lastWorkerMessageType,
              hasLeague: !!league,
              uiBootValidation: {
                valid: bootViewValidation.valid,
                reasons: bootViewValidation.reasons,
              },
              fullSimValidationForUiState: {
                valid: fullSimValidationForUiState.valid,
                reasons: fullSimValidationForUiState.reasons,
              },
              teamCount: Array.isArray(league?.teams) ? league.teams.length : 0,
              weekCount: Array.isArray(league?.schedule?.weeks) ? league.schedule.weeks.length : 0,
              trace: bootDiagnostics,
            }, null, 2)}</pre>
          </details>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className={`app-shell view-enter ${isPostseason ? 'postseason' : ''} ${themeClass}`} key="league_dashboard" data-testid="app-shell-ready">

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
            <span className="app-season-year">{safeYear}</span>
            <span className="app-season-sep">&middot;</span>
            <span>{safeWeek ? `Week ${safeWeek}` : 'Offseason'}</span>
            <span className="app-season-sep">&middot;</span>
            <span className="app-phase-badge">{
              safePhase === 'regular' ? 'Regular Season' :
              safePhase === 'playoffs' ? 'Playoffs' :
              safePhase === 'preseason' ? 'Preseason' :
              safePhase === 'offseason_resign' ? 'Re-Signing' :
              safePhase === 'offseason' ? 'Offseason' :
              safePhase === 'free_agency' ? 'Free Agency' :
              safePhase === 'draft' ? 'Draft' :
              safePhase
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
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <button
              className="btn btn-primary app-advance-btn app-action-primary"
              onClick={handleAdvanceWeek}
              disabled={busy || simulating || isCutdownRequired || isBatchSimBlocking || !!promptUserGame}
              title={isCutdownRequired ? "You must cut your roster to 53 players before advancing." : ""}
              style={{ flex: 2 }}
            >
              {getAdvanceLabel()}
            </button>
            {topSecondaryAction && !isBatchSimBlocking && (
              <button
                className="btn app-sim-btn app-action-secondary"
                onClick={topSecondaryAction.onClick}
                disabled={topSecondaryAction.disabled}
                title={topSecondaryAction.title}
                style={{ flex: 1 }}
              >
                {topSecondaryAction.label}
              </button>
            )}
          </div>
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

      {/* ── Sim Confirmation Dialog ───────────────────────────────────── */}
      {simConfirmTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm long simulation"
          data-testid="sim-confirm-dialog"
          className="app-banner app-banner-warn"
          style={{ margin: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px' }}
        >
          <span className="app-banner-text" data-testid="sim-confirm-text">
            {simConfirmTarget === 'playoffs'
              ? 'Sim all remaining regular-season weeks? You may skip weekly decisions, injuries, contracts, and game-plan adjustments.'
              : simConfirmTarget === 'offseason'
              ? 'Sim to offseason? You may skip remaining games and weekly decisions.'
              : 'Sim through offseason to next preseason? You may skip offseason decisions.'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary app-banner-btn"
              data-testid="sim-confirm-proceed"
              onClick={() => { handleSimToPhase(simConfirmTarget); setSimConfirmTarget(null); }}
            >
              Sim anyway
            </button>
            <button
              className="btn app-banner-btn"
              data-testid="sim-confirm-cancel"
              onClick={() => setSimConfirmTarget(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

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
      {unresolvedWeeklyEvent && !simulating && !busy && (
        <div role="alert" className="app-banner app-banner-error" style={{ marginTop: 8, cursor: 'pointer', animation: 'eventPulse 1.25s ease-in-out infinite' }} onClick={() => setShowWeeklyEventModal(true)}>
          <span className="app-banner-text">Franchise Event Requires Decision · Advance Week is blocked.</span>
          <button className="btn app-banner-btn" onClick={(e) => { e.stopPropagation(); setShowWeeklyEventModal(true); }}>
            Open Event
          </button>
          <style>{`@keyframes eventPulse { 0%{opacity:0.8} 50%{opacity:1} 100%{opacity:0.8} }`}</style>
        </div>
      )}

      {/* ── Batch Sim Overlay ──────────────────────────────────────────── */}
      {batchSim && (
        <div className="app-batch-overlay">
          <div className="app-batch-title">
            {batchSim.targetPhase === 'playoffs'
              ? 'Simulating to playoffs…'
              : batchSim.targetPhase === 'offseason'
              ? 'Simulating to offseason…'
              : batchSim.targetPhase === 'preseason'
              ? 'Simulating to next season…'
              : `Simulating to ${batchSim.targetPhase}…`}
          </div>
          <div className="app-batch-detail">
            {batchSim.phase === 'regular' ? `Regular Season · Week ${batchSim.currentWeek}` :
             batchSim.phase === 'playoffs' ? `Playoffs · Week ${batchSim.currentWeek}` :
             batchSim.phase || 'Starting up…'}
          </div>
          <div className="app-batch-detail" style={{ opacity: 0.85, fontSize: 12 }}>
            {batchSim.status === 'running' || !batchSim.status
              ? 'Simulating weeks — this may take a moment.'
              : batchSim.status === 'cancelled'
              ? 'Simulation cancelled. You can retry or return to your franchise.'
              : batchSim.status === 'completed'
              ? 'Simulation complete!'
              : batchSim.status}
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
          <button className="btn app-banner-btn" onClick={handlePrimaryRetry} disabled={busy || simulating}>
            {retryLabel}
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
                Retry
              </button>
            )}
            <button className="btn app-banner-btn" onClick={handleSafeReset}>
              Safe Reset
            </button>
          </div>
        </div>
      )}
      {!bootstrapSummary.ready && (
        <div role="status" className="app-banner app-banner-info">
          Still setting up your franchise… {bootstrapSummary.reasons[0] ?? 'Preparing franchise data.'}
        </div>
      )}
      {safeStarterWarning ? (
        <div role="status" className="app-banner app-banner-warn" data-testid="safe-starter-warning">
          {safeStarterWarning}
        </div>
      ) : null}

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {/* Only notifications with real, visible content render a dismissible
          pill — empty entries would otherwise show as a blank gray block with
          just an "×" in the post-sim / weekly-results area.
          Mobile trust pass: at most 3 rows render (newest last) so routine
          post-sim notices ("Weekly simulation ran…", "development updated…")
          can't bury the weekly results; older ones collapse into one compact
          summary row with a Dismiss-all action. Warnings and retryable rows
          stay until acted on; info rows auto-dismiss (see effect above). */}
      {(() => {
        if (getDisplayableNotifications(notifications).length === 0) return null;
        const { visible, collapsed } = capVisibleNotifications(notifications, 3);
        return (
          <div className="app-notifications" data-testid="app-notifications">
            {collapsed.length > 0 && (
              <div className="app-notification app-notification-info app-notification-compact" data-testid="app-notification-overflow">
                <span>{collapsed.length} earlier notice{collapsed.length === 1 ? '' : 's'}</span>
                <button
                  onClick={() => collapsed.forEach((n) => actions.dismissNotification(n.id))}
                  className="app-notification-dismiss"
                  aria-label="Dismiss earlier notices"
                >
                  ×
                </button>
              </div>
            )}
            {visible.map(n => (
              <div
                key={n.id}
                className={`app-notification app-notification-compact ${n.level === 'warn' ? 'app-notification-warn' : 'app-notification-info'}`}
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
                  aria-label="Dismiss notice"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        );
      })()}

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
          onGameDetailBack={() => {
            if (postGameResultStash) {
              setPostGameResult(postGameResultStash);
              setPostGameResultStash(null);
            }
          }}
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
                {/* ── Tactical Tendency Selector ── */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    Coaching Tendency
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { key: 'CONSERVATIVE', label: 'Conservative', color: '#34C759' },
                      { key: 'BALANCED',     label: 'Balanced',     color: '#0A84FF' },
                      { key: 'AGGRESSIVE',   label: 'Aggressive',   color: '#FF453A' },
                    ].map(({ key, label, color }) => (
                      <button
                        key={key}
                        onClick={() => setUserTendency(key)}
                        style={{
                          flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 'var(--text-xs)', fontWeight: 700,
                          border: `1.5px solid ${userTendency === key ? color : 'var(--hairline)'}`,
                          background: userTendency === key ? `${color}22` : 'transparent',
                          color: userTendency === key ? color : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4, textAlign: 'center' }}>
                    {userTendency === 'AGGRESSIVE' ? 'More deep passes & 4th-down attempts'
                      : userTendency === 'CONSERVATIVE' ? 'More runs & safe punt decisions'
                      : 'Baseline simulation behavior'}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setWatchMode('watch');
                    actions.watchGame(userTendency);
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
                    actions.watchGame(userTendency);
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
                    actions.watchGame(userTendency);
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
        // Canonical final: the worker posts GAME_EVENT (the league-recorded
        // score) before PLAY_LOGS, so the real result is known for the whole
        // watch session. The narrated play stream runs on a different engine
        // whose running score can contradict it — never treat viewer-reported
        // scores as the result when the canonical final exists.
        const canonicalFinal = readStrictFinalScore(userEvent);
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
              userTendency={userTendency}
              finalScore={canonicalFinal}
              gameSummary={{
                gameReasoningFlags: userGameReasoningFlags || [],
                homeId: homeTeam?.id,
                awayId: awayTeam?.id,
                homeAbbr: homeTeam?.abbr,
                awayAbbr: awayTeam?.abbr,
              }}
              onComplete={(scores) => {
                try {
                  // Belt-and-suspenders save immediately on game completion
                  if (activeSlot) actions.saveSlot(activeSlot);
                  // Capture final scores + logs for PostGameScreen, then clear the viewer.
                  // If neither the canonical GAME_EVENT nor the viewer callback has a
                  // strict pair, do not mount the normal result screen: it would have
                  // no trustworthy W/L/T or archive payload.
                  const nextPostGameResult = buildWatchPostGameResult({
                    canonicalFinal,
                    viewerScores: scores,
                    homeTeam,
                    awayTeam,
                    userTeamId: league?.userTeamId,
                    week: league?.week,
                    phase: league?.phase,
                    logs: userGameLogs || [],
                    liveStats: userGameLiveStats || null,
                    playerStats: userGamePlayerStats || null,
                    gameReasoningFlags: userGameReasoningFlags || [],
                    seasonId: league?.seasonId,
                  });
                  if (nextPostGameResult) {
                    setPostGameRecovery(null);
                    setPostGameResult(nextPostGameResult);
                  } else {
                    setPostGameResult(null);
                    setPostGameResultStash(null);
                    setPostGameRecovery({ week: league?.week, phase: league?.phase, homeTeam, awayTeam });
                  }
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
          playerStats={postGameResult.playerStats || null}
          gameReasoningFlags={postGameResult.gameReasoningFlags || []}
          boxScoreGameId={postGameResult.gameId}
          onOpenBoxScore={(gameId) => {
            if (!gameId) return;
            setPostGameResultStash(postGameResult);
            setPostGameResult(null);
            setExternalBoxScoreId(gameId);
          }}
          onContinue={() => {
            try {
              setPostGameResult(null);
              setPostGameResultStash(null);
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
              setPostGameResultStash(null);
            }
          }}
          onArchiveReady={(archivePayload) => {
            if (!archivePayload?.gameId) return;
            saveGame(archivePayload.gameId, {
              ...archivePayload,
              season: archivePayload.season ?? postGameResult.seasonId ?? league?.seasonId ?? null,
            });
          }}
        />
      )}

      {postGameRecovery && !postGameResult && (
        <div
          data-testid="postgame-missing-final-recovery"
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", inset: 0, zIndex: 9700,
            background: "rgba(0,0,0,0.88)",
            backdropFilter: "blur(16px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px 16px",
          }}
        >
          <div style={{
            width: "100%", maxWidth: 420,
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
            borderRadius: 16,
            padding: 20,
            textAlign: "center",
          }}>
            <div style={{ fontSize: "1.2rem", fontWeight: 900, marginBottom: 8 }}>
              Official result pending
            </div>
            <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>
              The league record did not provide a complete score for {postGameRecovery.awayTeam?.abbr ?? "AWY"} at {postGameRecovery.homeTeam?.abbr ?? "HME"}. No Game Book was opened or persisted.
            </p>
            <button
              type="button"
              data-testid="postgame-missing-final-continue"
              onClick={() => {
                setPostGameRecovery(null);
                setPostGameResultStash(null);
                setTimeout(() => {
                  try {
                    actions.advanceWeek({ skipUserGame: true });
                  } catch (err) {
                    console.error('[PostGameRecovery] advanceWeek failed:', err);
                  }
                }, 150);
              }}
              style={{
                cursor: "pointer",
                fontWeight: 800,
                fontSize: "0.85rem",
                padding: "10px 20px",
                borderRadius: 999,
                border: "1px solid var(--accent)",
                background: "var(--accent-muted)",
                color: "var(--accent)",
              }}
            >
              Continue week processing
            </button>
          </div>
        </div>
      )}

      {/* ── Skip-mode Post-Game Summary ────────────────────────────────── */}
      {skipGameSummary && !postGameResult && !postGameRecovery && (
        <PostGameSummary
          gameResult={skipGameSummary}
          injuries={skipGameSummary.injuries}
          momentumChange={skipGameSummary.momentumChange}
          onClose={() => setSkipGameSummary(null)}
          onViewGameBook={skipGameSummary.gameId ? () => {
            setSkipGameSummary(null);
            setExternalBoxScoreId(skipGameSummary.gameId);
          } : undefined}
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
      {showWeeklyEventModal && unresolvedWeeklyEvent && (
        <EventDecisionModal
          event={unresolvedWeeklyEvent}
          onChoose={handleResolveWeeklyEvent}
          onClose={() => setShowWeeklyEventModal(false)}
          onDecideLater={() => setShowWeeklyEventModal(false)}
        />
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
