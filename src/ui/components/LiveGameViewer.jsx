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
          // Add a small delay before triggering onComplete
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
      <div style={{ padding: "20px", textAlign: "center", color: "white" }}>
        No play data available.
        <button className="btn btn-primary" onClick={onComplete} style={{ marginTop: 20 }}>Continue</button>
      </div>
    );
  }

  const currentLog = logs[currentIndex] || logs[0];
  const visibleLogs = logs.slice(0, currentIndex + 1).slice(-30); // keep last 30

  const homeColor = teamColor(homeTeam?.abbr);
  const awayColor = teamColor(awayTeam?.abbr);
  const isHomePoss = currentLog.possession === 'home';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'var(--bg)', zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'sans-serif'
    }}>
      {/* ── Scorebug Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: 'var(--space-4)', background: 'var(--surface-strong)',
        borderBottom: '2px solid var(--hairline)', gap: 'var(--space-6)'
      }}>
        {/* Away Team */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: awayColor }}>{awayTeam?.abbr}</span>
          <span style={{ fontSize: '3rem', fontWeight: 900 }}>{currentLog.scoreAway || 0}</span>
          {!isHomePoss && <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', marginLeft: 8 }} />}
        </div>

        {/* Game Clock */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 var(--space-4)' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>Q{currentLog.quarter || 1}</div>
          <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>{currentLog.clock || '15:00'}</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {currentLog.down} & {currentLog.distance}
          </div>
        </div>

        {/* Home Team */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {isHomePoss && <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', marginRight: 8 }} />}
          <span style={{ fontSize: '3rem', fontWeight: 900 }}>{currentLog.scoreHome || 0}</span>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: homeColor }}>{homeTeam?.abbr}</span>
        </div>
      </div>

      {/* ── Field Visualization ── */}
      <div style={{ padding: 'var(--space-4)', background: '#1a472a', borderBottom: '2px solid var(--hairline)' }}>
        <div style={{ position: 'relative', width: '100%', height: 60, background: '#2d5a27', borderRadius: 4, overflow: 'hidden' }}>
          {/* Yard lines */}
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${(i+1)*10}%`, top: 0, bottom: 0,
              width: 2, background: 'rgba(255,255,255,0.2)'
            }}>
              <span style={{ position: 'absolute', top: 5, left: 5, color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{(i < 5 ? (i+1)*10 : (9-i)*10)}</span>
            </div>
          ))}
          {/* Line of Scrimmage */}
          <div style={{
            position: 'absolute', left: `${currentLog.yardLine || 50}%`, top: 0, bottom: 0,
            width: 4, background: '#0A84FF', zIndex: 10, transition: 'left 0.5s ease'
          }} />
          {/* 1st Down Marker */}
          <div style={{
            position: 'absolute', left: `${(currentLog.yardLine || 50) + (currentLog.distance || 10)}%`, top: 0, bottom: 0,
            width: 4, background: '#FFD60A', zIndex: 10, transition: 'left 0.5s ease'
          }} />
        </div>
      </div>

      {/* ── Play-by-Play Ticker ── */}
      <div ref={logContainerRef} style={{ flex: 1, padding: 'var(--space-4)', overflowY: 'auto', background: 'var(--surface)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {visibleLogs.map((log, idx) => (
            <div key={idx} style={{
              padding: 'var(--space-3)', background: 'var(--surface-strong)', borderRadius: 'var(--radius-md)',
              borderLeft: `4px solid ${log.possession === 'home' ? homeColor : awayColor}`,
              animation: idx === visibleLogs.length - 1 ? 'fadeInUp 0.3s ease-out' : 'none'
            }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                Q{log.quarter || 1} | {log.clock || '15:00'} | {log.down} & {log.distance}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{log.playText}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{
        padding: 'var(--space-4)', background: 'var(--surface-strong)',
        display: 'flex', justifyContent: 'center', gap: 'var(--space-3)',
        borderTop: '1px solid var(--hairline)'
      }}>
        <button className={`btn ${speed === 1500 ? 'btn-primary' : ''}`} onClick={() => setSpeed(1500)}>Normal Speed</button>
        <button className={`btn ${speed === 500 ? 'btn-primary' : ''}`} onClick={() => setSpeed(500)}>Fast</button>
        <button className="btn btn-danger" onClick={() => setSpeed(0)}>Skip to End</button>
      </div>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
