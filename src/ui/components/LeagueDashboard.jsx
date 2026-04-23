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
import PlayerProfileModalBoundary from "./PlayerProfileModalBoundary.jsx";
import TeamProfile from "./TeamProfile.jsx";
import Leaders from "./Leaders.jsx";
import LeagueLeaders from "./LeagueLeaders.jsx";
import AwardRaces from "./AwardRaces.jsx";
import PlayerStats from "./PlayerStats.jsx";
import StrategyPanel from "./StrategyPanel.jsx";
import GamePlanScreen from "./GamePlanScreen.jsx";
import WeeklyPrepScreen from "./WeeklyPrepScreen.jsx";
import WeeklyResultsCenter from "./WeeklyResultsCenter.jsx";
import NewsFeed from "./NewsFeed.jsx";
import RecordBook from "./RecordBook.jsx";
import StatLeadersWidget from "./StatLeadersWidget.jsx";
import FinancialsView from "./FinancialsView.jsx";
import ContractCenter from "./ContractCenter.jsx";
import PostseasonHub from "./PostseasonHub.jsx";
import TrainingCamp from "./TrainingCamp.jsx";
import StaffManagement from "./StaffManagement.jsx";
import ModdingHub from "./ModdingHub.jsx";
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
import FranchiseStoryHub from "./FranchiseStoryHub.jsx";
import ScheduleCenter from "./ScheduleCenter.jsx";
import StandingsCenter from "./StandingsCenter.jsx";
import SectionSubnav from "./SectionSubnav.jsx";
import { buildLatestResultsSummary } from "../utils/lastResultSummary.js";
import { getAppShellContext } from "../utils/appShellContext.js";
import {
  clampPercent,
  deriveTeamCapSnapshot,
  formatMoneyM,
  formatPercent,
  safeRound,
} from "../utils/numberFormatting.js";
import { deriveFranchisePressure } from "../utils/pressureModel.js";
import { normalizeManagementDestination } from "../utils/managementScreenRouting.js";
import { safeGetLeagueState, getSafePhaseContext, getSafeStandingsRows } from "../../state/selectors.js";
import {
  SHELL_SECTIONS,
  getShellSectionForDashboardTab,
  normalizeDashboardTab,
  normalizeShellSectionId,
} from "../utils/shellNavigation.js";
import { usePhaseRouteHydration } from "../hooks/usePhaseRouteHydration.js";


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
    const fallbackTab = this.props.fallbackTab ?? "HQ";
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
        <button
          className="btn btn-secondary"
          style={{ marginLeft: "var(--space-2)" }}
          onClick={() => {
            this.setState({ hasError: false, error: null });
            this.props.onNavigate?.(fallbackTab);
          }}
        >
          Return to {fallbackTab}
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
  "Story",
  "Standings",
  "Schedule",
  "Weekly Results",
  "Stats",
  "Leaders",
  "League Leaders",
  "Award Races",
  "Analytics",
  "Weekly Prep",
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
  { id: SHELL_SECTIONS.team, title: "Team Management", tabs: ["Team", "Roster Hub", "Roster", "Depth Chart", "Weekly Prep", "Game Plan", "Training", "Injuries", "Staff", "Financials", "Contract Center", "💰 Cap"] },
  { id: SHELL_SECTIONS.league, title: "League Office", tabs: ["League", "Weekly Results", "Schedule", "Standings", "Stats", "League Leaders", "Transactions", "Free Agency", "Draft", "History Hub", "History", "Awards & Records", "Season Recap"] },
  { id: SHELL_SECTIONS.news, title: "News", tabs: ["News", "Story"] },
];

const NAV_TEST_IDS = {
  [SHELL_SECTIONS.hq]: "nav-hq",
  [SHELL_SECTIONS.team]: "nav-team",
  [SHELL_SECTIONS.league]: "nav-league",
  [SHELL_SECTIONS.news]: "nav-news",
};

const TEAM_FACING_TABS = new Set(["Roster", "Depth Chart", "Roster Hub", "Weekly Prep", "Game Plan", "Training", "Injuries", "Staff", "Financials", "Contract Center"]);
const HQ_QUICK_TABS = ['Roster Hub', 'Schedule', 'Standings', 'Staff'];

const TAB_ALIASES = {
  Trades: "Transactions",
};

const MOBILE_TAB_MAP = Object.freeze({
  "League Leaders": "league-leaders",
});

const REVERSE_TAB_MAP = Object.freeze(
  Object.fromEntries(Object.entries(MOBILE_TAB_MAP).map(([tab, slug]) => [slug, tab])),
);

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

function toTestId(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalizeMobileTab(tab) {
  if (!tab) return tab;
  return REVERSE_TAB_MAP[tab] ?? tab;
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

// Standings and schedule experiences now live in dedicated premium centers.

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
  if (phase === "playoffs") return ["HQ", "Postseason", "Weekly Prep", "Game Plan", "Injuries"];
  return ["HQ", "Weekly Prep", "Game Plan", "Roster", "Transactions"];
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
  const [tradeSeedPartnerId, setTradeSeedPartnerId] = useState(null);
  const [rosterInitialState, setRosterInitialState] = useState({ view: "table", filter: "ALL" });
  const [rosterInitialView, setRosterInitialView] = useState("table");
  const [statsInitialFamily, setStatsInitialFamily] = useState("passing");
  const [leagueInitialSection, setLeagueInitialSection] = useState("Overview");
  const [teamInitialSection, setTeamInitialSection] = useState("Overview");
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
  const safeLeague = safeGetLeagueState(league);
  const safeTeams = safeLeague.teams;
  const phaseContext = getSafePhaseContext(safeLeague);
  const safeStandingsRows = useMemo(() => getSafeStandingsRows(safeLeague), [safeLeague]);
  const isInitialized = safeTeams.length > 0;
  const standingsContext = phaseContext?.standingsContext ?? league?.standingsContext ?? null;
  usePhaseRouteHydration({ activeTab, league: safeLeague, actions });

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
                Owner {pressure?.owner?.state ?? "Stable"} {ownerApprovalText} {(ownerApproval != null && ownerApproval < 50) ? "(Seat Hot) ⚠️" : ""}
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
        <div className="franchise-status-pill-row">
          <span className="app-status-chip tone-team"><strong>{shell.teamAbbr}</strong></span>
          <span className="app-status-chip tone-league">Week {shell.week}</span>
          <span className="app-status-chip tone-info" style={{ textTransform: 'capitalize' }}>{shell.phase}</span>
          <span className="app-status-chip">Cap {shell.capSummary}</span>
        </div>
      </div>

      {/* ── Contextual Action Banners (compact) ── */}
      {activeTab !== "HQ" && phaseContext.phase === "offseason_resign" && (
        <div onClick={() => setActiveTab("Roster")} className="action-banner action-banner-success">
          ✍️ <strong>Expiring Contracts</strong> — review before Free Agency
        </div>
      )}
      {activeTab !== "HQ" && phaseContext.phase === "preseason" && (
        <div className="action-banner action-banner-warning">
          ⚠️ <strong>Roster Cutdown:</strong>{" "}
          <span style={{ color: (userTeam?.rosterCount ?? 0) > 53 ? "var(--danger)" : "var(--success)" }}>
            {userTeam?.rosterCount ?? 0}
          </span>
          {" "}/ 53 — must release {Math.max(0, (userTeam?.rosterCount ?? 0) - 53)} players
        </div>
      )}
      {activeTab !== "HQ" && phaseContext.phase === "playoffs" && activeTab !== "Postseason" && (
        <div onClick={() => setActiveTab("Postseason")} className="action-banner action-banner-gold">
          🏆 <strong>PLAYOFFS</strong> — click to view bracket
        </div>
      )}
      {activeTab !== "HQ" && phaseContext.phase === "draft" && activeTab !== "Draft" && (league?.draftLifecycleStatus === "draft_ready" || league?.draftLifecycleStatus === "draft_generated") && (
        <div onClick={() => setActiveTab("Draft")} className="action-banner action-banner-accent">
          🏈 <strong>Draft Board is Open</strong> — click to make picks
        </div>
      )}

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
              data-testid={NAV_TEST_IDS[group.id] ?? `primary-nav-${toTestId(group.title)}`}
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
          {(activeSection === SHELL_SECTIONS.hq ? HQ_QUICK_TABS : (NAV_GROUPS.find((group) => group.id === activeSection)?.tabs ?? ['HQ']))
            .filter((tab) => TABS.includes(tab))
            .map((tab) => (
              <button
                key={tab}
                data-testid={`section-tab-${toTestId(tab)}`}
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
          <TabErrorBoundary label="Franchise HQ" onNavigate={setActiveTab}>
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
                  if (destination.leagueSection) {
                    setLeagueInitialSection(destination.leagueSection);
                  }
                  if (destination.teamSection) {
                    setTeamInitialSection(destination.teamSection);
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
          <TabErrorBoundary label="Team" onNavigate={setActiveTab}>
            <TeamHub
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onTeamSelect={setSelectedTeamId}
              onOpenGameDetail={openGameDetail}
              onNavigate={setActiveTab}
              initialSection={teamInitialSection}
              rosterInitialState={rosterInitialState}
              rosterInitialView={rosterInitialView}
              statsInitialFamily={statsInitialFamily}
              renderSchedule={(sourceTab = "Team") => (
                <ScheduleCenter
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
          <TabErrorBoundary label="League" onNavigate={setActiveTab}>
            <LeagueHub
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onTeamSelect={setSelectedTeamId}
              onNavigateTrade={(teamId = null) => {
                setTradeInitialView("Finder");
                setTradeSeedPartnerId(teamId != null ? Number(teamId) : null);
                setActiveTab("Transactions");
              }}
              onOpenGameDetail={openGameDetail}
              initialSection={leagueInitialSection}
              renderSchedule={(sourceTab = "League") => (
                <ScheduleCenter
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
              renderResults={() => (
                <WeeklyResultsCenter
                  league={league}
                  initialWeek={league?.week}
                  onGameSelect={(gameId) => openGameDetail(gameId, "League")}
                />
              )}
              renderStandings={() => (
                <StandingsCenter
                  teams={safeStandingsRows}
                  userTeamId={league.userTeamId}
                  onTeamSelect={setSelectedTeamId}
                  leagueSettings={league.settings}
                  standingsContext={standingsContext}
                />
              )}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "News" && (
          <TabErrorBoundary label="News" onNavigate={setActiveTab}>
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
        {activeTab === "Story" && (
          <TabErrorBoundary label="Story" onNavigate={setActiveTab} fallbackTab="HQ">
            <FranchiseStoryHub league={league} />
          </TabErrorBoundary>
        )}
        {activeTab === "Standings" && (
          <TabErrorBoundary label="Standings" onNavigate={setActiveTab} fallbackTab="League">
            <StandingsCenter
              teams={safeStandingsRows}
              userTeamId={league.userTeamId}
              onTeamSelect={setSelectedTeamId}
              leagueSettings={league.settings}
              standingsContext={standingsContext}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Schedule" && (
          <TabErrorBoundary label="Schedule" onNavigate={setActiveTab}>
            <ScheduleCenter
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
        {activeTab === "Weekly Results" && (
          <TabErrorBoundary label="Weekly Results" onNavigate={setActiveTab} fallbackTab="League">
            <WeeklyResultsCenter
              league={league}
              initialWeek={league?.week}
              onGameSelect={(gameId) => openGameDetail(gameId, "Weekly Results")}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Stats" && (
          <TabErrorBoundary label="Stats" onNavigate={setActiveTab}>
            <PlayerStats
              actions={actions}
              league={league}
              onPlayerSelect={setSelectedPlayerId}
              initialFamily={statsInitialFamily}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Leaders" && (
          <TabErrorBoundary label="Leaders" onNavigate={setActiveTab}>
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
          <TabErrorBoundary label="League Leaders" onNavigate={setActiveTab} fallbackTab="League">
            <LeagueLeaders
              league={league}
              actions={actions}
              onPlayerSelect={(player) => setSelectedPlayerId(player?.id ?? player)}
              onNavigate={setActiveTab}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Award Races" && (
          <TabErrorBoundary label="Award Races" onNavigate={setActiveTab}>
            <AwardRaces
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Strategy" && (
          <TabErrorBoundary label="Strategy" onNavigate={setActiveTab}>
            <StrategyPanel league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Weekly Prep" && (
          <TabErrorBoundary label="Weekly Prep" onNavigate={setActiveTab}>
            <WeeklyPrepScreen league={league} onNavigate={setActiveTab} />
          </TabErrorBoundary>
        )}
        {activeTab === "Game Plan" && (
          <TabErrorBoundary label="Game Plan" onNavigate={setActiveTab}>
            <GamePlanScreen league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Roster" && (
          <TabErrorBoundary label="Roster" onNavigate={setActiveTab}>
            <Roster
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onNavigate={setActiveTab}
              initialState={rosterInitialState}
              initialViewMode={rosterInitialView}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Depth Chart" && (
          <TabErrorBoundary label="Depth Chart" onNavigate={setActiveTab}>
            <DragAndDropDepthChart
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onNavigate={setActiveTab}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Roster Hub" && (
          <TabErrorBoundary label="Roster Hub" onNavigate={setActiveTab}>
            <RosterHub
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
            />
          </TabErrorBoundary>
        )}
        {activeTab === "Financials" && (
          <TabErrorBoundary label="Financials" onNavigate={setActiveTab}>
            <FinancialsView league={league} actions={actions} />
          </TabErrorBoundary>
        )}
        {activeTab === "Contract Center" && (
          <TabErrorBoundary label="Contract Center" onNavigate={setActiveTab}>
            <ContractCenter league={league} actions={actions} onNavigate={setActiveTab} />
          </TabErrorBoundary>
        )}
        {activeTab === "Draft" && (
          <TabErrorBoundary label="Draft" onNavigate={setActiveTab} fallbackTab="League">
            <Draft
              league={league}
              actions={actions}
              onNavigate={setActiveTab}
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
            <DraftBigBoard league={league} actions={actions} onPlayerSelect={setSelectedPlayerId} onNavigate={setActiveTab} />
          </TabErrorBoundary>
        )}
        {activeTab === "Draft Room" && (
          <TabErrorBoundary label="Draft Room">
            <RookieDraft
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onNavigate={setActiveTab}
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
            <TradeWorkspace
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onNavigate={setActiveTab}
              initialView={tradeInitialView}
              initialPartnerTeamId={tradeSeedPartnerId}
            />
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
            <ModdingHub league={league} actions={actions} />
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
        activeTab={activeTab}
        onSectionChange={handleSectionChange}
        onDestinationChange={(tab) => setActiveTab(canonicalizeMobileTab(tab))}
        onAdvance={onAdvanceWeek}
        advanceLabel={advanceLabel}
        advanceDisabled={advanceDisabled}
        league={league}
      />

      {/* ── Player Profile modal ── */}
      {selectedPlayerId && (
        <TabErrorBoundary label="Player Profile">
          <PlayerProfileModalBoundary playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)}>
            <PlayerProfile
              playerId={selectedPlayerId}
              onClose={() => setSelectedPlayerId(null)}
              actions={actions}
              teams={league.teams}
              league={league}
              onNavigate={setActiveTab}
            />
          </PlayerProfileModalBoundary>
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
            league={league}
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
