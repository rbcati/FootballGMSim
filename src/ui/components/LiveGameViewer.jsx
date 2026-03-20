/**
 * LiveGameViewer.jsx — Full-screen play-by-play game viewer
 *
 * Renders as a fixed overlay so it properly blocks underlying UI.
 * Handles empty logs, auto-advance with configurable speed, and
 * bulletproof touch handling for mobile.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF", "#34C759", "#FF9F0A", "#FF453A", "#5E5CE6",
    "#64D2FF", "#FFD60A", "#30D158", "#FF6961", "#AEC6CF",
    "#FF6B35", "#B4A0E5",
  ];
  let hash = 0;
  for (let i = 0; i < abbr.length; i++) hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

const SPEEDS = [
  { label: "Slow", ms: 2500 },
  { label: "Normal", ms: 1200 },
  { label: "Fast", ms: 400 },
  { label: "Instant", ms: 0 },
];

export default function LiveGameViewer({ logs, homeTeam, awayTeam, onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(1); // Normal
  const [finished, setFinished] = useState(false);
  const [paused, setPaused] = useState(false);
  const logContainerRef = useRef(null);
  const completedRef = useRef(false);

  const speed = SPEEDS[speedIdx].ms;
  const safeLogs = Array.isArray(logs) && logs.length > 0 ? logs : null;

  // Handle empty logs — auto-complete after short delay
  useEffect(() => {
    if (!safeLogs && !completedRef.current) {
      completedRef.current = true;
      const timer = setTimeout(() => {
        if (onComplete) onComplete();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [safeLogs, onComplete]);

  // Auto-advance play index
  useEffect(() => {
    if (!safeLogs || finished || paused) return;

    if (speed === 0) {
      // Instant — jump to end
      setCurrentIndex(safeLogs.length - 1);
      setFinished(true);
      return;
    }

    if (currentIndex >= safeLogs.length - 1) {
      setFinished(true);
      return;
    }

    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= safeLogs.length - 1) {
          setFinished(true);
        }
        return Math.min(next, safeLogs.length - 1);
      });
    }, speed);

    return () => clearInterval(timer);
  }, [currentIndex, safeLogs, speed, finished, paused]);

  // Auto-scroll play log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [currentIndex]);

  // Handle game completion
  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (onComplete) onComplete();
  }, [onComplete]);

  // Auto-proceed after game ends
  useEffect(() => {
    if (finished && !completedRef.current) {
      const timer = setTimeout(handleComplete, 2500);
      return () => clearTimeout(timer);
    }
  }, [finished, handleComplete]);

  if (!safeLogs) {
    return (
      <div className="lgv-overlay">
        <div className="lgv-empty-state">
          <div className="lgv-empty-icon">🏈</div>
          <p>No play-by-play data available for this game.</p>
          <button className="lgv-btn lgv-btn-primary" onClick={handleComplete}>
            Continue
          </button>
        </div>
        <style>{lgvStyles}</style>
      </div>
    );
  }

  const currentLog = safeLogs[currentIndex] || safeLogs[0];
  const visibleLogs = safeLogs.slice(0, currentIndex + 1).slice(-25);

  const homeColor = teamColor(homeTeam?.abbr);
  const awayColor = teamColor(awayTeam?.abbr);
  const isHomePoss = currentLog.possession === 'home';

  const progress = safeLogs.length > 1
    ? Math.round((currentIndex / (safeLogs.length - 1)) * 100)
    : 100;

  return (
    <div className="lgv-overlay">
      <style>{lgvStyles}</style>

      <div className="lgv-game-container">
        {/* Scorebug */}
        <div className="lgv-scorebug">
          <div className={`lgv-team-block ${!isHomePoss ? 'lgv-has-poss' : ''}`}>
            <div className="lgv-team-name" style={{ color: awayColor }}>
              {awayTeam?.abbr || 'AWAY'}
            </div>
            <div className="lgv-team-score">{currentLog.scoreAway || 0}</div>
          </div>

          <div className="lgv-game-info">
            <div className="lgv-quarter">Q{currentLog.quarter || 1}</div>
            <div className="lgv-clock">{currentLog.clock || '15:00'}</div>
            <div className="lgv-down-dist">
              {currentLog.down || 1}{ordinalSuffix(currentLog.down || 1)} & {currentLog.distance || 10}
            </div>
          </div>

          <div className={`lgv-team-block ${isHomePoss ? 'lgv-has-poss' : ''}`}>
            <div className="lgv-team-name" style={{ color: homeColor }}>
              {homeTeam?.abbr || 'HOME'}
            </div>
            <div className="lgv-team-score">{currentLog.scoreHome || 0}</div>
          </div>
        </div>

        {/* Field */}
        <div className="lgv-field-wrap">
          <div className="lgv-field">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="lgv-yard-line" style={{ left: `${(i + 1) * 10}%` }}>
                <span className="lgv-yard-num">{i < 5 ? (i + 1) * 10 : (9 - i) * 10}</span>
              </div>
            ))}
            <div
              className="lgv-los"
              style={{ left: `${Math.max(2, Math.min(98, currentLog.yardLine || 50))}%` }}
            />
            <div
              className="lgv-first-down-marker"
              style={{ left: `${Math.max(2, Math.min(98, (currentLog.yardLine || 50) + (currentLog.distance || 10)))}%` }}
            />
          </div>
          {/* Progress bar */}
          <div className="lgv-progress-bar">
            <div className="lgv-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Play-by-play */}
        <div ref={logContainerRef} className="lgv-plays">
          {visibleLogs.map((log, idx) => (
            <div
              key={idx}
              className={`lgv-play ${idx === visibleLogs.length - 1 ? 'lgv-play-latest' : ''}`}
              style={{
                borderLeftColor: log.possession === 'home' ? homeColor : awayColor,
              }}
            >
              <span className="lgv-play-info">
                Q{log.quarter || 1} {log.clock || ''} &middot; {log.down || 1}&{log.distance || 10}
              </span>
              <span className="lgv-play-text">{log.playText}</span>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="lgv-controls">
          <div className="lgv-speed-btns">
            {!finished && (
              <button
                className={`lgv-btn ${paused ? 'lgv-btn-primary' : ''}`}
                onClick={() => setPaused(!paused)}
              >
                {paused ? '▶ Play' : '⏸ Pause'}
              </button>
            )}
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                className={`lgv-btn ${speedIdx === i && !finished ? 'lgv-btn-active' : ''}`}
                onClick={() => {
                  setSpeedIdx(i);
                  setPaused(false);
                  if (s.ms === 0) {
                    setCurrentIndex(safeLogs.length - 1);
                    setFinished(true);
                  }
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          {finished && (
            <button className="lgv-btn lgv-btn-primary lgv-btn-continue" onClick={handleComplete}>
              Continue &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return (s[(v - 20) % 10] || s[v] || s[0]);
}

const lgvStyles = `
  .lgv-overlay {
    position: fixed; inset: 0;
    z-index: 5000;
    background: var(--bg, #0a0c10);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    pointer-events: auto;
    touch-action: manipulation;
  }

  .lgv-game-container {
    width: 100%; max-width: 600px;
    display: flex; flex-direction: column;
    height: 100%; max-height: 100dvh;
    padding: var(--space-3);
    gap: var(--space-3);
  }

  /* Scorebug */
  .lgv-scorebug {
    display: flex; align-items: center; justify-content: space-between;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    flex-shrink: 0;
  }
  .lgv-team-block {
    display: flex; flex-direction: column; align-items: center;
    gap: 2px; min-width: 60px;
    position: relative;
  }
  .lgv-team-block.lgv-has-poss::after {
    content: ''; position: absolute; bottom: -6px; left: 50%;
    transform: translateX(-50%);
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent);
  }
  .lgv-team-name {
    font-size: var(--text-sm); font-weight: 800;
    letter-spacing: 1px; text-transform: uppercase;
  }
  .lgv-team-score {
    font-size: var(--text-3xl); font-weight: 900;
    color: var(--text); line-height: 1;
  }
  .lgv-game-info {
    text-align: center; flex: 1;
  }
  .lgv-quarter {
    font-size: var(--text-xs); font-weight: 700;
    color: var(--accent); text-transform: uppercase;
    letter-spacing: 1px;
  }
  .lgv-clock {
    font-size: var(--text-xl); font-weight: 800;
    color: var(--text); font-variant-numeric: tabular-nums;
  }
  .lgv-down-dist {
    font-size: var(--text-xs); color: var(--text-muted); font-weight: 600;
  }

  /* Field */
  .lgv-field-wrap { flex-shrink: 0; }
  .lgv-field {
    height: 40px; border-radius: var(--radius-md);
    background: linear-gradient(90deg, #1a472a, #2d7a4a 50%, #1a472a);
    position: relative; overflow: hidden;
    border: 2px solid rgba(255,255,255,0.1);
  }
  .lgv-yard-line {
    position: absolute; top: 0; bottom: 0; width: 1px;
    background: rgba(255,255,255,0.15);
  }
  .lgv-yard-num {
    position: absolute; top: 2px; left: 50%;
    transform: translateX(-50%);
    font-size: 8px; color: rgba(255,255,255,0.35);
    font-weight: 700;
  }
  .lgv-los {
    position: absolute; top: 0; bottom: 0; width: 3px;
    background: var(--accent);
    box-shadow: 0 0 8px rgba(10,132,255,0.5);
    transition: left 300ms ease;
  }
  .lgv-first-down-marker {
    position: absolute; top: 0; bottom: 0; width: 2px;
    background: var(--warning);
    opacity: 0.7;
    transition: left 300ms ease;
  }
  .lgv-progress-bar {
    height: 3px; background: var(--hairline);
    border-radius: 2px; margin-top: var(--space-1);
    overflow: hidden;
  }
  .lgv-progress-fill {
    height: 100%; background: var(--accent);
    border-radius: 2px;
    transition: width 300ms ease;
  }

  /* Plays */
  .lgv-plays {
    flex: 1; overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: flex; flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-1) 0;
    min-height: 0;
  }
  .lgv-play {
    padding: var(--space-2) var(--space-3);
    border-left: 3px solid var(--hairline);
    background: var(--surface);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    font-size: var(--text-sm);
    display: flex; flex-direction: column; gap: 2px;
    opacity: 0.7;
  }
  .lgv-play.lgv-play-latest {
    opacity: 1;
    background: var(--surface-strong);
    animation: lgvFadeIn 0.25s ease-out;
  }
  .lgv-play-info {
    font-size: 10px; color: var(--text-subtle);
    font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .lgv-play-text {
    color: var(--text); font-weight: 500;
  }

  /* Controls */
  .lgv-controls {
    flex-shrink: 0;
    display: flex; flex-direction: column; gap: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--hairline);
  }
  .lgv-speed-btns {
    display: flex; gap: var(--space-2);
    flex-wrap: wrap; justify-content: center;
  }
  .lgv-btn {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--hairline);
    background: var(--surface);
    color: var(--text-muted);
    border-radius: var(--radius-md);
    font-size: var(--text-xs); font-weight: 700;
    cursor: pointer;
    min-height: 40px; min-width: 40px;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: all 150ms ease;
  }
  .lgv-btn:hover { background: var(--surface-strong); color: var(--text); }
  .lgv-btn.lgv-btn-active {
    background: var(--accent); color: #fff;
    border-color: var(--accent);
  }
  .lgv-btn.lgv-btn-primary {
    background: var(--accent); color: #fff;
    border-color: var(--accent);
  }
  .lgv-btn.lgv-btn-primary:hover {
    background: var(--accent-hover);
  }
  .lgv-btn-continue {
    width: 100%; min-height: 48px;
    font-size: var(--text-base); font-weight: 800;
  }

  /* Empty state */
  .lgv-empty-state {
    text-align: center;
    display: flex; flex-direction: column;
    align-items: center; gap: var(--space-4);
    color: var(--text-muted);
  }
  .lgv-empty-icon { font-size: 48px; }

  @keyframes lgvFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 480px) {
    .lgv-scorebug { padding: var(--space-2) var(--space-3); }
    .lgv-team-score { font-size: var(--text-2xl); }
    .lgv-clock { font-size: var(--text-lg); }
  }
`;
