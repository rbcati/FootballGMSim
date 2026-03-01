/**
 * LiveGame.jsx
 *
 * Phase-4 live game viewer.  Shown as a panel when the worker is
 * simulating a week; stays visible after simulation ends to show results.
 *
 * Architecture:
 *  - Receives `gameEvents` — an array of GAME_EVENT payloads emitted by the
 *    worker after each individual game finishes.  One entry per game.
 *  - Each event: { gameId, week, homeId, awayId, homeName, awayName,
 *                  homeAbbr, awayAbbr, homeScore, awayScore }
 *  - The user's own game is identified via `league.userTeamId`.
 *  - Synthetic play-by-play runs on an interval while simulating; text is
 *    generated from team abbreviations so it's always plausible.
 *  - "Skip to End" sets a local flag that suppresses new play lines and
 *    waits quietly for WEEK_COMPLETE.
 *
 * Layout:
 *   ┌──────────────── Header (LIVE dot / title / Skip button) ──────────────┐
 *   │ Progress bar                                                           │
 *   ├───────────────────────────────┬───────────────────────────────────────┤
 *   │  Scoreboard (left column)     │  Play-by-play log (right column)      │
 *   │  • All matchup cards          │  • Scrolling text for user's game     │
 *   │  • User game highlighted      │  • Auto-scroll to bottom              │
 *   └───────────────────────────────┴───────────────────────────────────────┘
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { audioManager } from '../audio.js';
import { launchConfetti } from '../../confetti.js';
import '../../ui-enhancements.css';

// ── Palette helper ─────────────────────────────────────────────────────────────

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

// ── Animated "LIVE" indicator ─────────────────────────────────────────────────

function LiveDot() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'var(--danger)',
        display: 'inline-block',
        animation: 'lgLivePulse 1.1s ease-in-out infinite',
      }} />
      <style>{`@keyframes lgLivePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.85)}}`}</style>
    </span>
  );
}

// ── Team badge (circular) ─────────────────────────────────────────────────────

function TeamBadge({ abbr, size = 36, isUser = false }) {
  const color = teamColor(abbr);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `${color}22`,
      border: `2px solid ${isUser ? 'var(--accent)' : color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, fontSize: size * 0.3,
      color: isUser ? 'var(--accent)' : color,
      flexShrink: 0, letterSpacing: '-0.5px',
    }}>
      {abbr?.slice(0, 3) ?? '?'}
    </div>
  );
}

// ── Scoreboard card (one per matchup) ────────────────────────────────────────

function MatchupCard({ event, userTeamId, pending }) {
  const { homeId, awayId, homeAbbr, awayAbbr, homeScore, awayScore } = event;
  const isUser   = homeId === userTeamId || awayId === userTeamId;
  const finished = !pending;

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isUser ? 'var(--accent)' : 'var(--hairline)'}`,
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3) var(--space-4)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      boxShadow: isUser ? '0 0 0 1px var(--accent)' : 'none',
      minWidth: 0,
    }}>
      {/* Away team */}
      <TeamBadge abbr={awayAbbr} size={32} isUser={awayId === userTeamId} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-xs)', fontWeight: 700,
          color: awayId === userTeamId ? 'var(--accent)' : 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {awayAbbr}
        </div>
        <div style={{
          fontSize: 'var(--text-xl)', fontWeight: 800, lineHeight: 1.1,
          color: finished && awayScore > homeScore ? 'var(--text)' : 'var(--text-muted)',
        }}>
          {awayScore}
        </div>
      </div>

      <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 40 }}>
        {finished
          ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', fontWeight: 700 }}>FINAL</span>
          : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600 }}>LIVE</span>}
      </div>

      {/* Home team */}
      <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
        <div style={{
          fontSize: 'var(--text-xs)', fontWeight: 700,
          color: homeId === userTeamId ? 'var(--accent)' : 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {homeAbbr}
        </div>
        <div style={{
          fontSize: 'var(--text-xl)', fontWeight: 800, lineHeight: 1.1,
          color: finished && homeScore > awayScore ? 'var(--text)' : 'var(--text-muted)',
        }}>
          {homeScore}
        </div>
      </div>
      <TeamBadge abbr={homeAbbr} size={32} isUser={homeId === userTeamId} />
    </div>
  );
}

// ── Pending (not-yet-resolved) game placeholder ───────────────────────────────

function PendingCard({ game, teamById, userTeamId }) {
  const home   = teamById[game.home] ?? { abbr: '???', id: game.home };
  const away   = teamById[game.away] ?? { abbr: '???', id: game.away };
  const isUser = home.id === userTeamId || away.id === userTeamId;
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isUser ? 'var(--accent)' : 'var(--hairline)'}`,
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3) var(--space-4)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      opacity: 0.6,
    }}>
      <TeamBadge abbr={away.abbr} size={32} isUser={away.id === userTeamId} />
      <div style={{ flex: 1, textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
        {away.abbr} @ {home.abbr}
      </div>
      <TeamBadge abbr={home.abbr} size={32} isUser={home.id === userTeamId} />
    </div>
  );
}

// ── Synthetic play-by-play generator ─────────────────────────────────────────
// Generates believable play descriptions from team abbreviations.
// These are entirely synthetic — the simulator doesn't produce play logs.

const PLAY_POOL = [
  { template: (o, d, g) => `${o} — ${g >= 15 ? 'deep pass complete' : 'short pass complete'} for ${g} yds`, type: 'PASS', momentum: 10 },
  { template: (o, d, g) => `${o} — QB scrambles for ${g} yds`, type: 'RUN', momentum: 5 },
  { template: (o, d, g) => `${o} — run up the middle, ${g} yds`, type: 'RUN', momentum: 5 },
  { template: (o, d, g) => `${o} — stretch run to the outside, ${g} yds`, type: 'RUN', momentum: 5 },
  { template: (o, d, g) => `${d} — sack! QB brought down, loss of ${g % 8 + 1} yds`, type: 'SACK', momentum: -15 },
  { template: (o, d, g) => `${o} — pass incomplete, ${d} breaks it up`, type: 'INCOMPLETE', momentum: -2 },
  { template: (o, d, g) => `${o} — TOUCHDOWN! 6 pts`, type: 'TOUCHDOWN', momentum: 40 },
  { template: (o, d, g) => `${o} — field goal attempt... GOOD! 3 pts`, type: 'FIELD_GOAL', momentum: 15 },
  { template: (o, d, g) => `${d} — INTERCEPTION! Ball at the ${g} yd line`, type: 'INTERCEPTION', momentum: -30 },
  { template: (o, d, g) => `${o} — punt, ${d} fair catch at their ${g} yd line`, type: 'PUNT', momentum: -5 },
  { template: (o, d, g) => `${o} — penalty: false start, 5 yd loss`, type: 'PENALTY', momentum: -5 },
  { template: (o, d, g) => `${o} — 4th-and-short: QB sneak, 1st down`, type: 'RUN', momentum: 15 },
  { template: (o, d, g) => `${d} — pass interference called, ${g} yds`, type: 'PENALTY', momentum: 5 },
  { template: (o, d, g) => `${o} — play-action fake, ${g} yd gain`, type: 'PASS', momentum: 8 },
  { template: (o, d, g) => `${o} — screen pass, ${g} yds after catch`, type: 'PASS', momentum: 8 },
  { template: (o, d, g) => `${o} — FUMBLE recovered by ${d}!`, type: 'FUMBLE', momentum: -30 },
  { template: (o, d, g) => `${o} — 3rd-and-long conversion, ${g} yds`, type: 'PASS', momentum: 12 },
  { template: (o, d, g) => `${d} — safety! 2 pts`, type: 'SAFETY', momentum: -20 },
];

function getOverlayClass(type) {
  switch (type) {
    case 'TOUCHDOWN': return 'goal touchdown';
    case 'FIELD_GOAL': return 'goal field-goal';
    case 'INTERCEPTION': return 'save turnover';
    case 'FUMBLE': return 'save turnover';
    case 'SACK': return 'save sack';
    case 'SAFETY': return 'save safety';
    default: return '';
  }
}

function generatePlay(homeAbbr, awayAbbr, seed = 0) {
  const isHome = (seed ^ 0x5f) % 3 !== 0;
  const off    = isHome ? homeAbbr : awayAbbr;
  const def    = isHome ? awayAbbr : homeAbbr;
  const gain   = ((seed * 13 + 7) % 28) + 1;
  const tplIdx = (seed * 7 + 3) % PLAY_POOL.length;
  const playObj = PLAY_POOL[tplIdx];

  return {
    ...playObj,
    text: playObj.template(off, def, gain),
    isHomeOffense: isHome, // true if Offense is Home team
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveGame({ simulating, simProgress, league, lastResults, gameEvents }) {
  const [visible, setVisible]       = useState(false);
  const [plays, setPlays]           = useState([]);
  const [skipping, setSkipping]     = useState(false);
  const [prevSim, setPrevSim]       = useState(false);
  const [momentum, setMomentum]     = useState(0);
  const [overlayEvent, setOverlayEvent] = useState(null);
  const [resultShown, setResultShown] = useState(false);
  const playLogRef                  = useRef(null);
  const intervalRef                 = useRef(null);
  const overlayTimerRef             = useRef(null);
  const playCountRef                = useRef(0);

  // ── Build fast-lookup maps ───────────────────────────────────────────────

  const teamById = useMemo(() => {
    const map = {};
    (league?.teams ?? []).forEach(t => { map[t.id] = t; });
    return map;
  }, [league?.teams]);

  // Games currently scheduled for this week that haven't resolved yet
  const weekGames = useMemo(() => {
    if (!league?.schedule?.weeks || !league?.week) return [];
    const wd = league.schedule.weeks.find(w => w.week === league.week);
    return wd?.games ?? [];
  }, [league?.schedule, league?.week]);

  // The user's team's game from the current week schedule
  const userGame = useMemo(() => {
    if (!league?.userTeamId) return null;
    return weekGames.find(
      g => Number(g.home) === league.userTeamId || Number(g.away) === league.userTeamId
    ) ?? null;
  }, [weekGames, league?.userTeamId]);

  // Resolved GAME_EVENT for the user's game (if simulation already finished it)
  const userEvent = useMemo(() => {
    if (!league?.userTeamId) return null;
    return (gameEvents ?? []).find(
      e => e.homeId === league.userTeamId || e.awayId === league.userTeamId
    ) ?? null;
  }, [gameEvents, league?.userTeamId]);

  const userHomeAbbr = userEvent?.homeAbbr
    ?? (userGame ? teamById[userGame.home]?.abbr : null) ?? '???';
  const userAwayAbbr = userEvent?.awayAbbr
    ?? (userGame ? teamById[userGame.away]?.abbr : null) ?? '???';

  const userIsHome = useMemo(() => {
    if (userEvent) return userEvent.homeId === league?.userTeamId;
    if (userGame) return Number(userGame.home) === league?.userTeamId;
    return false;
  }, [userEvent, userGame, league?.userTeamId]);

  // ── Show / hide logic ────────────────────────────────────────────────────

  useEffect(() => {
    if (simulating && !prevSim) {
      // Simulation just started
      setVisible(true);
      setPlays([]);
      setMomentum(0);
      setOverlayEvent(null);
      setResultShown(false);
      setSkipping(false);
      playCountRef.current = 0;
    }
    setPrevSim(simulating);
  }, [simulating]);

  // ── Synthetic play ticker ────────────────────────────────────────────────

  const addPlay = useCallback(() => {
    if (skipping) return;
    const n = playCountRef.current++;
    setPlays(prev => {
      const play = generatePlay(userHomeAbbr, userAwayAbbr, n);

      // Audio & Visual Effects
      if (play.type === 'TOUCHDOWN') {
        audioManager.playTouchdown();
        // Trigger confetti if the user's team scored
        if (play.isHomeOffense === userIsHome) {
          launchConfetti();
        }
      } else if (play.type === 'FIELD_GOAL') {
        audioManager.playFieldGoal();
      } else if (play.type === 'INTERCEPTION' || play.type === 'FUMBLE') {
        audioManager.playInterception();
      } else if (play.type === 'SACK') {
        audioManager.playSack();
      } else if (play.type === 'SAFETY') {
        audioManager.playSack(); // Re-use sack sound for now
      }

      // Update Momentum
      const delta = play.momentum || 0;
      const userIsOffense = play.isHomeOffense === userIsHome;
      const change = userIsOffense ? delta : -delta;
      setMomentum(m => Math.max(-100, Math.min(100, m + change)));

      // Trigger Overlay
      if (['TOUCHDOWN', 'FIELD_GOAL', 'INTERCEPTION', 'SACK', 'FUMBLE', 'SAFETY'].includes(play.type)) {
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        setOverlayEvent({ type: play.type, text: play.type.replace('_', ' ') });
        overlayTimerRef.current = setTimeout(() => setOverlayEvent(null), 2000);
      }

      return [...prev.slice(-49), { id: n, ...play }];   // keep last 50 entries
    });
  }, [skipping, userHomeAbbr, userAwayAbbr, userIsHome]);

  useEffect(() => {
    if (!simulating || skipping) {
      clearInterval(intervalRef.current);
      return;
    }
    // Only generate plays when the user has a game this week
    if (!userGame && !userEvent) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(addPlay, 700);
    return () => clearInterval(intervalRef.current);
  }, [simulating, skipping, addPlay, userGame, userEvent]);

  // Stop ticker when simulation finishes
  useEffect(() => {
    if (!simulating) clearInterval(intervalRef.current);
  }, [simulating]);

  // ── Auto-scroll play log ─────────────────────────────────────────────────

  useEffect(() => {
    if (playLogRef.current) {
      playLogRef.current.scrollTop = playLogRef.current.scrollHeight;
    }
  }, [plays]);

  // ── Skip to End ──────────────────────────────────────────────────────────

  const handleSkip = () => {
    setSkipping(true);
    clearInterval(intervalRef.current);
  };

  // ── Build scoreboard data ────────────────────────────────────────────────

  const userTeamId = league?.userTeamId;

  // All resolved game events — then filtered to user's game only for the scoreboard.
  const resolvedEvents = gameEvents ?? [];
  const userResolvedEvents = resolvedEvents.filter(
    e => e.homeId === userTeamId || e.awayId === userTeamId
  );

  // Games still pending (not yet in gameEvents) — show only user's game.
  const resolvedGameIds = new Set(resolvedEvents.map(e => e.gameId));
  const pendingGames = weekGames.filter(g => {
    const id = `${league?.seasonId}_w${league?.week}_${g.home}_${g.away}`;
    return !resolvedGameIds.has(id);
  });
  const userPendingGames = pendingGames.filter(
    g => Number(g.home) === userTeamId || Number(g.away) === userTeamId
  );

  // Final results to show when sim is done — user's game only.
  const isFinished = !simulating && (lastResults?.length ?? 0) > 0;
  const userLastResults = (lastResults ?? []).filter(
    r => r.homeId === userTeamId || r.awayId === userTeamId
  );

  useEffect(() => {
    if (simulating) {
      setResultShown(false);
    } else if (isFinished && !resultShown) {
      const userResult = userLastResults[0];
      if (userResult) {
        const userWon = userResult.homeId === userTeamId
          ? userResult.homeScore > userResult.awayScore
          : userResult.awayScore > userResult.homeScore;

        if (userWon) {
          audioManager.playWin();
          launchConfetti();
        } else {
          audioManager.playLoss();
        }
      }
      setResultShown(true);
    }
  }, [simulating, isFinished, resultShown, userLastResults, userTeamId]);

  if (!visible) return null;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-lg)',
      marginBottom: 'var(--space-6)',
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-5)',
        background: 'var(--surface-strong)',
        borderBottom: '1px solid var(--hairline)',
      }}>
        {simulating && <LiveDot />}
        <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
          {simulating
            ? `Week ${league?.week} · Simulating…`
            : `Week ${league?.week ?? ''} · Final Results`}
        </span>

        {simulating && !skipping && (
          <>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 8 }}>
              {simProgress}%
            </span>
            <button
              onClick={handleSkip}
              style={{
                marginLeft: 'auto',
                background: 'var(--surface-strong)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                padding: '3px 10px',
                fontWeight: 600,
              }}
            >
              Skip to End
            </button>
          </>
        )}

        {simulating && skipping && (
          <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', fontStyle: 'italic' }}>
            Waiting for results…
          </span>
        )}

        {!simulating && (
          <button
            onClick={() => setVisible(false)}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)',
              padding: '0 var(--space-1)', lineHeight: 1,
            }}
            aria-label="Close live game viewer"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Progress bar ── */}
      {simulating && (
        <div style={{ height: 3, background: 'var(--hairline)' }}>
          <div style={{
            height: '100%', width: `${simProgress}%`,
            background: skipping ? 'var(--text-muted)' : 'var(--accent)',
            transition: 'width 0.2s ease',
          }} />
        </div>
      )}

      {/* ── Final Result Banner ── */}
      {!simulating && isFinished && userLastResults.length > 0 && (
        <div style={{
          padding: 'var(--space-4)',
          textAlign: 'center',
          background: 'var(--surface-strong)',
          borderBottom: '1px solid var(--hairline)',
          animation: 'lgFadeIn 0.5s ease'
        }}>
          {(() => {
             const r = userLastResults[0];
             const userWon = r.homeId === userTeamId ? r.homeScore > r.awayScore : r.awayScore > r.homeScore;
             return (
               <div>
                 <div style={{
                   fontSize: '3rem', fontWeight: 900,
                   color: userWon ? 'var(--success)' : 'var(--danger)',
                   textTransform: 'uppercase', letterSpacing: '2px',
                   marginBottom: 'var(--space-2)',
                   textShadow: userWon ? '0 0 20px rgba(52, 199, 89, 0.4)' : 'none'
                 }}>
                   {userWon ? 'Victory' : 'Defeat'}
                 </div>
                 <div style={{ fontSize: 'var(--text-lg)', color: 'var(--text-muted)', fontWeight: 700 }}>
                   {r.homeScore} — {r.awayScore}
                 </div>
               </div>
             );
          })()}
        </div>
      )}

      {/* ── Event Overlay ── */}
      {overlayEvent && (
        <div className={`game-event-overlay ${getOverlayClass(overlayEvent.type)}`}>
          <div className="event-text">{overlayEvent.text}</div>
        </div>
      )}

      {/* ── Momentum Bar ── */}
      {simulating && (
        <div style={{
          height: 6, background: 'var(--surface-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--hairline)'
        }}>
          {/* Center Marker */}
          <div style={{ position: 'absolute', width: 2, height: '100%', background: 'var(--text-muted)', opacity: 0.3, zIndex: 1 }} />

          {/* Bar */}
          <div style={{
            height: '100%',
            width: '50%',
            display: 'flex',
            justifyContent: momentum > 0 ? 'flex-start' : 'flex-end',
            marginLeft: momentum > 0 ? '50%' : 0,
            marginRight: momentum > 0 ? 0 : '50%',
          }}>
             <div style={{
               width: `${Math.abs(momentum)}%`,
               height: '100%',
               background: momentum > 0 ? 'var(--accent)' : 'var(--danger)',
               transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
             }} />
          </div>
        </div>
      )}

      {/* ── Body: split scoreboard / play-by-play ── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0,
        minHeight: 200,
      }}>
        {/* ── Left: Scoreboard ── */}
        <div style={{
           flex: '999 1 300px',
           padding: 'var(--space-4)',
           borderRight: '1px solid var(--hairline)',
           borderBottom: '1px solid var(--hairline)', // fallback for wrapping
        }}>
          <div style={{
            fontSize: 'var(--text-xs)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.8px',
            color: 'var(--text-muted)', marginBottom: 'var(--space-3)',
          }}>
            Scoreboard — Week {league?.week}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'var(--space-2)',
          }}>
            {/* User's finished game (GAME_EVENT received) */}
            {userResolvedEvents.map((ev, i) => (
              <MatchupCard
                key={ev.gameId ?? i}
                event={ev}
                userTeamId={userTeamId}
                pending={false}
              />
            ))}

            {/* User's pending game (still in progress during sim) */}
            {simulating && userPendingGames.map((g, i) => (
              <PendingCard
                key={i}
                game={g}
                teamById={teamById}
                userTeamId={userTeamId}
              />
            ))}

            {/* Post-sim fallback: show user's lastResult if no events (e.g. skip was used) */}
            {isFinished && userResolvedEvents.length === 0 && userLastResults.map((r, i) => (
              <MatchupCard
                key={i}
                event={{
                  gameId:    `fallback_${i}`,
                  homeId:    r.homeId,
                  awayId:    r.awayId,
                  homeAbbr:  r.homeName?.slice(0, 3) ?? '???',
                  awayAbbr:  r.awayName?.slice(0, 3) ?? '???',
                  homeScore: r.homeScore,
                  awayScore: r.awayScore,
                }}
                userTeamId={userTeamId}
                pending={false}
              />
            ))}

            {userResolvedEvents.length === 0 && !simulating && (
              <p style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', margin: 0 }}>
                No games to display.
              </p>
            )}
          </div>
        </div>

        {/* ── Right: Play-by-play log ── */}
        <div style={{
           flex: '1 1 280px',
           display: 'flex', flexDirection: 'column',
           borderTop: '1px solid var(--hairline)', // for wrapping
           marginTop: -1, // collapse double border if wrapped
        }}>
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--hairline)',
            fontSize: 'var(--text-xs)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.8px',
            color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          }}>
            {userHomeAbbr !== '???' ? `${userAwayAbbr} @ ${userHomeAbbr}` : 'Play-by-play'}
          </div>
          <div
            ref={playLogRef}
            style={{
              flex: 1, overflowY: 'auto', maxHeight: 280, minHeight: 150,
              padding: 'var(--space-2) var(--space-3)',
              display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
            }}
          >
            {plays.length === 0 && simulating && !skipping && (
              <p style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', margin: 0, padding: 'var(--space-2) 0' }}>
                {userGame || userEvent ? 'Simulation starting…' : 'Your team is on a bye this week.'}
              </p>
            )}
            {skipping && (
              <p style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', margin: 0, padding: 'var(--space-2) 0', fontStyle: 'italic' }}>
                Skipping to final results…
              </p>
            )}
            {!simulating && plays.length === 0 && (
              <p style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', margin: 0, padding: 'var(--space-2) 0' }}>
                Simulation complete.
              </p>
            )}
            {plays.map((p) => (
              <div
                key={p.id}
                style={{
                  fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                  lineHeight: 1.45, borderBottom: '1px solid var(--hairline)',
                  paddingBottom: 'var(--space-1)',
                  animation: p.id === plays[plays.length - 1]?.id ? 'lgFadeIn 0.22s ease' : 'none',
                }}
              >
                {p.text}
              </div>
            ))}
            <style>{`@keyframes lgFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
          </div>
        </div>
      </div>
    </div>
  );
}
