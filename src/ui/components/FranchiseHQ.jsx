import { summarizeRosterDevelopment } from "../utils/playerDevelopmentSignals.js";
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM } from "../utils/numberFormatting.js";
import { getHQViewModel } from "../../state/selectors.js";
import { buildCompletedGamePresentation, openResolvedBoxScore } from "../utils/boxScoreAccess.js";
import {
  EmptyState,
  StatusChip,
  HeroCard,
  ActionTile,
  StatStrip,
  SectionCard,
  CompactInsightCard,
  CompactListRow,
  SectionHeader,
} from "./ScreenSystem.jsx";
import { getRecentGames as getArchivedRecentGames } from "../../core/archive/gameArchive.ts";
import { autoBuildDepthChart, depthWarnings } from "../../core/depthChart.js";
import {
  getTeamStatusLine,
  getActionContext,
  getActionDestination,
  rankHqPriorityItems,
  getTeamSnapshotNotes,
} from "../utils/hqHelpers.js";
import { deriveWeeklyPrepState, markWeeklyPrepStep } from "../utils/weeklyPrep.js";

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatRecord(team) {
  if (!team) return "0-0";
  const ties = safeNum(team.ties);
  return `${safeNum(team.wins)}-${safeNum(team.losses)}${ties ? `-${ties}` : ""}`;
}

function getNextGame(league) {
  const weeks = league?.schedule?.weeks ?? [];
  for (const week of weeks) {
    for (const game of week?.games ?? []) {
      if (game?.played) continue;
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      if (homeId !== Number(league?.userTeamId) && awayId !== Number(league?.userTeamId)) continue;
      const isHome = homeId === Number(league?.userTeamId);
      const oppId = isHome ? awayId : homeId;
      const opp = (league?.teams ?? []).find((t) => Number(t?.id) === oppId);
      return { week: Number(week?.week ?? 1), isHome, opp, game };
    }
  }
  return null;
}

function getPrevGame(league) {
  const weeks = [...(league?.schedule?.weeks ?? [])].sort((a, b) => Number(b?.week ?? 0) - Number(a?.week ?? 0));
  for (const week of weeks) {
    const games = [...(week?.games ?? [])].reverse();
    for (const game of games) {
      if (!game?.played) continue;
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      if (homeId !== Number(league?.userTeamId) && awayId !== Number(league?.userTeamId)) continue;
      return { ...game, week: Number(week?.week ?? league?.week ?? 1), homeId, awayId };
    }
  }
  return null;
}

function getSeverityTone(level) {
  if (level === "urgent" || level === "blocker") return "danger";
  if (level === "recommended" || level === "warning" || level === "recommendation") return "warning";
  return "info";
}

export default function FranchiseHQ({ league, onNavigate, onOpenBoxScore, onAdvanceWeek, busy, simulating }) {
  const vm = useMemo(() => getHQViewModel(league), [league]);
  const [lineupToast, setLineupToast] = useState(null);
  const developmentSummary = useMemo(() => summarizeRosterDevelopment(vm.userTeam?.roster ?? [], new Map()), [vm.userTeam?.roster]);
  const weekly = useMemo(() => evaluateWeeklyContext(vm.league), [vm.league]);
  const prep = useMemo(() => deriveWeeklyPrepState(vm.league), [vm.league]);
  const nextGame = useMemo(() => getNextGame(vm.league), [vm.league]);
  const previousScheduledGame = useMemo(() => getPrevGame(vm.league), [vm.league]);
  const latestArchived = useMemo(() => getArchivedRecentGames(1)?.[0] ?? null, [vm.league?.seasonId, vm.league?.week]);

  if (!vm.userTeam) {
    return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  }

  const team = vm.userTeam;
  const cap = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const record = formatRecord(team);
  const statusLine = getTeamStatusLine(team, vm.league, weekly);
  const rankedPriorities = rankHqPriorityItems(team, vm.league, weekly, nextGame);

  const latestGamePresentation = latestArchived
    ? buildCompletedGamePresentation(
      {
        ...latestArchived,
        homeScore: latestArchived?.score?.home,
        awayScore: latestArchived?.score?.away,
      },
      { seasonId: vm.league?.seasonId, week: Number(latestArchived?.week ?? vm.league?.week ?? 1), source: "hq_last_game" },
    )
    : null;

  const fallbackLastGame = previousScheduledGame
    ? {
      id: previousScheduledGame?.id,
      homeAbbr: previousScheduledGame?.home?.abbr ?? "HOME",
      awayAbbr: previousScheduledGame?.away?.abbr ?? "AWAY",
      score: {
        home: safeNum(previousScheduledGame?.homeScore),
        away: safeNum(previousScheduledGame?.awayScore),
      },
      week: previousScheduledGame?.week,
      userWon:
          (previousScheduledGame?.homeId === Number(vm.league?.userTeamId)
            && safeNum(previousScheduledGame?.homeScore) > safeNum(previousScheduledGame?.awayScore))
          || (previousScheduledGame?.awayId === Number(vm.league?.userTeamId)
            && safeNum(previousScheduledGame?.awayScore) > safeNum(previousScheduledGame?.homeScore)),
    }
    : null;

  const lastGame = latestArchived ?? fallbackLastGame;
  const recapCtaLabel = latestGamePresentation?.canOpen
    ? (latestGamePresentation?.ctaLabel?.toLowerCase().includes("tactical") ? "Tactical Recap" : "Box Score")
    : "View Result";

  const handleSetLineup = () => {
    const roster = Array.isArray(team?.roster) ? team.roster : [];
    const existingAssignments = {};
    for (const player of roster) {
      const rowKey = player?.depthChart?.rowKey;
      if (!rowKey) continue;
      if (!existingAssignments[rowKey]) existingAssignments[rowKey] = [];
      existingAssignments[rowKey].push(player.id);
    }
    const assignments = autoBuildDepthChart(roster, existingAssignments);
    const warnings = depthWarnings(assignments, roster);
    const hasBlockingLineupIssue = warnings.some((warning) => warning.level === "error");
    if (!hasBlockingLineupIssue) markWeeklyPrepStep(vm.league, "lineupChecked", true);
    setLineupToast(hasBlockingLineupIssue ? "Depth chart still has missing starters." : "Lineup is valid. Opening depth chart.");
    window.setTimeout(() => setLineupToast(null), 2200);
    onNavigate?.("Team:Roster / Depth");
  };

  const commandCenterActions = [
    { label: "Set Lineup", type: "lineup", onClick: handleSetLineup },
    { label: "Game Plan", type: "gameplan", onClick: () => { markWeeklyPrepStep(vm.league, "planReviewed", true); onNavigate?.(getActionDestination("gameplan", nextGame)); } },
    { label: "Scout Opponent", type: "opponent", onClick: () => { markWeeklyPrepStep(vm.league, "opponentScouted", true); onNavigate?.(getActionDestination("opponent", nextGame)); } },
    { label: "News & Injuries", type: "news", onClick: () => { markWeeklyPrepStep(vm.league, "injuriesReviewed", true); onNavigate?.(getActionDestination("news", nextGame)); } },
  ].map((a) => ({ ...a, context: getActionContext(a.type, weekly, nextGame) }));

  const previewPriorities = [rankedPriorities.featured, ...(rankedPriorities.secondary ?? [])].filter(Boolean).slice(0, 3);

  const ownerApproval = safeNum(weekly?.pressurePoints?.ownerApproval ?? vm.league?.ownerApproval ?? vm.league?.ownerMood, null);
  const expiringCount = safeNum(weekly?.pressurePoints?.expiringCount);
  const rosterCount = Array.isArray(team?.roster) ? team.roster.length : safeNum(team?.rosterCount, 0);
  const snapshotNotes = getTeamSnapshotNotes(team, weekly, cap.capRoom);
  const nextDecision = rankedPriorities.featured ?? null;
  const topNeedRows = previewPriorities.filter((item) => String(item?.tab ?? "").toLowerCase().includes("team")).slice(0, 3);
  const injuryRows = (team?.roster ?? [])
    .filter((player) => safeNum(player?.injury?.gamesRemaining ?? player?.injuryWeeksRemaining, 0) > 0)
    .sort((a, b) => safeNum(b?.ovr, 0) - safeNum(a?.ovr, 0))
    .slice(0, 3);

  return (
    <div className="app-screen-stack franchise-hq">
      <HeroCard
        eyebrow={`${league?.year ?? "Season"} · Week ${league?.week ?? 1} · ${String(league?.phase ?? "regular").replaceAll("_", " ")}`}
        title={`${team?.city ?? ""} ${team?.name ?? "Team"}`}
        subtitle={`${record} · ${nextGame ? `${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.name ?? "TBD"} (${formatRecord(nextGame.opp)})` : "No upcoming opponent"}`}
        rightMeta={<StatusChip label={statusLine} tone="team" />}
        actions={(
          <>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Weekly Prep")}>Prepare Game</Button>
            <Button size="sm" className="app-advance-btn" onClick={onAdvanceWeek} disabled={busy || simulating}>{busy || simulating ? "Working…" : "Advance Week"}</Button>
          </>
        )}
      >
        <div className="app-hero-summary-grid">
          <div>
            <span>Last result</span>
            <strong>
              {lastGame
                ? `${lastGame.userWon ? "W" : "L"} · ${lastGame.awayAbbr} ${safeNum(lastGame?.score?.away)} @ ${lastGame.homeAbbr} ${safeNum(lastGame?.score?.home)}`
                : "No completed game yet"}
            </strong>
          </div>
          <div>
            <span>Prep status</span>
            <strong>{prep?.readinessLabel ?? "Prep status unavailable"}</strong>
          </div>
        </div>
      </HeroCard>

      <div className="app-action-grid-2x2">
        {commandCenterActions.map((action) => (
          <ActionTile key={action.label} title={action.label} subtitle={action.context} onClick={action.onClick} tone="info" />
        ))}
      </div>
      {lineupToast ? <p className="app-inline-toast">{lineupToast}</p> : null}

      <SectionCard title="Next Action" subtitle="Your highest-priority decision this week." variant="compact">
        {nextDecision ? (
          <CompactListRow
            title={nextDecision.label}
            subtitle={nextDecision.detail}
            meta={<StatusChip label={nextDecision.level === "urgent" ? "Urgent" : "Recommended"} tone={getSeverityTone(nextDecision.level)} />}
          >
            <Button size="sm" onClick={() => onNavigate?.(nextDecision?.tab ?? "Team")}>{nextDecision.verb ?? "Open task"}</Button>
          </CompactListRow>
        ) : (
          <CompactInsightCard title="No urgent blockers" subtitle="Use this week to gain edges in prep and depth." tone="info" ctaLabel="Open Team" onCta={() => onNavigate?.("Team:Overview")} />
        )}
      </SectionCard>
      {developmentSummary.rising.length > 0 && (
        <SectionCard title="Development Outlook" subtitle="Risers and breakout candidates." variant="compact">
          <div className="app-priority-rail">
            {developmentSummary.rising.slice(0, 2).map((p) => (
              <CompactInsightCard
                key={p.id}
                title={p.name}
                subtitle={`${p.pos} · Rising trend · OVR ${p.ovr}`}
                tone="ok"
                ctaLabel="Profile"
                onCta={() => onNavigate?.("Team:Development")}
              />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionHeader eyebrow="Team status" title="Command Snapshot" subtitle="Core team state in one pass." />
      <StatStrip items={[
        { label: "OVR", value: `${safeNum(team?.ovr, 0)}`, tone: "team" },
        { label: "Cap Room", value: formatMoneyM(cap.capRoom), tone: cap.capRoom < 10 ? "warning" : "ok" },
        { label: "Roster", value: `${rosterCount}/53`, tone: rosterCount > 53 ? "danger" : "neutral" },
        { label: "Expiring", value: `${expiringCount}`, tone: expiringCount >= 8 ? "warning" : "neutral" },
      ]} />

      <SectionCard title="Team Health Snapshot" subtitle="Current injuries and availability impact." variant="compact">
        <div className="app-row-stack">
          {injuryRows.length === 0 ? (
            <CompactInsightCard title="No active injuries" subtitle="Primary rotation is currently available." tone="ok" />
          ) : injuryRows.map((player) => (
            <CompactListRow
              key={player.id}
              title={`${player.name} · ${player.pos}`}
              subtitle={`${safeNum(player?.injury?.gamesRemaining ?? player?.injuryWeeksRemaining, 0)} game(s) out`}
              meta={<StatusChip label="Unavailable" tone="warning" />}
            >
              <Button size="sm" variant="ghost" onClick={() => onNavigate?.("Team:Injuries")}>Injury report</Button>
            </CompactListRow>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Latest Game Result" subtitle="Open full recap and box score." variant="compact">
        {lastGame ? (
          <CompactListRow
            title={`${lastGame.userWon ? "Win" : "Loss"} · Week ${lastGame.week ?? vm.league?.week ?? 1}`}
            subtitle={`${lastGame.awayAbbr} ${safeNum(lastGame?.score?.away)} @ ${lastGame.homeAbbr} ${safeNum(lastGame?.score?.home)}`}
            meta={<StatusChip label="Recap" tone="league" />}
          >
            <Button
              size="sm"
              variant="outline"
              onClick={() => openResolvedBoxScore(
                {
                  ...latestArchived,
                  id: latestArchived?.id ?? lastGame?.id,
                  week: latestArchived?.week ?? lastGame?.week,
                  homeScore: latestArchived?.score?.home ?? lastGame?.score?.home,
                  awayScore: latestArchived?.score?.away ?? lastGame?.score?.away,
                },
                { seasonId: vm.league?.seasonId, week: Number(latestArchived?.week ?? lastGame?.week ?? vm.league?.week ?? 1), source: "hq_last_game" },
                onOpenBoxScore,
              )}
              disabled={latestArchived ? !latestGamePresentation?.canOpen : false}
            >
              {recapCtaLabel}
            </Button>
          </CompactListRow>
        ) : (
          <CompactInsightCard title="No final yet" subtitle="Play your next game to unlock full recap context." tone="info" ctaLabel="Open Schedule" onCta={() => onNavigate?.("Schedule")} />
        )}
      </SectionCard>

      <SectionCard title="Cap & Contracts Snapshot" subtitle="Financial pressure and expiration risk." variant="compact">
        <div className="app-priority-rail">
          <CompactInsightCard title={formatMoneyM(cap.capRoom)} subtitle={snapshotNotes.capNote} tone={cap.capRoom < 5 ? "warning" : "ok"} ctaLabel="Open cap" onCta={() => onNavigate?.("💰 Cap")} />
          <CompactInsightCard title={`${expiringCount} expiring`} subtitle={snapshotNotes.expiringNote} tone={expiringCount >= 6 ? "warning" : "info"} ctaLabel="Contracts" onCta={() => onNavigate?.("Team:Contracts")} />
        </div>
      </SectionCard>

      <SectionCard title="Top Roster Needs" subtitle="Where depth or planning work should happen next." variant="compact">
        <div className="app-priority-rail">
          {topNeedRows.length > 0 ? topNeedRows.map((item, idx) => (
            <CompactInsightCard
              key={`${item.label}-${idx}`}
              title={item.label}
              subtitle={item.detail}
              tone={getSeverityTone(item.level)}
              ctaLabel={item.verb || "Open"}
              onCta={() => onNavigate?.(item?.tab ?? "Team")}
            />
          )) : (
            <CompactInsightCard title={snapshotNotes.rosterNote} subtitle="No high-priority roster alarms this week." tone="ok" ctaLabel="Roster / Depth" onCta={() => onNavigate?.("Team:Roster / Depth")} />
          )}
        </div>
      </SectionCard>

      <section className="app-teaser-strip card">
        <CompactListRow title="Team View" subtitle="Roster, depth chart, contracts, and injuries." meta={<StatusChip label="Team" tone="team" />}>
          <Button size="sm" variant="ghost" onClick={() => onNavigate?.("Team:Overview")}>Open Team Hub</Button>
        </CompactListRow>
        <CompactListRow title="League View" subtitle="Standings, weekly scores, and spotlight games." meta={<StatusChip label="League" tone="league" />}>
          <Button size="sm" variant="ghost" onClick={() => onNavigate?.("League:Results")}>Open Results</Button>
        </CompactListRow>
        <CompactListRow title="Recent Team / League News" subtitle={ownerApproval == null ? "Approval unavailable" : `Owner approval ${ownerApproval}`} meta={<StatusChip label="News" tone={ownerApproval != null && ownerApproval < 55 ? "warning" : "info"} />}>
          <Button size="sm" variant="ghost" onClick={() => onNavigate?.("🤖 GM Advisor")}>Open Advisor</Button>
        </CompactListRow>
      </section>
    </div>
  );
}
