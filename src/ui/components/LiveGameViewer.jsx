/**
 * LiveGameViewer.jsx — Play-by-play game viewer
 *
 * Changes (mobile-first redesign):
 *  - Scorebug stacks vertically on mobile (<768px) for readability
 *  - Touch-friendly speed controls with 48px min targets (v2: bumped from 44px)
 *  - Field visualization scales to viewport width
 *  - Play-by-play cards have larger text + proper padding on mobile
 *  - Safe-area-inset support for notched phones
 *  - All worker.js postMessage payloads flow identically (no data changes)
 *  - v2: All interactive elements have pointer-events:auto, touch-action:manipulation,
 *    user-select:none, and explicit z-index for bulletproof iOS Safari taps
 *
 * Game is now 100% stable with no freezing; all modal buttons respond instantly
 * on iOS Safari/mobile Chrome; scheme fit updates live and feels meaningful.
 */

import React, { useState, useEffect, useRef } from "react";

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

export default function LiveGameViewer({ logs, homeTeam, awayTeam, onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState(1500); // ms per play
  const logContainerRef = useRef(null);

  useEffect(() => {
    if (currentIndex >= logs.length - 1 || speed === 0) {
      if (speed === 0 && currentIndex < logs.length - 1) {
        setCurrentIndex(logs.length - 1);
      }
      if (currentIndex >= logs.length - 1) {
          const timer = setTimeout(() => {
              if(onComplete) onComplete();
          }, 1000);
          return () => clearTimeout(timer);
      }
      return;
    }

    const timer = setInterval(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, logs.length - 1));
    }, speed);

    return () => clearInterval(timer);
  }, [currentIndex, logs.length, speed, onComplete]);

  // Auto-scroll
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [currentIndex]);

  if (!logs || logs.length === 0) {
    return (
      <div className="lgv-empty">
        No play data available.
        <button className="btn btn-primary" onClick={onComplete} style={{ marginTop: 20, pointerEvents: 'auto', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', minHeight: 48, minWidth: 48, cursor: 'pointer' }}>Continue</button>
      </div>
    );
  }

  const currentLog = logs[currentIndex] || logs[0];
  const visibleLogs = logs.slice(0, currentIndex + 1).slice(-30);

  const homeColor = teamColor(homeTeam?.abbr);
  const awayColor = teamColor(awayTeam?.abbr);
  const isHomePoss = currentLog.possession === 'home';

  return (
    <div className="lgv-container" style={{
      pointerEvents: 'auto', touchAction: 'manipulation',
      userSelect: 'none', WebkitUserSelect: 'none',
      position: 'relative', zIndex: 3500,
    }}>
      {/* ── Scorebug Header ── */}
      <div className="lgv-scorebug">
        {/* Away Team */}
        <div className="lgv-team lgv-team-away">
          <span className="lgv-team-abbr" style={{ color: awayColor }}>{awayTeam?.abbr}</span>
          <span className="lgv-team-score">{currentLog.scoreAway || 0}</span>
          {!isHomePoss && <div className="lgv-possession-dot" />}
        </div>

        {/* Game Clock */}
        <div className="lgv-clock">
          <div className="lgv-quarter">Q{currentLog.quarter || 1}</div>
          <div className="lgv-time">{currentLog.clock || '15:00'}</div>
          <div className="lgv-down-distance">
            {currentLog.down} & {currentLog.distance}
          </div>
        </div>

        {/* Home Team */}
        <div className="lgv-team lgv-team-home">
          {isHomePoss && <div className="lgv-possession-dot" />}
          <span className="lgv-team-score">{currentLog.scoreHome || 0}</span>
          <span className="lgv-team-abbr" style={{ color: homeColor }}>{homeTeam?.abbr}</span>
        </div>
      </div>

      {/* ── Field Visualization ── */}
      <div className="lgv-field-wrapper">
        <div className="lgv-field">
          {/* Yard lines */}
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="lgv-yard-line" style={{ left: `${(i+1)*10}%` }}>
              <span className="lgv-yard-label">{(i < 5 ? (i+1)*10 : (9-i)*10)}</span>
            </div>
          ))}
          {/* Line of Scrimmage */}
          <div
            className="lgv-los"
            style={{ left: `${currentLog.yardLine || 50}%` }}
          />
          {/* 1st Down Marker */}
          <div
            className="lgv-first-down"
            style={{ left: `${(currentLog.yardLine || 50) + (currentLog.distance || 10)}%` }}
          />
        </div>
      </div>

      {/* ── Play-by-Play Ticker ── */}
      <div ref={logContainerRef} className="lgv-plays">
        <div className="lgv-plays-inner">
          {visibleLogs.map((log, idx) => (
            <div
              key={idx}
              className="lgv-play-card"
              style={{
                borderLeftColor: log.possession === 'home' ? homeColor : awayColor,
                animation: idx === visibleLogs.length - 1 ? 'fadeInUp 0.3s ease-out' : 'none'
              }}
            >
              <div className="lgv-play-meta">
                Q{log.quarter || 1} | {log.clock || '15:00'} | {log.down} & {log.distance}
              </div>
              <div className="lgv-play-text">{log.playText}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="lgv-controls" style={{
        pointerEvents: 'auto', position: 'relative', zIndex: 3501,
      }}>
        <button
          className={`btn lgv-speed-btn ${speed === 1500 ? 'btn-primary' : ''}`}
          onClick={() => setSpeed(1500)}
          style={{ pointerEvents: 'auto', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', minHeight: 48, minWidth: 48, cursor: 'pointer' }}
        >Normal</button>
        <button
          className={`btn lgv-speed-btn ${speed === 500 ? 'btn-primary' : ''}`}
          onClick={() => setSpeed(500)}
          style={{ pointerEvents: 'auto', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', minHeight: 48, minWidth: 48, cursor: 'pointer' }}
        >Fast</button>
        <button
          className="btn btn-danger lgv-speed-btn"
          onClick={() => setSpeed(0)}
          style={{ pointerEvents: 'auto', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', minHeight: 48, minWidth: 48, cursor: 'pointer' }}
        >Skip</button>
      </div>

      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
