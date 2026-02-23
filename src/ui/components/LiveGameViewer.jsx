/**
 * LiveGameViewer.jsx
 *
 * ZenGM-inspired live simulation overlay.
 *
 * Shown as a bottom drawer / full-width panel when the worker is simulating a week.
 * Subscribes to:
 *   • simulating   — whether the sim is active
 *   • simProgress  — 0-100 percentage complete
 *   • league       — current schedule + teams to display matchups
 *   • lastResults  — final scores after WEEK_COMPLETE
 *
 * No extra protocol messages needed — all data already flows through useWorker state.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';

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

function TeamBadge({ abbr, size = 40, highlight = false }) {
  const color = teamColor(abbr);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `${color}22`,
      border: `2px solid ${highlight ? 'var(--accent)' : color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, fontSize: size * 0.3,
      color: highlight ? 'var(--accent)' : color,
      flexShrink: 0, letterSpacing: '-0.5px',
    }}>
      {abbr?.slice(0, 3) ?? '?'}
    </div>
  );
}

/** Animated pulsing dot — shows the "live" indicator */
function LiveDot() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'var(--danger)',
        display: 'inline-block',
        animation: 'livePulse 1.1s ease-in-out infinite',
      }} />
      <style>{`@keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.85)} }`}</style>
    </span>
  );
}

// ── Live matchup card ─────────────────────────────────────────────────────────

function MatchupCard({ game, homeTeam, awayTeam, userTeamId, result, simProgress }) {
  const isUser  = homeTeam?.id === userTeamId || awayTeam?.id === userTeamId;
  const played  = game.played || result;
  const hScore  = result?.homeScore ?? game.homeScore;
  const aScore  = result?.awayScore ?? game.awayScore;
  const hasScore = hScore !== undefined && aScore !== undefined;

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
      {/* Away */}
      <TeamBadge abbr={awayTeam?.abbr} size={36} highlight={awayTeam?.id === userTeamId} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-xs)', fontWeight: 700,
          color: awayTeam?.id === userTeamId ? 'var(--accent)' : 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {awayTeam?.abbr ?? '???'}
        </div>
        {hasScore && (
          <div style={{
            fontSize: 'var(--text-xl)', fontWeight: 800,
            color: hasScore && aScore > hScore ? 'var(--text)' : 'var(--text-muted)',
            lineHeight: 1.1,
          }}>
            {aScore}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '0 var(--space-1)', flexShrink: 0 }}>
        {played
          ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', fontWeight: 700 }}>FINAL</span>
          : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', fontWeight: 600 }}>@</span>
        }
      </div>

      {/* Home */}
      <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
        <div style={{
          fontSize: 'var(--text-xs)', fontWeight: 700,
          color: homeTeam?.id === userTeamId ? 'var(--accent)' : 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {homeTeam?.abbr ?? '???'}
        </div>
        {hasScore && (
          <div style={{
            fontSize: 'var(--text-xl)', fontWeight: 800,
            color: hasScore && hScore > aScore ? 'var(--text)' : 'var(--text-muted)',
            lineHeight: 1.1,
          }}>
            {hScore}
          </div>
        )}
      </div>
      <TeamBadge abbr={homeTeam?.abbr} size={36} highlight={homeTeam?.id === userTeamId} />
    </div>
  );
}

// ── Play-by-play log ──────────────────────────────────────────────────────────

const PLAY_TEMPLATES = [
  '{off} QB scrambles for {gain} yards',
  '{off} pass complete to WR, {gain} yard gain',
  '{off} run up the middle, {gain} yards',
  '{off} deep pass complete! {gain} yard gain',
  '{off} rush to the outside, {gain} yards',
  '{def} sack! {off} QB brought down for -{gain} yards',
  '{off} pass incomplete, {def} breaks it up',
  '{off} field goal attempt... GOOD! 3 points',
  '{off} touchdown! 7 points',
  '{def} interception! Turnover on downs',
  '{off} punt, {def} takes over at their own {gain}',
  '{off} penalty, false start, 5 yards',
];

function generateFakePlays(homeAbbr, awayAbbr, count = 8) {
  const plays = [];
  for (let i = 0; i < count; i++) {
    const isHome = Math.random() > 0.5;
    const off = isHome ? homeAbbr : awayAbbr;
    const def = isHome ? awayAbbr : homeAbbr;
    const tpl = PLAY_TEMPLATES[Math.floor(Math.random() * PLAY_TEMPLATES.length)];
    const gain = Math.floor(Math.random() * 25) + 1;
    plays.push(
      tpl.replace(/{off}/g, off).replace(/{def}/g, def).replace(/{gain}/g, String(gain))
    );
  }
  return plays;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveGameViewer({ simulating, simProgress, league, lastResults }) {
  const [visible, setVisible]     = useState(false);
  const [plays, setPlays]         = useState([]);
  const [prevSim, setPrevSim]     = useState(false);
  const playLogRef                = useRef(null);
  const playIntervalRef           = useRef(null);

  // Build teamById lookup
  const teamById = useMemo(() => {
    const map = {};
    (league?.teams ?? []).forEach(t => { map[t.id] = t; });
    return map;
  }, [league?.teams]);

  // Get current week's games from schedule
  const currentWeekGames = useMemo(() => {
    if (!league?.schedule?.weeks || !league?.week) return [];
    const weekData = league.schedule.weeks.find(w => w.week === league.week);
    return weekData?.games ?? [];
  }, [league?.schedule, league?.week]);

  // Show viewer when simulation starts, persist after it ends
  useEffect(() => {
    if (simulating && !prevSim) {
      setVisible(true);
      setPlays([]);
    }
    setPrevSim(simulating);
  }, [simulating]);

  // Generate fake play-by-play ticker while simulating
  useEffect(() => {
    if (!simulating || currentWeekGames.length === 0) {
      clearInterval(playIntervalRef.current);
      return;
    }

    const game = currentWeekGames[Math.floor(Math.random() * currentWeekGames.length)];
    const home = teamById[game?.home];
    const away = teamById[game?.away];

    const tick = () => {
      if (!home || !away) return;
      const newPlay = generateFakePlays(home.abbr, away.abbr, 1)[0];
      setPlays(prev => [...prev.slice(-30), newPlay]);
    };

    playIntervalRef.current = setInterval(tick, 600);
    return () => clearInterval(playIntervalRef.current);
  }, [simulating, currentWeekGames, teamById]);

  // Auto-scroll play log
  useEffect(() => {
    if (playLogRef.current) {
      playLogRef.current.scrollTop = playLogRef.current.scrollHeight;
    }
  }, [plays]);

  if (!visible) return null;

  const isFinished = !simulating && lastResults && lastResults.length > 0;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-lg)',
      marginBottom: 'var(--space-6)',
      overflow: 'hidden',
    }}>
      {/* Header bar */}
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
            : `Week ${league?.week ?? ''} Results`}
        </span>
        {simulating && (
          <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {simProgress}% complete
          </span>
        )}
        {!simulating && (
          <button
            onClick={() => setVisible(false)}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)',
              padding: '0 var(--space-1)', lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>

      {/* Progress bar */}
      {simulating && (
        <div style={{ height: 3, background: 'var(--hairline)' }}>
          <div style={{
            height: '100%', width: `${simProgress}%`,
            background: 'var(--accent)',
            transition: 'width 0.2s ease',
          }} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0 }}>
        {/* Matchups grid */}
        <div style={{ padding: 'var(--space-4)', borderRight: '1px solid var(--hairline)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
            Scoreboard
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'var(--space-2)',
          }}>
            {isFinished
              ? lastResults.map((r, i) => {
                  const home = { id: r.homeId, abbr: r.homeName?.slice(0, 3) ?? '???', ...teamById[r.homeId] };
                  const away = { id: r.awayId, abbr: r.awayName?.slice(0, 3) ?? '???', ...teamById[r.awayId] };
                  return (
                    <MatchupCard
                      key={i}
                      game={{ played: true }}
                      homeTeam={home}
                      awayTeam={away}
                      userTeamId={league?.userTeamId}
                      result={{ homeScore: r.homeScore, awayScore: r.awayScore }}
                    />
                  );
                })
              : currentWeekGames.map((game, i) => (
                  <MatchupCard
                    key={i}
                    game={game}
                    homeTeam={teamById[game.home]}
                    awayTeam={teamById[game.away]}
                    userTeamId={league?.userTeamId}
                    result={null}
                    simProgress={simProgress}
                  />
                ))}
          </div>
        </div>

        {/* Play-by-play log */}
        <div style={{ width: 260, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--hairline)',
            fontSize: 'var(--text-xs)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.8px',
            color: 'var(--text-muted)',
          }}>
            Play-by-play
          </div>
          <div
            ref={playLogRef}
            style={{
              flex: 1, overflowY: 'auto', maxHeight: 260,
              padding: 'var(--space-2) var(--space-3)',
              display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
            }}
          >
            {plays.length === 0 && !isFinished && (
              <p style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', margin: 0, padding: 'var(--space-2) 0' }}>
                {simulating ? 'Simulation starting…' : 'No plays yet'}
              </p>
            )}
            {isFinished && plays.length === 0 && (
              <p style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', margin: 0, padding: 'var(--space-2) 0' }}>
                Simulation complete.
              </p>
            )}
            {plays.map((play, i) => (
              <div key={i} style={{
                fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                lineHeight: 1.4, borderBottom: '1px solid var(--hairline)',
                paddingBottom: 'var(--space-1)',
                animation: i === plays.length - 1 ? 'fadeSlideIn 0.25s ease' : 'none',
              }}>
                {play}
              </div>
            ))}
            <style>{`@keyframes fadeSlideIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }`}</style>
          </div>
        </div>
      </div>
    </div>
  );
}
