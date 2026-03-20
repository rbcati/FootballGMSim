/**
 * SeasonSimViewer.jsx — Play-by-play game viewer with animated SVG field,
 * moving player dots, live scoreboard, and WinProbabilityWidget updates.
 * "Watch Game" button experience that makes this feel premium.
 *
 * Props:
 *  - logs: array of play-by-play log entries from worker
 *  - homeTeam: { id, abbr, name, ... }
 *  - awayTeam: { id, abbr, name, ... }
 *  - onComplete: () => void — called when viewer is dismissed
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import WinProbabilityWidget from "./WinProbabilityWidget.jsx";
import { playSound } from "./SoundToggle.jsx";

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

// ── SVG Football Field ──
function FootballField({ ballPosition, homeColor, awayColor, children }) {
  // ballPosition: 0-100 (left endzone to right endzone)
  const bp = Math.max(0, Math.min(100, ballPosition || 50));

  return (
    <div className="field-container" style={{ marginBottom: "var(--space-3)" }}>
      {/* End zones */}
      <div className="field-endzone-left" style={{ background: awayColor + "60" }}>
        <svg width="100%" height="100%" viewBox="0 0 60 100" preserveAspectRatio="none">
          <text x="30" y="50" textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.3)" fontSize="14" fontWeight="900"
            transform="rotate(-90 30 50)">
            END ZONE
          </text>
        </svg>
      </div>
      <div className="field-endzone-right" style={{ background: homeColor + "60" }}>
        <svg width="100%" height="100%" viewBox="0 0 60 100" preserveAspectRatio="none">
          <text x="30" y="50" textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.3)" fontSize="14" fontWeight="900"
            transform="rotate(90 30 50)">
            END ZONE
          </text>
        </svg>
      </div>

      {/* Yard line numbers */}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(yd => (
        <div key={yd} style={{
          position: "absolute", top: "50%", left: `${yd}%`,
          transform: "translate(-50%, -50%)",
          fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.2)",
          pointerEvents: "none",
        }}>
          {yd <= 50 ? yd : 100 - yd}
        </div>
      ))}

      {/* Ball marker */}
      <div style={{
        position: "absolute",
        left: `${bp}%`, top: "50%",
        transform: "translate(-50%, -50%)",
        width: 14, height: 8, borderRadius: "40%",
        background: "#8B4513",
        border: "1px solid rgba(255,255,255,0.3)",
        boxShadow: "0 0 8px rgba(139,69,19,0.5)",
        transition: "left 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)",
        zIndex: 5,
      }} />

      {/* Line of scrimmage */}
      <div style={{
        position: "absolute",
        left: `${bp}%`, top: 0, bottom: 0,
        width: 2, background: "rgba(255,215,0,0.4)",
        transform: "translateX(-50%)",
        transition: "left 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)",
        pointerEvents: "none",
      }} />

      {children}
    </div>
  );
}

// ── Scoreboard ──
function Scoreboard({ homeTeam, awayTeam, homeScore, awayScore, quarter, timeLeft, homeColor, awayColor }) {
  return (
    <div className="scoreboard" style={{ marginBottom: "var(--space-3)" }}>
      <div className="scoreboard-team">
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: `${awayColor}22`, border: `2px solid ${awayColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 11, color: awayColor,
        }}>
          {awayTeam?.abbr?.slice(0, 3) || "AWY"}
        </div>
        <div className="scoreboard-abbr" style={{ fontSize: "var(--text-sm)" }}>
          {awayTeam?.abbr || "AWY"}
        </div>
      </div>

      <div className="scoreboard-score" style={{
        color: awayScore > homeScore ? "var(--text)" : "var(--text-muted)",
      }}>
        {awayScore}
      </div>

      <div style={{ textAlign: "center" }}>
        <div className="scoreboard-separator">—</div>
        <div className="scoreboard-info">
          {QUARTER_NAMES[Math.min(quarter - 1, 5)] || `Q${quarter}`}
          {timeLeft && ` · ${timeLeft}`}
        </div>
      </div>

      <div className="scoreboard-score" style={{
        color: homeScore > awayScore ? "var(--text)" : "var(--text-muted)",
      }}>
        {homeScore}
      </div>

      <div className="scoreboard-team">
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: `${homeColor}22`, border: `2px solid ${homeColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 11, color: homeColor,
        }}>
          {homeTeam?.abbr?.slice(0, 3) || "HME"}
        </div>
        <div className="scoreboard-abbr" style={{ fontSize: "var(--text-sm)" }}>
          {homeTeam?.abbr || "HME"}
        </div>
      </div>
    </div>
  );
}

// ── Play Log Entry ──
function PlayEntry({ play, isNew, homeAbbr, awayAbbr }) {
  const isScore = play.type === "touchdown" || play.type === "field_goal" ||
                  play.text?.toLowerCase().includes("touchdown") ||
                  play.text?.toLowerCase().includes("field goal");
  const isTurnover = play.type === "interception" || play.type === "fumble" ||
                     play.text?.toLowerCase().includes("interception") ||
                     play.text?.toLowerCase().includes("fumble");
  const isBigPlay = play.yards >= 20 || isScore;

  return (
    <div
      className={isNew ? "fade-in-up" : ""}
      style={{
        padding: "var(--space-2) var(--space-3)",
        borderLeft: `3px solid ${isScore ? "var(--success)" : isTurnover ? "var(--danger)" : isBigPlay ? "var(--warning)" : "var(--hairline)"}`,
        background: isScore ? "rgba(52,199,89,0.05)" : isTurnover ? "rgba(255,69,58,0.05)" : "transparent",
        borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
        marginBottom: "var(--space-1)",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--space-2)",
        fontSize: "var(--text-xs)",
      }}>
        <span style={{
          fontWeight: 700, color: "var(--text-muted)", minWidth: 28,
        }}>
          {play.quarter ? `Q${play.quarter}` : ""}
        </span>
        <span style={{
          fontWeight: isScore || isBigPlay ? 700 : 400,
          color: isScore ? "var(--success)" : isTurnover ? "var(--danger)" : "var(--text)",
          flex: 1,
        }}>
          {play.text || play.description || "Play"}
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

// ── Main Component ──
export default function SeasonSimViewer({ logs = [], homeTeam, awayTeam, onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1); // 1x, 2x, 4x
  const scrollRef = useRef(null);
  const timerRef = useRef(null);

  const hColor = useMemo(() => teamColor(homeTeam?.abbr || ""), [homeTeam?.abbr]);
  const aColor = useMemo(() => teamColor(awayTeam?.abbr || ""), [awayTeam?.abbr]);

  // Auto-advance plays
  useEffect(() => {
    if (!isPlaying || currentIndex >= logs.length) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Play sound on scoring/big plays
    if (currentIndex > 0 && currentIndex <= logs.length) {
      const play = logs[currentIndex - 1];
      const text = (play?.text || play?.description || "").toLowerCase();
      if (text.includes("touchdown")) playSound("touchdown");
      else if (text.includes("field goal")) playSound("field_goal");
      else if (text.includes("interception") || text.includes("fumble")) playSound("turnover");
    }

    const delay = Math.max(100, 800 / speed);
    timerRef.current = setTimeout(() => {
      setCurrentIndex(i => i + 1);
    }, delay);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, currentIndex, logs.length, speed]);

  // Auto-scroll play log
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentIndex]);

  const visibleLogs = logs.slice(0, currentIndex);
  const currentPlay = visibleLogs[visibleLogs.length - 1];
  const isComplete = currentIndex >= logs.length;

  // Compute current score from logs
  const currentState = useMemo(() => {
    let homeScore = 0, awayScore = 0, quarter = 1;
    let ballPos = 50; // field position

    for (let i = 0; i < currentIndex && i < logs.length; i++) {
      const log = logs[i];
      if (log.homeScore !== undefined) homeScore = log.homeScore;
      if (log.awayScore !== undefined) awayScore = log.awayScore;
      if (log.quarter) quarter = log.quarter;
      if (log.fieldPosition !== undefined) ballPos = log.fieldPosition;
      else if (log.yardLine !== undefined) ballPos = log.yardLine;
    }

    return { homeScore, awayScore, quarter, ballPos };
  }, [logs, currentIndex]);

  // Build win probability events for the widget
  const wpEvents = useMemo(() => {
    const events = [];
    for (let i = 0; i < currentIndex && i < logs.length; i++) {
      const log = logs[i];
      if (log.homeWinProb !== undefined) {
        events.push({
          play: i,
          homeWinProb: log.homeWinProb,
          quarter: log.quarter,
        });
      }
    }
    // If no explicit WP, synthesize from score
    if (events.length === 0 && currentIndex > 0) {
      const diff = currentState.homeScore - currentState.awayScore;
      const base = 0.5 + diff * 0.02;
      events.push({ play: 0, homeWinProb: Math.max(0.05, Math.min(0.95, base)), quarter: currentState.quarter });
    }
    return events;
  }, [logs, currentIndex, currentState]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9500,
      background: "rgba(0,0,0,0.9)",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* ── Top Bar ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "var(--space-3) var(--space-4)",
        borderBottom: "1px solid var(--hairline)",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text)" }}>
          Game Viewer
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {/* Speed controls */}
          {[1, 2, 4].map(s => (
            <button
              key={s}
              className={`division-tab${speed === s ? " active" : ""}`}
              onClick={() => setSpeed(s)}
              style={{ fontSize: 10, minWidth: 32 }}
            >
              {s}x
            </button>
          ))}
          <button
            className="division-tab"
            onClick={() => setIsPlaying(p => !p)}
            style={{ minWidth: 48 }}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          {isComplete && (
            <button
              className="btn-premium btn-primary-premium"
              onClick={onComplete}
              style={{ fontSize: "var(--text-xs)" }}
            >
              Continue
            </button>
          )}
          <button
            onClick={onComplete}
            style={{
              background: "none", border: "1px solid var(--hairline)",
              borderRadius: "var(--radius-md)", width: 32, height: 32,
              color: "var(--text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            x
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{
        flex: 1, overflow: "hidden",
        display: "flex", flexDirection: "column",
        padding: "var(--space-4)",
        gap: "var(--space-3)",
      }}>
        {/* Scoreboard */}
        <Scoreboard
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={currentState.homeScore}
          awayScore={currentState.awayScore}
          quarter={currentState.quarter}
          timeLeft={currentPlay?.timeLeft || currentPlay?.time}
          homeColor={hColor}
          awayColor={aColor}
        />

        {/* Football Field */}
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
          height={80}
        />

        {/* Play-by-play log */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-2)",
          }}
        >
          {visibleLogs.map((play, i) => (
            <PlayEntry
              key={i}
              play={play}
              isNew={i === currentIndex - 1}
              homeAbbr={homeTeam?.abbr}
              awayAbbr={awayTeam?.abbr}
            />
          ))}
          {visibleLogs.length === 0 && (
            <div style={{
              textAlign: "center", padding: "var(--space-6)",
              color: "var(--text-muted)", fontSize: "var(--text-sm)",
            }}>
              Game starting...
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{
          height: 4, borderRadius: 2,
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
