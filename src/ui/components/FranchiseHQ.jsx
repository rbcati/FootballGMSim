import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM } from "../utils/numberFormatting.js";
import { findLatestUserCompletedGame } from "../utils/completedGameSelectors.js";
import { getHQViewModel } from "../../state/selectors.js";
import { buildCompletedGamePresentation, openResolvedBoxScore } from "../utils/boxScoreAccess.js";
import { EmptyState, SectionCard, StatCard, TeamChip } from "./common/UiPrimitives.jsx";

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

function buildStandingContext(team, league) {
  if (!team) return "Standing unavailable";
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const sameConference = teams.filter((t) => String(t?.conf) === String(team?.conf));
  const sameDivision = teams.filter((t) => String(t?.conf) === String(team?.conf) && String(t?.div) === String(team?.div));
  const sorter = (a, b) => (safeNum(b.wins) - safeNum(a.wins)) || (safeNum(a.losses) - safeNum(b.losses));
  const confRank = sameConference.sort(sorter).findIndex((t) => Number(t?.id) === Number(team?.id)) + 1;
  const divRank = sameDivision.sort(sorter).findIndex((t) => Number(t?.id) === Number(team?.id)) + 1;
  const confLabel = team?.confName ?? team?.conf ?? "Conference";
  return `${confLabel}: #${confRank || "-"} · Division: #${divRank || "-"}`;
}

function getFranchiseHeadline({ weekly, team, nextGame, latest }) {
  if (weekly?.focus?.title) return weekly.focus.title;
  if (latest?.story?.headline) return latest.story.headline;
  if (nextGame?.opp?.abbr) return `Prepare for ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp.abbr}`;
  return `${team?.name ?? "Franchise"} enter Week ${safeNum(weekly?.week, 1)} looking for momentum.`;
}

const URGENT_TONE = {
  danger: "var(--danger)",
  warning: "var(--warning)",
  info: "var(--accent)",
};

export default function FranchiseHQ({ league, onNavigate, onOpenBoxScore, onTeamSelect }) {
  const vm = useMemo(() => getHQViewModel(league), [league]);
  const weekly = useMemo(() => evaluateWeeklyContext(vm.league), [vm.league]);
  const latest = useMemo(() => findLatestUserCompletedGame(vm.league), [vm.league]);
  const nextGame = useMemo(() => getNextGame(vm.league), [vm.league]);
  const latestPresentation = useMemo(() => (
    latest ? buildCompletedGamePresentation(latest.game, { seasonId: vm.league?.seasonId, week: latest.week, source: "hq_recent_results" }) : null
  ), [latest, vm.league?.seasonId]);

  if (!vm.userTeam) {
    return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  }

  const team = vm.userTeam;
  const cap = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const record = formatRecord(team);
  const standingContext = buildStandingContext(team, vm.league);
  const urgentItems = (weekly?.urgentItems ?? []).slice(0, 4);
  const teamStoryCount = (vm.league?.newsItems ?? []).filter((item) => Number(item?.teamId) === Number(team?.id)).length;
  const leagueStory = (weekly?.storylineCards ?? [])[0];
  const franchiseHeadline = getFranchiseHeadline({ weekly, team, nextGame, latest });

  return (
    <div className="app-screen-stack franchise-hq" style={{ display: "grid", gap: "var(--space-3)" }}>
      <SectionCard
        title="This Week / Current Situation"
        actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("Schedule")}>Schedule</Button>}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            {vm.league?.year} · Week {vm.league?.week ?? 1} · {vm.league?.phase ?? "regular"}
          </div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>{record} · {standingContext}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            Playoff chase: {weekly?.direction === "contender" ? "in the hunt" : weekly?.direction === "rebuilding" ? "long-view season" : "tight middle class"}
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            Pressure: Owner {weekly?.pressure?.owner?.state ?? "Stable"} · Fans {weekly?.pressure?.fans?.state ?? "Steady"} · Media {weekly?.pressure?.media?.state ?? "Steady"}
          </div>
          <div style={{ padding: "var(--space-2)", borderRadius: 10, background: "var(--surface-strong)", fontWeight: 700 }}>{franchiseHeadline}</div>
        </div>
      </SectionCard>

      <SectionCard title={nextGame ? "Next Game" : "Last Result"}>
        <div style={{ display: "grid", gap: 8 }}>
          {nextGame ? (
            <>
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>
                Week {nextGame.week} · {nextGame.isHome ? "vs" : "@"} <TeamChip team={nextGame.opp} />
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                Matchup: {record} vs {formatRecord(nextGame.opp)} · {safeNum(weekly?.pressurePoints?.injuriesCount) > 0 ? `${safeNum(weekly?.pressurePoints?.injuriesCount)} injury decision(s)` : "healthy setup"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="sm" onClick={() => onNavigate?.("Team")}>Set lineup</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Game Plan")}>Game plan</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("League")}>League scouting</Button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700 }}>{latest?.story?.headline ?? "No completed game yet."}</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{latest?.story?.detail ?? "Advance to generate your first recap."}</div>
              <div>
                <Button
                  size="sm"
                  disabled={!latestPresentation?.canOpen}
                  onClick={() => latest && openResolvedBoxScore(latest.game, { seasonId: vm.league?.seasonId, week: latest.week, source: "hq_recent_results" }, onOpenBoxScore)}
                  title={latestPresentation?.statusLabel}
                >
                  {latestPresentation?.ctaLabel ?? "Open Box Score"}
                </Button>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Urgent Actions" actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("Team")}>Team Hub</Button>}>
        {urgentItems.length === 0 ? <div style={{ color: "var(--text-muted)" }}>No immediate fires. Stay ahead by reviewing cap and contracts.</div> : (
          <div style={{ display: "grid", gap: 8 }}>
            {urgentItems.map((item) => (
              <button
                key={`${item.label}-${item.tab}`}
                className="btn"
                style={{ textAlign: "left", borderColor: URGENT_TONE[item.tone] ?? "var(--hairline)", background: "transparent" }}
                onClick={() => onNavigate?.(item?.tab ?? "Team")}
              >
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
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" variant="outline" onClick={() => onNavigate?.("Contract Center")}>Contracts</Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate?.("💰 Cap")}>Cap</Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate?.("Schedule")}>Schedule</Button>
        </div>
      </SectionCard>

      <SectionCard title="League Pulse" actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("News")}>Open News</Button>}>
        <div style={{ display: "grid", gap: 6 }}>
          <div><strong>Featured result:</strong> {latest?.story?.headline ?? "No major result yet."}</div>
          <div><strong>Race note:</strong> {leagueStory?.title ?? "Playoff race snapshots populate as season advances."}</div>
          <div><strong>Player/Team of week:</strong> {weekly?.storylineCards?.find((s) => /week|honor|award/i.test(`${s?.title} ${s?.detail}`))?.title ?? "Weekly honors pending"}</div>
          <div><strong>Major move:</strong> {(vm.league?.newsItems ?? []).find((n) => /trade|signed|contract|free agency/i.test(`${n?.headline} ${n?.body}`))?.headline ?? "No major transaction note."}</div>
        </div>
      </SectionCard>

      <SectionCard title="News Preview" actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("News")}>All stories</Button>}>
        <div style={{ display: "grid", gap: 8 }}>
          {(vm.league?.newsItems ?? []).slice(0, 3).map((item, idx) => (
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
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Week {item?.week ?? vm.league?.week ?? 1} · {item?.priority ?? "normal"} priority</div>
            </button>
          ))}
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Team-relevant stories this week: {teamStoryCount}</div>
        </div>
      </SectionCard>
    </div>
  );
}
