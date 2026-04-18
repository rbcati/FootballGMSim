import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  HeroCard,
  SectionCard,
  ActionTile,
  StatStrip,
  StatPill,
  PriorityRail,
  PriorityItem,
  ScreenHeader
} from "./ScreenSystem.jsx";
import { deriveTeamCapSnapshot, formatMoneyM } from "../utils/numberFormatting.js";
import { getHQViewModel } from "../../state/selectors.js";
import { buildCompletedGamePresentation, openResolvedBoxScore } from "../utils/boxScoreAccess.js";
import { getRecentGames as getArchivedRecentGames } from "../../core/archive/gameArchive.ts";
import {
  getTeamStatusLine,
  getActionDestination,
  rankHqPriorityItems,
  getTeamSnapshotNotes,
} from "../utils/hqHelpers.js";

function safeNum(value, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

const formatRecord = (t) => `${t?.wins ?? 0}-${t?.losses ?? 0}${t?.ties ? `-${t.ties}` : ""}`;

export default function FranchiseHQ({
  league: vm,
  actions,
  onNavigate,
  onOpenBoxScore,
  onAdvanceWeek,
  advanceDisabled,
  advanceLabel,
}) {
  const { team, weekly, priorityItems } = useMemo(() => getHQViewModel(vm), [vm]);

  const cap = useMemo(() => deriveTeamCapSnapshot(team), [team]);
  const snapshotNotes = useMemo(() => getTeamSnapshotNotes(team, weekly, cap), [team, weekly, cap]);
  const rankedPriorities = useMemo(() => rankHqPriorityItems(priorityItems), [priorityItems]);

  const recentArchived = useMemo(() => getArchivedRecentGames(vm), [vm]);
  const latestArchived = recentArchived?.[0];

  const lastGame = vm.userResults?.[0];
  const latestGamePresentation = useMemo(
    () => (lastGame && team?.id ? buildCompletedGamePresentation(lastGame, team.id) : null),
    [lastGame, team?.id]
  );

  const nextGame = vm.userSchedule?.find((g) => !g.isFinished);

  const heroEyebrow = `${vm.year} · Week ${vm.week} · ${vm.phase}`;
  const heroTitle = `${team?.city} ${team?.name} (${formatRecord(team)})`;

  const lastResultLine = latestGamePresentation
    ? `Last: ${latestGamePresentation.userWon ? "W" : "L"} ${latestGamePresentation.scoreLine}`
    : "Season Kickoff";

  const nextOpponentLine = nextGame
    ? `Next: ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.abbr ?? nextGame.opp?.name} (${formatRecord(nextGame.opp)})`
    : "No game scheduled";

  const heroSubtitle = `${nextOpponentLine}  •  ${lastResultLine}`;

  const getSeverityTone = (level) => {
    if (level === "blocker") return "danger";
    if (level === "warning") return "warning";
    return "info";
  };

  return (
    <div className="app-screen-stack franchise-hq">
      <HeroCard
        eyebrow={heroEyebrow}
        title={heroTitle}
        subtitle={heroSubtitle}
        footer={
          <>
            <Button
              className="flex-1"
              onClick={onAdvanceWeek}
              disabled={advanceDisabled}
            >
              {advanceLabel || "Advance Week"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onNavigate?.("Weekly Prep")}
            >
              Prepare Game
            </Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
        <ActionTile
          label="Set Lineup"
          sublabel="Depth Chart"
          icon="📋"
          onClick={() => onNavigate?.("Roster")}
        />
        <ActionTile
          label="Game Plan"
          sublabel="Strategy"
          icon="🎯"
          onClick={() => onNavigate?.("Weekly Prep")}
        />
        <ActionTile
          label="Scout Opp"
          sublabel="Matchup"
          icon="🔭"
          onClick={() => onNavigate?.(getActionDestination("opponent", nextGame))}
        />
        <ActionTile
          label="News & Inj"
          sublabel="League Pulse"
          icon="🗞️"
          onClick={() => onNavigate?.("News")}
        />
      </div>

      <SectionCard
        title="Priority Queue"
        subtitle="Critical calls and blockers"
        variant="compact"
      >
        <PriorityRail>
          {rankedPriorities.length > 0 ? (
            rankedPriorities.slice(0, 3).map((item, idx) => (
              <PriorityItem
                key={`priority-${idx}`}
                label={item.label}
                detail={item.detail}
                tone={getSeverityTone(item.level)}
                actionLabel={item.verb || "Review"}
                onAction={() => onNavigate?.(item.tab || "Team")}
              />
            ))
          ) : (
            <PriorityItem
              label="No urgent blockers"
              detail="Team operations are stable for this week."
              tone="info"
              actionLabel="Financials"
              onAction={() => onNavigate?.("Financials")}
            />
          )}
        </PriorityRail>
      </SectionCard>

      <SectionCard
        title="Team Snapshot"
        variant="compact"
      >
        <StatStrip>
          <StatPill
            label="OVR"
            value={`${safeNum(team?.ovr, 0)}`}
            note={snapshotNotes.ovrNote}
          />
          <StatPill
            label="Cap Room"
            value={formatMoneyM(cap.capRoom)}
            note={snapshotNotes.capNote}
            tone={cap.capRoom < 0 ? "danger" : cap.capRoom < 5 ? "warning" : "neutral"}
          />
          <StatPill
            label="Roster"
            value={`${(team?.roster ?? []).length} active`}
            note={snapshotNotes.rosterNote}
          />
          <StatPill
            label="Expiring"
            value={`${safeNum(weekly?.pressurePoints?.expiringCount)}`}
            note={snapshotNotes.expiringNote}
            tone={weekly?.pressurePoints?.expiringCount > 5 ? "warning" : "neutral"}
          />
        </StatStrip>
      </SectionCard>

      <SectionCard title="League Pulse" variant="compact">
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
           <button
            className="btn btn-ghost w-full justify-between"
            onClick={() => onNavigate?.("League:Results")}
            style={{ padding: "10px 12px", textAlign: "left" }}
           >
             <div style={{ display: "grid", gap: 2 }}>
               <div style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>Weekly League Results</div>
               <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Scores and race center</div>
             </div>
             <span>→</span>
           </button>
           <button
            className="btn btn-ghost w-full justify-between"
            onClick={() => onNavigate?.("League:Leaders")}
            style={{ padding: "10px 12px", textAlign: "left" }}
           >
             <div style={{ display: "grid", gap: 2 }}>
               <div style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>League Leaders</div>
               <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Player and team stats</div>
             </div>
             <span>→</span>
           </button>
        </div>
      </SectionCard>
    </div>
  );
}
