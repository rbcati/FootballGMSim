/**
 * LeagueDashboard.jsx
 *
 * Tabbed dashboard using the legacy CSS design system (hub.css, components.css,
 * base.css).  Receives the view-model slice from the Web Worker via `league` prop.
 *
 * Tabs:
 *  - Standings   — AFC/NFC conference tables (conf/div numeric + string safe)
 *  - Schedule    — Current-week matchup cards with final scores
 *  - Leaders     — Simple per-stat top-5 tables
 *  - Roster      — Full player grid with release controls
 *  - Free Agency — FA pool with sign / filter controls
 *  - Trades      — Side-by-side roster trade interface
 */

import React, { useState, useMemo, useEffect, useCallback, useRef, Component } from "react";
import DonutChart from "./DonutChart";
import HomeDashboard from "./HomeDashboard.jsx";
import Roster from "./Roster.jsx";
import RosterHub from "./RosterHub.jsx";
import Draft from "./Draft.jsx";
import RookieDraft from "./RookieDraft.jsx";
import Coaches from "./Coaches.jsx";
import FreeAgency from "./FreeAgency.jsx";
import FreeAgencyHub from "./FreeAgencyHub.jsx";
import TradeCenter from "./TradeCenter.jsx";
import TradeFinder from "./TradeFinder.jsx";
import BoxScore from "./BoxScore.jsx";
import LeagueHistory from "./LeagueHistory.jsx";
import HallOfFame from "./HallOfFame.jsx";
import PlayerProfile from "./PlayerProfile.jsx";
import PlayerDetailModal from "./PlayerDetailModal.jsx";
import TeamProfile from "./TeamProfile.jsx";
import Leaders from "./Leaders.jsx";
import AwardRaces from "./AwardRaces.jsx";
import PlayerStats from "./PlayerStats.jsx";
import StrategyPanel from "./StrategyPanel.jsx";
import NewsFeed from "./NewsFeed.jsx";
import StatLeadersWidget from "./StatLeadersWidget.jsx";
import FinancialsView from "./FinancialsView.jsx";
import PostseasonHub from "./PostseasonHub.jsx";
import MobileNav from "./MobileNav.jsx";

// Map MobileNav tab IDs → LeagueDashboard tab names
const MOBILE_TAB_MAP = {
  hub: "Home",
  home: "Home",
  standings: "Standings",
  schedule: "Schedule",
  roster: "Roster",
  roster_hub: "Roster Hub",
  leaders: "Leaders",
  free_agency: "Free Agency",
  fa_hub: "FA Hub",
  trades: "Trades",
  trade_finder: "Trade Finder",
  draft: "Draft",
  draft_room: "Draft Room",
  coaches: "Coaches",
  financials: "Financials",
  strategy: "Strategy",
  news: "Standings",
  player_stats: "Stats",
  awards: "Award Races",
  history: "History",
  hall_of_fame: "Hall of Fame",
};

// Reverse map: dashboard tab → MobileNav tab ID
const REVERSE_TAB_MAP = Object.fromEntries(
  Object.entries(MOBILE_TAB_MAP).map(([k, v]) => [v, k])
);

// ── TabErrorBoundary ─────────────────────────────────────────────────────────
// Catches render-phase exceptions inside individual tabs.  A crash in one tab
// surfaces a localised error panel rather than tearing down the whole dashboard.

class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[TabErrorBoundary] Tab render error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const label = this.props.label ?? "This tab";
    return (
      <div
        style={{
          padding: "var(--space-8)",
          textAlign: "center",
          color: "var(--danger)",
          background: "rgba(255,69,58,0.07)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--danger)",
        }}
      >
        <div style={{ fontSize: "1.5rem", marginBottom: "var(--space-3)" }}>
          ⚠️
        </div>
        <div style={{ fontWeight: 700, marginBottom: "var(--space-2)" }}>
          {label} encountered a render error
        </div>
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            marginBottom: "var(--space-4)",
            fontFamily: "monospace",
            maxWidth: 480,
            margin: "0 auto var(--space-4)",
          }}
        >
          {this.state.error?.message ?? String(this.state.error)}
        </div>
        <button
          className="btn"
          onClick={() => this.setState({ hasError: false, error: null })}
        >
          Retry
        </button>
      </div>
    );
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_TABS = [
  "Home",
  "Standings",
  "Schedule",
  "Stats",
  "Leaders",
  "Award Races",
  "Strategy",
  "Roster",
  "Roster Hub",
  "Financials",
  "Draft",
  "Draft Room",
  "Coaches",
  "Free Agency",
  "FA Hub",
  "Trades",
  "Trade Finder",
  "History",
  "Hall of Fame",
];

// Division display labels and their numeric indices (from App.jsx DEFAULT_TEAMS).
// div: 0=East  1=North  2=South  3=West
const DIVS = [
  { name: "East", idx: 0 },
  { name: "North", idx: 1 },
  { name: "South", idx: 2 },
  { name: "West", idx: 3 },
];

const CONFS = ["AFC", "NFC"];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Deterministic colour from team abbreviation so logos feel branded
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

/**
 * Normalise a conf value to the 0/1 index regardless of whether teams store
 * it as a number (0=AFC, 1=NFC) or a string ('AFC'/'NFC').
 */
function confIdx(val) {
  if (typeof val === "number") return val;
  return val === "AFC" ? 0 : 1;
}

/** Normalise a div value to its 0-3 index. */
function divIdx(val) {
  if (typeof val === "number") return val;
  const map = { East: 0, North: 1, South: 2, West: 3 };
  return map[val] ?? 0;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Circular team "logo" placeholder with first 3 chars of abbreviation. */
function TeamLogo({ abbr, size = 56, isUser = false }) {
  const color = teamColor(abbr);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `${color}22`,
        border: `3px solid ${isUser ? "var(--accent)" : color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: size * 0.28,
        color: isUser ? "var(--accent)" : color,
        flexShrink: 0,
        letterSpacing: "-0.5px",
      }}
    >
      {abbr?.slice(0, 3) ?? "?"}
    </div>
  );
}

/** Win-pct helper. */
function winPct(wins, losses, ties) {
  const games = wins + losses + ties;
  if (games === 0) return ".000";
  return ((wins + ties * 0.5) / games).toFixed(3).replace(/^0/, "");
}

/** Six-tier colour-coded OVR pill (Madden-style). */
export function OvrPill({ ovr, size = "sm" }) {
  let cls = "rating-color-bad";
  let label = "";
  if (ovr >= 95)      { cls = "rating-color-goat";  label = "GOAT"; }
  else if (ovr >= 88) { cls = "rating-color-elite"; label = "ELITE"; }
  else if (ovr >= 78) { cls = "rating-color-star";  label = "STAR"; }
  else if (ovr >= 68) { cls = "rating-color-good";  label = ""; }
  else if (ovr >= 58) { cls = "rating-color-avg";   label = ""; }

  return (
    <span
      className={`ovr-pill ${cls}`}
      title={label ? `${label} (${ovr} OVR)` : `${ovr} OVR`}
      style={size === "lg" ? { minWidth: 42, fontSize: "var(--text-sm)", padding: "3px 8px" } : {}}
    >
      {ovr}
    </span>
  );
}

// ── Standings Tab ─────────────────────────────────────────────────────────────

// Helper: compute streak from recentResults array (["W","L","W",...])
function computeStreak(results = []) {
  if (!results.length) return null;
  const last = results[results.length - 1];
  let count = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === last) count++;
    else break;
  }
  return { type: last, count };
}

// Compute conference standings for playoff picture
function getConferenceRankings(teams, confVal) {
  const ci = typeof confVal === "string" ? (confVal === "AFC" ? 0 : 1) : confVal;
  const confTeams = teams
    .filter(t => confIdx(t.conf) === ci)
    .sort((a, b) => {
      const pa = parseFloat(winPct(a.wins, a.losses, a.ties));
      const pb = parseFloat(winPct(b.wins, b.losses, b.ties));
      return pb - pa || b.wins - a.wins;
    });

  // 7 teams make playoffs: 4 division winners (seeds 1-4) + 3 wild cards (seeds 5-7)
  // For simplicity: top team from each division gets a div seed, rest sorted for WC
  const divMap = {};
  confTeams.forEach(t => {
    const d = divIdx(t.div);
    if (!divMap[d] || parseFloat(winPct(t.wins, t.losses, t.ties)) > parseFloat(winPct(divMap[d].wins, divMap[d].losses, divMap[d].ties))) {
      divMap[d] = t;
    }
  });
  const divWinners = new Set(Object.values(divMap).map(t => t.id));
  const divWinnerList = Object.values(divMap).sort((a, b) => parseFloat(winPct(b.wins, b.losses, b.ties)) - parseFloat(winPct(a.wins, a.losses, a.ties)));
  const wildcards = confTeams.filter(t => !divWinners.has(t.id));

  return { divWinnerList, wildcards, divWinners, confTeams };
}

function PlayoffPictureView({ teams, activeConf, userTeamId, onTeamSelect }) {
  const ci = activeConf === "AFC" ? 0 : 1;
  const { divWinnerList, wildcards, divWinners } = useMemo(
    () => getConferenceRankings(teams, ci),
    [teams, ci]
  );

  const allRanked = [...divWinnerList, ...wildcards];
  const cutoff = 7; // 7 playoff teams

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {/* Section headers */}
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--success)", marginBottom: "var(--space-1)" }}>
        In Playoffs (Top 7)
      </div>

      {allRanked.map((team, i) => {
        const isIn = i < cutoff;
        const seed = i + 1;
        const isDivWin = divWinners.has(team.id);
        const isUser = team.id === userTeamId;
        const divName = ["East","North","South","West"][divIdx(team.div)] ?? "";
        const gamesPlayed = team.wins + team.losses + team.ties;

        return (
          <React.Fragment key={team.id}>
            {i === cutoff && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", margin: "var(--space-2) 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--danger)", opacity: 0.5 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--danger)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Out of Playoffs
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--danger)", opacity: 0.5 }} />
              </div>
            )}
            <div
              style={{
                display: "flex", alignItems: "center", gap: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                background: isUser ? "var(--accent-muted)" : isIn ? "var(--surface)" : "rgba(255,69,58,0.04)",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${isUser ? "var(--accent)" : isIn && i === cutoff - 1 ? "rgba(52,199,89,0.2)" : "var(--hairline)"}`,
                cursor: "pointer", transition: "background 0.15s",
              }}
              onClick={() => onTeamSelect?.(team.id)}
            >
              {/* Seed */}
              <span style={{ width: 22, textAlign: "center", fontWeight: 800, fontSize: "var(--text-sm)", color: i < 4 ? "var(--warning)" : "var(--text-muted)" }}>
                {seed}
              </span>

              {/* Team logo */}
              <TeamLogo abbr={team.abbr} size={28} isUser={isUser} />

              {/* Name */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: isUser ? 700 : 500, fontSize: "var(--text-sm)", color: isUser ? "var(--accent)" : "var(--text)" }}>
                  {team.abbr}
                  {isUser && <span style={{ marginLeft: 4, color: "var(--accent)", fontSize: 10 }}>★</span>}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>
                  {divName}{isDivWin ? " ✓" : ""}
                </div>
              </div>

              {/* Record */}
              <span style={{ fontSize: "var(--text-xs)", fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>
                {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
              </span>

              {/* Playoff badge */}
              {isIn ? (
                <span className={`playoff-badge ${isDivWin ? "playoff-badge-div" : i < cutoff - 1 ? "playoff-badge-in" : "playoff-badge-bubble"}`}>
                  {isDivWin ? `DIV ${["AFC","NFC"][ci]}` : "WC"}
                </span>
              ) : (
                i === cutoff ? (
                  <span className="playoff-badge playoff-badge-bubble">BUBBLE</span>
                ) : (
                  <span className="playoff-badge playoff-badge-out">OUT</span>
                )
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StandingsTab({ teams, userTeamId, onTeamSelect }) {
  const [activeConf, setActiveConf] = useState("AFC");
  const [viewMode, setViewMode] = useState("division"); // "division" | "playoff"

  // Normalise activeConf label → numeric index for comparison
  const activeConfIdx = activeConf === "AFC" ? 0 : 1;

  const grouped = useMemo(() => {
    const confTeams = teams.filter((t) => confIdx(t.conf) === activeConfIdx);
    const groups = DIVS.map(({ name, idx }) => ({
      div: name,
      teams: confTeams
        .filter((t) => divIdx(t.div) === idx)
        .sort((a, b) => {
          const pa = winPct(a.wins, a.losses, a.ties);
          const pb = winPct(b.wins, b.losses, b.ties);
          return pb - pa || b.wins - a.wins;
        }),
    })).filter((g) => g.teams.length > 0);

    // Sort groups so the user's division is first
    if (userTeamId) {
      groups.sort((a, b) => {
        const aHasUser = a.teams.some((t) => t.id === userTeamId);
        const bHasUser = b.teams.some((t) => t.id === userTeamId);
        if (aHasUser && !bHasUser) return -1;
        if (!aHasUser && bHasUser) return 1;
        return 0;
      });
    }
    return groups;
  }, [teams, activeConfIdx, userTeamId]);

  return (
    <div>
      {/* Conference tab pills + view mode toggle */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}
      >
        <div className="standings-tabs">
          {CONFS.map((c) => (
            <button
              key={c}
              className={`standings-tab${activeConf === c ? " active" : ""}`}
              onClick={() => setActiveConf(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="standings-tabs">
          <button
            className={`standings-tab${viewMode === "division" ? " active" : ""}`}
            onClick={() => setViewMode("division")}
          >
            Divisions
          </button>
          <button
            className={`standings-tab${viewMode === "playoff" ? " active" : ""}`}
            onClick={() => setViewMode("playoff")}
          >
            Playoff Picture
          </button>
        </div>
      </div>

      {viewMode === "playoff" ? (
        <PlayoffPictureView
          teams={teams}
          activeConf={activeConf}
          userTeamId={userTeamId}
          onTeamSelect={onTeamSelect}
        />
      ) : (
      <div style={{ display: "grid", gap: "var(--space-6)" }}>
        {grouped.map(({ div, teams: divTeams }) => (
          <div
            key={div}
            className="card"
            style={{ padding: 0, overflow: "hidden" }}
          >
            <div
              style={{
                padding: "var(--space-3) var(--space-5)",
                background: "var(--surface-strong)",
                borderBottom: "1px solid var(--hairline)",
              }}
            >
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "var(--text-muted)",
                }}
              >
                {activeConf} {div}
              </span>
            </div>

            <div
              className="table-wrapper"
              style={{ padding: "0 var(--space-2)" }}
            >
              <table className="standings-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: "var(--space-5)" }}>Team</th>
                    <th style={{ textAlign: "center" }}>W</th>
                    <th style={{ textAlign: "center" }}>L</th>
                    <th style={{ textAlign: "center" }}>T</th>
                    <th style={{ textAlign: "center" }}>PCT</th>
                    <th style={{ textAlign: "center" }}>PF</th>
                    <th style={{ textAlign: "center" }}>PA</th>
                    <th style={{ textAlign: "center" }}>STRK</th>
                    <th style={{ textAlign: "center" }}>OVR</th>
                    <th
                      style={{
                        textAlign: "right",
                        paddingRight: "var(--space-5)",
                      }}
                    >
                      CAP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {divTeams.map((team, idx) => {
                    const isUser = team.id === userTeamId;
                    return (
                      <tr
                        key={team.id}
                        className={isUser ? "user-team-row" : ""}
                      >
                        <td style={{ paddingLeft: "var(--space-4)" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "var(--space-3)",
                            }}
                          >
                            <span
                              style={{
                                width: 20,
                                textAlign: "center",
                                color: "var(--text-subtle)",
                                fontSize: "var(--text-xs)",
                                fontWeight: 700,
                              }}
                            >
                              {idx + 1}
                            </span>
                            <TeamLogo
                              abbr={team.abbr}
                              size={32}
                              isUser={isUser}
                            />
                            <div>
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: "var(--text)",
                                  fontSize: "var(--text-sm)",
                                  cursor: "pointer",
                                }}
                                onClick={() => onTeamSelect?.(team.id)}
                              >
                                {team.name}
                                {isUser && (
                                  <span
                                    style={{
                                      marginLeft: 6,
                                      fontSize: "var(--text-xs)",
                                      color: "var(--accent)",
                                      fontWeight: 700,
                                    }}
                                  >
                                    ★
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: "var(--text-xs)",
                                  color: "var(--text-subtle)",
                                }}
                              >
                                {team.abbr}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            fontWeight: 700,
                            color: "var(--text)",
                          }}
                        >
                          {team.wins}
                        </td>
                        <td style={{ textAlign: "center" }}>{team.losses}</td>
                        <td style={{ textAlign: "center" }}>{team.ties}</td>
                        <td style={{ textAlign: "center", fontWeight: 600 }}>
                          {winPct(team.wins, team.losses, team.ties)}
                        </td>
                        <td style={{ textAlign: "center" }}>{team.ptsFor}</td>
                        <td style={{ textAlign: "center" }}>
                          {team.ptsAgainst}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {(() => {
                            const streak = computeStreak(team.recentResults ?? []);
                            if (!streak) return <span style={{ color: "var(--text-subtle)", fontSize: "var(--text-xs)" }}>—</span>;
                            return (
                              <span className={`streak-badge streak-${streak.type.toLowerCase()}`}>
                                {streak.type}{streak.count}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <OvrPill ovr={team.ovr} />
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            paddingRight: "var(--space-4)",
                            color: "var(--success)",
                            fontSize: "var(--text-sm)",
                          }}
                        >
                          ${(team.capRoom ?? 0).toFixed(1)}M
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {grouped.length === 0 && (
          <div
            style={{
              color: "var(--text-muted)",
              textAlign: "center",
              padding: "var(--space-8)",
            }}
          >
            No teams found for {activeConf}.
          </div>
        )}
      </div>
      )} {/* end playoff/division ternary */}
    </div>
  );
}

// ── Schedule Tab ──────────────────────────────────────────────────────────────

function ScheduleTab({
  schedule,
  teams,
  currentWeek,
  userTeamId,
  nextGameStakes,
  seasonId,
  onGameSelect,
  playoffSeeds,
  onTeamRoster,
}) {
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);

  const teamById = useMemo(() => {
    const map = {};
    teams.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [teams]);

  // Build a fast teamId → seed lookup from the playoff seeds structure.
  const seedByTeam = useMemo(() => {
    if (!playoffSeeds) return {};
    const map = {};
    for (const confSeeds of Object.values(playoffSeeds)) {
      for (const s of confSeeds) {
        map[s.teamId] = s.seed;
      }
    }
    return map;
  }, [playoffSeeds]);

  // Guard: if schedule is missing (e.g. older save format) show a clear message
  // instead of crashing or showing blank content.
  if (!schedule?.weeks?.length) {
    return (
      <div
        style={{
          padding: "var(--space-8)",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "var(--text-sm)",
        }}
      >
        Schedule data is not available for this save. Advance the season to
        regenerate.
      </div>
    );
  }

  const isPlayoffs = selectedWeek >= 19;

  const totalWeeks = schedule?.weeks?.length ?? 0;
  const weekData = schedule?.weeks?.find((w) => w.week === selectedWeek);
  const games = weekData?.games ?? [];

  return (
    <div>
      {/* Week selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          marginBottom: "var(--space-6)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-muted)",
            fontWeight: 600,
          }}
        >
          Week
        </span>
        <div className="standings-tabs" style={{ flexWrap: "wrap" }}>
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
            <button
              key={w}
              className={`standings-tab${selectedWeek === w ? " active" : ""}`}
              onClick={() => setSelectedWeek(w)}
              style={{ minWidth: 36 }}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Game cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {games.map((game, idx) => {
          const home = teamById[game.home] ?? {
            name: `Team ${game.home}`,
            abbr: "???",
            wins: 0,
            losses: 0,
            ties: 0,
          };
          const away = teamById[game.away] ?? {
            name: `Team ${game.away}`,
            abbr: "???",
            wins: 0,
            losses: 0,
            ties: 0,
          };
          const isUserGame = home.id === userTeamId || away.id === userTeamId;
          const showStakes =
            isUserGame &&
            !game.played &&
            nextGameStakes > 50 &&
            selectedWeek === currentWeek;
          const isClickable = game.played && onGameSelect && seasonId;
          const handleCardClick = isClickable
            ? () =>
                onGameSelect(
                  `${seasonId}_w${selectedWeek}_${game.home}_${game.away}`,
                )
            : undefined;

          return (
            <div
              key={idx}
              className="matchup-card"
              onClick={handleCardClick}
              style={{
                ...(isUserGame
                  ? {
                      borderColor: "var(--accent)",
                      boxShadow: "0 0 0 1px var(--accent), var(--shadow-lg)",
                    }
                  : {}),
                ...(isClickable ? { cursor: "pointer" } : {}),
              }}
            >
              {/* Card header */}
              <div className="matchup-header">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                  }}
                >
                  <span>Week {selectedWeek}</span>
                  {showStakes && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "var(--radius-pill)",
                        background:
                          nextGameStakes > 80
                            ? "var(--danger)"
                            : "var(--warning)",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "var(--text-xs)",
                        letterSpacing: "0.5px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {nextGameStakes > 80 ? "🔥 RIVALRY" : "⚠️ STAKES"}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "var(--radius-pill)",
                    background: game.played
                      ? "var(--success)22"
                      : "var(--accent)22",
                    color: game.played ? "var(--success)" : "var(--accent)",
                    fontWeight: 700,
                  }}
                >
                  {game.played ? "Final" : "Scheduled"}
                </span>
              </div>

              {/* Final score display */}
              {game.played && game.homeScore !== undefined && (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "baseline",
                      gap: "var(--space-3)",
                      padding: "var(--space-1) 0",
                      fontSize: "var(--text-xl)",
                      fontWeight: 800,
                    }}
                  >
                    <span
                      style={{
                        color:
                          game.awayScore > game.homeScore
                            ? "var(--text)"
                            : "var(--text-muted)",
                      }}
                    >
                      {isPlayoffs && seedByTeam[away.id]
                        ? `(${seedByTeam[away.id]}) `
                        : ""}
                      {away.abbr} {game.awayScore}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        color: "var(--text-subtle)",
                        fontWeight: 400,
                      }}
                    >
                      –
                    </span>
                    <span
                      style={{
                        color:
                          game.homeScore > game.awayScore
                            ? "var(--text)"
                            : "var(--text-muted)",
                      }}
                    >
                      {game.homeScore} {home.abbr}
                      {isPlayoffs && seedByTeam[home.id]
                        ? ` (${seedByTeam[home.id]})`
                        : ""}
                    </span>
                  </div>
                  {isClickable && (
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "var(--text-xs)",
                        color: "var(--accent)",
                        marginBottom: "var(--space-1)",
                      }}
                    >
                      View Box Score →
                    </div>
                  )}
                </>
              )}

              {/* Teams */}
              <div className="matchup-content">
                <div className="matchup-team away">
                  <TeamLogo
                    abbr={away.abbr}
                    size={64}
                    isUser={away.id === userTeamId}
                  />
                  <div
                    className="team-name-matchup"
                    onClick={
                      onTeamRoster
                        ? (e) => {
                            e.stopPropagation();
                            onTeamRoster(away.id);
                          }
                        : undefined
                    }
                    style={{ cursor: onTeamRoster ? "pointer" : "default" }}
                    title={
                      onTeamRoster
                        ? `View ${away.name ?? away.abbr} roster`
                        : undefined
                    }
                  >
                    {isPlayoffs && seedByTeam[away.id] ? (
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          color: "var(--accent)",
                          marginRight: 3,
                        }}
                      >
                        ({seedByTeam[away.id]})
                      </span>
                    ) : null}
                    {away.abbr}
                  </div>
                  <div className="team-record-matchup">
                    {away.wins}-{away.losses}
                    {away.ties > 0 ? `-${away.ties}` : ""}
                  </div>
                </div>
                <div className="matchup-vs">
                  <span className="vs-badge">VS</span>
                  <span className="at-badge">at</span>
                </div>
                <div className="matchup-team home">
                  <TeamLogo
                    abbr={home.abbr}
                    size={64}
                    isUser={home.id === userTeamId}
                  />
                  <div
                    className="team-name-matchup"
                    onClick={
                      onTeamRoster
                        ? (e) => {
                            e.stopPropagation();
                            onTeamRoster(home.id);
                          }
                        : undefined
                    }
                    style={{ cursor: onTeamRoster ? "pointer" : "default" }}
                    title={
                      onTeamRoster
                        ? `View ${home.name ?? home.abbr} roster`
                        : undefined
                    }
                  >
                    {isPlayoffs && seedByTeam[home.id] ? (
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          color: "var(--accent)",
                          marginRight: 3,
                        }}
                      >
                        ({seedByTeam[home.id]})
                      </span>
                    ) : null}
                    {home.abbr}
                  </div>
                  <div className="team-record-matchup">
                    {home.wins}-{home.losses}
                    {home.ties > 0 ? `-${home.ties}` : ""}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {games.length === 0 && (
          <p
            style={{
              color: "var(--text-muted)",
              gridColumn: "1/-1",
              textAlign: "center",
              padding: "var(--space-8)",
            }}
          >
            No games found for week {selectedWeek}.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Leaders Tab ───────────────────────────────────────────────────────────────

function LeadersTab({ teams }) {
  const leaders = useMemo(
    () => [
      {
        label: "Most Wins",
        rows: [...teams].sort((a, b) => b.wins - a.wins).slice(0, 5),
        value: (t) => `${t.wins}W`,
      },
      {
        label: "Top Offense (PF)",
        rows: [...teams].sort((a, b) => b.ptsFor - a.ptsFor).slice(0, 5),
        value: (t) => `${t.ptsFor} pts`,
      },
      {
        label: "Best Defense (PA)",
        rows: [...teams]
          .sort((a, b) => a.ptsAgainst - b.ptsAgainst)
          .slice(0, 5),
        value: (t) => `${t.ptsAgainst} PA`,
      },
      {
        label: "Highest Rated",
        rows: [...teams].sort((a, b) => b.ovr - a.ovr).slice(0, 5),
        value: (t) => `OVR ${t.ovr}`,
      },
    ],
    [teams],
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: "var(--space-6)",
      }}
    >
      {leaders.map(({ label, rows, value }) => (
        <div
          key={label}
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
        >
          <div
            style={{
              padding: "var(--space-3) var(--space-5)",
              background: "var(--surface-strong)",
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <span className="hub-section-title" style={{ marginBottom: 0 }}>
              {label}
            </span>
          </div>
          <div
            className="hub-rankings-list"
            style={{ padding: "var(--space-3)" }}
          >
            {rows.map((team, i) => (
              <div key={team.id} className="hub-ranking-item">
                <span
                  className="hub-ranking-rank"
                  style={i === 0 ? { color: "var(--warning)" } : {}}
                >
                  {i + 1}
                </span>
                <TeamLogo abbr={team.abbr} size={28} />
                <span className="hub-ranking-team">{team.name}</span>
                <span
                  className="hub-ranking-record"
                  style={{ fontWeight: 600, color: "var(--text)" }}
                >
                  {value(team)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

// ── Quick-Jump FAB ─────────────────────────────────────────────────────────
function QuickJumpFab({ onNavigate }) {
  const [open, setOpen] = useState(false);

  const items = [
    { label: "Roster", icon: "👥", tab: "Roster" },
    { label: "Standings", icon: "📊", tab: "Standings" },
    { label: "Schedule", icon: "📅", tab: "Schedule" },
    { label: "Trades", icon: "🔄", tab: "Trades" },
  ];

  return (
    <div className="quick-jump-fab">
      {open && (
        <div className="quick-jump-menu">
          {items.map((item) => (
            <button
              key={item.tab}
              onClick={() => {
                onNavigate(item.tab);
                setOpen(false);
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
      <button
        className="quick-jump-fab-btn"
        onClick={() => setOpen(!open)}
        title="Quick navigation"
      >
        {open ? "X" : "="}
      </button>
    </div>
  );
}

export default function LeagueDashboard({ league, busy, actions }) {
  const [activeTab, setActiveTab] = useState("Home");
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [comparePlayerId, setComparePlayerId] = useState(null);

  // Track the previous phase so we can detect transitions.
  const prevPhaseRef = React.useRef(null);

  // Dynamic tabs: add Postseason when in playoffs
  const TABS = useMemo(() => {
    const isPlayoffs = league?.phase === "playoffs" || league?.playoffSeeds;
    if (isPlayoffs) {
      // Insert "Postseason" after "Schedule"
      const copy = [...BASE_TABS];
      const idx = copy.indexOf("Schedule");
      copy.splice(idx + 1, 0, "Postseason");
      return copy;
    }
    return BASE_TABS;
  }, [league?.phase, league?.playoffSeeds]);

  // Auto-navigate based on phase transitions:
  //  draft       → go to Draft tab (so the user sees the board immediately)
  //  draft→preseason → new season started; leave Draft tab so the stale
  //                    DraftComplete panel no longer shows.
  //  playoffs    → auto-switch to Postseason tab on first entry
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = league?.phase;

    if (league?.phase === "draft") {
      setActiveTab("Draft");
    } else if (prevPhase === "draft" && league?.phase === "preseason") {
      setActiveTab("Home");
    } else if (league?.phase === "playoffs" && prevPhase !== "playoffs") {
      setActiveTab("Postseason");
    }
  }, [league?.phase]);

  // ── Keyboard Shortcuts ──────────────────────────────────────────────────
  // Alt+1..9 → switch tabs, Esc → close modals, Alt+H → Home
  useEffect(() => {
    const handleKey = (e) => {
      // Escape: close any open modal
      if (e.key === "Escape") {
        if (selectedPlayerId) { setSelectedPlayerId(null); return; }
        if (selectedTeamId != null) { setSelectedTeamId(null); return; }
        if (selectedGameId) { setSelectedGameId(null); return; }
        return;
      }

      // Don't intercept if user is typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

      // Alt + number → switch tabs
      if (e.altKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < TABS.length) setActiveTab(TABS[idx]);
        return;
      }

      // Alt+H → Home tab
      if (e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setActiveTab("Home");
        return;
      }

      // Alt+R → Roster Hub
      if (e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setActiveTab("Roster Hub");
        return;
      }

      // Alt+D → Draft Room
      if (e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setActiveTab("Draft Room");
        return;
      }

      // Alt+T → Trade Finder
      if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setActiveTab("Trade Finder");
        return;
      }

      // Alt+F → FA Hub
      if (e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setActiveTab("FA Hub");
        return;
      }

      // Alt+Left / Alt+Right → prev/next tab
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const curIdx = TABS.indexOf(activeTab);
        if (curIdx < 0) return;
        const next = e.key === "ArrowRight"
          ? (curIdx + 1) % TABS.length
          : (curIdx - 1 + TABS.length) % TABS.length;
        setActiveTab(TABS[next]);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [TABS, activeTab, selectedPlayerId, selectedTeamId, selectedGameId]);

  // ── Mobile Swipe Gestures ───────────────────────────────────────────────
  // Swipe left/right on the tab content area to navigate between tabs
  const touchStartRef = useRef(null);
  const touchContentRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const onTouchEnd = useCallback((e) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Must be a fast horizontal swipe (>60px, <300ms, more horizontal than vertical)
    if (Math.abs(dx) < 60 || dt > 300 || Math.abs(dy) > Math.abs(dx)) return;

    const curIdx = TABS.indexOf(activeTab);
    if (curIdx < 0) return;

    if (dx < 0) {
      // Swipe left → next tab
      const next = (curIdx + 1) % TABS.length;
      setActiveTab(TABS[next]);
    } else {
      // Swipe right → prev tab
      const prev = (curIdx - 1 + TABS.length) % TABS.length;
      setActiveTab(TABS[prev]);
    }
  }, [TABS, activeTab]);

  if (!league) return null;

  // NOTE: a missing schedule only affects the Schedule tab.
  // Do NOT block the whole dashboard — all other tabs remain usable.

  const userTeam = league.teams?.find((t) => t.id === league.userTeamId);
  const userAbbr = userTeam?.abbr ?? "---";
  const userRecord = userTeam
    ? `${userTeam.wins}-${userTeam.losses}${userTeam.ties ? `-${userTeam.ties}` : ""}`
    : "0-0";

  const totalGames =
    league.teams.reduce((s, t) => s + t.wins + t.losses + t.ties, 0) / 2;
  const avgScore = league.teams.length
    ? Math.round(
        league.teams.reduce((s, t) => s + t.ptsFor, 0) /
          Math.max(1, totalGames * 2),
      )
    : 0;
  const avgOvr = league.teams.length
    ? Math.round(
        league.teams.reduce((s, t) => s + t.ovr, 0) / league.teams.length,
      )
    : 75;

  const capTotal = userTeam?.capTotal ?? 255;
  const capUsed = userTeam?.capUsed ?? 0;
  const deadCap = userTeam?.deadCap ?? 0;
  const capRoom = userTeam?.capRoom ?? capTotal - capUsed;

  return (
    <div>
      {/* ── Hub Header ── */}
      <div className="hub-header">
        <div className="hub-header-content">
          <div className="team-identity">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-4)",
              }}
            >
              <TeamLogo abbr={userAbbr} size={56} isUser />
              <div>
                <div className="team-name-large">
                  {userTeam?.name ?? "No Team Selected"}
                </div>
                <div className="team-record-large">
                  {userRecord}
                  {userTeam && (
                    <span className="division-rank-badge">
                      {userTeam.conf} {userTeam.div}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="season-context">
            <div className="current-week-large">
              {league.week ? `Week ${league.week}` : "Offseason"}
            </div>
            <div className="season-year-large">
              {league.year ?? 2025} Season · {league.phase}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 16 }}>
              <div
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                }}
              >
                Owner:{" "}
                <span
                  style={{
                    color:
                      (league.ownerApproval ?? 75) >= 70
                        ? "var(--success)"
                        : (league.ownerApproval ?? 75) >= 50
                          ? "var(--warning)"
                          : "var(--danger)",
                  }}
                >
                  {league.ownerApproval ?? 75}%
                </span>
                {(league.ownerApproval ?? 75) < 50 && (
                  <span style={{ color: "var(--danger)", marginLeft: 4 }}>
                    (Seat Hot)
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                }}
              >
                Fan:{" "}
                <span
                  style={{
                    color:
                      (league.fanApproval ?? 65) >= 70
                        ? "var(--success)"
                        : (league.fanApproval ?? 65) >= 50
                          ? "var(--warning)"
                          : "var(--danger)",
                  }}
                >
                  {league.fanApproval ?? 65}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Expiring Contracts Banner ── */}
      {league.phase === "offseason_resign" && (
        <div
          onClick={() => setActiveTab("Roster")}
          style={{
            background: "rgba(52, 199, 89, 0.15)",
            border: "1px solid var(--success)",
            color: "var(--success)",
            padding: "var(--space-4)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--space-6)",
            fontWeight: 700,
            textAlign: "center",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-3)",
            fontSize: "var(--text-lg)",
          }}
        >
          <span>✍️</span>
          <span>Expiring Contracts</span>
          <span
            style={{
              fontWeight: 400,
              fontSize: "var(--text-base)",
              color: "var(--text)",
            }}
          >
            — Review and extend players before Free Agency.
          </span>
        </div>
      )}

      {/* ── Preseason Cutdown Banner ── */}
      {league.phase === "preseason" && (
        <div
          style={{
            background: "rgba(255,159,10,0.15)",
            border: "1px solid var(--warning)",
            color: "var(--warning)",
            padding: "var(--space-4)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--space-6)",
            fontWeight: 700,
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-3)",
            fontSize: "var(--text-lg)",
          }}
        >
          <span>⚠️</span>
          <span>
            Roster Cutdown:{" "}
            <span
              style={{
                color:
                  (userTeam?.rosterCount ?? 0) > 53
                    ? "var(--danger)"
                    : "var(--success)",
              }}
            >
              {userTeam?.rosterCount ?? 0}
            </span>{" "}
            / 53
          </span>
          <span
            style={{
              fontWeight: 400,
              fontSize: "var(--text-base)",
              color: "var(--text-muted)",
            }}
          >
            — You must release{" "}
            {(userTeam?.rosterCount ?? 0) > 53 ? userTeam.rosterCount - 53 : 0}{" "}
            players to advance.
          </span>
        </div>
      )}

      {/* ── Postseason Banner ── */}
      {league.phase === "playoffs" && activeTab !== "Postseason" && (
        <div
          onClick={() => setActiveTab("Postseason")}
          style={{
            background:
              "linear-gradient(135deg, rgba(255,215,0,0.12), rgba(192,192,192,0.08))",
            border: "1px solid rgba(255,215,0,0.3)",
            color: "#FFD700",
            padding: "var(--space-4)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--space-6)",
            fontWeight: 700,
            textAlign: "center",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-3)",
            fontSize: "var(--text-lg)",
          }}
        >
          <span style={{ fontSize: "1.3rem" }}>&#127942;</span>
          <span>PLAYOFF BRACKET</span>
          <span
            style={{
              fontWeight: 400,
              fontSize: "var(--text-base)",
              color: "var(--text)",
            }}
          >
            — Click to view the bracket and matchups.
          </span>
        </div>
      )}

      {/* ── Draft Active Banner ── */}
      {league.phase === "draft" && activeTab !== "Draft" && (
        <div
          onClick={() => setActiveTab("Draft")}
          style={{
            background: "rgba(10,132,255,0.15)",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
            padding: "var(--space-4)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--space-6)",
            fontWeight: 700,
            textAlign: "center",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-3)",
            fontSize: "var(--text-lg)",
          }}
        >
          <span>🏈</span>
          <span>Draft Board is Open</span>
          <span
            style={{
              fontWeight: 400,
              fontSize: "var(--text-base)",
              color: "var(--text)",
            }}
          >
            — Click here to make your picks.
          </span>
        </div>
      )}

      {/* ── Status Grid (3-col: Cap Space | Standings | Last Game + Scores) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-6)",
        }}
      >
        {/* Cap Space widget — consolidated financials */}
        <div className="stat-box">
          <div className="stat-label">Cap Space</div>
          <div
            className="stat-value-large"
            style={{
              color:
                capRoom > 10
                  ? "var(--success)"
                  : capRoom > 0
                    ? "var(--warning)"
                    : "var(--danger)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ${capRoom.toFixed(1)}M
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px' }}>
              <DonutChart data={[
                  { value: capUsed - deadCap, color: "var(--accent)" },
                  { value: deadCap, color: "var(--danger)" },
                  { value: Math.max(0, capRoom), color: "var(--surface-strong)" }
              ]} size={36} strokeWidth={6} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--accent)" }}>Act: ${(capUsed - deadCap).toFixed(1)}</span>
                      {deadCap > 0 && <span style={{ color: "var(--danger)" }}>Ded: ${deadCap.toFixed(1)}</span>}
                  </div>
                  <div>Tot: ${capTotal.toFixed(0)}</div>
              </div>
          </div>
        </div>

        {/* Standings snapshot */}
        <div className="stat-box">
          <div className="stat-label">Standings</div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span
              style={{
                fontSize: "var(--text-xl)",
                fontWeight: 800,
                color: "var(--text)",
              }}
            >
              {userRecord}
            </span>
            <span
              style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}
            >
              {userTeam
                ? `${typeof userTeam.conf === "number" ? CONFS[userTeam.conf] : userTeam.conf} ${typeof userTeam.div === "number" ? DIVS.find((d) => d.idx === userTeam.div)?.name : userTeam.div}`
                : ""}
            </span>
          </div>
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              marginTop: 2,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Avg PPG: {avgScore} · Lg OVR: {avgOvr}
          </div>
        </div>

        {/* Last Game + compact league scores */}
        <div className="stat-box">
          {(() => {
            const prevWeek = (league.week || 1) - 1;
            const weekData = league.schedule?.weeks?.find(
              (w) => w.week === prevWeek,
            );
            const allGames = weekData?.games?.filter((g) => g.played) ?? [];
            const userGame = allGames.find(
              (g) =>
                g.home === league.userTeamId ||
                (typeof g.home === "object" &&
                  g.home.id === league.userTeamId) ||
                g.away === league.userTeamId ||
                (typeof g.away === "object" && g.away.id === league.userTeamId),
            );
            const otherGames = allGames.filter((g) => g !== userGame);

            const teamById = {};
            league.teams?.forEach((t) => {
              teamById[t.id] = t;
            });

            if (userGame) {
              const homeId =
                typeof userGame.home === "object"
                  ? userGame.home.id
                  : userGame.home;
              const awayId =
                typeof userGame.away === "object"
                  ? userGame.away.id
                  : userGame.away;
              const isHome = homeId === league.userTeamId;
              const userScore = isHome
                ? userGame.homeScore
                : userGame.awayScore;
              const oppScore = isHome ? userGame.awayScore : userGame.homeScore;
              const oppId = isHome ? awayId : homeId;
              const oppAbbr = teamById[oppId]?.abbr ?? "???";
              const win = userScore > oppScore;
              const resultChar = win ? "W" : userScore === oppScore ? "T" : "L";
              const resultColor = win
                ? "var(--success)"
                : userScore === oppScore
                  ? "var(--text-muted)"
                  : "var(--danger)";

              return (
                <>
                  <div className="stat-label">Last Game</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--text-lg)",
                        fontWeight: 800,
                        color: resultColor,
                      }}
                    >
                      {resultChar}
                    </span>
                    <span
                      style={{ fontSize: "var(--text-base)", fontWeight: 700 }}
                    >
                      {userScore}-{oppScore}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--text-muted)",
                      }}
                    >
                      vs {oppAbbr}
                    </span>
                  </div>
                  {/* Compact other league scores — click to open BoxScore */}
                  {otherGames.length > 0 && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 10,
                        color: "var(--text-subtle)",
                        lineHeight: 1.5,
                        fontVariantNumeric: "tabular-nums",
                        maxHeight: 48,
                        overflow: "hidden",
                      }}
                    >
                      {otherGames.slice(0, 6).map((g, i) => {
                        const hId =
                          typeof g.home === "object" ? g.home.id : g.home;
                        const aId =
                          typeof g.away === "object" ? g.away.id : g.away;
                        const hA = teamById[hId]?.abbr ?? "?";
                        const aA = teamById[aId]?.abbr ?? "?";
                        const gId = league.seasonId
                          ? `${league.seasonId}_w${prevWeek}_${hId}_${aId}`
                          : null;
                        return (
                          <span
                            key={i}
                            onClick={
                              gId ? () => setSelectedGameId(gId) : undefined
                            }
                            style={{
                              cursor: gId ? "pointer" : "default",
                              textDecoration: gId ? "underline dotted" : "none",
                            }}
                            title={gId ? "View box score" : undefined}
                          >
                            {aA} {g.awayScore}-{g.homeScore} {hA}
                            {i < Math.min(otherGames.length, 6) - 1
                              ? " · "
                              : ""}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            }
            return (
              <>
                <div className="stat-label">Last Game</div>
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--text-muted)",
                  }}
                >
                  No results yet
                </div>
              </>
            );
          })()}
        </div>

        {/* News Feed */}
        <NewsFeed league={league} />

        {/* Stat Leaders Widget */}
        {league.phase !== "preseason" && (
          <StatLeadersWidget onPlayerSelect={setSelectedPlayerId} />
        )}
      </div>

      {/* ── Tab Navigation ── */}
      <div
        className="standings-tabs"
        style={{ marginBottom: "var(--space-6)", flexWrap: "wrap" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`standings-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab Content — each tab is independently error-bounded ── */}
      {/* Swipe left/right to navigate tabs on mobile */}
      <div className="fade-in" key={activeTab} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {activeTab === "Home" && (
          <TabErrorBoundary label="Home">
            <HomeDashboard
              league={league}
              onTeamSelect={setSelectedTeamId}
              onPlayerSelect={setSelectedPlayerId}
              onTabChange={setActiveTab}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Standings" && (
          <TabErrorBoundary label="Standings">
            <StandingsTab
              teams={league.teams}
              userTeamId={league.userTeamId}
              onTeamSelect={setSelectedTeamId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Schedule" && (
          <TabErrorBoundary label="Schedule">
            <ScheduleTab
              schedule={league.schedule}
              teams={league.teams}
              currentWeek={league.week}
              userTeamId={league.userTeamId}
              nextGameStakes={league.nextGameStakes}
              seasonId={league.seasonId}
              onGameSelect={setSelectedGameId}
              playoffSeeds={league.playoffSeeds}
              onTeamRoster={(teamId) => {
                setSelectedTeamId(teamId);
              }}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Stats" && (
          <TabErrorBoundary label="Stats">
            <PlayerStats
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Leaders" && (
          <TabErrorBoundary label="Leaders">
            <Leaders
              onPlayerSelect={setSelectedPlayerId}
              userTeamId={league.userTeamId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Award Races" && (
          <TabErrorBoundary label="Award Races">
            <AwardRaces
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Strategy" && (
          <TabErrorBoundary label="Strategy">
            <StrategyPanel league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Roster" && (
          <TabErrorBoundary label="Roster">
            <Roster
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Roster Hub" && (
          <TabErrorBoundary label="Roster Hub">
            <RosterHub
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Financials" && (
          <TabErrorBoundary label="Financials">
            <FinancialsView league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Draft" && (
          <TabErrorBoundary label="Draft">
            <Draft
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Draft Room" && (
          <TabErrorBoundary label="Draft Room">
            <RookieDraft
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Coaches" && (
          <TabErrorBoundary label="Coaches">
            <Coaches league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Free Agency" && (
          <TabErrorBoundary label="Free Agency">
            <FreeAgency
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "FA Hub" && (
          <TabErrorBoundary label="FA Hub">
            <FreeAgencyHub
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Trades" && (
          <TabErrorBoundary label="Trades">
            <TradeCenter
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Trade Finder" && (
          <TabErrorBoundary label="Trade Finder">
            <TradeFinder
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "History" && (
          <TabErrorBoundary label="History">
            <LeagueHistory onPlayerSelect={setSelectedPlayerId} />
          </TabErrorBoundary>
        )}
        {activeTab === "Hall of Fame" && (
          <TabErrorBoundary label="Hall of Fame">
            <HallOfFame onPlayerSelect={setSelectedPlayerId} />
          </TabErrorBoundary>
        )}
        {activeTab === "Postseason" && (
          <TabErrorBoundary label="Postseason">
            <PostseasonHub league={league} />
          </TabErrorBoundary>
        )}
      </div>

      {/* ── Quick-Jump FAB (mobile) ── */}
      <QuickJumpFab onNavigate={setActiveTab} />

      {/* ── Mobile Navigation (bottom bar + slide-in) ── */}
      <MobileNav
        activeTab={REVERSE_TAB_MAP[activeTab] || "hub"}
        onTabChange={(mobileTabId) => {
          const dashTab = MOBILE_TAB_MAP[mobileTabId];
          if (dashTab) setActiveTab(dashTab);
        }}
        league={league}
      />

      {/* ── Box Score modal (portal-style, rendered above all tabs) ── */}
      {selectedGameId && (
        <TabErrorBoundary label="Box Score">
          <BoxScore
            gameId={selectedGameId}
            actions={actions}
            onClose={() => setSelectedGameId(null)}
          />
        </TabErrorBoundary>
      )}

      {/* ── Player Profile modal ── */}
      {selectedPlayerId && (
        <TabErrorBoundary label="Player Profile">
          <PlayerProfile
            playerId={selectedPlayerId}
            onClose={() => setSelectedPlayerId(null)}
            actions={actions}
            teams={league.teams}
          />
        </TabErrorBoundary>
      )}

      {/* ── Team Profile modal ── */}
      {selectedTeamId != null && (
        <TabErrorBoundary label="Team Profile">
          <TeamProfile
            teamId={selectedTeamId}
            onClose={() => setSelectedTeamId(null)}
            onPlayerSelect={(id) => {
              setSelectedTeamId(null);
              setSelectedPlayerId(id);
            }}
          />
        </TabErrorBoundary>
      )}
    </div>
  );
}
