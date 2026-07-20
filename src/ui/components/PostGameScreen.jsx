/**
 * PostGameScreen.jsx — Post-game results summary
 *
 * Shown after a game simulation completes (or after advancing week).
 * Displays:
 *  - Final score hero
 *  - W/L/T result for the user team
 *  - Game Leaders (QB stat line, top receiver, top rusher) via PlayerCards
 *  - Key stat highlights
 *  - Continue button
 */

import React, { useMemo, useState, Component } from "react";
import PlayerCard from "./PlayerCard.jsx";
import AdvancedStats from "./AdvancedStats.jsx";
import { buildGameFlowSummary } from "../../core/sim/gameFlowSummary.js";
import { buildReasoningBullets, buildPlayerLeadersFromArchive } from "../../core/gameSummary.js";
import { readStrictFinalScore } from "../../core/gameArchive.js";
import ReplayableGameFlowViewer from "./ReplayableGameFlowViewer.jsx";

// ── Error boundary so a crash here never freezes the whole app ────────────────
// Recovery contract: the fallback is a fully opaque, anchored surface (no
// unrelated screen bleeding through behind it), the copy is honest (the game
// result is already saved — only the recap view failed), and navigation is
// user-controlled and fires exactly once. No automatic redirect races the
// button.
export class PostGameErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
    this.recoveredRef = { done: false };
    this.handleRecover = this.handleRecover.bind(this);
  }
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(err) { console.error('[PostGameScreen] render crash:', err); }
  handleRecover() {
    if (this.recoveredRef.done) return;
    this.recoveredRef.done = true;
    this.props.onContinue?.();
  }
  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="postgame-recovery-title"
        aria-describedby="postgame-recovery-detail"
        data-testid="postgame-recovery"
        style={{
          position: "fixed", inset: 0, zIndex: 9700,
          background: "var(--bg, #0b0b12)", display: "flex",
          alignItems: "center", justifyContent: "center", flexDirection: "column",
          gap: 14, padding: 24, textAlign: "center",
        }}
      >
        <div style={{ fontSize: "1.6rem" }} aria-hidden="true">🏈</div>
        <div id="postgame-recovery-title" style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text, #fff)" }}>
          Game recap unavailable
        </div>
        <div id="postgame-recovery-detail" style={{ fontSize: "0.85rem", color: "var(--text-muted, #9aa2b1)", maxWidth: 320, lineHeight: 1.5 }}>
          The final result was saved, but the recap view could not be shown.
          You can pick the week back up from Franchise HQ.
        </div>
        <button
          onClick={this.handleRecover}
          data-testid="postgame-recovery-return"
          style={{
            padding: "12px 28px", background: "#0A84FF", color: "#fff",
            border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer",
            minHeight: 44,
          }}
        >
          Return to HQ
        </button>
      </div>
    );
  }
}

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF","#34C759","#FF9F0A","#FF453A","#5E5CE6",
    "#64D2FF","#FFD60A","#30D158","#FF6961","#AEC6CF",
    "#FF6B35","#B4A0E5",
  ];
  let h = 0;
  for (let i = 0; i < abbr.length; i++) h = abbr.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function StatPill({ label, value, color = "var(--text-muted)" }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "10px 16px",
      background: "var(--surface)",
      border: "1px solid var(--hairline)",
      borderRadius: 10,
      minWidth: 80,
    }}>
      <div style={{ fontSize: "1.2rem", fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-subtle)",
        textTransform: "uppercase", letterSpacing: "0.8px", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// Simple confetti
function Confetti({ colors }) {
  const particles = useMemo(() => Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 2.5,
    color: colors[i % colors.length],
    size: 5 + Math.random() * 7,
    duration: 2 + Math.random() * 2,
  })), []); // eslint-disable-line

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 9800 }}>
      <style>{`
        @keyframes pgConfetti {
          from { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          to   { transform: translateY(110vh) rotate(540deg); opacity: 0; }
        }
      `}</style>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", top: 0, left: `${p.x}%`,
          width: p.size, height: p.size * 0.55,
          background: p.color, borderRadius: 2,
          animation: `pgConfetti ${p.duration}s ${p.delay}s linear forwards`,
        }} />
      ))}
    </div>
  );
}


const asNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Derive game leaders from the CANONICAL player box score (the same authority
 * that owns the final score) — never from narration play-logs. Returns
 * team-attributed, pre-formatted leader cards for Passing / Rushing / Receiving
 * / Defense. When canonical stats are absent, returns no leaders (honest empty
 * state) rather than recounting narration references.
 */
function useCanonicalLeaders(playerStats, context) {
  return useMemo(() => {
    const empty = { qb: null, receiver: null, rusher: null, defender: null };
    try {
      const hasStats = playerStats
        && (Object.keys(playerStats.home ?? {}).length || Object.keys(playerStats.away ?? {}).length);
      if (!hasStats) return empty;
      const { categories } = buildPlayerLeadersFromArchive(playerStats, context);
      const teamAbbr = (teamId) => (
        Number(teamId) === Number(context.homeId) ? context.homeAbbr
          : Number(teamId) === Number(context.awayId) ? context.awayAbbr : null
      );
      const format = (row, kind) => {
        if (!row) return null;
        const s = row.stats ?? {};
        let statLine = "";
        if (kind === "passing") statLine = `${asNum(s.passComp)}/${asNum(s.passAtt)} · ${asNum(s.passYd)} yds${asNum(s.passTD) ? ` · ${asNum(s.passTD)} TD` : ""}`;
        else if (kind === "receiving") statLine = `${asNum(s.receptions)} rec · ${asNum(s.recYd)} yds${asNum(s.recTD) ? ` · ${asNum(s.recTD)} TD` : ""}`;
        else if (kind === "rushing") statLine = `${asNum(s.rushAtt)} car · ${asNum(s.rushYd)} yds${asNum(s.rushTD) ? ` · ${asNum(s.rushTD)} TD` : ""}`;
        else {
          statLine = [
            asNum(s.tackles) ? `${asNum(s.tackles)} tkl` : "",
            asNum(s.sacks) ? `${asNum(s.sacks)} sack${asNum(s.sacks) > 1 ? "s" : ""}` : "",
            asNum(s.interceptions) ? `${asNum(s.interceptions)} INT` : "",
            asNum(s.passesDefended) ? `${asNum(s.passesDefended)} PD` : "",
          ].filter(Boolean).join(" · ");
        }
        return { name: row.name, pos: row.pos, teamAbbr: teamAbbr(row.teamId), statLine };
      };
      return {
        qb: format(categories.passing, "passing"),
        receiver: format(categories.receiving, "receiving"),
        rusher: format(categories.rushing, "rushing"),
        defender: format(categories.defense, "defense"),
      };
    } catch (err) {
      console.error('[useCanonicalLeaders] error:', err);
      return empty;
    }
  }, [playerStats, context]);
}

function LeaderCard({ label, player, color }) {
  if (!player || !player.statLine) return null;
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--hairline)",
      borderRadius: 10, padding: "8px 12px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        background: `${color}20`, border: `2px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.68rem", fontWeight: 900, color,
      }}>
        {player.pos || "?"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
          {player.teamAbbr && (
            <span style={{
              fontSize: "0.55rem", fontWeight: 800, color: "var(--text-subtle)",
              background: "var(--surface-strong, rgba(255,255,255,0.08))",
              border: "1px solid var(--hairline)", borderRadius: 5,
              padding: "1px 5px", letterSpacing: "0.5px", flexShrink: 0,
            }}>{player.teamAbbr}</span>
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name || "?"}</span>
        </div>
        <div style={{ fontSize: "0.72rem", color, fontWeight: 700, marginTop: 1 }}>
          {player.statLine}
        </div>
      </div>
    </div>
  );
}

function PostGameScreenInner({ rawGameRecord, boxScoreGame, gameRecord,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  userTeamId,
  mvpPlayer,          // optional player object (legacy)
  stats = {},         // { totalYards, passYards, rushYards, turnovers }
  logs = [],          // play-by-play logs (presentation-only: game flow / key moments)
  playerStats = null, // CANONICAL box score { home: {[pid]:{name,pos,stats}}, away: {...} }
  teamStats = null,
  scoringSummary = null,   // CANONICAL scoring summary (drive-level event ledger, #1700)
  quarterScores = null,    // CANONICAL quarter scores derived from the ledger
  canonicalEvents = null,  // CANONICAL drive-level event ledger
  gameReasoningFlags = [],
  boxScoreGameId,
  onOpenBoxScore,
  onContinue,
  onArchiveReady,
  week,
  phase,
}) {
  const hColor = teamColor(homeTeam?.abbr || "HME");
  const aColor = teamColor(awayTeam?.abbr || "AWY");
  const strictFinalScore = readStrictFinalScore({ homeScore, awayScore });
  const hasStrictFinal = Boolean(strictFinalScore);
  const displayHomeScore = strictFinalScore?.home ?? null;
  const displayAwayScore = strictFinalScore?.away ?? null;

  const homeWon = hasStrictFinal && displayHomeScore > displayAwayScore;
  const tied = hasStrictFinal && displayHomeScore === displayAwayScore;
  const userIsHome = homeTeam?.id === userTeamId;
  const userIsAway = awayTeam?.id === userTeamId;
  const userWon = hasStrictFinal && ((userIsHome && homeWon) || (userIsAway && !homeWon && !tied));
  const userLost = hasStrictFinal && ((userIsHome && !homeWon && !tied) || (userIsAway && homeWon));

  const resultColor = userWon ? "#34C759" : userLost ? "#FF453A" : tied ? "#FFD60A" : "var(--text-muted)";
  const resultEmoji = userWon ? "🏆" : userLost ? "😔" : tied ? "🤝" : "🏈";
  const resultLabel = userWon ? "VICTORY!" : userLost ? "DEFEAT" : tied ? "TIE" : "Result pending";

  const [activeTab, setActiveTab] = useState("leaders"); // "leaders" | "grades"
  // Show "Game Saved ✓" for 3 seconds on mount to confirm the auto-save happened
  const [showSaved, setShowSaved] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setShowSaved(false), 3000);
    return () => clearTimeout(t);
  }, []);

  const leaderContext = useMemo(() => ({
    homeId: homeTeam?.id, awayId: awayTeam?.id,
    homeAbbr: homeTeam?.abbr, awayAbbr: awayTeam?.abbr,
  }), [homeTeam?.id, awayTeam?.id, homeTeam?.abbr, awayTeam?.abbr]);
  const { qb, receiver, rusher, defender } = useCanonicalLeaders(playerStats, leaderContext);
  const hasCanonicalStats = Boolean(
    playerStats && (Object.keys(playerStats.home ?? {}).length || Object.keys(playerStats.away ?? {}).length),
  );
  const gfs = useMemo(() => buildGameFlowSummary(rawGameRecord ?? boxScoreGame ?? gameRecord ?? null), [rawGameRecord, boxScoreGame, gameRecord]);
  const [showReplay, setShowReplay] = useState(false);

  const notableMoments = (logs || [])
    .filter((l) => l?.isTouchdown || l?.turnover || /field goal|sack|interception|fumble/i.test(l?.text ?? ""))
    .slice(-5)
    .reverse();
  // Only render the interactive Game Flow card when it has real content.
  const hasGameFlow = Boolean(gfs) || notableMoments.length > 0;

  const showLeaders = Boolean(qb || receiver || rusher || defender);

  console.debug('[PostGameScreen] gameReasoningFlags length:', gameReasoningFlags?.length ?? 0);
  const reasoningBullets = useMemo(
    () => buildReasoningBullets(gameReasoningFlags ?? []),
    [gameReasoningFlags],
  );
  const archiveSavedRef = React.useRef(false);
  React.useEffect(() => {
    if (archiveSavedRef.current || !boxScoreGameId || typeof onArchiveReady !== "function" || !strictFinalScore) return;
    archiveSavedRef.current = true;
    const recapText = notableMoments.length
      ? notableMoments.map((m) => `Q${m.quarter ?? "?"} ${m.clock ?? ""} ${m.text ?? "Momentum swing"}`).join(" ")
      : `${awayTeam?.abbr ?? "AWY"} ${strictFinalScore.away} - ${strictFinalScore.home} ${homeTeam?.abbr ?? "HME"}`;
    // Persist the CANONICAL box score, never narration-derived player totals, so
    // the Game Book and season accumulation read the same authority the score
    // came from. Fall back to empty sides when canonical stats are unavailable
    // rather than recounting play-log references.
    const canonicalPlayerStats = hasCanonicalStats
      ? { home: playerStats.home ?? {}, away: playerStats.away ?? {} }
      : { home: {}, away: {} };
    // Persist the CANONICAL scoring summary / quarter scores / event ledger
    // (#1700) so the Game Book replays the exact same scoreAfter progression
    // the live viewer showed — never the narration-derived `notableMoments`.
    // Legacy fallback to notableMoments only when no canonical ledger exists.
    const hasCanonicalLedger = Array.isArray(scoringSummary);
    const archivedScoringSummary = hasCanonicalLedger ? scoringSummary : notableMoments;
    onArchiveReady({
      gameId: boxScoreGameId,
      season: null,
      week,
      homeId: homeTeam?.id,
      awayId: awayTeam?.id,
      homeAbbr: homeTeam?.abbr,
      awayAbbr: awayTeam?.abbr,
      homeScore: strictFinalScore.home,
      awayScore: strictFinalScore.away,
      recapText,
      logs,
      playerStats: canonicalPlayerStats,
      ...(teamStats ? { teamStats } : {}),
      scoringSummary: archivedScoringSummary,
      ...(quarterScores ? { quarterScores } : {}),
      ...(Array.isArray(canonicalEvents) && canonicalEvents.length ? { canonicalEvents } : {}),
      summary: {
        storyline: recapText,
        simOutputs: null,
      },
    });
  }, [awayScore, awayTeam?.abbr, awayTeam?.id, boxScoreGameId, canonicalEvents, hasCanonicalStats, homeScore, homeTeam?.abbr, homeTeam?.id, logs, notableMoments, onArchiveReady, playerStats, quarterScores, scoringSummary, strictFinalScore, teamStats, week]);

  const canOpenGameBook = Boolean(boxScoreGameId && hasStrictFinal);

  return (
    <>
      {userWon && <Confetti colors={[hColor, aColor, "#FFD700", "#fff"]} />}

      <div style={{
        position: "fixed", inset: 0, zIndex: 9700,
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(16px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "24px 16px 80px",
      }}>
        <div style={{ width: "100%", maxWidth: 420 }}>

          {/* Result banner — compact single-line header so postgame content
              starts above the fold on a phone. Emotionally clear (emoji +
              tone color + W/L label) without a half-screen of decoration. */}
          <div
            data-testid="postgame-result-banner"
            style={{
              textAlign: "center", marginBottom: 10,
              animation: "fadeSlideIn 0.4s ease-out",
            }}
          >
            <style>{`
              @keyframes fadeSlideIn {
                from { opacity: 0; transform: translateY(16px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: "1.5rem", lineHeight: 1 }} aria-hidden="true">{resultEmoji}</span>
              <span style={{
                fontSize: "1.35rem", fontWeight: 900, letterSpacing: "1.5px",
                color: resultColor,
              }}>
                {resultLabel}
              </span>
            </div>
            <div style={{
              marginTop: 4, display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8, minHeight: 18,
            }}>
              {week && (
                <span style={{ fontSize: "0.72rem", color: "var(--text-subtle)", fontWeight: 600 }}>
                  Week {week} · {phase === "playoffs" ? "Playoffs" : "Regular Season"}
                </span>
              )}
              {showSaved && hasStrictFinal && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "2px 8px",
                  background: "#34C75918",
                  border: "1px solid #34C75940",
                  borderRadius: 20,
                  fontSize: "0.65rem", fontWeight: 700, color: "#34C759",
                  animation: "fadeSlideIn 0.3s ease-out",
                }}>
                  ✓ Game saved
                </span>
              )}
            </div>
          </div>

          {/* Score card */}
          <div style={{
            background: "var(--surface)",
            border: "1.5px solid var(--hairline)",
            borderRadius: 16,
            padding: "10px 14px",
            marginBottom: 10,
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              {/* Away */}
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", margin: "0 auto 6px",
                  background: `${aColor}20`, border: `2px solid ${aColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 13, color: aColor,
                }}>
                  {awayTeam?.abbr?.slice(0, 3) ?? "AWY"}
                </div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 3 }}>
                  {awayTeam?.name ?? awayTeam?.abbr ?? "Away"}
                </div>
                <div style={{
                  fontSize: "2.2rem", fontWeight: 900,
                  color: !homeWon && !tied ? aColor : "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums", lineHeight: 1,
                }}>
                  {displayAwayScore ?? "—"}
                </div>
              </div>

              <div style={{ textAlign: "center", padding: "0 12px" }}>
                <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--text-subtle)",
                  letterSpacing: "1px", textTransform: "uppercase" }}>
                  RESULT
                </div>
              </div>

              {/* Home */}
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", margin: "0 auto 6px",
                  background: `${hColor}20`, border: `2px solid ${hColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 13, color: hColor,
                }}>
                  {homeTeam?.abbr?.slice(0, 3) ?? "HME"}
                </div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 3 }}>
                  {homeTeam?.name ?? homeTeam?.abbr ?? "Home"}
                </div>
                <div style={{
                  fontSize: "2.2rem", fontWeight: 900,
                  color: homeWon ? hColor : "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums", lineHeight: 1,
                }}>
                  {displayHomeScore ?? "—"}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                data-testid="box-score-trigger"
                onClick={() => canOpenGameBook && onOpenBoxScore?.(boxScoreGameId)}
                disabled={!canOpenGameBook}
                style={{
                  cursor: canOpenGameBook ? "pointer" : "not-allowed",
                  fontWeight: 800,
                  fontSize: "0.8rem",
                  padding: "8px 20px",
                  borderRadius: 999,
                  border: `1px solid ${canOpenGameBook ? "var(--accent)" : "var(--hairline)"}`,
                  background: canOpenGameBook ? "var(--accent-muted)" : "transparent",
                  color: canOpenGameBook ? "var(--accent)" : "var(--text-subtle)",
                  minHeight: "var(--mobile-btn-h-compact, 38px)",
                }}
              >
                {canOpenGameBook ? "View Game Book ›" : "Official score pending"}
              </button>
            </div>
          </div>

          {/* Stats grid */}
          {(stats.totalYards != null || stats.passYards != null || stats.turnovers != null) && (
            <div style={{
              display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center",
              marginBottom: 16,
            }}>
              {stats.totalYards != null && (
                <StatPill label="Total Yds" value={stats.totalYards} color="var(--accent)" />
              )}
              {stats.passYards != null && (
                <StatPill label="Pass Yds" value={stats.passYards} color="#0A84FF" />
              )}
              {stats.rushYards != null && (
                <StatPill label="Rush Yds" value={stats.rushYards} color="#34C759" />
              )}
              {stats.turnovers != null && (
                <StatPill label="Turnovers" value={stats.turnovers}
                  color={stats.turnovers > 2 ? "#FF453A" : "var(--text-muted)"} />
              )}
            </div>
          )}

          {/* Game Flow — hide the toggle card entirely when there's nothing to show,
              and surface a compact, useful empty state instead of dead space. */}
          {!hasGameFlow ? (
            <div
              data-testid="postgame-flow-empty"
              style={{
                marginBottom: 12, background: "var(--surface)", border: "1px solid var(--hairline)",
                borderRadius: 12, padding: "10px 12px", fontSize: "0.74rem", color: "var(--text-muted)",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <strong style={{ fontSize: "0.78rem", color: "var(--text)" }}>Game Flow</strong>
              <span style={{ color: "var(--text-subtle)" }}>· Detailed game flow was not recorded for this matchup.</span>
            </div>
          ) : (
          <div style={{ marginBottom: 12, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: "0.8rem" }}>Game Flow</strong>
              <div style={{ display: "flex", gap: "8px" }}>
                {gfs && (
                  <button className="btn btn-secondary" style={{ padding: "6px 10px", fontSize: "0.72rem" }} onClick={() => setShowReplay((v) => !v)} data-testid="postgame-replay-toggle">
                    {showReplay ? "Hide Replay" : "Replay"}
                  </button>
                )}
                {notableMoments.length > 0 && (
                  <button className="btn" style={{ padding: "6px 10px", fontSize: "0.72rem" }} onClick={() => setShowDetails((v) => !v)} data-testid="postgame-flow-toggle">
                    {showDetails ? "Hide" : "Key moments"}
                  </button>
                )}
              </div>
            </div>
            {showReplay && gfs && (
              <div style={{ marginTop: 12 }}>
                <ReplayableGameFlowViewer
                  gameFlowSummary={gfs}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  finalScore={{ home: displayHomeScore, away: displayAwayScore }}
                />
              </div>
            )}
            {showDetails && (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }} data-testid="postgame-flow-moments">
                {notableMoments.length === 0 ? (
                  <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>No notable moments logged for this game.</div>
                ) : notableMoments.map((m, i) => {
                  const isTD = m?.isTouchdown;
                  const isTurnover = m?.turnover;
                  const dot = isTD ? "·" : isTurnover ? "·" : "·";
                  const typeLabel = isTD ? "TD" : isTurnover ? "Turnover" : "Score";
                  return (
                    <div key={i} style={{ fontSize: "0.74rem", color: "var(--text-muted)", padding: "6px 8px", background: "var(--surface-strong)", borderRadius: 8, display: "flex", gap: 6 }}>
                      <span style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>Q{m.quarter ?? "?"}{m.clock ? ` ${m.clock}` : ""}</span>
                      <span style={{ color: "var(--text-subtle)" }}>{dot}</span>
                      <span style={{ fontWeight: 600, color: isTD ? "#34C759" : isTurnover ? "#FF453A" : "var(--text)", whiteSpace: "nowrap" }}>{typeLabel}</span>
                      <span style={{ flex: 1 }}>{m.text ?? "Momentum swing"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* ── Tab switcher (Leaders / Grades) ── */}
          {(showLeaders || hasCanonicalStats) && (
            <div style={{
              display: "flex", background: "var(--surface)",
              border: "1px solid var(--hairline)", borderRadius: 10,
              padding: 3, marginBottom: 12, gap: 3,
            }}>
              {[["leaders","🎖 Leaders"], ["grades","📊 Grades"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    flex: 1, padding: "7px 0",
                    background: activeTab === key ? resultColor : "transparent",
                    color: activeTab === key ? (resultColor === "#FFD60A" ? "#000" : "#fff") : "var(--text-muted)",
                    border: "none", borderRadius: 8,
                    fontWeight: 800, fontSize: "0.75rem", cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* ── Game Leaders (canonical box score) ── */}
          {activeTab === "leaders" && showLeaders && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <LeaderCard label="Passing" player={qb} color="#FF9F0A" />
                <LeaderCard label="Receiving" player={receiver} color="#0A84FF" />
                <LeaderCard label="Rushing" player={rusher} color="#34C759" />
                <LeaderCard label="Defense" player={defender} color="#FF453A" />
              </div>
            </div>
          )}

          {/* ── Grades tab (canonical box score) ── */}
          {activeTab === "grades" && hasCanonicalStats && (
            <div style={{ marginBottom: 16, background: "var(--surface)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--hairline)" }}>
              <AdvancedStats
                playerStats={playerStats}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                userTeamId={userTeamId}
              />
            </div>
          )}

          {/* Legacy MVP card (fallback when no logs) */}
          {!showLeaders && mvpPlayer && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: "0.65rem", fontWeight: 800, color: "var(--text-subtle)",
                textTransform: "uppercase", letterSpacing: "1px",
                textAlign: "center", marginBottom: 8,
              }}>
                ⭐ Game MVP
              </div>
              <PlayerCard player={mvpPlayer} variant="standard" />
            </div>
          )}

          {/* Executive Summary — high-density postgame reasoning diagnostics */}
          <div
            data-testid="postgame-executive-summary"
            style={{
              marginBottom: 20,
              textAlign: "left",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "var(--text-subtle)",
              textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
              Executive Summary
            </div>
            {reasoningBullets.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {reasoningBullets.map((bullet) => (
                  <li key={bullet} style={{ fontSize: "0.8rem", lineHeight: 1.4, color: "var(--text)" }}>
                    • {bullet}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: "0.8rem", lineHeight: 1.4, color: "var(--text-muted)", fontStyle: "italic" }}>
                No tactical signals detected — set a Game Plan before kickoff to unlock postgame diagnostics.
              </div>
            )}
          </div>

          {/* Continue button */}
          <button
            onClick={onContinue}
            style={{
              width: "100%", padding: "16px",
              background: resultColor,
              color: resultColor === "#FFD60A" ? "#000" : "#fff",
              border: "none", borderRadius: 12,
              fontWeight: 900, fontSize: "1rem", cursor: "pointer",
              letterSpacing: "0.5px",
              boxShadow: `0 4px 20px ${resultColor}44`,
            }}
          >
            Back to Hub →
          </button>
        </div>
      </div>
    </>
  );
}

// Wrap with error boundary so a crash here returns user to hub gracefully
export default function PostGameScreen(props) {
  return (
    <PostGameErrorBoundary onContinue={props.onContinue}>
      <PostGameScreenInner {...props} />
    </PostGameErrorBoundary>
  );
}
