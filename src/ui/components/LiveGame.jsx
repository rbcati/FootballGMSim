/**
 * LiveGame.jsx
 *
 * Handles both the passive simulation ticker (SimTicker) and the interactive
 * live game viewer (InteractiveLiveGame) when the user plays a game.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ── Interactive Live Game Viewer ─────────────────────────────────────────────

function InteractiveLiveGame({ game, league, onFinish, onExit }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!game || !league || !window.liveGameViewer) return;

    // 1. Setup simulated environment
    // Clone league to allow local mutation by the viewer without affecting React props
    // We only need the structure relevant for the game
    const leagueClone = JSON.parse(JSON.stringify(league));
    window.state = { league: leagueClone };

    // Resolve teams from the clone
    const homeTeam = leagueClone.teams.find(t => t.id === Number(game.home));
    const awayTeam = leagueClone.teams.find(t => t.id === Number(game.away));

    if (!homeTeam || !awayTeam) {
        console.error("Teams not found for live game");
        return;
    }

    // 2. Initialize Viewer
    const viewer = window.liveGameViewer;
    viewer.initGame(homeTeam, awayTeam, league.userTeamId);

    // 3. Render & Start
    viewer.renderToView('#game-sim-container');
    viewer.startSim();

    // 4. Hook Callback
    viewer.onGameEndCallback = (gameState) => {
        // The viewer calls finalizeGame() internally which calls commitGameResult().
        // commitGameResult updates the league object (our clone) with resultsByWeek.

        // Find the result in our local clone to send back to the worker
        const weekIndex = (leagueClone.week || 1) - 1;
        const results = leagueClone.resultsByWeek?.[weekIndex] || [];

        // Find result matching this game
        const result = results.find(r =>
            (r.home === homeTeam.id && r.away === awayTeam.id)
        );

        if (result) {
            // Send the result back to App -> Worker
            // Delay slightly to let the user see the "VICTORY" screen
            // actually, we wait for user to click "Continue" or "Close" in the viewer UI?
            // The viewer UI shows a "Close" button in .final-stats or overlay
            // We can override the "Close" button behavior or just wait.

            // Current Viewer implementation: onGameEndCallback is called immediately when clock hits 0.
            // But the UI shows an overlay.
            // We should NOT auto-close. We should let the user inspect stats.

            // We simply report the result now so it's safe.
            // The exit is handled by the "Close" button in the viewer or a manual "Back" button we provide.
            if (onFinish) onFinish(result);
        } else {
            console.error("Game result not found in local state after finish");
        }
    };

    return () => {
        if (viewer) viewer.destroy();
        window.state = null;
    };
  }, [game, league]); // Run once on mount

  return (
    <div className="interactive-game-wrapper" style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: '#000', overflow: 'hidden'
    }}>
      <div id="game-sim-container" ref={containerRef} style={{ width: '100%', height: '100%' }}></div>

      {/* Fallback Exit Button (in case Viewer UI fails or user gets stuck) */}
      <button
        onClick={onExit}
        style={{
            position: 'absolute', top: 10, right: 10, zIndex: 2001,
            background: 'rgba(255,0,0,0.7)', color: 'white', border: 'none',
            padding: '5px 10px', borderRadius: '4px', cursor: 'pointer'
        }}
      >
        Exit / Back
      </button>
    </div>
  );
}

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
  (o, d, g) => `${o} — ${g >= 15 ? 'deep pass complete' : 'short pass complete'} for ${g} yds`,
  (o, d, g) => `${o} — QB scrambles for ${g} yds`,
  (o, d, g) => `${o} — run up the middle, ${g} yds`,
  (o, d, g) => `${o} — stretch run to the outside, ${g} yds`,
  (o, d, g) => `${d} — sack! QB brought down, loss of ${g % 8 + 1} yds`,
  (o, d, g) => `${o} — pass incomplete, ${d} breaks it up`,
  (o, d, g) => `${o} — TOUCHDOWN! 6 pts`,
  (o, d, g) => `${o} — field goal attempt... GOOD! 3 pts`,
  (o, d, g) => `${d} — INTERCEPTION! Ball at the ${g} yd line`,
  (o, d, g) => `${o} — punt, ${d} fair catch at their ${g} yd line`,
  (o, d, g) => `${o} — penalty: false start, 5 yd loss`,
  (o, d, g) => `${o} — 4th-and-short: QB sneak, 1st down`,
  (o, d, g) => `${d} — pass interference called, ${g} yds`,
  (o, d, g) => `${o} — play-action fake, ${g} yd gain`,
  (o, d, g) => `${o} — screen pass, ${g} yds after catch`,
  (o, d, g) => `${o} — FUMBLE recovered by ${d}!`,
  (o, d, g) => `${o} — 3rd-and-long conversion, ${g} yds`,
  (o, d, g) => `${d} — safety! 2 pts`,
];

function generatePlay(homeAbbr, awayAbbr, seed = 0) {
  const isHome = (seed ^ 0x5f) % 3 !== 0;
  const off    = isHome ? homeAbbr : awayAbbr;
  const def    = isHome ? awayAbbr : homeAbbr;
  const gain   = ((seed * 13 + 7) % 28) + 1;
  const tplIdx = (seed * 7 + 3) % PLAY_POOL.length;
  return PLAY_POOL[tplIdx](off, def, gain);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveGame({
  simulating, simProgress, league, lastResults, gameEvents,
  viewingGame, userGame, onGameFinished, onExit
}) {
  const [visible, setVisible]       = useState(false);
  const [plays, setPlays]           = useState([]);
  const [skipping, setSkipping]     = useState(false);
  const [prevSim, setPrevSim]       = useState(false);
  const playLogRef                  = useRef(null);
  const intervalRef                 = useRef(null);
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
  const userGameInfo = useMemo(() => {
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
    ?? (userGameInfo ? teamById[userGameInfo.home]?.abbr : null) ?? '???';
  const userAwayAbbr = userEvent?.awayAbbr
    ?? (userGameInfo ? teamById[userGameInfo.away]?.abbr : null) ?? '???';

  // ── Show / hide logic ────────────────────────────────────────────────────

  useEffect(() => {
    if (simulating && !prevSim) {
      // Simulation just started
      setVisible(true);
      setPlays([]);
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
      const line = generatePlay(userHomeAbbr, userAwayAbbr, n);
      return [...prev.slice(-49), line];   // keep last 50 entries
    });
  }, [skipping, userHomeAbbr, userAwayAbbr]);

  useEffect(() => {
    if (!simulating || skipping) {
      clearInterval(intervalRef.current);
      return;
    }
    // Only generate plays when the user has a game this week
    if (!userGameInfo && !userEvent) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(addPlay, 700);
    return () => clearInterval(intervalRef.current);
  }, [simulating, skipping, addPlay, userGameInfo, userEvent]);

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

  // Resolved game events (GAME_EVENT payloads from the worker)
  const resolvedEvents = gameEvents ?? [];

  // Games still pending (not yet in gameEvents)
  const resolvedGameIds = new Set(resolvedEvents.map(e => e.gameId));
  const pendingGames = weekGames.filter(g => {
    const id = `${league?.seasonId}_w${league?.week}_${g.home}_${g.away}`;
    return !resolvedGameIds.has(id);
  });

  // Final results to show when sim is done
  const isFinished = !simulating && (lastResults?.length ?? 0) > 0;

  // If viewing a game interactively, render the full viewer
  // (This check must happen after hooks)
  if (viewingGame && userGame) {
      return (
          <InteractiveLiveGame
              game={userGame}
              league={league}
              onFinish={onGameFinished}
              onExit={onExit}
          />
      );
  }

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

      {/* ── Body: split scoreboard / play-by-play ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 280px',
        gap: 0,
        minHeight: 200,
      }}>
        {/* ── Left: Scoreboard ── */}
        <div style={{ padding: 'var(--space-4)', borderRight: '1px solid var(--hairline)' }}>
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
            {/* Finished games (GAME_EVENT received) */}
            {resolvedEvents.map((ev, i) => (
              <MatchupCard
                key={ev.gameId ?? i}
                event={ev}
                userTeamId={league?.userTeamId}
                pending={false}
              />
            ))}

            {/* Pending games (still in progress during sim) */}
            {simulating && pendingGames.map((g, i) => (
              <PendingCard
                key={i}
                game={g}
                teamById={teamById}
                userTeamId={league?.userTeamId}
              />
            ))}

            {/* Post-sim fallback: show lastResults if no events (e.g. skip was used) */}
            {isFinished && resolvedEvents.length === 0 && (lastResults ?? []).map((r, i) => (
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
                userTeamId={league?.userTeamId}
                pending={false}
              />
            ))}

            {resolvedEvents.length === 0 && !simulating && (
              <p style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', margin: 0 }}>
                No games to display.
              </p>
            )}
          </div>
        </div>

        {/* ── Right: Play-by-play log ── */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
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
              flex: 1, overflowY: 'auto', maxHeight: 280,
              padding: 'var(--space-2) var(--space-3)',
              display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
            }}
          >
            {plays.length === 0 && simulating && !skipping && (
              <p style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', margin: 0, padding: 'var(--space-2) 0' }}>
                {userGameInfo || userEvent ? 'Simulation starting…' : 'Your team is on a bye this week.'}
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
            {plays.map((line, i) => (
              <div
                key={i}
                style={{
                  fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                  lineHeight: 1.45, borderBottom: '1px solid var(--hairline)',
                  paddingBottom: 'var(--space-1)',
                  animation: i === plays.length - 1 ? 'lgFadeIn 0.22s ease' : 'none',
                }}
              >
                {line}
              </div>
            ))}
            <style>{`@keyframes lgFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
          </div>
        </div>
      </div>
    </div>
  );
}
