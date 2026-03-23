/**
 * AnimatedField.jsx — SVG-based animated football field for play-by-play visualization
 *
 * Shows a top-down football field with animated player icons, ball movement,
 * line of scrimmage, first-down markers, and real-time play commentary.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

// Field constants
const FIELD_W = 1000;
const FIELD_H = 460;
const END_ZONE_W = 80;
const PLAY_AREA_W = FIELD_W - 2 * END_ZONE_W; // 840
const YARD_PX = PLAY_AREA_W / 100; // 8.4px per yard

function yardToX(yard) {
  return END_ZONE_W + Math.max(0, Math.min(100, yard)) * YARD_PX;
}

const TEAM_COLORS = {
  home: { primary: "#1a5276", secondary: "#2980b9" },
  away: { primary: "#922b21", secondary: "#e74c3c" },
};

// Generate player positions for a formation
function getOffensePositions(ballX, ballY, isHome) {
  const dir = isHome ? 1 : -1;
  const base = [
    { role: "QB", x: ballX - dir * 40, y: ballY, r: 8 },
    { role: "RB", x: ballX - dir * 70, y: ballY + 15, r: 7 },
    { role: "WR1", x: ballX + dir * 10, y: 60, r: 7 },
    { role: "WR2", x: ballX + dir * 10, y: FIELD_H - 60, r: 7 },
    { role: "WR3", x: ballX + dir * 5, y: 120, r: 7 },
    { role: "TE", x: ballX + dir * 5, y: ballY - 30, r: 7 },
    { role: "OL1", x: ballX - dir * 15, y: ballY - 30, r: 8 },
    { role: "OL2", x: ballX - dir * 15, y: ballY - 15, r: 8 },
    { role: "C", x: ballX - dir * 10, y: ballY, r: 8 },
    { role: "OL3", x: ballX - dir * 15, y: ballY + 15, r: 8 },
    { role: "OL4", x: ballX - dir * 15, y: ballY + 30, r: 8 },
  ];
  return base;
}

function getDefensePositions(ballX, ballY, isHome) {
  const dir = isHome ? 1 : -1;
  return [
    { role: "DL1", x: ballX + dir * 15, y: ballY - 25, r: 8 },
    { role: "DL2", x: ballX + dir * 15, y: ballY, r: 8 },
    { role: "DL3", x: ballX + dir * 15, y: ballY + 25, r: 8 },
    { role: "LB1", x: ballX + dir * 50, y: ballY - 40, r: 7 },
    { role: "LB2", x: ballX + dir * 50, y: ballY, r: 7 },
    { role: "LB3", x: ballX + dir * 50, y: ballY + 40, r: 7 },
    { role: "CB1", x: ballX + dir * 20, y: 65, r: 7 },
    { role: "CB2", x: ballX + dir * 20, y: FIELD_H - 65, r: 7 },
    { role: "S1", x: ballX + dir * 90, y: ballY - 50, r: 7 },
    { role: "S2", x: ballX + dir * 90, y: ballY + 50, r: 7 },
    { role: "NB", x: ballX + dir * 35, y: 130, r: 7 },
  ];
}

// Football shape for the ball
function Football({ x, y, rotation = 0, size = 6 }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rotation})`}>
      <ellipse rx={size} ry={size * 0.55} fill="#8B4513" stroke="#5C3317" strokeWidth="1" />
      <line x1={-size * 0.5} y1="0" x2={size * 0.5} y2="0" stroke="white" strokeWidth="0.8" />
      <line x1={-size * 0.3} y1="-1.5" x2={-size * 0.3} y2="1.5" stroke="white" strokeWidth="0.6" />
      <line x1={0} y1="-2" x2={0} y2="2" stroke="white" strokeWidth="0.6" />
      <line x1={size * 0.3} y1="-1.5" x2={size * 0.3} y2="1.5" stroke="white" strokeWidth="0.6" />
    </g>
  );
}

export default function AnimatedField({
  play,
  homeTeam,
  awayTeam,
  possession,
  momentum = 0,
  isPlaying = false,
  speed = 1,
}) {
  const [animPhase, setAnimPhase] = useState(0); // 0=pre-snap, 1=play, 2=result
  const [ballPos, setBallPos] = useState({ x: 500, y: FIELD_H / 2 });
  const [commentary, setCommentary] = useState("");
  const [showResult, setShowResult] = useState(false);
  const animRef = useRef(null);
  const prevPlayRef = useRef(null);

  const ballOn = play?.ballOn ?? 50;
  const firstDownLine = play?.ballOn != null && play?.distance != null
    ? Math.min(100, ballOn + (play.distance ?? 10))
    : null;

  const losX = yardToX(ballOn);
  const fdX = firstDownLine != null ? yardToX(firstDownLine) : null;

  // Animate when play changes
  useEffect(() => {
    if (!play || play === prevPlayRef.current) return;
    prevPlayRef.current = play;

    setAnimPhase(0);
    setShowResult(false);
    setBallPos({ x: losX, y: FIELD_H / 2 });

    const dur = Math.max(200, 1500 / speed);

    const t1 = setTimeout(() => {
      setAnimPhase(1);

      // Move ball based on play type
      const yards = play.yards ?? 0;
      const newX = yardToX(Math.max(0, Math.min(100, ballOn + yards)));

      if (play.type === "pass") {
        setBallPos({ x: newX, y: FIELD_H / 2 + (Math.random() - 0.5) * 80 });
      } else if (play.type === "run") {
        setBallPos({ x: newX, y: FIELD_H / 2 + (Math.random() - 0.5) * 40 });
      } else if (play.type === "kick" || play.type === "punt") {
        setBallPos({ x: newX, y: FIELD_H / 2 });
      } else {
        setBallPos({ x: newX, y: FIELD_H / 2 });
      }
    }, dur * 0.3);

    const t2 = setTimeout(() => {
      setAnimPhase(2);
      setShowResult(true);
      setCommentary(play.description || `${play.type} for ${play.yards ?? 0} yards`);
    }, dur);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [play, losX, ballOn, speed]);

  const homeColor = homeTeam?.color || TEAM_COLORS.home.primary;
  const awayColor = awayTeam?.color || TEAM_COLORS.away.primary;
  const possColor = possession === "home" ? homeColor : awayColor;

  const offPositions = useMemo(() =>
    getOffensePositions(losX, FIELD_H / 2, possession === "home"),
    [losX, possession]
  );
  const defPositions = useMemo(() =>
    getDefensePositions(losX, FIELD_H / 2, possession === "home"),
    [losX, possession]
  );

  return (
    <div style={{ width: "100%", background: "var(--surface)", borderRadius: "var(--radius-lg, 12px)", overflow: "hidden", border: "1px solid var(--hairline)" }}>
      {/* Scoreboard */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 12px", background: "var(--bg)", borderBottom: "1px solid var(--hairline)",
        fontSize: 13, fontWeight: 700,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: awayColor, fontSize: 14 }}>{awayTeam?.abbr || "AWY"}</span>
          <span style={{ fontSize: 18, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
            {play?.awayScore ?? 0}
          </span>
        </div>
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>
          <div>{play?.quarter ? `Q${play.quarter}` : "Q1"} · {play?.time || "15:00"}</div>
          <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>
            {play?.down ? `${play.down}${["st","nd","rd","th"][Math.min(play.down-1,3)]} & ${play.distance ?? 10}` : "1st & 10"}
            {" · "}{possession === "home" ? homeTeam?.abbr : awayTeam?.abbr} ball
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
            {play?.homeScore ?? 0}
          </span>
          <span style={{ color: homeColor, fontSize: 14 }}>{homeTeam?.abbr || "HME"}</span>
        </div>
      </div>

      {/* Momentum bar */}
      <div style={{ height: 4, background: "var(--surface-strong, #1a1a2e)", display: "flex" }}>
        <div style={{
          width: `${50 - momentum / 2}%`, background: awayColor, opacity: 0.7,
          transition: "width 0.8s ease",
        }} />
        <div style={{ flex: 1 }} />
        <div style={{
          width: `${momentum / 2}%`, background: homeColor, opacity: 0.7,
          transition: "width 0.8s ease",
        }} />
      </div>

      {/* SVG Field */}
      <svg
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        style={{ width: "100%", display: "block" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="fieldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d5a1e" />
            <stop offset="50%" stopColor="#347a28" />
            <stop offset="100%" stopColor="#2d5a1e" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Field background */}
        <rect x="0" y="0" width={FIELD_W} height={FIELD_H} fill="url(#fieldGrad)" />

        {/* End zones */}
        <rect x="0" y="0" width={END_ZONE_W} height={FIELD_H} fill={awayColor} opacity="0.3" />
        <rect x={FIELD_W - END_ZONE_W} y="0" width={END_ZONE_W} height={FIELD_H} fill={homeColor} opacity="0.3" />

        {/* End zone text */}
        <text x={END_ZONE_W / 2} y={FIELD_H / 2} fill="white" opacity="0.15" fontSize="40" fontWeight="900"
          textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90, ${END_ZONE_W / 2}, ${FIELD_H / 2})`}>
          {awayTeam?.abbr || "AWAY"}
        </text>
        <text x={FIELD_W - END_ZONE_W / 2} y={FIELD_H / 2} fill="white" opacity="0.15" fontSize="40" fontWeight="900"
          textAnchor="middle" dominantBaseline="middle" transform={`rotate(90, ${FIELD_W - END_ZONE_W / 2}, ${FIELD_H / 2})`}>
          {homeTeam?.abbr || "HOME"}
        </text>

        {/* End zone borders */}
        <line x1={END_ZONE_W} y1="0" x2={END_ZONE_W} y2={FIELD_H} stroke="white" strokeWidth="3" />
        <line x1={FIELD_W - END_ZONE_W} y1="0" x2={FIELD_W - END_ZONE_W} y2={FIELD_H} stroke="white" strokeWidth="3" />

        {/* Yard lines */}
        {Array.from({ length: 11 }, (_, i) => {
          const yard = i * 10;
          const x = yardToX(yard);
          return (
            <g key={`yd-${yard}`}>
              <line x1={x} y1="0" x2={x} y2={FIELD_H} stroke="white" strokeWidth="1" opacity="0.5" />
              {yard > 0 && yard < 100 && (
                <>
                  <text x={x} y="25" fill="white" opacity="0.4" fontSize="16" fontWeight="700"
                    textAnchor="middle">{yard <= 50 ? yard : 100 - yard}</text>
                  <text x={x} y={FIELD_H - 12} fill="white" opacity="0.4" fontSize="16" fontWeight="700"
                    textAnchor="middle">{yard <= 50 ? yard : 100 - yard}</text>
                </>
              )}
            </g>
          );
        })}

        {/* Hash marks */}
        {Array.from({ length: 99 }, (_, i) => {
          const x = yardToX(i + 1);
          if ((i + 1) % 10 === 0) return null;
          return (
            <g key={`hash-${i}`}>
              <line x1={x} y1={FIELD_H * 0.33 - 3} x2={x} y2={FIELD_H * 0.33 + 3} stroke="white" strokeWidth="0.5" opacity="0.3" />
              <line x1={x} y1={FIELD_H * 0.67 - 3} x2={x} y2={FIELD_H * 0.67 + 3} stroke="white" strokeWidth="0.5" opacity="0.3" />
            </g>
          );
        })}

        {/* First down line (yellow) */}
        {fdX != null && (
          <line x1={fdX} y1="0" x2={fdX} y2={FIELD_H} stroke="#FFD700" strokeWidth="3" opacity="0.8"
            strokeDasharray="8 4" />
        )}

        {/* Line of scrimmage (blue) */}
        <line x1={losX} y1="0" x2={losX} y2={FIELD_H} stroke="#4A90D9" strokeWidth="3" opacity="0.8" />

        {/* Offense players */}
        {offPositions.map((p, i) => {
          const moveX = animPhase >= 1 && play?.type === "run" && (p.role === "RB" || p.role === "QB")
            ? (play.yards ?? 0) * YARD_PX * (possession === "home" ? 1 : -1) * 0.5
            : 0;
          const moveY = animPhase >= 1 && p.role.startsWith("WR") && play?.type === "pass"
            ? (Math.random() - 0.5) * 40 : 0;
          return (
            <g key={`off-${i}`}>
              <circle
                cx={p.x + moveX} cy={p.y + moveY} r={p.r}
                fill={possColor} stroke="white" strokeWidth="1.5"
                style={{ transition: `cx ${0.8 / speed}s ease, cy ${0.8 / speed}s ease` }}
                opacity="0.9"
              />
              <text x={p.x + moveX} y={p.y + moveY + 1} fill="white" fontSize="6" fontWeight="700"
                textAnchor="middle" dominantBaseline="middle"
                style={{ transition: `x ${0.8 / speed}s ease, y ${0.8 / speed}s ease`, pointerEvents: "none" }}>
                {p.role.replace(/\d/g, "")}
              </text>
            </g>
          );
        })}

        {/* Defense players */}
        {defPositions.map((p, i) => {
          const defColor = possession === "home" ? awayColor : homeColor;
          const moveX = animPhase >= 1 ? (Math.random() - 0.5) * 15 : 0;
          return (
            <g key={`def-${i}`}>
              <circle
                cx={p.x + moveX} cy={p.y} r={p.r}
                fill={defColor} stroke="white" strokeWidth="1.5"
                style={{ transition: `cx ${0.8 / speed}s ease` }}
                opacity="0.85"
              />
              <text x={p.x + moveX} y={p.y + 1} fill="white" fontSize="6" fontWeight="700"
                textAnchor="middle" dominantBaseline="middle"
                style={{ transition: `x ${0.8 / speed}s ease`, pointerEvents: "none" }}>
                {p.role.replace(/\d/g, "")}
              </text>
            </g>
          );
        })}

        {/* Pass trajectory */}
        {play?.type === "pass" && animPhase >= 1 && (
          <line
            x1={losX} y1={FIELD_H / 2}
            x2={ballPos.x} y2={ballPos.y}
            stroke="white" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5"
            style={{ transition: `x2 ${0.6 / speed}s ease, y2 ${0.6 / speed}s ease` }}
          />
        )}

        {/* Ball */}
        <Football
          x={animPhase >= 1 ? ballPos.x : losX}
          y={animPhase >= 1 ? ballPos.y : FIELD_H / 2}
          rotation={play?.type === "pass" ? 45 : 0}
          size={7}
        />

        {/* Result overlay */}
        {showResult && play?.result && (
          <g>
            <rect x={FIELD_W / 2 - 120} y={FIELD_H / 2 - 25} width="240" height="50" rx="8"
              fill="rgba(0,0,0,0.75)" />
            <text x={FIELD_W / 2} y={FIELD_H / 2 - 5} fill={
              (play.yards ?? 0) > 0 ? "#34C759" : (play.yards ?? 0) < 0 ? "#FF453A" : "white"
            } fontSize="14" fontWeight="800" textAnchor="middle">
              {play.result}
            </text>
            <text x={FIELD_W / 2} y={FIELD_H / 2 + 15} fill="white" fontSize="10" textAnchor="middle" opacity="0.8">
              {play.yards != null ? `${play.yards > 0 ? "+" : ""}${play.yards} yards` : ""}
            </text>
          </g>
        )}

        {/* Sideline borders */}
        <rect x="0" y="0" width={FIELD_W} height={FIELD_H} fill="none" stroke="white" strokeWidth="4" />
      </svg>

      {/* Commentary bar */}
      {commentary && (
        <div style={{
          padding: "8px 12px",
          background: "var(--bg)",
          borderTop: "1px solid var(--hairline)",
          fontSize: 12,
          color: "var(--text)",
          fontWeight: 600,
          animation: "slideInRight 0.3s ease-out",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: isPlaying ? "#34C759" : "var(--text-subtle)",
            flexShrink: 0,
          }} />
          <span>{commentary}</span>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
