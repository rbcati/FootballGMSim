/**
 * SeasonSimViewer.jsx — Play-by-play game viewer with animated SVG field,
 * live scoreboard, WinProbabilityWidget, and a big animated final-score overlay
 * with confetti on upsets/close games.
 *
 * Props:
 *  - logs: array of play-by-play log entries from worker
 *  - homeTeam: { id, abbr, name, ... }
 *  - awayTeam: { id, abbr, name, ... }
 *  - onComplete: () => void — called when viewer is dismissed
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import WinProbabilityWidget from "./WinProbabilityWidget.jsx";

const QUARTER_NAMES = ["Q1", "Q2", "HALF", "Q3", "Q4", "OT"];

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF", "#34C759", "#FF9F0A", "#FF453A", "#5E5CE6",
    "#64D2FF", "#FFD60A", "#30D158",
  ];
  let hash = 0;
  for (let i = 0; i < abbr.length; i++)
    hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

// ── Confetti particle system ──────────────────────────────────────────────────
function ConfettiParticle({ delay, x, color, size, rotation }) {
  return (
    <div style={{
      position: "absolute",
      top: -20,
      left: `${x}%`,
      width: size,
      height: size * 0.5,
      background: color,
      borderRadius: 2,
      animation: `confettiFall ${1.8 + Math.random()}s ${delay}s linear forwards`,
      transform: `rotate(${rotation}deg)`,
      zIndex: 201,
    }} />
  );
}

function ConfettiLayer({ count = 60, colors }) {
  const particles = useMemo(() => {
    const palette = colors || ["#FFD700", "#FF453A", "#34C759", "#0A84FF", "#FF9F0A", "#5E5CE6"];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 1.5,
      color: palette[i % palette.length],
      size: 8 + Math.random() * 8,
      rotation: Math.random() * 360,
    }));
  }, [count]);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 201 }}>
      {particles.map(p => (
        <ConfettiParticle key={p.id} {...p} />
      ))}
    </div>
  );
}

// ── SVG Football Field ──────────────────────────────────────────────────────
function FootballField({ ballPosition, homeColor, awayColor }) {
  const bp = Math.max(0, Math.min(100, ballPosition || 50));

  return (
    <div style={{
      position: "relative",
      height: 64,
      background: "linear-gradient(180deg, #1a5c2a, #1e6b32)",
      borderRadius: 8,
      overflow: "hidden",
      flexShrink: 0,
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      {/* End zones */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: "8%",
        background: awayColor + "44",
        borderRight: "1px solid rgba(255,255,255,0.15)",
      }} />
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: "8%",
        background: homeColor + "44",
        borderLeft: "1px solid rgba(255,255,255,0.15)",
      }} />

      {/* Yard lines */}
      {[20, 30, 40, 50, 60, 70, 80].map(yd => (
        <div key={yd} style={{
          position: "absolute", top: 0, bottom: 0, left: `${yd}%`,
          width: 1, background: "rgba(255,255,255,0.1)",
        }} />
      ))}

      {/* Midfield stripe */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: "50%",
        width: 2, background: "rgba(255,255,255,0.2)",
        transform: "translateX(-50%)",
      }} />

      {/* Ball marker */}
      <div style={{
        position: "absolute",
        left: `${bp}%`, top: "50%",
        transform: "translate(-50%, -50%)",
        width: 16, height: 10, borderRadius: "40%",
        background: "#8B4513",
        border: "1.5px solid rgba(255,255,255,0.4)",
        boxShadow: "0 0 10px rgba(139,69,19,0.7), 0 2px 4px rgba(0,0,0,0.4)",
        transition: "left 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)",
        zIndex: 5,
      }} />

      {/* Line of scrimmage */}
      <div style={{
        position: "absolute", left: `${bp}%`, top: 0, bottom: 0,
        width: 2, background: "rgba(255,215,0,0.5)",
        transform: "translateX(-50%)",
        transition: "left 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)",
        pointerEvents: "none",
        boxShadow: "0 0 6px rgba(255,215,0,0.4)",
      }} />
    </div>
  );
}

// ── Scoreboard ──────────────────────────────────────────────────────────────
function Scoreboard({ homeTeam, awayTeam, homeScore, awayScore, quarter, timeLeft, homeColor, awayColor }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 16, flexShrink: 0,
      background: "rgba(255,255,255,0.04)",
      borderRadius: 12,
      padding: "12px 20px",
      border: "1px solid var(--hairline)",
    }}>
      {/* Away team */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
            {awayTeam?.abbr?.slice(0, 3) || "AWY"}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.6 }}>Away</div>
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: `${awayColor}22`, border: `2px solid ${awayColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 900, color: awayColor,
        }}>
          {awayTeam?.abbr?.slice(0, 2) || "AW"}
        </div>
      </div>

      {/* Score */}
      <div style={{ textAlign: "center", minWidth: 120 }}>
        <div style={{
          display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8,
        }}>
          <span style={{
            fontSize: 40, fontWeight: 900, lineHeight: 1,
            color: awayScore > homeScore ? "var(--text)" : "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
            transition: "color 0.3s",
          }}>{awayScore}</span>
          <span style={{ fontSize: 20, color: "var(--text-muted)", fontWeight: 300 }}>—</span>
          <span style={{
            fontSize: 40, fontWeight: 900, lineHeight: 1,
            color: homeScore > awayScore ? "var(--text)" : "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
            transition: "color 0.3s",
          }}>{homeScore}</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginTop: 2 }}>
          {QUARTER_NAMES[Math.min(quarter - 1, 5)] || `Q${quarter}`}
          {timeLeft && ` · ${timeLeft}`}
        </div>
      </div>

      {/* Home team */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: `${homeColor}22`, border: `2px solid ${homeColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 900, color: homeColor,
        }}>
          {homeTeam?.abbr?.slice(0, 2) || "HM"}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
            {homeTeam?.abbr?.slice(0, 3) || "HME"}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.6 }}>Home</div>
        </div>
      </div>
    </div>
  );
}

// ── Play Log Entry ──────────────────────────────────────────────────────────
function PlayEntry({ play, isNew }) {
  // Support both 'text' (new) and 'playText' (legacy) fields
  const playText = play.text || play.playText || play.description || "";
  const lc = playText.toLowerCase();

  const isScore = play.type === "touchdown" || play.type === "field_goal" ||
                  lc.includes("touchdown") || lc.includes("field goal");
  const isTurnover = play.type === "interception" || play.type === "fumble" ||
                     lc.includes("interception") || lc.includes("fumble");
  const isBigPlay = (play.yards >= 20) || isScore;

  return (
    <div
      className={isNew ? "fade-in-up" : ""}
      style={{
        padding: "6px 12px",
        borderLeft: `3px solid ${isScore ? "var(--success)" : isTurnover ? "var(--danger)" : isBigPlay ? "var(--warning)" : "var(--hairline)"}`,
        background: isScore ? "rgba(52,199,89,0.06)" : isTurnover ? "rgba(255,69,58,0.06)" : "transparent",
        borderRadius: "0 6px 6px 0",
        marginBottom: 2,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: "var(--text-muted)", minWidth: 24, fontSize: 11 }}>
          {play.quarter ? `Q${play.quarter}` : ""}
        </span>
        <span style={{
          fontWeight: isScore || isBigPlay ? 700 : 400,
          color: isScore ? "var(--success)" : isTurnover ? "var(--danger)" : "var(--text)",
          flex: 1,
        }}>
          {playText || "Play"}
        </span>
        {play.yards !== undefined && play.yards !== 0 && (
          <span style={{
            fontWeight: 700, fontSize: 10,
            color: play.yards > 0 ? "var(--success)" : "var(--danger)",
          }}>
            {play.yards > 0 ? "+" : ""}{play.yards}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Final Score Overlay ─────────────────────────────────────────────────────
function FinalScoreOverlay({ homeTeam, awayTeam, homeScore, awayScore, homeColor, awayColor, onContinue, userTeamId }) {
  const homeWon = homeScore > awayScore;
  const tied = homeScore === awayScore;
  const scoreDiff = Math.abs(homeScore - awayScore);
  const isUpset = false; // Could add logic later
  const isClose = scoreDiff <= 7;

  // Determine user result
  const userIsHome = homeTeam?.id === userTeamId;
  const userIsAway = awayTeam?.id === userTeamId;
  const userWon = (userIsHome && homeWon) || (userIsAway && !homeWon && !tied);
  const userLost = (userIsHome && !homeWon && !tied) || (userIsAway && homeWon);
  const showConfetti = userWon || isClose;

  let resultText = tied ? "FINAL · TIE" : homeWon ? `${homeTeam?.abbr || "HOME"} WIN` : `${awayTeam?.abbr || "AWAY"} WIN`;
  let badgeClass = tied ? "tie" : (isClose && !isUpset) ? "win" : "win";
  if (userLost) badgeClass = "loss";
  if (isUpset) badgeClass = "upset";

  return (
    <div className="final-score-overlay">
      {showConfetti && <ConfettiLayer count={80} colors={[homeColor, awayColor, "#FFD700", "#fff"]} />}
      <div className="final-score-card">
        <div className="final-score-trophy">
          {userWon ? "🏆" : userLost ? "😔" : tied ? "🤝" : "🏈"}
        </div>
        <div className="final-score-label">FINAL SCORE</div>

        <div className="final-score-teams">
          {/* Away team */}
          <div className="final-score-team-block">
            <div className="final-score-abbr" style={{ color: awayColor }}>
              {awayTeam?.abbr?.slice(0, 3) || "AWY"}
            </div>
            <div className={`final-score-number ${!homeWon && !tied ? "winner" : ""}`} style={{
              color: !homeWon && !tied ? awayColor : "var(--text-muted)",
            }}>
              {awayScore}
            </div>
          </div>

          <div className="final-score-dash">—</div>

          {/* Home team */}
          <div className="final-score-team-block">
            <div className="final-score-abbr" style={{ color: homeColor }}>
              {homeTeam?.abbr?.slice(0, 3) || "HME"}
            </div>
            <div className={`final-score-number ${homeWon ? "winner" : ""}`} style={{
              color: homeWon ? homeColor : "var(--text-muted)",
            }}>
              {homeScore}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <span className={`final-score-result-badge ${badgeClass}`}>
            {resultText}
            {isClose && !tied && " · Close Game"}
          </span>
        </div>

        <button className="final-score-continue-btn" onClick={onContinue}>
          Continue →
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function SeasonSimViewer({ logs = [], homeTeam, awayTeam, onComplete, userTeamId }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1); // 1x, 2x, 4x
  const [showFinalOverlay, setShowFinalOverlay] = useState(false);
  const scrollRef = useRef(null);
  const timerRef = useRef(null);

  const hColor = useMemo(() => teamColor(homeTeam?.abbr || ""), [homeTeam?.abbr]);
  const aColor = useMemo(() => teamColor(awayTeam?.abbr || ""), [awayTeam?.abbr]);

  // Auto-complete if no logs provided
  useEffect(() => {
    if (!Array.isArray(logs) || logs.length === 0) {
      const t = setTimeout(() => { if (onComplete) onComplete(); }, 1500);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance plays
  useEffect(() => {
    if (!isPlaying || currentIndex >= logs.length) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    const delay = Math.max(80, 700 / speed);
    timerRef.current = setTimeout(() => {
      setCurrentIndex(i => i + 1);
    }, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, currentIndex, logs.length, speed]);

  // Show final overlay when game completes
  useEffect(() => {
    if (currentIndex >= logs.length && logs.length > 0) {
      // Small delay so users see the final play first
      const t = setTimeout(() => setShowFinalOverlay(true), 600);
      return () => clearTimeout(t);
    }
  }, [currentIndex, logs.length]);

  // Auto-scroll play log
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentIndex]);

  const visibleLogs = logs.slice(0, currentIndex);
  const isComplete = currentIndex >= logs.length;

  // Compute current state from logs
  // Handles both new (homeScore) and legacy (scoreHome) field names
  const currentState = useMemo(() => {
    let homeScore = 0, awayScore = 0, quarter = 1, ballPos = 50;
    for (let i = 0; i < currentIndex && i < logs.length; i++) {
      const log = logs[i];
      // New field names
      if (log.homeScore !== undefined) homeScore = log.homeScore;
      else if (log.scoreHome !== undefined) homeScore = log.scoreHome;
      if (log.awayScore !== undefined) awayScore = log.awayScore;
      else if (log.scoreAway !== undefined) awayScore = log.scoreAway;
      if (log.quarter) quarter = log.quarter;
      if (log.fieldPosition !== undefined) ballPos = log.fieldPosition;
      else if (log.yardLine !== undefined) ballPos = log.yardLine;
    }
    return { homeScore, awayScore, quarter, ballPos };
  }, [logs, currentIndex]);

  // Build win probability events
  const wpEvents = useMemo(() => {
    const events = [];
    for (let i = 0; i < currentIndex && i < logs.length; i++) {
      const log = logs[i];
      if (log.homeWinProb !== undefined) {
        events.push({ play: i, homeWinProb: log.homeWinProb, quarter: log.quarter });
      }
    }
    if (events.length === 0 && currentIndex > 0) {
      const diff = currentState.homeScore - currentState.awayScore;
      const base = 0.5 + diff * 0.02;
      events.push({ play: 0, homeWinProb: Math.max(0.05, Math.min(0.95, base)), quarter: currentState.quarter });
    }
    return events;
  }, [logs, currentIndex, currentState]);

  const currentPlay = visibleLogs[visibleLogs.length - 1];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9500,
      background: "rgba(0,0,0,0.92)",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Final score overlay */}
      {showFinalOverlay && (
        <div style={{ position: "absolute", inset: 0, zIndex: 200 }}>
          <FinalScoreOverlay
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeScore={currentState.homeScore}
            awayScore={currentState.awayScore}
            homeColor={hColor}
            awayColor={aColor}
            onContinue={onComplete}
            userTeamId={userTeamId}
          />
        </div>
      )}

      {/* ── Top Bar ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid var(--hairline)",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
          Live Game
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* Speed */}
          {[1, 2, 4].map(s => (
            <button
              key={s}
              className={`division-tab${speed === s ? " active" : ""}`}
              onClick={() => setSpeed(s)}
              style={{ fontSize: 11, minWidth: 30, padding: "4px 8px" }}
            >
              {s}x
            </button>
          ))}
          <button
            className="division-tab"
            onClick={() => setIsPlaying(p => !p)}
            style={{ minWidth: 52, padding: "4px 8px" }}
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          {isComplete && !showFinalOverlay && (
            <button
              className="btn-premium btn-primary-premium"
              onClick={() => setShowFinalOverlay(true)}
              style={{ fontSize: 12, padding: "6px 16px" }}
            >
              Final Score
            </button>
          )}
          <button
            onClick={onComplete}
            style={{
              background: "none", border: "1px solid var(--hairline)",
              borderRadius: 8, width: 32, height: 32,
              color: "var(--text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{
        flex: 1, overflow: "hidden",
        display: "flex", flexDirection: "column",
        padding: 16, gap: 12,
      }}>
        {/* Scoreboard */}
        <Scoreboard
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={currentState.homeScore}
          awayScore={currentState.awayScore}
          quarter={currentState.quarter}
          timeLeft={currentPlay?.timeLeft || currentPlay?.clock}
          homeColor={hColor}
          awayColor={aColor}
        />

        {/* Field */}
        <FootballField
          ballPosition={currentState.ballPos}
          homeColor={hColor}
          awayColor={aColor}
        />

        {/* Win Probability */}
        <WinProbabilityWidget
          events={wpEvents}
          homeTeam={homeTeam || { abbr: "HOME" }}
          awayTeam={awayTeam || { abbr: "AWAY" }}
          homeColor={hColor}
          awayColor={aColor}
          height={64}
        />

        {/* Play-by-play log */}
        <div
          ref={scrollRef}
          className="play-log-scroll"
          style={{
            flex: 1, overflowY: "auto",
            background: "rgba(0,0,0,0.25)",
            borderRadius: 10,
            padding: 8,
            border: "1px solid var(--hairline)",
          }}
        >
          {visibleLogs.map((play, i) => (
            <PlayEntry
              key={i}
              play={play}
              isNew={i === currentIndex - 1}
            />
          ))}
          {visibleLogs.length === 0 && (
            <div style={{
              textAlign: "center", padding: "32px 16px",
              color: "var(--text-muted)", fontSize: 13,
            }}>
              Game starting...
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{
          height: 3, borderRadius: 2,
          background: "var(--hairline)", overflow: "hidden",
          flexShrink: 0,
        }}>
          <div style={{
            height: "100%", borderRadius: 2,
            background: "var(--accent)",
            width: `${logs.length > 0 ? (currentIndex / logs.length) * 100 : 0}%`,
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>
    </div>
  );
}
