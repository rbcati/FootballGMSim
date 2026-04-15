import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM } from "../utils/numberFormatting.js";
import { getHQViewModel } from "../../state/selectors.js";
import { buildCompletedGamePresentation } from "../utils/boxScoreAccess.js";
import { EmptyState, SectionCard, StatCard } from "./common/UiPrimitives.jsx";
import { LinkedGameSummaryCard } from "./common/GameResultCards.jsx";
import { CtaRow, CompactListRow, StatusChip } from "./ScreenSystem.jsx";
import { getRecentGames as getArchivedRecentGames } from "../../core/archive/gameArchive.ts";
import { autoBuildDepthChart, depthWarnings } from "../../core/depthChart.js";

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

function toneAccent(tone) {
  if (tone === "danger") return "var(--danger)";
  if (tone === "warning") return "var(--warning)";
  return "var(--accent)";
}

export default function FranchiseHQ({ league, onNavigate, onOpenBoxScore, onTeamSelect, onAdvanceWeek, busy, simulating }) {
  const vm = useMemo(() => getHQViewModel(league), [league]);
  const [lineupToast, setLineupToast] = useState(null);
  const weekly = useMemo(() => evaluateWeeklyContext(vm.league), [vm.league]);
  const nextGame = useMemo(() => getNextGame(vm.league), [vm.league]);
  const latestArchived = useMemo(() => getArchivedRecentGames(1)?.[0] ?? null, [vm.league?.seasonId, vm.league?.week]);

  if (!vm.userTeam) {
    return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  }

  const team = vm.userTeam;
  const cap = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const record = formatRecord(team);
  const urgentItems = (weekly?.urgentItems ?? []).slice(0, 6);
  const pressureSummary = `Owner ${weekly?.pressure?.owner?.state ?? "Stable"} · Fans ${weekly?.pressure?.fans?.state ?? "Steady"} · Media ${weekly?.pressure?.media?.state ?? "Steady"}`;
  const teamDevelopments = (vm.league?.newsItems ?? [])
    .filter((item) => item?.teamId == null || Number(item?.teamId) === Number(vm.league?.userTeamId))
    .slice(0, 2);
  const scheduleWeeks = vm.league?.schedule?.weeks ?? [];
  const remainingRegularSeasonGames = scheduleWeeks
    .flatMap((w) => w?.games ?? [])
    .filter((game) => {
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      const involvesUser = homeId === Number(vm.league?.userTeamId) || awayId === Number(vm.league?.userTeamId);
      return involvesUser && !game?.played;
    }).length;
  const phasePriorityQueue = useMemo(() => {
    const queue = [...urgentItems];
    if (vm.league?.phase === "preseason" && (team?.roster?.length ?? 0) > 53) {
      queue.unshift({
        label: "Roster cutdown required",
        detail: `${team.roster.length} players on roster — trim to regular-season limits.`,
        tab: "Roster",
        tone: "danger",
      });
    }
    if (vm.league?.phase === "regular" && remainingRegularSeasonGames <= 3) {
      queue.unshift({
        label: "Trade window is closing",
        detail: `${remainingRegularSeasonGames} regular-season game${remainingRegularSeasonGames === 1 ? "" : "s"} left. Resolve pending market moves now.`,
        tab: "Transactions",
        tone: "warning",
      });
    }
    return queue.slice(0, 5);
  }, [urgentItems, vm.league?.phase, team?.roster?.length, remainingRegularSeasonGames]);
  const latestGamePresentation = latestArchived
    ? buildCompletedGamePresentation({
      ...latestArchived,
      homeScore: latestArchived?.score?.home,
      awayScore: latestArchived?.score?.away,
    }, { seasonId: vm.league?.seasonId, week: Number(latestArchived?.week ?? vm.league?.week ?? 1), source: "hq_last_game" })
    : null;
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
    setLineupToast(hasBlockingLineupIssue
      ? "Depth chart still has missing starters. Fix red-warning rows to finalize lineup."
      : "Lineup is valid. Opening depth chart.");
    window.setTimeout(() => setLineupToast(null), 2200);
    onNavigate?.("Roster:depth|ALL");
  };

  return (
    <div className="app-screen-stack franchise-hq" style={{ display: "grid", gap: "var(--space-3)" }}>
      <SectionCard title="This Week" actions={<StatusChip label={vm.league?.phase ?? "season"} tone="league" />}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{vm.league?.year} · Week {vm.league?.week ?? 1} · {vm.league?.phase ?? "regular"}</div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>{record} · {team?.conf ?? ""} {team?.div ?? ""}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{pressureSummary}</div>
          <CtaRow actions={[
            { label: busy || simulating ? "Working…" : "Advance Week", onClick: onAdvanceWeek, disabled: busy || simulating },
            { label: "Set lineup", onClick: handleSetLineup, compact: true },
            { label: "Game plan", onClick: () => onNavigate?.("Game Plan"), compact: true },
            { label: "Schedule", onClick: () => onNavigate?.("Schedule"), compact: true },
            { label: "Open news", onClick: () => onNavigate?.("News"), compact: true },
          ]} />
        </div>
      </SectionCard>

      <SectionCard title="Priority Queue" subtitle="Only the highest-impact franchise actions for this week." actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("Team")}>Open Team</Button>}>
        {phasePriorityQueue.length === 0 ? <div style={{ color: "var(--text-muted)" }}>No immediate blockers.</div> : (
          <div style={{ display: "grid", gap: 8 }}>
            {phasePriorityQueue.map((item) => (
              <CompactListRow
                key={`${item.label}-${item.tab}`}
                title={item.label}
                subtitle={item.detail}
                meta={<StatusChip label={item.tone ?? "info"} tone={item.tone === "danger" ? "warning" : "league"} />}
              >
                <button className="btn btn-sm" onClick={() => onNavigate?.(item?.tab ?? "Team")}>Open</button>
              </CompactListRow>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Next Game" actions={nextGame ? <StatusChip label={`Week ${nextGame.week}`} tone="team" /> : null}>
        {nextGame ? (
          <div style={{ display: "grid", gap: 8 }}>
            <LinkedGameSummaryCard
              label="Upcoming"
              title={`Week ${nextGame.week} · ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.abbr ?? "TBD"}`}
              subtitle="Open game"
              disabled
            />
            {lineupToast ? <div style={{ fontSize: "var(--text-xs)", color: "var(--accent)" }}>{lineupToast}</div> : null}
          </div>
        ) : <div style={{ color: "var(--text-muted)" }}>No upcoming game found.</div>}
      </SectionCard>

      <SectionCard title="Last Game">
        {!latestArchived ? <div style={{ color: "var(--text-muted)" }}>No completed game yet.</div> : (
          <LinkedGameSummaryCard
            label={`Week ${latestArchived?.week ?? vm.league?.week} final`}
            title={`${latestArchived?.awayAbbr} ${latestArchived?.score?.away} @ ${latestArchived?.homeAbbr} ${latestArchived?.score?.home}`}
            subtitle={latestGamePresentation?.canOpen ? "Open box score" : "View result unavailable"}
            onOpen={() => onOpenBoxScore?.(latestArchived?.id)}
            disabled={!latestGamePresentation?.canOpen}
          />
        )}
      </SectionCard>

      <SectionCard title="Team Snapshot" subtitle="Quick health and cap context. Open Team for full management tools.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <StatCard label="OVR / OFF / DEF" value={`${safeNum(team?.ovr, 0)} / ${safeNum(team?.offenseRating, team?.offRating)} / ${safeNum(team?.defenseRating, team?.defRating)}`} />
          <StatCard label="Cap Room" value={formatMoneyM(cap.capRoom)} note={`Used ${formatMoneyM(cap.capUsed)}`} />
          <StatCard label="Roster" value={`${(team?.roster ?? []).length} players`} note={`${safeNum(weekly?.pressurePoints?.injuriesCount)} injured`} />
          <StatCard label="Expiring Deals" value={`${safeNum(weekly?.pressurePoints?.expiringCount)} players`} note="Review before FA window" />
        </div>
      </SectionCard>

      <SectionCard title="News Desk Preview" subtitle="Recent stories tied to your team and league context." actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("News")}>Open News</Button>}>
        <div style={{ display: "grid", gap: 8 }}>
          {teamDevelopments.map((item, idx) => (
            <CompactListRow
              key={item?.id ?? `preview-${idx}`}
              title={item?.headline ?? "League update"}
              subtitle={item?.body ?? "Read full context in News"}
              meta={<StatusChip label={item?.teamId != null ? "Team story" : "League story"} tone={item?.teamId != null ? "team" : "league"} />}
            >
              <button
                className="btn btn-sm"
                onClick={() => {
                  if (item?.teamId != null) onTeamSelect?.(item.teamId);
                  onNavigate?.(item?.teamId != null ? "Team" : "News");
                }}
              >
                Open
              </button>
            </CompactListRow>
          ))}
          {teamDevelopments.length === 0 ? <div style={{ color: "var(--text-muted)" }}>No major updates this week.</div> : null}
        </div>
      </SectionCard>
    </div>
  );
}
