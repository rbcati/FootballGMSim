import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM } from "../utils/numberFormatting.js";
import { getHQViewModel } from "../../state/selectors.js";
import { buildCompletedGamePresentation } from "../utils/boxScoreAccess.js";
import { EmptyState, SectionCard, StatCard, TeamChip } from "./common/UiPrimitives.jsx";
import { getRecentGames as getArchivedRecentGames } from "../../core/archive/gameArchive.ts";

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

export default function FranchiseHQ({ league, onNavigate, onOpenBoxScore, onTeamSelect, onAdvanceWeek, busy, simulating }) {
  const vm = useMemo(() => getHQViewModel(league), [league]);
  const weekly = useMemo(() => evaluateWeeklyContext(vm.league), [vm.league]);
  const nextGame = useMemo(() => getNextGame(vm.league), [vm.league]);
  const latestArchived = useMemo(() => getArchivedRecentGames(1)?.[0] ?? null, [vm.league?.seasonId, vm.league?.week]);

  if (!vm.userTeam) {
    return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  }

  const team = vm.userTeam;
  const cap = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const record = formatRecord(team);
  const urgentItems = (weekly?.urgentItems ?? []).slice(0, 5);
  const pressureSummary = `Owner ${weekly?.pressure?.owner?.state ?? "Stable"} · Fans ${weekly?.pressure?.fans?.state ?? "Steady"} · Media ${weekly?.pressure?.media?.state ?? "Steady"}`;
  const teamDevelopments = (vm.league?.newsItems ?? [])
    .filter((item) => item?.teamId == null || Number(item?.teamId) === Number(vm.league?.userTeamId))
    .slice(0, 3);
  const latestGamePresentation = latestArchived
    ? buildCompletedGamePresentation({
      ...latestArchived,
      homeScore: latestArchived?.score?.home,
      awayScore: latestArchived?.score?.away,
    }, { seasonId: vm.league?.seasonId, week: Number(latestArchived?.week ?? vm.league?.week ?? 1), source: "hq_last_game" })
    : null;

  return (
    <div className="app-screen-stack franchise-hq" style={{ display: "grid", gap: "var(--space-3)" }}>
      <SectionCard title="This Week" actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("Schedule")}>Schedule</Button>}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{vm.league?.year} · Week {vm.league?.week ?? 1} · {vm.league?.phase ?? "regular"}</div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>{record} · {team?.conf ?? ""} {team?.div ?? ""}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{pressureSummary}</div>
          <Button size="sm" onClick={onAdvanceWeek} disabled={busy || simulating}>Advance Week</Button>
        </div>
      </SectionCard>

      <SectionCard title="Next Game">
        {nextGame ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>Week {nextGame.week} · {nextGame.isHome ? "vs" : "@"} <TeamChip team={nextGame.opp} /></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" onClick={() => onNavigate?.("Team")}>Set lineup</Button>
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("Game Plan")}>Game plan</Button>
            </div>
          </div>
        ) : <div style={{ color: "var(--text-muted)" }}>No upcoming game found.</div>}
      </SectionCard>

      <SectionCard title="Last Game">
        {!latestArchived ? <div style={{ color: "var(--text-muted)" }}>No completed game yet.</div> : (
          <button
            type="button"
            className="btn"
            style={{ textAlign: "left" }}
            onClick={() => onOpenBoxScore?.(latestArchived?.id)}
            disabled={!latestGamePresentation?.canOpen}
            title={latestGamePresentation?.canOpen ? "Open box score" : latestGamePresentation?.statusLabel}
          >
            <strong>
              Week {latestArchived?.week ?? vm.league?.week}: {latestArchived?.awayAbbr} {latestArchived?.score?.away} - {latestArchived?.score?.home} {latestArchived?.homeAbbr}
            </strong>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
              {latestGamePresentation?.canOpen ? "Tap score to open box score ›" : latestGamePresentation?.statusLabel}
            </div>
          </button>
        )}
      </SectionCard>

      <SectionCard title="Urgent Actions" actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("Team")}>Team Hub</Button>}>
        {urgentItems.length === 0 ? <div style={{ color: "var(--text-muted)" }}>No immediate blockers.</div> : (
          <div style={{ display: "grid", gap: 8 }}>
            {urgentItems.map((item) => (
              <button key={`${item.label}-${item.tab}`} className="btn" style={{ textAlign: "left" }} onClick={() => onNavigate?.(item?.tab ?? "Team")}>
                <div style={{ fontWeight: 700 }}>{item.label}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{item.detail}</div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Team Snapshot">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <StatCard label="OVR / OFF / DEF" value={`${safeNum(team?.ovr, 0)} / ${safeNum(team?.offenseRating, team?.offRating)} / ${safeNum(team?.defenseRating, team?.defRating)}`} />
          <StatCard label="Cap Room" value={formatMoneyM(cap.capRoom)} note={`Used ${formatMoneyM(cap.capUsed)}`} />
          <StatCard label="Roster" value={`${(team?.roster ?? []).length} players`} note={`${safeNum(weekly?.pressurePoints?.injuriesCount)} injured`} />
          <StatCard label="Expiring Deals" value={`${safeNum(weekly?.pressurePoints?.expiringCount)} players`} note="Review before FA window" />
        </div>
      </SectionCard>

      <SectionCard title="Team Developments" actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("News")}>Open News</Button>}>
        <div style={{ display: "grid", gap: 8 }}>
          {teamDevelopments.map((item, idx) => (
            <button
              key={item?.id ?? `preview-${idx}`}
              className="btn"
              style={{ textAlign: "left" }}
              onClick={() => {
                if (item?.teamId != null) onTeamSelect?.(item.teamId);
                onNavigate?.(item?.teamId != null ? "Team" : "News");
              }}
            >
              <div style={{ fontWeight: 700 }}>{item?.headline ?? "League update"}</div>
            </button>
          ))}
          {teamDevelopments.length === 0 ? <div style={{ color: "var(--text-muted)" }}>No major updates this week.</div> : null}
        </div>
      </SectionCard>
    </div>
  );
}
