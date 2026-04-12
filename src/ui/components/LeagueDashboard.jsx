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

import React, { useState, useMemo, useEffect, Component } from "react";
import DonutChart from "./DonutChart";
import NotificationCenter from "./NotificationCenter.jsx";
import DragAndDropDepthChart from "./DragAndDropDepthChart.jsx";
import Roster from "./Roster.jsx";
import RosterHub from "./RosterHub.jsx";
import FranchiseHQ from "./FranchiseHQ.jsx";
import FranchiseSummaryPanel from "./FranchiseSummaryPanel.jsx";
import Draft from "./Draft.jsx";
import RookieDraft from "./RookieDraft.jsx";
import Coaches from "./Coaches.jsx";
import FreeAgency from "./FreeAgency.jsx";
import GameDetailScreen from "./GameDetailScreen.jsx";
import LeagueHistory from "./LeagueHistory.jsx";
import TeamHistoryScreen from "./TeamHistoryScreen.jsx";
import AwardsRecordsScreen from "./AwardsRecordsScreen.jsx";
import HallOfFame from "./HallOfFame.jsx";
import HistoryHub from "./HistoryHub.jsx";
import TradeWorkspace from "./TradeWorkspace.jsx";
import PlayerProfile from "./PlayerProfile.jsx";
import TeamProfile from "./TeamProfile.jsx";
import Leaders from "./Leaders.jsx";
import LeagueLeaders from "./LeagueLeaders.jsx";
import AwardRaces from "./AwardRaces.jsx";
import PlayerStats from "./PlayerStats.jsx";
import StrategyPanel from "./StrategyPanel.jsx";
import GamePlanScreen from "./GamePlanScreen.jsx";
import NewsFeed from "./NewsFeed.jsx";
import RecordBook from "./RecordBook.jsx";
import StatLeadersWidget from "./StatLeadersWidget.jsx";
import FinancialsView from "./FinancialsView.jsx";
import ContractCenter from "./ContractCenter.jsx";
import PostseasonHub from "./PostseasonHub.jsx";
import TrainingCamp from "./TrainingCamp.jsx";
import StaffManagement from "./StaffManagement.jsx";
import SaveExportImport from "./SaveExportImport.jsx";
import MockDraft from "./MockDraft.jsx";
import InjuryReport from "./InjuryReport.jsx";
import GodMode from "./GodMode.jsx";
import SeasonRecap from "./SeasonRecap.jsx";
import MobileNav from "./MobileNav.jsx";
import AnalyticsHub from "./AnalyticsHub.jsx";
import GlossaryPopover from "./GlossaryPopover.jsx";
import OnboardingTour from "./OnboardingTour.jsx";
import OffseasonHub from "./OffseasonHub.jsx";
import GMAdvisor from "./GMAdvisor.jsx";
import CapManager from "./CapManager.jsx";
import DraftBigBoard from "./DraftBigBoard.jsx";
import CoachingScreen from "./CoachingScreen.jsx";
import TeamHub from "./TeamHub.jsx";
import LeagueHub from "./LeagueHub.jsx";
import SectionSubnav from "./SectionSubnav.jsx";
import { buildLatestResultsSummary } from "../utils/lastResultSummary.js";
import { getAppShellContext } from "../utils/appShellContext.js";
import { getScheduleFiltersState, persistScheduleFiltersState } from "../utils/scheduleFiltersState.js";
import {
  clampPercent,
  deriveTeamCapSnapshot,
  formatMoneyM,
  formatPercent,
  safeRound,
} from "../utils/numberFormatting.js";
import {
  derivePregameAngles,
  derivePostgameStory,
  deriveBoxScoreImmersion,
  deriveWeeklyHonors,
} from "../utils/gamePresentation.js";
import { deriveFranchisePressure } from "../utils/pressureModel.js";
import { getClickableCardProps } from "../utils/clickableCard.js";
import { buildCompletedGamePresentation, openResolvedBoxScore } from "../utils/boxScoreAccess.js";
import { normalizeManagementDestination } from "../utils/managementScreenRouting.js";
import { createBoxScoreTapHandler } from "../utils/scoreTapTarget.js";
import { safeGetLeagueState, getScheduleViewModel } from "../../state/selectors.js";
import {
  SHELL_SECTIONS,
  getShellSectionForDashboardTab,
  normalizeDashboardTab,
  normalizeShellSectionId,
} from "../utils/shellNavigation.js";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  "HQ",
  "Team",
  "League",
  "News",
  "Standings",
  "Schedule",
  "Stats",
  "Leaders",
  "League Leaders",
  "Award Races",
  "Analytics",
  "Game Plan",
  "Roster",
  "Depth Chart",
  "Roster Hub",
  "Training",
  "Injuries",
  "Financials",
  "Contract Center",
  "Coaches",
  "Staff",
  "Transactions",
  "Free Agency",
  "Trades",
  "Draft",
  "Draft Room",
  "Mock Draft",
  "History Hub",
  "History",
  "Team History",
  "Hall of Fame",
  "Awards & Records",
  "Season Recap",
  "Saves",
  "God Mode",
  "🤖 GM Advisor",
  "Game Detail",
  "Offseason",
  "💰 Cap",
  "🎓 Draft",
  "🎙️ Coaches",
];

const NAV_GROUPS = [
  { id: SHELL_SECTIONS.hq, title: "HQ", tabs: ["HQ"] },
  { id: SHELL_SECTIONS.team, title: "Team", tabs: ["Team", "Roster", "Depth Chart", "Game Plan", "Training", "Injuries", "Staff", "Financials", "Contract Center"] },
  { id: SHELL_SECTIONS.league, title: "League", tabs: ["League", "Standings", "Schedule", "Stats", "Leaders", "Award Races", "Analytics", "News"] },
  { id: SHELL_SECTIONS.transactions, title: "Transactions", tabs: ["Transactions", "Free Agency", "Draft", "Draft Room", "Mock Draft"] },
  { id: SHELL_SECTIONS.history, title: "History", tabs: ["History Hub", "History", "Hall of Fame", "Awards & Records", "Season Recap", "Team History", "Saves"] },
];

const TEAM_FACING_TABS = new Set(["Roster", "Depth Chart", "Roster Hub", "Game Plan", "Training", "Injuries", "Staff", "Financials", "Contract Center"]);
const TAB_ALIASES = {
  Trades: "Transactions",
};

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

function StandingsTab({ teams, userTeamId, onTeamSelect, leagueSettings }) {
  const confNames = Array.isArray(leagueSettings?.conferenceNames) && leagueSettings.conferenceNames.length
    ? leagueSettings.conferenceNames
    : CONFS;
  const divNames = Array.isArray(leagueSettings?.divisionNames) && leagueSettings.divisionNames.length
    ? leagueSettings.divisionNames
    : DIVS.map((d) => d.name);
  const [activeConf, setActiveConf] = useState(confNames[0] || "AFC");
  const [viewMode, setViewMode] = useState("division"); // "division" | "playoff"

  // Normalise activeConf label → numeric index for comparison
  const activeConfIdx = Math.max(0, confNames.indexOf(activeConf));

  const grouped = useMemo(() => {
    const confTeams = teams.filter((t) => confIdx(t.conf) === activeConfIdx);
    const groups = divNames.map((name, idx) => ({
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
  }, [teams, activeConfIdx, userTeamId, divNames]);

  return (
    <div>
      {/* Conference tab pills + view mode toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
        <Tabs value={activeConf} onValueChange={setActiveConf}>
          <TabsList style={{ minHeight: 34 }}>
            {confNames.map(c => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Tabs value={viewMode} onValueChange={setViewMode}>
          <TabsList style={{ minHeight: 34 }}>
            <TabsTrigger value="division">Divisions</TabsTrigger>
            <TabsTrigger value="playoff">Playoff Picture</TabsTrigger>
          </TabsList>
        </Tabs>
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
          <Card key={div} className="card-premium">
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-widest text-[color:var(--text-muted)]">{activeConf} {div}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ paddingLeft: "var(--space-5)" }}>Team</TableHead>
                      <TableHead style={{ textAlign: "center" }}>W</TableHead>
                      <TableHead style={{ textAlign: "center" }}>L</TableHead>
                      <TableHead style={{ textAlign: "center" }}>T</TableHead>
                      <TableHead style={{ textAlign: "center" }}>PCT</TableHead>
                      <TableHead style={{ textAlign: "center", color: "var(--text-muted)" }} title="Points For (season total)">
                        PF
                      </TableHead>
                      <TableHead style={{ textAlign: "center", color: "var(--text-muted)" }} title="Points Against (season total)">
                        PA
                      </TableHead>
                      <TableHead style={{ textAlign: "center" }}>STRK</TableHead>
                      <TableHead style={{ textAlign: "center" }}>OVR</TableHead>
                      <TableHead style={{ textAlign: "right", paddingRight: "var(--space-5)" }}>CAP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {divTeams.map((team, idx) => {
                      const isUser = team.id === userTeamId;
                      return (
                        <TableRow
                          key={team.id}
                          className={isUser ? "user-team-row" : ""}
                          style={{ background: idx % 2 ? "rgba(255,255,255,0.02)" : "transparent" }}
                        >
                          <TableCell style={{ paddingLeft: "var(--space-4)" }}>
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
                          </TableCell>
                          <TableCell
                            style={{
                              textAlign: "center",
                              fontWeight: 700,
                              color: "var(--text)",
                            }}
                          >
                            {team.wins}
                          </TableCell>
                          <TableCell style={{ textAlign: "center" }}>{team.losses}</TableCell>
                          <TableCell style={{ textAlign: "center" }}>{team.ties}</TableCell>
                          <TableCell style={{ textAlign: "center", fontWeight: 600 }}>
                            {winPct(team.wins, team.losses, team.ties)}
                          </TableCell>
                          <TableCell style={{ textAlign: "center", color: "var(--success)", fontWeight: 700 }}>
                            {team.ptsFor}
                          </TableCell>
                          <TableCell style={{ textAlign: "center" }}>
                            <span style={{ color: "var(--warning)", fontWeight: 700 }}>{team.ptsAgainst}</span>
                          </TableCell>
                          <TableCell style={{ textAlign: "center" }}>
                            {(() => {
                              const streak = computeStreak(team.recentResults ?? []);
                              if (!streak) return <span style={{ color: "var(--text-subtle)", fontSize: "var(--text-xs)" }}>—</span>;
                              return (
                                <span className={`streak-badge streak-${streak.type.toLowerCase()}`}>
                                  {streak.type}{streak.count}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell style={{ textAlign: "center" }}>
                            <OvrPill ovr={team.ovr} />
                          </TableCell>
                          <TableCell
                            style={{
                              textAlign: "right",
                              paddingRight: "var(--space-4)",
                              color: "var(--success)",
                              fontSize: "var(--text-sm)",
                            }}
                          >
                            {formatMoneyM(team.capRoom ?? team.capSpace)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
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
      <div style={{ marginTop: "var(--space-2)", fontSize: "0.66rem", color: "var(--text-subtle)" }}>
        PF/PA values are season aggregates and may appear compressed early in the season.
      </div>
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
  league,
  onPlayerSelect,
}) {
  const initialFilters = useMemo(() => getScheduleFiltersState({
    selectedWeek: Number(currentWeek ?? 1),
    viewMode: 'my_team',
    selectedTeamId: Number(userTeamId ?? 0),
    statusFilter: 'all',
  }), [currentWeek, userTeamId]);
  const [selectedWeek, setSelectedWeek] = useState(initialFilters.selectedWeek);
  const [viewMode, setViewMode] = useState(initialFilters.viewMode);
  const [selectedTeamId, setSelectedTeamId] = useState(initialFilters.selectedTeamId);
  const [statusFilter, setStatusFilter] = useState(initialFilters.statusFilter);

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
  const scheduleModel = getScheduleViewModel({ week: currentWeek, userTeamId, schedule }, {
    week: selectedWeek,
    teamId: selectedTeamId,
    mode: viewMode === 'selected_team' || viewMode === 'my_team' ? 'team' : 'league',
    status: statusFilter,
  });
  useEffect(() => {
    persistScheduleFiltersState({ selectedWeek, viewMode, selectedTeamId, statusFilter });
  }, [selectedWeek, viewMode, selectedTeamId, statusFilter]);

  const filteredGames = (viewMode === 'my_team')
    ? games.filter((game) => {
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      return homeId === Number(userTeamId) || awayId === Number(userTeamId);
    })
    : (viewMode === 'selected_team')
      ? games.filter((game) => {
        const homeId = Number(game?.home?.id ?? game?.home);
        const awayId = Number(game?.away?.id ?? game?.away);
        return homeId === Number(selectedTeamId) || awayId === Number(selectedTeamId);
      })
      : scheduleModel.games;
  const visibleGames = filteredGames.filter((game) => {
    if (statusFilter === 'completed') return Boolean(game?.played);
    if (statusFilter === 'upcoming') return !Boolean(game?.played);
    return true;
  });
  const weeklyHonors = useMemo(() => deriveWeeklyHonors(league), [league]);
  const weekRecapItems = useMemo(() => (
    games
      .filter((game) => game?.played)
      .map((game) => {
        const home = teamById[game.home] ?? { abbr: "HOME" };
        const away = teamById[game.away] ?? { abbr: "AWAY" };
        const presentation = buildCompletedGamePresentation(game, { seasonId, week: selectedWeek, teamById, source: "schedule_recap" });
        const story = derivePostgameStory({ league, game, week: selectedWeek });
        return { game, home, away, presentation, story };
      })
      .slice(0, 8)
  ), [games, league, seasonId, selectedWeek, teamById]);

  return (
    <div>
      {/* Week selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          marginBottom: "var(--space-3)",
          position: "sticky",
          top: "calc(var(--screen-sticky-top, 0px) + 8px)",
          zIndex: 3,
          background: "var(--surface)",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-2) var(--space-3)",
        }}
      >
        <strong style={{ fontSize: "var(--text-xs)", letterSpacing: ".4px", textTransform: "uppercase", color: "var(--text-muted)" }}>Filters</strong>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <Button size="sm" variant={statusFilter === "completed" ? "default" : "outline"} onClick={() => setStatusFilter("completed")}>Completed</Button>
          <Button size="sm" variant={statusFilter === "upcoming" ? "default" : "outline"} onClick={() => setStatusFilter("upcoming")}>Upcoming</Button>
          <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>All</Button>
        </div>
      </div>
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
        <select value={viewMode} onChange={(e) => setViewMode(e.target.value)} style={{ minHeight: 34 }}>
          <option value="my_team">My team schedule</option>
          <option value="selected_team">Selected team</option>
          <option value="all_week">League view (week slate)</option>
        </select>
        <span className="badge">{viewMode === 'my_team' ? 'My Team View' : viewMode === 'selected_team' ? 'Selected Team View' : 'League View'}</span>
        {viewMode === "selected_team" && (
          <select value={selectedTeamId ?? ""} onChange={(e) => setSelectedTeamId(Number(e.target.value))} style={{ minHeight: 34 }}>
            {(teams ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        )}
      </div>

      {weekRecapItems.length > 0 && (
        <div className="card" style={{ marginBottom: "var(--space-4)", padding: "var(--space-3) var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong>Week {selectedWeek} recap</strong>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Scores + storylines at a glance</span>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {weekRecapItems.map(({ game, away, home, presentation, story }, idx) => (
              <button
                key={`${game.home}-${game.away}-${idx}`}
                className={`btn-link ${presentation.canOpen ? "" : "disabled"}`}
                onClick={() => openResolvedBoxScore(game, { seasonId, week: selectedWeek, source: "schedule_recap" }, onGameSelect)}
                style={{ textAlign: "left", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}
                title={presentation.canOpen ? presentation.ctaLabel : presentation.statusLabel}
              >
                <strong style={{ color: "var(--text)" }}>{away.abbr} {game.awayScore} @ {home.abbr} {game.homeScore}</strong>
                {" · "}
                {story?.headline ?? "Final"}
                {" · "}
                <span style={{ color: presentation.archiveQuality === "full" ? "var(--success)" : presentation.archiveQuality === "partial" ? "var(--warning)" : "var(--text-subtle)" }}>
                  {presentation.statusLabel}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Game cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {weeklyHonors?.week === selectedWeek && (
          <div className="matchup-card" style={{ gridColumn: "1 / -1", borderColor: "rgba(245,158,11,0.45)" }}>
            <div className="matchup-header">
              <span>Week {selectedWeek} honors</span>
              <span style={{ color: "var(--warning)", fontWeight: 700 }}>Broadcast desk</span>
            </div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              {weeklyHonors?.playerOfWeek && (
                <div>
                  <strong style={{ color: "var(--text)" }}>Player of the Week:</strong>{" "}
                  <button className="btn-link" style={{ fontSize: "inherit" }} onClick={() => onPlayerSelect?.(weeklyHonors.playerOfWeek.playerId)}>{weeklyHonors.playerOfWeek.name}</button>
                  {` (${weeklyHonors.playerOfWeek.pos ?? "—"})`}{weeklyHonors.playerOfWeek.line ? ` · ${weeklyHonors.playerOfWeek.line}` : ""}
                </div>
              )}
              {weeklyHonors?.rookieOfWeek && (
                <div>
                  <strong style={{ color: "var(--text)" }}>Top Rookie:</strong>{" "}
                  <button className="btn-link" style={{ fontSize: "inherit" }} onClick={() => onPlayerSelect?.(weeklyHonors.rookieOfWeek.playerId)}>{weeklyHonors.rookieOfWeek.name}</button>
                  {` (${weeklyHonors.rookieOfWeek.pos ?? "—"})`}{weeklyHonors.rookieOfWeek.line ? ` · ${weeklyHonors.rookieOfWeek.line}` : ""}
                </div>
              )}
              {weeklyHonors?.statementWin && <div><strong style={{ color: "var(--text)" }}>Statement win:</strong> {weeklyHonors.statementWin.headline}</div>}
            </div>
          </div>
        )}
        {visibleGames.map((game, idx) => {
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
          const presentation = game.played ? buildCompletedGamePresentation(game, { seasonId, week: selectedWeek, teamById, source: "schedule_card" }) : null;
          const resolvedGameId = presentation?.resolvedGameId ?? null;
          const archiveQuality = presentation?.archiveQuality ?? "missing";
          const isClickable = Boolean(presentation?.canOpen && onGameSelect);
          const pregameAngles = !game.played ? derivePregameAngles({ league, game, week: selectedWeek }) : [];
          const postgame = game.played ? derivePostgameStory({ league, game, week: selectedWeek }) : null;
          const immersion = game.played ? deriveBoxScoreImmersion({ league, game, week: selectedWeek }) : null;
          const isTopWeekTeam = weeklyHonors?.teamOfWeekId != null
            && selectedWeek === weeklyHonors.week
            && (weeklyHonors.teamOfWeekId === away.id || weeklyHonors.teamOfWeekId === home.id);
          const majorResultTag = (() => {
            if (!postgame) return null;
            if (selectedWeek === 22 && league?.championTeamId != null) return "Super Bowl aftermath";
            if (selectedWeek === 21) return "Conference title clinched";
            if (selectedWeek >= 19 && postgame.tag === "Upset") return "Playoff upset";
            if (selectedWeek >= 17 && postgame.tag === "Upset") return "Playoff race shakeup";
            return null;
          })();
          const handleCardClick = isClickable
            ? () => openResolvedBoxScore(game, { seasonId, week: selectedWeek, source: "schedule_card" }, onGameSelect)
            : undefined;
          const scoreTapHandler = createBoxScoreTapHandler({
            gameId: resolvedGameId,
            onOpenBoxScore: onGameSelect,
          });
          const clickableCardProps = getClickableCardProps({
            onOpen: handleCardClick,
            disabled: !isClickable,
            ariaLabel: isClickable ? `Open box score for ${away.abbr} at ${home.abbr}` : undefined,
          });

          return (
            <div
              key={idx}
              className={`matchup-card ${isClickable ? "clickable-card" : ""}`}
              {...clickableCardProps}
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
                  {isTopWeekTeam && (
                    <span style={{ padding: "2px 8px", borderRadius: "var(--radius-pill)", background: "rgba(245,158,11,0.18)", color: "var(--warning)", fontWeight: 700, fontSize: "var(--text-xs)" }}>
                      Team of the Week
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
                {game.played && (
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: "var(--radius-pill)",
                    background: archiveQuality === "full" ? "var(--success)22" : archiveQuality === "partial" ? "var(--warning)22" : "var(--surface-strong)",
                    color: archiveQuality === "full" ? "var(--success)" : archiveQuality === "partial" ? "var(--warning)" : "var(--text-muted)",
                    fontWeight: 700,
                  }}>
                    {archiveQuality === "full" ? "Full box score" : archiveQuality === "partial" ? "Partial archive" : "Archive unavailable"}
                  </span>
                )}
              </div>
              {game.played && !resolvedGameId && (
                <div style={{ fontSize: 12, color: "var(--warning)" }}>Final score available; archive ID missing in this save.</div>
              )}

              {/* Final score display */}
              {game.played && game.homeScore !== undefined && (
                <>
                  <button
                    type="button"
                    className={`score-tap-target ${scoreTapHandler ? "score-tap-target-clickable" : "score-tap-target-static"}`}
                    onClick={scoreTapHandler}
                    aria-label={scoreTapHandler ? `Open box score for ${away.abbr} at ${home.abbr}` : undefined}
                    aria-disabled={!scoreTapHandler}
                    title={scoreTapHandler ? presentation?.ctaLabel ?? "View box score" : presentation?.statusLabel}
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
                  </button>
                  {isClickable && (
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "var(--text-xs)",
                        color: "var(--accent)",
                        marginBottom: "var(--space-1)",
                      }}
                    >
                      {presentation?.ctaLabel ?? "View Box Score"} →
                    </div>
                  )}
                  {postgame && (
                    <div style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textAlign: "center" }}>
                      <strong style={{ color: "var(--text)" }}>{postgame.headline}</strong>
                      <div>{postgame.detail}</div>
                      {majorResultTag && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{ border: "1px solid rgba(245,158,11,0.5)", color: "var(--warning)", borderRadius: 999, padding: "1px 8px", fontWeight: 700 }}>
                            {majorResultTag}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {immersion?.playerOfGame && (
                    <div style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textAlign: "center" }}>
                      Player of the game:{" "}
                      <button className="btn-link" style={{ fontSize: "inherit" }} onClick={(e) => { e.stopPropagation(); onPlayerSelect?.(immersion.playerOfGame.playerId); }}>
                        {immersion.playerOfGame.name}
                      </button>
                      {immersion.playerOfGame.line ? ` · ${immersion.playerOfGame.line}` : ""}
                      {immersion.streakImpact ? <div>{immersion.streakImpact}</div> : null}
                    </div>
                  )}
                </>
              )}
              {!game.played && pregameAngles.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: "var(--space-2)" }}>
                  {pregameAngles.map((angle) => (
                    <span
                      key={`${idx}-${angle.key}`}
                      style={{
                        padding: "2px 8px",
                        borderRadius: "var(--radius-pill)",
                        border: "1px solid var(--hairline)",
                        fontSize: "var(--text-xs)",
                        color: angle.tone === "danger" ? "var(--danger)" : angle.tone === "warning" ? "var(--warning)" : "var(--text-muted)",
                      }}
                    >
                      {angle.label}
                    </span>
                  ))}
                </div>
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
              {isClickable ? <span className="clickable-card__chevron" aria-hidden="true">›</span> : null}
            </div>
          );
        })}

        {visibleGames.length === 0 && (
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

function getPhasePriorityTabs(phase) {
  if (phase === "offseason_resign") return ["HQ", "Contract Center", "Roster", "Free Agency", "Financials"];
  if (phase === "free_agency") return ["HQ", "Free Agency", "Trades", "Draft"];
  if (phase === "draft") return ["HQ", "Draft", "Mock Draft", "Transactions"];
  if (phase === "preseason") return ["HQ", "Roster Hub", "Depth Chart", "Training"];
  if (phase === "playoffs") return ["HQ", "Postseason", "Game Plan", "Injuries"];
  return ["HQ", "Game Plan", "Roster", "Transactions"];
}

export default function LeagueDashboard({
  league,
  lastResults = [],
  lastSimWeek = null,
  busy,
  simulating,
  actions,
  onAdvanceWeek,
  notifications = [],
  onDismissNotification,
  externalBoxScoreId,
  onConsumeExternalBoxScore,
  advanceLabel = "Advance",
  advanceDisabled = false,
}) {
  const [activeTab, setActiveTab] = useState("HQ");
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [lastGameTab, setLastGameTab] = useState("Schedule");
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [comparePlayerId, setComparePlayerId] = useState(null);
  const [tradeInitialView, setTradeInitialView] = useState("Finder");
  const [rosterInitialState, setRosterInitialState] = useState({ view: "table", filter: "ALL" });
  const [rosterInitialView, setRosterInitialView] = useState("table");
  const [statsInitialFamily, setStatsInitialFamily] = useState("passing");
  const [newsSubtab, setNewsSubtab] = useState("All");
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 767 : false));

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
    const normalized = normalizeDashboardTab(activeTab);
    if (TAB_ALIASES[normalized]) {
      setActiveTab(TAB_ALIASES[normalized]);
      return;
    }
    if (normalized !== activeTab) {
      setActiveTab(normalized);
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = league?.phase;

    if (league?.phase === "draft") {
      setActiveTab("Draft");
    } else if (prevPhase === "draft" && league?.phase === "preseason") {
      setActiveTab("HQ");
    } else if (league?.phase === "playoffs" && prevPhase !== "playoffs") {
      setActiveTab("Postseason");
    }
  }, [league?.phase]);

  // If an external box score request comes from the LiveGame scoreboard,
  // open the dedicated Game Detail screen and consume the request.
  useEffect(() => {
    if (!externalBoxScoreId) return;
    setLastGameTab(activeTab);
    setSelectedGameId(externalBoxScoreId);
    setActiveTab("Game Detail");
    onConsumeExternalBoxScore?.();
  }, [externalBoxScoreId, onConsumeExternalBoxScore, activeTab]);

  if (!league) {
    return (
      <div className="card" style={{ padding: "var(--space-5)", color: "var(--text-muted)" }}>
        Loading franchise dashboard…
      </div>
    );
  }
  const safeTeams = Array.isArray(league?.teams) ? league.teams : [];
  const safeLeague = { ...league, teams: safeTeams, week: Number(league?.week ?? 1) };
  const isInitialized = safeTeams.length > 0;

  // NOTE: a missing schedule only affects the Schedule tab.
  // Do NOT block the whole dashboard — all other tabs remain usable.

  const userTeam = safeTeams.find((t) => Number(t.id) === Number(league.userTeamId)) ?? safeTeams[0] ?? null;
  const userAbbr = userTeam?.abbr ?? "---";
  const userRecord = userTeam
    ? `${userTeam.wins}-${userTeam.losses}${userTeam.ties ? `-${userTeam.ties}` : ""}`
    : "0-0";

  const totalGames =
    safeTeams.reduce((s, t) => s + t.wins + t.losses + t.ties, 0) / 2;
  const avgScore = safeTeams.length
    ? Math.round(
        safeTeams.reduce((s, t) => s + t.ptsFor, 0) /
          Math.max(1, totalGames * 2),
      )
    : 0;
  const avgOvr = safeTeams.length
    ? Math.round(
        safeTeams.reduce((s, t) => s + t.ovr, 0) / safeTeams.length,
      )
    : 75;

  const cap = deriveTeamCapSnapshot(userTeam, { fallbackCapTotal: 255 });
  const capTotal = cap.capTotal;
  const capUsed = cap.capUsed;
  const deadCap = cap.deadCap;
  const capRoom = cap.capRoom;
  const ownerApproval = clampPercent(
    safeRound(league.ownerApproval ?? league.ownerMood, 0, null),
    null,
  );
  const ownerApprovalText = formatPercent(ownerApproval, "—");
  const pressure = deriveFranchisePressure(league);
  const shell = getAppShellContext(league);
  const teamSummaryNav = () => setActiveTab("Roster Hub");
  const openGameDetail = (gameId, sourceTab = activeTab) => {
    if (!gameId) return;
    setLastGameTab(sourceTab);
    setSelectedGameId(gameId);
    setActiveTab("Game Detail");
  };
  const activeSection = getShellSectionForDashboardTab(activeTab);
  const handleSectionChange = (sectionId) => {
    const normalizedSection = normalizeShellSectionId(sectionId);
    const group = NAV_GROUPS.find((entry) => entry.id === normalizedSection);
    const targetTab = group?.tabs?.find((tab) => TABS.includes(tab)) ?? "HQ";
    setActiveTab(targetTab);
  };

  return (
    <div>
      {/* ── Franchise shell status bar ── */}
      <div className="franchise-status-bar">
        <button
          type="button"
          className="team-summary-nav-card clickable-card"
          onClick={teamSummaryNav}
          aria-label={`Open ${userTeam?.name ?? "team"} hub`}
        >
          <TeamLogo abbr={userAbbr} size={40} isUser />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "var(--text-base)", color: "var(--text)", lineHeight: 1.1 }}>
              {userTeam?.name ?? "No Team Selected"}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 1 }}>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>{userRecord}</span>
              {userTeam && <span> · {userTeam.conf} {userTeam.div}</span>}
              {league.week && <span> · Week {league.week}</span>}
              {" · "}
              <span style={{ color: ownerApproval == null ? "var(--text-muted)" : ownerApproval >= 70 ? "var(--success)" : ownerApproval >= 50 ? "var(--warning)" : "var(--danger)" }}>
                Owner {pressure?.owner?.state ?? "Stable"} {ownerApprovalText}
              </span>
              {pressure?.fans?.state ? <span>{` · Fans ${pressure.fans.state}`}</span> : null}
              {pressure?.media?.state ? <span>{` · Media ${pressure.media.state}`}</span> : null}
            </div>
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", textAlign: "right" }}>
            <div style={{ fontWeight: 700, color: "var(--text-muted)" }}>{league.year ?? 2025}</div>
            <div style={{ textTransform: "capitalize" }}>{league.phase}</div>
          </div>
          <span className="clickable-card__chevron" aria-hidden="true">›</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <NotificationCenter
            notifications={notifications}
            onDismiss={onDismissNotification}
            onDismissAll={() => {
              notifications.forEach(n => onDismissNotification?.(n.id));
            }}
          />
        </div>
        <div className="franchise-status-bar__meta">
          <span><strong>{shell.teamAbbr}</strong> {shell.teamName}</span>
          <span>{shell.year}</span>
          <span>Week {shell.week}</span>
          <span style={{ textTransform: 'capitalize' }}>{shell.phase}</span>
          <span>Cap {shell.capSummary}</span>
        </div>
      </div>

      {/* ── Contextual Action Banners (compact) ── */}
      {activeTab !== "HQ" && league.phase === "offseason_resign" && (
        <div onClick={() => setActiveTab("Roster")} className="action-banner action-banner-success">
          ✍️ <strong>Expiring Contracts</strong> — review before Free Agency
        </div>
      )}
      {activeTab !== "HQ" && league.phase === "preseason" && (
        <div className="action-banner action-banner-warning">
          ⚠️ <strong>Roster Cutdown:</strong>{" "}
          <span style={{ color: (userTeam?.rosterCount ?? 0) > 53 ? "var(--danger)" : "var(--success)" }}>
            {userTeam?.rosterCount ?? 0}
          </span>
          {" "}/ 53 — must release {Math.max(0, (userTeam?.rosterCount ?? 0) - 53)} players
        </div>
      )}
      {activeTab !== "HQ" && league.phase === "playoffs" && activeTab !== "Postseason" && (
        <div onClick={() => setActiveTab("Postseason")} className="action-banner action-banner-gold">
          🏆 <strong>PLAYOFFS</strong> — click to view bracket
        </div>
      )}
      {activeTab !== "HQ" && league.phase === "draft" && activeTab !== "Draft" && (
        <div onClick={() => setActiveTab("Draft")} className="action-banner action-banner-accent">
          🏈 <strong>Draft Board is Open</strong> — click to make picks
        </div>
      )}

      {/* ── Status Grid — hidden during Draft to create a cleaner "War Room" view ── */}
      {activeTab !== "Home" && activeTab !== "HQ" && league.phase !== "draft" && <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-4)",
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
            {formatMoneyM(capRoom)}
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px' }}>
              <DonutChart data={[
                  { value: Math.max(0, capUsed - deadCap), color: "var(--accent)" },
                  { value: deadCap, color: "var(--danger)" },
                  { value: Math.max(0, capRoom), color: "var(--surface-strong)" }
              ]} size={36} strokeWidth={6} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--accent)" }}>Act: {formatMoneyM(Math.max(0, capUsed - deadCap))}</span>
                      {deadCap > 0 && <span style={{ color: "var(--danger)" }}>Ded: {formatMoneyM(deadCap)}</span>}
                  </div>
                  <div>Tot: {formatMoneyM(capTotal, "—", { digits: 0 })}</div>
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
            const toId = (value) =>
              Number(typeof value === "object" ? value?.id : value);
            const prevWeek = Number(lastSimWeek ?? ((league.week || 1) - 1));

            const teamById = {};
            safeTeams?.forEach((t) => {
              teamById[t.id] = t;
            });

            const authoritativeResults = Array.isArray(lastResults) ? lastResults : [];
            const userResult = authoritativeResults.find(
              (r) =>
                Number(r.homeId) === Number(league.userTeamId) ||
                Number(r.awayId) === Number(league.userTeamId),
            );

            if (userResult) {
              const homeId = Number(userResult.homeId);
              const awayId = Number(userResult.awayId);
              const isHome = homeId === league.userTeamId;
              const userScore = isHome
                ? userResult.homeScore
                : userResult.awayScore;
              const oppScore = isHome ? userResult.awayScore : userResult.homeScore;
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
                  {authoritativeResults.length > 1 && (
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
                      {authoritativeResults
                        .filter((g) => g !== userResult)
                        .slice(0, 6)
                        .map((g, i, arr) => {
                        const hId = toId(g.homeId);
                        const aId = toId(g.awayId);
                        const hA = teamById[hId]?.abbr ?? "?";
                        const aA = teamById[aId]?.abbr ?? "?";
                        const compactPresentation = buildCompletedGamePresentation(g, { seasonId: league.seasonId, week: prevWeek, source: "weekly_hub_compact_scores" });
                        const gId = compactPresentation.resolvedGameId;
                        const compactScoreTapHandler = createBoxScoreTapHandler({
                          gameId: gId,
                          onOpenBoxScore: () => openResolvedBoxScore(g, { seasonId: league.seasonId, week: prevWeek, source: "weekly_hub_compact_scores" }, (id) => openGameDetail(id, "Weekly Hub")),
                        });
                        return (
                          <React.Fragment key={i}>
                            {compactPresentation.canOpen ? (
                              <button
                                type="button"
                                className="compact-score-link"
                                onClick={compactScoreTapHandler}
                                aria-label={`Open box score for ${aA} at ${hA}`}
                                title={compactPresentation.ctaLabel}
                              >
                                {aA} {g.awayScore}-{g.homeScore} {hA}
                              </button>
                            ) : (
                              <span title={compactPresentation.statusLabel}>{aA} {g.awayScore}-{g.homeScore} {hA}</span>
                            )}
                            {i < arr.length - 1 ? " · " : ""}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            }

            if (authoritativeResults.length > 0) {
              const featured = buildLatestResultsSummary({ results: authoritativeResults, teamById });
              return (
                <>
                  <div className="stat-label">Last Game</div>
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Week {prevWeek} complete. No user matchup in latest results.
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 10,
                      color: "var(--text-subtle)",
                      lineHeight: 1.5,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {featured.join(" · ")}
                  </div>
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
                  No latest simulated results
                </div>
              </>
            );
          })()}
        </div>

      </div>}

      {/* ── Grouped Navigation ── */}
      {!isMobile && <div
        className="dashboard-main-tabs"
        style={{
          marginBottom: "var(--space-4)",
          display: "grid",
          gap: 8,
          position: "sticky",
          top: "calc(env(safe-area-inset-top) + 4px)",
          zIndex: 10,
          background: "var(--bg)",
          padding: "var(--space-2) var(--space-1) var(--space-3)",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <div className="standings-tabs" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
          {NAV_GROUPS.map((group) => (
            <button
              key={group.id}
              className={`standings-tab${activeSection === group.id ? " active" : ""}`}
              onClick={() => handleSectionChange(group.id)}
              aria-current={activeSection === group.id ? "page" : undefined}
              style={{ flexShrink: 0, fontWeight: 700 }}
            >
              {group.title}
            </button>
          ))}
        </div>
        <div className="standings-tabs" style={{ flexWrap: "nowrap", overflowX: "auto", gap: 6 }}>
          {(NAV_GROUPS.find((group) => group.id === activeSection)?.tabs ?? ["HQ"])
            .filter((tab) => TABS.includes(tab))
            .map((tab) => (
              <button
                key={tab}
                className={`standings-tab${activeTab === tab ? " active" : ""}`}
                onClick={() => setActiveTab(tab)}
                aria-current={activeTab === tab ? "page" : undefined}
                style={{ flexShrink: 0, fontSize: "11px", padding: "7px 10px" }}
              >
                {tab}
              </button>
            ))}
          </div>
      </div>}

      {/* ── Tab Content — each tab is independently error-bounded ── */}
      <div className="fade-in" key={activeTab}>
        {TEAM_FACING_TABS.has(activeTab) ? <FranchiseSummaryPanel league={league} compact className="" /> : null}
        {(activeTab === "HQ" || activeTab === "Weekly Hub" || activeTab === "Home") && (
          <TabErrorBoundary label="Franchise HQ">
              <FranchiseHQ
                league={safeLeague}
                onNavigate={(tab) => {
                  const destination = normalizeManagementDestination(tab);
                  if (destination.tradeView) {
                    setTradeInitialView(destination.tradeView);
                  }
                  if (destination.rosterState) {
                    setRosterInitialState(destination.rosterState);
                    setRosterInitialView(destination.rosterState.view);
                  }
                  if (destination.statsFamily) {
                    setStatsInitialFamily(destination.statsFamily);
                  }
                  setActiveTab(destination.tab && TABS.includes(destination.tab) ? destination.tab : "HQ");
                }}
                onAdvanceWeek={onAdvanceWeek}
                busy={busy}
                simulating={simulating}
                onOpenBoxScore={(gameId) => openGameDetail(gameId, "HQ")}
                onTeamSelect={setSelectedTeamId}
            />
            {league.phase !== "preseason" && (
              <div style={{ marginTop: "var(--space-4)" }}>
                <StatLeadersWidget onPlayerSelect={setSelectedPlayerId} actions={actions} />
              </div>
            )}
          </TabErrorBoundary>
        )}
        {activeTab === "Team" && (
          <TabErrorBoundary label="Team">
            <TeamHub
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onTeamSelect={setSelectedTeamId}
              onOpenGameDetail={openGameDetail}
              rosterInitialState={rosterInitialState}
              rosterInitialView={rosterInitialView}
              statsInitialFamily={statsInitialFamily}
              renderSchedule={(sourceTab = "Team") => (
                <ScheduleTab
                  schedule={league.schedule}
                  teams={league.teams}
                  currentWeek={league.week}
                  userTeamId={league.userTeamId}
                  nextGameStakes={league.nextGameStakes}
                  seasonId={league.seasonId}
                  onGameSelect={(gameId) => openGameDetail(gameId, sourceTab)}
                  playoffSeeds={league.playoffSeeds}
                  onTeamRoster={setSelectedTeamId}
                  league={league}
                  onPlayerSelect={setSelectedPlayerId}
                />
              )}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "League" && (
          <TabErrorBoundary label="League">
            <LeagueHub
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onTeamSelect={setSelectedTeamId}
              onOpenGameDetail={openGameDetail}
              renderSchedule={(sourceTab = "League") => (
                <ScheduleTab
                  schedule={league.schedule}
                  teams={league.teams}
                  currentWeek={league.week}
                  userTeamId={league.userTeamId}
                  nextGameStakes={league.nextGameStakes}
                  seasonId={league.seasonId}
                  onGameSelect={(gameId) => openGameDetail(gameId, sourceTab)}
                  playoffSeeds={league.playoffSeeds}
                  onTeamRoster={setSelectedTeamId}
                  league={league}
                  onPlayerSelect={setSelectedPlayerId}
                />
              )}
              renderStandings={() => (
                <StandingsTab
                  teams={league.teams}
                  userTeamId={league.userTeamId}
                  onTeamSelect={setSelectedTeamId}
                  leagueSettings={league.settings}
                />
              )}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "News" && (
          <TabErrorBoundary label="News">
            <SectionSubnav items={["All", "Team", "League", "Transactions"]} activeItem={newsSubtab} onChange={setNewsSubtab} />
            <NewsFeed
              league={league}
              mode="full"
              segment={newsSubtab.toLowerCase()}
              onTeamSelect={setSelectedTeamId}
              onPlayerSelect={setSelectedPlayerId}
              onOpenBoxScore={(gameId) => openGameDetail(gameId, "News")}
              onNavigate={setActiveTab}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Standings" && (
          <TabErrorBoundary label="Standings">
            <StandingsTab
              teams={league.teams}
              userTeamId={league.userTeamId}
              onTeamSelect={setSelectedTeamId}
              leagueSettings={league.settings}
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
              onGameSelect={(gameId) => openGameDetail(gameId, "Schedule")}
              playoffSeeds={league.playoffSeeds}
              onTeamRoster={(teamId) => {
                setSelectedTeamId(teamId);
              }}
              league={league}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Stats" && (
          <TabErrorBoundary label="Stats">
            <PlayerStats
              actions={actions}
              league={league}
              onPlayerSelect={setSelectedPlayerId}
              initialFamily={statsInitialFamily}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Leaders" && (
          <TabErrorBoundary label="Leaders">
            <Leaders
              onPlayerSelect={setSelectedPlayerId}
              userTeamId={league.userTeamId}
              actions={actions}
              onNavigate={setActiveTab}
              league={league}
            />
          </TabErrorBoundary>
        )}
        {isInitialized && activeTab === "League Leaders" && (
          <TabErrorBoundary label="League Leaders">
            <LeagueLeaders league={league} actions={actions} />
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
        {activeTab === "Game Plan" && (
          <TabErrorBoundary label="Game Plan">
            <GamePlanScreen league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Roster" && (
          <TabErrorBoundary label="Roster">
            <Roster
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              initialState={rosterInitialState}
              initialViewMode={rosterInitialView}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Depth Chart" && (
          <TabErrorBoundary label="Depth Chart">
            <DragAndDropDepthChart
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
        {activeTab === "Contract Center" && (
          <TabErrorBoundary label="Contract Center">
            <ContractCenter league={league} actions={actions} />
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
        {isInitialized && activeTab === "💰 Cap" && (
          <TabErrorBoundary label="Cap">
            <CapManager league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {isInitialized && activeTab === "🎓 Draft" && (
          <TabErrorBoundary label="Draft Big Board">
            <DraftBigBoard league={league} actions={actions} />
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
        {isInitialized && activeTab === "🎙️ Coaches" && (
          <TabErrorBoundary label="Coaching">
            <CoachingScreen league={league} actions={actions} />
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
              userTeamId={league.userTeamId}
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onNavigate={setActiveTab}
            />
          </TabErrorBoundary>
        )}
                {(activeTab === "Transactions" || activeTab === "Trades") && (
          <TabErrorBoundary label="Transactions">
            <TradeWorkspace league={league} actions={actions} onPlayerSelect={setSelectedPlayerId} initialView={tradeInitialView} />
          </TabErrorBoundary>
        )}
                {isInitialized && activeTab === "📰 News" && (
          <TabErrorBoundary label="News">
            <NewsFeed
              league={league}
              mode="full"
              onTeamSelect={setSelectedTeamId}
              onPlayerSelect={setSelectedPlayerId}
              onOpenBoxScore={(gameId) => openGameDetail(gameId, "News")}
              onNavigate={setActiveTab}
            />
          </TabErrorBoundary>
        )}

        {activeTab === "Game Detail" && (
          <TabErrorBoundary label="Game Detail">
            <GameDetailScreen
              gameId={selectedGameId}
              league={league}
              actions={actions}
              onBack={() => setActiveTab(lastGameTab || "Schedule")}
              onPlayerSelect={setSelectedPlayerId}
              onTeamSelect={setSelectedTeamId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "History Hub" && (
          <TabErrorBoundary label="History Hub">
            <HistoryHub onNavigate={setActiveTab} />
          </TabErrorBoundary>
        )}
        {activeTab === "History" && (
          <TabErrorBoundary label="History">
            <LeagueHistory
              onPlayerSelect={setSelectedPlayerId}
              actions={actions}
              league={league}
              onOpenBoxScore={(gameId) => openGameDetail(gameId, "History")}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Team History" && (
          <TabErrorBoundary label="Team History">
            <TeamHistoryScreen
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onBack={() => setActiveTab("History Hub")}
              teamId={selectedTeamId ?? league?.userTeamId}
              onOpenBoxScore={(gameId) => openGameDetail(gameId, "Team History")}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Hall of Fame" && (
          <TabErrorBoundary label="Hall of Fame">
            <HallOfFame onPlayerSelect={setSelectedPlayerId} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Awards & Records" && (
          <TabErrorBoundary label="Awards & Records">
            <AwardsRecordsScreen actions={actions} league={league} onPlayerSelect={setSelectedPlayerId} onBack={() => setActiveTab("History Hub")} />
          </TabErrorBoundary>
        )}
        {activeTab === "Postseason" && (
          <TabErrorBoundary label="Postseason">
            <PostseasonHub league={league} onOpenBoxScore={(gameId) => openGameDetail(gameId, "Postseason")} />
          </TabErrorBoundary>
        )}
        {activeTab === "Training" && (
          <TabErrorBoundary label="Training">
            <TrainingCamp
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Staff" && (
          <TabErrorBoundary label="Staff">
            <StaffManagement league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Saves" && (
          <TabErrorBoundary label="Saves">
            <SaveExportImport league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Mock Draft" && (
          <TabErrorBoundary label="Mock Draft">
            <MockDraft
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Injuries" && (
          <TabErrorBoundary label="Injuries">
            <InjuryReport
              league={league}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "God Mode" && (
          <TabErrorBoundary label="God Mode">
            <GodMode league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Analytics" && (
          <TabErrorBoundary label="Analytics">
            <AnalyticsHub
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onTeamSelect={setSelectedTeamId}
              onNavigate={setActiveTab}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Offseason" && (
          <TabErrorBoundary label="Offseason">
            <OffseasonHub league={league} onNavigate={setActiveTab} />
          </TabErrorBoundary>
        )}
        {activeTab === "Season Recap" && (
          <TabErrorBoundary label="Season Recap">
            <SeasonRecap
              league={league}
              onPlayerSelect={setSelectedPlayerId}
              onTeamSelect={setSelectedTeamId}
              onNavigate={setActiveTab}
              onOpenBoxScore={(gameId) => openGameDetail(gameId, "Season Recap")}
            />
          </TabErrorBoundary>
        )}
        {isInitialized && activeTab === "🤖 GM Advisor" && (
          <TabErrorBoundary label="GM Advisor">
            <GMAdvisor
              league={league}
              leagueState={league}
              currentSeason={league?.year}
              currentWeek={league?.week}
            />
          </TabErrorBoundary>
        )}
      </div>

      {/* ── Quick-Jump FAB (mobile) ── */}
      {!isMobile && <QuickJumpFab onNavigate={setActiveTab} />}

      {/* ── Mobile Navigation (bottom bar + slide-in) ── */}
      <MobileNav
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        onDestinationChange={(tab) => setActiveTab(tab)}
        onAdvance={onAdvanceWeek}
        advanceLabel={advanceLabel}
        advanceDisabled={advanceDisabled}
        league={league}
      />

      {/* ── Player Profile modal ── */}
      {selectedPlayerId && (
        <TabErrorBoundary label="Player Profile">
          <PlayerProfile
            playerId={selectedPlayerId}
            onClose={() => setSelectedPlayerId(null)}
            actions={actions}
            teams={league.teams}
            onNavigate={setActiveTab}
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
            actions={actions}
            onNavigate={setActiveTab}
          />
        </TabErrorBoundary>
      )}

      {/* ── Global utilities (always mounted, visually minimal) ── */}
      <GlossaryPopover />
      <OnboardingTour league={league} />

    </div>
  );
}
