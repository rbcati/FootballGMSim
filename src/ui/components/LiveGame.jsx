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

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";

// ── Momentum Bar ───────────────────────────────────────────────────────────────
// Shows which team has the momentum based on recent plays.

function MomentumBar({ homeAbbr, awayAbbr, momentum }) {
  // momentum: -100 (all away) to +100 (all home). 0 = neutral.
  const clampedMom = Math.max(-100, Math.min(100, momentum));
  const homeColor = teamColor(homeAbbr);
  const awayColor = teamColor(awayAbbr);
  // Map -100..+100 to left%: 0%=all away, 50%=neutral, 100%=all home
  const filledPct = (clampedMom + 100) / 2; // 0-100

  return (
    <div style={{ padding: "var(--space-2) var(--space-4)", borderBottom: "1px solid var(--hairline)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: awayColor, minWidth: 28 }}>{awayAbbr}</span>
        <div style={{ flex: 1, height: 6, background: "var(--surface-strong)", borderRadius: "var(--radius-pill)", overflow: "hidden", position: "relative" }}>
          {/* Away momentum (red side) */}
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0,
            width: `${Math.max(0, 50 - filledPct)}%`,
            background: awayColor, opacity: 0.7,
            borderRadius: "var(--radius-pill)",
            transition: "width 0.8s cubic-bezier(0.2,0.8,0.2,1)",
          }} />
          {/* Home momentum (blue side) */}
          <div style={{
            position: "absolute", top: 0, right: 0, bottom: 0,
            width: `${Math.max(0, filledPct - 50)}%`,
            background: homeColor, opacity: 0.7,
            borderRadius: "var(--radius-pill)",
            transition: "width 0.8s cubic-bezier(0.2,0.8,0.2,1)",
          }} />
          {/* Center marker */}
          <div style={{ position: "absolute", top: -1, bottom: -1, left: "50%", width: 2, background: "var(--hairline-strong)", transform: "translateX(-50%)" }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: homeColor, minWidth: 28, textAlign: "right" }}>{homeAbbr}</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 9, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Momentum
        {Math.abs(clampedMom) > 25 && (
          <span style={{ marginLeft: 4, color: clampedMom > 0 ? homeColor : awayColor }}>
            → {clampedMom > 0 ? homeAbbr : awayAbbr}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Quarter Score Display ──────────────────────────────────────────────────────

function QuarterScores({ homeAbbr, awayAbbr, quarterScores }) {
  // quarterScores: { home: [q1,q2,q3,q4], away: [q1,q2,q3,q4] }
  const { home = [], away = [] } = quarterScores ?? {};
  const labels = ["Q1","Q2","Q3","Q4","OT"];

  const maxQ = Math.max(home.length, away.length, 4);
  const cols = Array.from({ length: maxQ }, (_, i) => i);

  return (
    <div style={{
      padding: "var(--space-2) var(--space-4)",
      borderBottom: "1px solid var(--hairline)",
      overflowX: "auto",
    }}>
      <div className="quarter-scores">
        {/* Header */}
        <div className="q-cell q-header" />
        {cols.map(i => (
          <div key={i} className="q-cell q-header">{labels[i] ?? `Q${i+1}`}</div>
        ))}
        <div className="q-cell q-header">T</div>

        {/* Away row */}
        <div className="q-cell q-team" style={{ color: "var(--text)", fontWeight: 700, fontSize: "var(--text-xs)" }}>{awayAbbr}</div>
        {cols.map(i => (
          <div key={i} className="q-cell q-score" style={{ fontSize: "var(--text-xs)", color: "var(--text)" }}>
            {away[i] ?? (i < maxQ ? "—" : "")}
          </div>
        ))}
        <div className="q-cell q-total" style={{ fontSize: "var(--text-xs)", color: "var(--text)" }}>
          {away.reduce((s, v) => s + v, 0)}
        </div>

        {/* Home row */}
        <div className="q-cell q-team" style={{ color: "var(--accent)", fontWeight: 700, fontSize: "var(--text-xs)" }}>{homeAbbr}</div>
        {cols.map(i => (
          <div key={i} className="q-cell q-score" style={{ fontSize: "var(--text-xs)", color: "var(--text)" }}>
            {home[i] ?? (i < maxQ ? "—" : "")}
          </div>
        ))}
        <div className="q-cell q-total" style={{ fontSize: "var(--text-xs)", color: "var(--accent)" }}>
          {home.reduce((s, v) => s + v, 0)}
        </div>
      </div>
    </div>
  );
}

// ── Palette helper ─────────────────────────────────────────────────────────────

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF",
    "#34C759",
    "#FF9F0A",
    "#FF453A",
    "#5E5CE6",
    "#64D2FF",
    "#FFD60A",
    "#30D158",
    "#FF6961",
    "#AEC6CF",
    "#FF6B35",
    "#B4A0E5",
  ];
  let hash = 0;
  for (let i = 0; i < abbr.length; i++)
    hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

// ── Animated "LIVE" indicator ─────────────────────────────────────────────────

function LiveDot() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--danger)",
          display: "inline-block",
          animation: "lgLivePulse 1.1s ease-in-out infinite",
        }}
      />
      <style>{`@keyframes lgLivePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.85)}}`}</style>
    </span>
  );
}

// ── Team badge (circular) ─────────────────────────────────────────────────────

function TeamBadge({ abbr, size = 36, isUser = false }) {
  const color = teamColor(abbr);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `${color}22`,
        border: `2px solid ${isUser ? "var(--accent)" : color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: size * 0.3,
        color: isUser ? "var(--accent)" : color,
        flexShrink: 0,
        letterSpacing: "-0.5px",
      }}
    >
      {abbr?.slice(0, 3) ?? "?"}
    </div>
  );
}

// ── Scoreboard card (one per matchup) ────────────────────────────────────────

function MatchupCard({ event, userTeamId, pending, onOpenBoxScore }) {
  const { homeId, awayId, homeAbbr, awayAbbr, homeScore, awayScore } = event;
  const isUser = homeId === userTeamId || awayId === userTeamId;
  const finished = !pending;
  const handleClick = () => {
    if (!finished || !onOpenBoxScore || !event?.gameId) return;
    onOpenBoxScore(event.gameId);
  };

  return (
    <div
      className={`matchup-card ${isUser ? "user-game" : ""}`}
      style={{
        padding: "var(--space-3) var(--space-4)",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        ...(isUser
          ? {
              borderColor: "var(--accent)",
              boxShadow: "0 0 0 1px var(--accent)",
            }
          : {}),
        cursor: finished && onOpenBoxScore && event?.gameId ? "pointer" : "default",
      }}
      onClick={handleClick}
    >
      {/* Away team */}
      <TeamBadge abbr={awayAbbr} size={32} isUser={awayId === userTeamId} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 700,
            color:
              awayId === userTeamId ? "var(--accent)" : "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {awayAbbr}
        </div>
        <div
          style={{
            fontSize: "var(--text-xl)",
            fontWeight: 800,
            lineHeight: 1.1,
            color:
              finished && awayScore > homeScore
                ? "var(--text)"
                : "var(--text-muted)",
          }}
        >
          {awayScore}
        </div>
      </div>

      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 40 }}>
        {finished ? (
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--success)",
              fontWeight: 700,
            }}
          >
            FINAL
          </span>
        ) : (
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--accent)",
              fontWeight: 600,
            }}
          >
            LIVE
          </span>
        )}
      </div>

      {/* Home team */}
      <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
        <div
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 700,
            color:
              homeId === userTeamId ? "var(--accent)" : "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {homeAbbr}
        </div>
        <div
          style={{
            fontSize: "var(--text-xl)",
            fontWeight: 800,
            lineHeight: 1.1,
            color:
              finished && homeScore > awayScore
                ? "var(--text)"
                : "var(--text-muted)",
          }}
        >
          {homeScore}
        </div>
      </div>
      <TeamBadge abbr={homeAbbr} size={32} isUser={homeId === userTeamId} />
    </div>
  );
}

// ── Pending (not-yet-resolved) game placeholder ───────────────────────────────

function PendingCard({ game, teamById, userTeamId }) {
  const home = teamById[game.home] ?? { abbr: "???", id: game.home };
  const away = teamById[game.away] ?? { abbr: "???", id: game.away };
  const isUser = home.id === userTeamId || away.id === userTeamId;
  return (
    <div
      className={`matchup-card pending ${isUser ? "user-game" : ""}`}
      style={{
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        opacity: 0.6,
        ...(isUser ? { borderColor: "var(--accent)" } : {}),
      }}
    >
      <TeamBadge abbr={away.abbr} size={32} isUser={away.id === userTeamId} />
      <div
        style={{
          flex: 1,
          textAlign: "center",
          fontSize: "var(--text-xs)",
          color: "var(--text-subtle)",
        }}
      >
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
  (o, d, g) =>
    `${o} — ${g >= 15 ? "deep pass complete" : "short pass complete"} for ${g} yds`,
  (o, d, g) => `${o} — QB scrambles for ${g} yds`,
  (o, d, g) => `${o} — run up the middle, ${g} yds`,
  (o, d, g) => `${o} — stretch run to the outside, ${g} yds`,
  (o, d, g) => `${d} — sack! QB brought down, loss of ${(g % 8) + 1} yds`,
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
  const off = isHome ? homeAbbr : awayAbbr;
  const def = isHome ? awayAbbr : homeAbbr;
  const gain = ((seed * 13 + 7) % 28) + 1;
  const tplIdx = (seed * 7 + 3) % PLAY_POOL.length;
  return PLAY_POOL[tplIdx](off, def, gain);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveGame({
  simulating,
  simProgress,
  league,
  lastResults,
  gameEvents,
  onOpenBoxScore,
}) {
  const [visible, setVisible] = useState(false);
  const [plays, setPlays] = useState([]);
  const [skipping, setSkipping] = useState(false);
  const [prevSim, setPrevSim] = useState(false);
  const [overlayEvent, setOverlayEvent] = useState(null);
  const [momentum, setMomentum] = useState(0); // -100 to +100 (positive = home momentum)
  const [quarterScores, setQuarterScores] = useState({ home: [], away: [] });
  const [driveCount, setDriveCount] = useState(0);
  const playLogRef = useRef(null);
  const intervalRef = useRef(null);
  const playCountRef = useRef(0);

  // ── Build fast-lookup maps ───────────────────────────────────────────────

  const teamById = useMemo(() => {
    const map = {};
    (league?.teams ?? []).forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [league?.teams]);

  // Games currently scheduled for this week that haven't resolved yet
  const weekGames = useMemo(() => {
    if (!league?.schedule?.weeks || !league?.week) return [];
    const wd = league.schedule.weeks.find((w) => w.week === league.week);
    return wd?.games ?? [];
  }, [league?.schedule, league?.week]);

  // The user's team's game from the current week schedule
  const userGame = useMemo(() => {
    if (!league?.userTeamId) return null;
    return (
      weekGames.find(
        (g) =>
          Number(g.home) === league.userTeamId ||
          Number(g.away) === league.userTeamId,
      ) ?? null
    );
  }, [weekGames, league?.userTeamId]);

  // Resolved GAME_EVENT for the user's game (if simulation already finished it)
  const userEvent = useMemo(() => {
    if (!league?.userTeamId) return null;
    return (
      (gameEvents ?? []).find(
        (e) => e.homeId === league.userTeamId || e.awayId === league.userTeamId,
      ) ?? null
    );
  }, [gameEvents, league?.userTeamId]);

  const userHomeAbbr =
    userEvent?.homeAbbr ??
    (userGame ? teamById[userGame.home]?.abbr : null) ??
    "???";
  const userAwayAbbr =
    userEvent?.awayAbbr ??
    (userGame ? teamById[userGame.away]?.abbr : null) ??
    "???";

  // ── Show / hide logic ────────────────────────────────────────────────────

  useEffect(() => {
    if (simulating && !prevSim) {
      // Simulation just started
      setVisible(true);
      setPlays([]);
      setSkipping(false);
      setMomentum(0);
      setQuarterScores({ home: [], away: [] });
      setDriveCount(0);
      playCountRef.current = 0;
    }
    setPrevSim(simulating);
  }, [simulating]);

  // ── Synthetic play ticker ────────────────────────────────────────────────

  const addPlay = useCallback(() => {
    if (skipping) return;
    const n = playCountRef.current++;
    const text = generatePlay(userHomeAbbr, userAwayAbbr, n);

    const lowerText = text.toLowerCase();
    const isHomePossession = lowerText.startsWith(userHomeAbbr.toLowerCase());

    // Update momentum: positive plays shift momentum toward the offensive team
    setMomentum(prev => {
      let delta = 0;
      if (lowerText.includes("touchdown"))      delta = isHomePossession ? 30 : -30;
      else if (lowerText.includes("field goal attempt... good")) delta = isHomePossession ? 15 : -15;
      else if (lowerText.includes("interception") || lowerText.includes("fumble")) delta = isHomePossession ? -25 : 25;
      else if (lowerText.includes("sack"))      delta = isHomePossession ? -10 : 10;
      else if (lowerText.includes("deep pass")) delta = isHomePossession ? 12 : -12;
      else if (lowerText.includes("safety"))    delta = isHomePossession ? -20 : 20;
      else                                      delta = isHomePossession ? 3 : -3;
      // Decay toward 0 (regression to mean)
      return Math.max(-100, Math.min(100, prev * 0.88 + delta));
    });

    // Simulate quarter score progression (roughly every 8 plays = 1 quarter)
    const quarterIdx = Math.floor(n / 8);
    if (lowerText.includes("touchdown") || lowerText.includes("field goal attempt... good")) {
      const pts = lowerText.includes("touchdown") ? 7 : 3;
      setQuarterScores(prev => {
        const q = Math.min(quarterIdx, 3);
        const newHome = [...prev.home];
        const newAway = [...prev.away];
        while (newHome.length <= q) newHome.push(0);
        while (newAway.length <= q) newAway.push(0);
        if (isHomePossession) newHome[q] += pts;
        else newAway[q] += pts;
        return { home: newHome, away: newAway };
      });
    }

    // Add drive summary every ~6 plays
    let entry = { id: n, text, isDrive: false, driveType: null };
    if (n > 0 && n % 6 === 0) {
      const driveTypes = [
        { type: "td", label: "Drive: TOUCHDOWN! 6+1 pts" },
        { type: "fg", label: "Drive: Field Goal. 3 pts" },
        { type: "punt", label: "Drive: 3-and-out. Punt." },
        { type: "to",  label: "Drive: Turnover on downs." },
      ];
      const dtIdx = (n * 3 + driveCount) % driveTypes.length;
      entry = { id: n, text, isDrive: true, ...driveTypes[dtIdx] };
      setDriveCount(c => c + 1);
    }

    setPlays((prev) => [...prev.slice(-59), entry]); // keep last 60 entries

    if (lowerText.includes("touchdown")) {
      setOverlayEvent({ type: "touchdown", text: "TOUCHDOWN" });
    } else if (lowerText.includes("field goal attempt... good")) {
      setOverlayEvent({ type: "field-goal-made", text: "FIELD GOAL" });
    } else if (
      lowerText.includes("interception") ||
      lowerText.includes("fumble")
    ) {
      setOverlayEvent({ type: "turnover", text: "TURNOVER" });
    } else if (lowerText.includes("sack")) {
      setOverlayEvent({ type: "sack", text: "SACK" });
    } else if (lowerText.includes("safety")) {
      setOverlayEvent({ type: "safety", text: "SAFETY" });
    } else if (lowerText.includes("deep pass complete")) {
      setOverlayEvent({ type: "big-play", text: "BIG PLAY" });
    } else {
      setOverlayEvent(null);
    }
  }, [skipping, userHomeAbbr, userAwayAbbr, driveCount]);

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
    (e) => e.homeId === userTeamId || e.awayId === userTeamId,
  );

  // Games still pending (not yet in gameEvents) — show only user's game.
  const resolvedGameIds = new Set(resolvedEvents.map((e) => e.gameId));
  const pendingGames = weekGames.filter((g) => {
    const id = `${league?.seasonId}_w${league?.week}_${g.home}_${g.away}`;
    return !resolvedGameIds.has(id);
  });
  const userPendingGames = pendingGames.filter(
    (g) => Number(g.home) === userTeamId || Number(g.away) === userTeamId,
  );

  // Final results to show when sim is done — user's game only.
  const isFinished = !simulating && (lastResults?.length ?? 0) > 0;
  const userLastResults = (lastResults ?? []).filter(
    (r) => r.homeId === userTeamId || r.awayId === userTeamId,
  );

  if (!visible) return null;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-lg)",
        marginBottom: "var(--space-6)",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-5)",
          background: "var(--surface-strong)",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        {simulating && <LiveDot />}
        <span
          style={{
            fontWeight: 700,
            fontSize: "var(--text-sm)",
            color: "var(--text)",
          }}
        >
          {simulating
            ? `Week ${league?.week} · Simulating…`
            : `Week ${league?.week ?? ""} · Final Results`}
        </span>

        {simulating && !skipping && (
          <>
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                marginLeft: 8,
              }}
            >
              {simProgress}%
            </span>
            <button
              className="btn"
              onClick={handleSkip}
              style={{
                marginLeft: "auto",
                background: "var(--surface-strong)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                padding: "3px 10px",
                fontWeight: 600,
              }}
            >
              Skip to End
            </button>
          </>
        )}

        {simulating && skipping && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: "var(--text-xs)",
              color: "var(--text-subtle)",
              fontStyle: "italic",
            }}
          >
            Waiting for results…
          </span>
        )}

        {!simulating && (
          <button
            className="btn"
            onClick={() => setVisible(false)}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: "var(--text-muted)",
              padding: "0 var(--space-1)",
              lineHeight: 1,
            }}
            aria-label="Close live game viewer"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Progress bar ── */}
      {simulating && (
        <div style={{ height: 3, background: "var(--hairline)" }}>
          <div
            style={{
              height: "100%",
              width: `${simProgress}%`,
              background: skipping ? "var(--text-muted)" : "var(--accent)",
              transition: "width 0.2s ease",
            }}
          />
        </div>
      )}

      {/* ── Momentum Bar (only shown when user has a game) ── */}
      {simulating && !skipping && (userGame || userEvent) && userHomeAbbr !== "???" && (
        <MomentumBar
          homeAbbr={userHomeAbbr}
          awayAbbr={userAwayAbbr}
          momentum={momentum}
        />
      )}

      {/* ── Quarter Scores (shown when scores have started accumulating) ── */}
      {simulating && !skipping && (userGame || userEvent) && (quarterScores.home.length > 0 || quarterScores.away.length > 0) && (
        <QuarterScores
          homeAbbr={userHomeAbbr}
          awayAbbr={userAwayAbbr}
          quarterScores={quarterScores}
        />
      )}

      {/* ── Body: split scoreboard / play-by-play ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0,
          minHeight: 200,
        }}
      >
        {/* ── Left: Scoreboard ── */}
        <div
          style={{
            flex: "999 1 300px",
            padding: "var(--space-4)",
            borderRight: "1px solid var(--hairline)",
            borderBottom: "1px solid var(--hairline)", // fallback for wrapping
          }}
        >
          <div
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              color: "var(--text-muted)",
              marginBottom: "var(--space-3)",
            }}
          >
            Scoreboard — Week {league?.week}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "var(--space-2)",
            }}
          >
            {/* User's finished game (GAME_EVENT received) */}
            {userResolvedEvents.map((ev, i) => (
              <MatchupCard
                key={ev.gameId ?? i}
                event={ev}
                userTeamId={userTeamId}
                pending={false}
                onOpenBoxScore={onOpenBoxScore}
              />
            ))}

            {/* User's pending game (still in progress during sim) */}
            {simulating &&
              userPendingGames.map((g, i) => (
                <PendingCard
                  key={i}
                  game={g}
                  teamById={teamById}
                  userTeamId={userTeamId}
                />
              ))}

            {/* Post-sim fallback: show user's lastResult if no events (e.g. skip was used) */}
            {isFinished &&
              userResolvedEvents.length === 0 &&
              userLastResults.map((r, i) => (
                <MatchupCard
                  key={i}
                  event={{
                    gameId: `fallback_${i}`,
                    homeId: r.homeId,
                    awayId: r.awayId,
                    homeAbbr: r.homeName?.slice(0, 3) ?? "???",
                    awayAbbr: r.awayName?.slice(0, 3) ?? "???",
                    homeScore: r.homeScore,
                    awayScore: r.awayScore,
                  }}
                  userTeamId={userTeamId}
                  pending={false}
                />
              ))}

            {userResolvedEvents.length === 0 && userLastResults.length === 0 && !simulating && (
              <p
                style={{
                  color: "var(--text-subtle)",
                  fontSize: "var(--text-xs)",
                  margin: 0,
                }}
              >
                No games to display.
              </p>
            )}
          </div>
        </div>

        {/* ── Right: Play-by-play log ── */}
        <div
          style={{
            flex: "1 1 280px",
            display: "flex",
            flexDirection: "column",
            borderTop: "1px solid var(--hairline)", // for wrapping
            marginTop: -1, // collapse double border if wrapped
          }}
        >
          <div
            style={{
              padding: "var(--space-3) var(--space-4)",
              borderBottom: "1px solid var(--hairline)",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            {userHomeAbbr !== "???"
              ? `${userAwayAbbr} @ ${userHomeAbbr}`
              : "Play-by-play"}
          </div>
          <div
            ref={playLogRef}
            style={{
              flex: 1,
              overflowY: "auto",
              maxHeight: 280,
              minHeight: 150,
              padding: "var(--space-2) var(--space-3)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-1)",
              position: "relative",
            }}
          >
            {overlayEvent && (
              <div
                className={`game-event-overlay ${overlayEvent.type}`}
                key={Date.now()}
              >
                <span className="event-text">{overlayEvent.text}</span>
              </div>
            )}
            {plays.length === 0 && simulating && !skipping && (
              <p
                style={{
                  color: "var(--text-subtle)",
                  fontSize: "var(--text-xs)",
                  margin: 0,
                  padding: "var(--space-2) 0",
                }}
              >
                {userGame || userEvent
                  ? "Simulation starting…"
                  : "Your team is on a bye this week."}
              </p>
            )}
            {skipping && (
              <p
                style={{
                  color: "var(--text-subtle)",
                  fontSize: "var(--text-xs)",
                  margin: 0,
                  padding: "var(--space-2) 0",
                  fontStyle: "italic",
                }}
              >
                Skipping to final results…
              </p>
            )}
            {!simulating && plays.length === 0 && (
              <p
                style={{
                  color: "var(--text-subtle)",
                  fontSize: "var(--text-xs)",
                  margin: 0,
                  padding: "var(--space-2) 0",
                }}
              >
                Simulation complete.
              </p>
            )}
            {plays.map((p) => (
              p.isDrive ? (
                <div
                  key={p.id}
                  className={`drive-summary ${p.driveType ?? ""}`}
                  style={{
                    animation: p.id === plays[plays.length - 1]?.id ? "lgFadeIn 0.22s ease" : "none",
                  }}
                >
                  {p.label}
                </div>
              ) : (
                <div
                  key={p.id}
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--text-muted)",
                    lineHeight: 1.45,
                    borderBottom: "1px solid var(--hairline)",
                    paddingBottom: "var(--space-1)",
                    animation:
                      p.id === plays[plays.length - 1]?.id
                        ? "lgFadeIn 0.22s ease"
                        : "none",
                  }}
                >
                  {p.text}
                </div>
              )
            ))}
            <style>{`@keyframes lgFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
          </div>
        </div>
      </div>
    </div>
  );
}
