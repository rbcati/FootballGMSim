import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM } from "../utils/numberFormatting.js";
import { findLatestUserCompletedGame } from "../utils/completedGameSelectors.js";
import { getHQViewModel } from "../../state/selectors.js";
import { getHQPrimaryAction } from "../utils/hqPrimaryAction.js";
import { EmptyState, SectionCard, StatCard, TeamChip, TrendBadge } from "./common/UiPrimitives.jsx";

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
      return { week: Number(week?.week ?? 1), isHome, opp };
    }
  }
  return null;
}

export default function FranchiseHQ({ league, onNavigate, onOpenBoxScore }) {
  const vm = useMemo(() => getHQViewModel(league), [league]);
  const weekly = useMemo(() => evaluateWeeklyContext(vm.league), [vm.league]);
  const latest = useMemo(() => findLatestUserCompletedGame(vm.league), [vm.league]);
  const nextGame = useMemo(() => getNextGame(vm.league), [vm.league]);

  if (!vm.userTeam) {
    return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  }

  const team = vm.userTeam;
  const cap = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const record = `${safeNum(team.wins)}-${safeNum(team.losses)}${safeNum(team.ties) ? `-${safeNum(team.ties)}` : ""}`;
  const deadline = vm.league?.tradeDeadline;
  const recent = Array.isArray(team?.recentResults) ? team.recentResults.slice(-5) : [];
  const trend = recent.length ? (recent.filter((r) => r === "W").length >= Math.ceil(recent.length / 2) ? "up" : "down") : "steady";

  const storylines = (weekly?.storylineCards ?? []).slice(0, 3);
  const primaryAction = getHQPrimaryAction(vm.league);

  const handlePrimaryAction = () => {
    if (!primaryAction?.action) return;
    if (primaryAction.action.type === 'box_score' && primaryAction.action.gameId) {
      onOpenBoxScore?.(primaryAction.action.gameId);
      return;
    }
    if (primaryAction.action.type === 'navigate' && primaryAction.action.tab) {
      onNavigate?.(primaryAction.action.tab);
    }
  };

  return (
    <div className="app-screen-stack franchise-hq" style={{ display: "grid", gap: "var(--space-3)" }}>
      <SectionCard
        title="This Week"
        actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("Schedule")}>Open Schedule</Button>}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <div><strong>{vm.league?.year}</strong> · Week {vm.league?.week ?? 1} · {vm.league?.phase ?? "regular"}</div>
          <button className="btn btn-primary" style={{ textAlign: 'left', minHeight: 46 }} onClick={handlePrimaryAction}>
            <div style={{ fontWeight: 800 }}>{primaryAction?.label ?? 'Review weekly priorities'}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{primaryAction?.detail}</div>
          </button>
          <div>Next opponent: {nextGame ? <>Week {nextGame.week} {nextGame.isHome ? "vs" : "@"} <TeamChip team={nextGame.opp} /></> : "No game scheduled"}</div>
          <div>Record context: <strong>{record}</strong></div>
          <div>Availability: {safeNum(weekly?.pressurePoints?.injuriesCount) > 0 ? `${safeNum(weekly?.pressurePoints?.injuriesCount)} injury flags` : "No major injuries"}</div>
          <div>Owner pulse: {weekly?.pressure?.owner?.state ?? "Stable"}</div>
          {cap.capRoom < 5 ? <div style={{ color: "var(--warning)" }}>Cap alert: {formatMoneyM(cap.capRoom)} available.</div> : null}
        </div>
      </SectionCard>

      <SectionCard title="Recent Results">
        <div style={{ display: "grid", gap: 10 }}>
          <div>Last game: {latest?.story?.headline ?? "No completed game yet."}</div>
          <div>Next game: {nextGame ? `Week ${nextGame.week} ${nextGame.isHome ? "vs" : "@"} ${nextGame?.opp?.name ?? "TBD"}` : "TBD"}</div>
          <div>Trend: <TrendBadge trend={trend} /> {recent.length ? recent.join(" ") : "No trend yet"}</div>
          <div>
            <Button size="sm" disabled={!latest?.gameId} onClick={() => latest?.gameId && onOpenBoxScore?.(latest.gameId)}>
              Open Last Box Score
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Front Office">
        <div style={{ display: "grid", gap: 8 }}>
          <StatCard label="Cap Space" value={formatMoneyM(cap.capRoom)} note={`Used ${formatMoneyM(cap.capUsed)} / ${formatMoneyM(cap.capTotal)}`} />
          {safeNum(weekly?.pressurePoints?.expiringCount) > 0 ? <div>Contracts: <strong>{safeNum(weekly?.pressurePoints?.expiringCount)} expiring players.</strong></div> : null}
          {safeNum(weekly?.pressurePoints?.injuriesCount) > 0 ? <div>Injuries: <strong>{safeNum(weekly?.pressurePoints?.injuriesCount)} players need coverage.</strong></div> : null}
          <div>Trade deadline: {deadline?.isLocked ? "Closed" : `Week ${deadline?.deadlineWeek ?? "—"}${deadline?.isFinalWindow ? " (approaching)" : ""}`}</div>
          {(team?.picks ?? []).length === 0 ? <div>Draft capital: no picks currently held.</div> : <div>Draft picks: {(team?.picks ?? []).length} currently held.</div>}
        </div>
      </SectionCard>

      <SectionCard title="League Storylines">
        {storylines.length === 0 ? (
          <EmptyState title="No major league notes" body="Advance a week to generate new league storylines." />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {storylines.map((item) => (
              <div key={item?.id ?? item?.title} className="card franchise-story-item" style={{ padding: "var(--space-2) var(--space-3)" }}>
                <strong>{item?.title ?? "League note"}</strong>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{item?.detail ?? item?.why ?? "No detail"}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
