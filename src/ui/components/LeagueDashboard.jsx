import React, { useState, useMemo, useEffect, Component } from "react";
import NotificationCenter from "./NotificationCenter.jsx";
import Roster from "./Roster.jsx";
import FranchiseHQ from "./FranchiseHQ.jsx";
import Draft from "./Draft.jsx";
import RookieDraft from "./RookieDraft.jsx";
import Coaches from "./Coaches.jsx";
import FreeAgency from "./FreeAgency.jsx";
import LeagueHistory from "./LeagueHistory.jsx";
import TeamHistoryScreen from "./TeamHistoryScreen.jsx";
import AwardsRecordsScreen from "./AwardsRecordsScreen.jsx";
import HallOfFame from "./HallOfFame.jsx";
import HistoryHub from "./HistoryHub.jsx";
import TradeWorkspace from "./TradeWorkspace.jsx";
import PlayerProfile from "./PlayerProfile.jsx";
import TeamProfile from "./TeamProfile.jsx";
import LeagueLeaders from "./LeagueLeaders.jsx";
import WeeklyResultsCenter from "./WeeklyResultsCenter.jsx";
import NewsFeed from "./NewsFeed.jsx";
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
import GameDetailScreen from "./GameDetailScreen.jsx";
import { deriveTeamCapSnapshot } from "../utils/numberFormatting.js";
import { safeGetLeagueState, getSafePhaseContext, getSafeStandingsRows } from "../../state/selectors.js";
import {
  SHELL_SECTIONS,
  getShellSectionForDashboardTab,
  normalizeShellSectionId,
} from "../utils/shellNavigation.js";
import { usePhaseRouteHydration } from "../hooks/usePhaseRouteHydration.js";


export function OvrPill({ ovr, size = "md" }) {
  const tone = ovr >= 90 ? "elite" : ovr >= 80 ? "great" : ovr >= 70 ? "good" : ovr >= 60 ? "average" : "poor";
  const colors = {
    elite: "#34C759",
    great: "#30D158",
    good: "#0A84FF",
    average: "#FF9F0A",
    poor: "#FF453A"
  };

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: colors[tone],
      color: "#fff",
      borderRadius: size === "lg" ? "8px" : "4px",
      fontSize: size === "lg" ? "14px" : "11px",
      fontWeight: 800,
      width: size === "lg" ? "36px" : "28px",
      height: size === "lg" ? "24px" : "18px",
    }}>
      {ovr}
    </span>
  );
}

// ── Error Boundary ─────────────────────────────────────────────────────────────

class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    const { label, fallbackTab = "HQ" } = this.props;
    if (this.state.hasError) {
      return (
        <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--danger)", background: "rgba(255,69,58,0.07)", borderRadius: "var(--radius-md)", border: "1px solid var(--danger)" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "var(--space-3)" }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: "var(--space-2)" }}>{label} encountered a render error</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-4)", fontFamily: "monospace" }}>
            {this.state.error?.message ?? String(this.state.error)}
          </div>
          <button className="btn" onClick={() => this.setState({ hasError: false, error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const NAV_GROUPS = [
  { id: SHELL_SECTIONS.hq, title: "HQ", tabs: ["HQ"] },
  { id: SHELL_SECTIONS.team, title: "Team", tabs: ["Team", "Roster", "Injuries"] },
  { id: SHELL_SECTIONS.league, title: "League", tabs: ["League", "Standings", "Weekly Results"] },
  { id: SHELL_SECTIONS.news, title: "News", tabs: ["News"] },
];

function canonicalizeMobileTab(tab) {
  if (tab === 'Trades') return 'Transactions';
  return tab;
}

export default function LeagueDashboard({
  league,
  actions,
  activeTab = "HQ",
  setActiveTab,
  onAdvanceWeek,
  advanceDisabled,
  advanceLabel,
  notifications = [],
  onDismissNotification,
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [lastGameTab, setLastGameTab] = useState(null);

  const safeLeague = safeGetLeagueState(league);
  const safeTeams = safeLeague.teams;

  usePhaseRouteHydration({ activeTab, league: safeLeague, actions });

  const userTeam = safeTeams.find((t) => Number(t.id) === Number(league.userTeamId)) ?? safeTeams[0] ?? null;
  const userRecord = userTeam ? `${userTeam.wins}-${userTeam.losses}${userTeam.ties ? "-" + userTeam.ties : ""}` : "0-0";

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
    const targetTab = group?.tabs?.[0] ?? "HQ";
    setActiveTab(targetTab);
  };

  return (
    <div className="app-shell">
      <header className="app-header-glass">
        <div className="status-bar-inner">
          <div className="status-bar-team">
            <div className="status-bar-info">
              <div className="status-bar-title">{userTeam?.name ?? "No Team"}</div>
              <div className="status-bar-subtitle">
                {userRecord} · Week {league.week} · {league.year}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationCenter
              notifications={notifications}
              onDismiss={onDismissNotification}
              onDismissAll={() => notifications.forEach(n => onDismissNotification?.(n.id))}
            />
          </div>
        </div>
      </header>

      <main className="view-enter" key={activeTab}>
        {activeTab === "HQ" && (
          <TabErrorBoundary label="HQ">
            <FranchiseHQ
              league={league}
              actions={actions}
              onNavigate={setActiveTab}
              onOpenBoxScore={openGameDetail}
              onAdvanceWeek={onAdvanceWeek}
              advanceDisabled={advanceDisabled}
              advanceLabel={advanceLabel}
            />
          </TabErrorBoundary>
        )}

        {activeTab === "Team" && (
          <TabErrorBoundary label="Team">
            <TeamHub
              league={league}
              actions={actions}
              onPlayerSelect={setSelectedPlayerId}
              onNavigate={setActiveTab}
            />
          </TabErrorBoundary>
        )}

        {activeTab === "League" && (
          <TabErrorBoundary label="League">
            <LeagueHub
              league={league}
              actions={actions}
              onOpenGameDetail={openGameDetail}
              onPlayerSelect={setSelectedPlayerId}
              renderStandings={() => actions.renderStandings()}
              renderResults={() => actions.renderWeeklyResults()}
            />
          </TabErrorBoundary>
        )}

        {activeTab === "News" && (
          <TabErrorBoundary label="News">
            <NewsFeed league={league} mode="full" onPlayerSelect={setSelectedPlayerId} onOpenBoxScore={openGameDetail} onNavigate={setActiveTab} />
          </TabErrorBoundary>
        )}

        {activeTab === "Game Detail" && (
          <TabErrorBoundary label="Game Detail">
            <GameDetailScreen gameId={selectedGameId} league={league} actions={actions} onBack={() => setActiveTab(lastGameTab || "HQ")} onPlayerSelect={setSelectedPlayerId} onTeamSelect={setSelectedTeamId} />
          </TabErrorBoundary>
        )}

        {/* Catch-all for other tabs */}
        {!["HQ", "Team", "League", "News", "Game Detail"].includes(activeTab) && (
          <TabErrorBoundary label={activeTab} onNavigate={setActiveTab}>
             {activeTab === "Roster" && <Roster league={league} actions={actions} onPlayerSelect={setSelectedPlayerId} onNavigate={setActiveTab} />}
             {activeTab === "Injuries" && <InjuryReport league={league} onPlayerSelect={setSelectedPlayerId} />}
             {activeTab === "Financials" && <FinancialsView league={league} actions={actions} />}
             {activeTab === "Contract Center" && <ContractCenter league={league} actions={actions} onNavigate={setActiveTab} />}
             {activeTab === "Free Agency" && <FreeAgency userTeamId={league.userTeamId} league={league} actions={actions} onPlayerSelect={setSelectedPlayerId} onNavigate={setActiveTab} />}
             {activeTab === "Transactions" && <TradeWorkspace league={league} actions={actions} onPlayerSelect={setSelectedPlayerId} onNavigate={setActiveTab} />}
             {activeTab === "Draft" && <Draft league={league} actions={actions} onNavigate={setActiveTab} onPlayerSelect={setSelectedPlayerId} />}
             {activeTab === "History Hub" && <HistoryHub onNavigate={setActiveTab} />}
             {activeTab === "History" && <LeagueHistory onPlayerSelect={setSelectedPlayerId} actions={actions} league={league} onOpenBoxScore={openGameDetail} />}
             {activeTab === "God Mode" && <GodMode league={league} actions={actions} />}
             {/* Add others as needed or let them render empty if not matched */}
          </TabErrorBoundary>
        )}
      </main>

      <MobileNav
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        onDestinationChange={(tab) => setActiveTab(canonicalizeMobileTab(tab))}
        onAdvance={onAdvanceWeek}
        advanceLabel={advanceLabel}
        advanceDisabled={advanceDisabled}
        league={league}
      />

      {selectedPlayerId && (
        <PlayerProfile playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} actions={actions} teams={league.teams} league={league} onNavigate={setActiveTab} />
      )}

      {selectedTeamId != null && (
        <TeamProfile teamId={selectedTeamId} onClose={() => setSelectedTeamId(null)} onPlayerSelect={setSelectedPlayerId} actions={actions} league={league} onNavigate={setActiveTab} />
      )}

      <GlossaryPopover />
      <OnboardingTour league={league} />
    </div>
  );
}