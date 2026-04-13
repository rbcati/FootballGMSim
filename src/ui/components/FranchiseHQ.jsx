import React, { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM } from "../utils/numberFormatting.js";
import { findLatestUserCompletedGame } from "../utils/completedGameSelectors.js";
import { getHQViewModel } from "../../state/selectors.js";
import { buildCompletedGamePresentation } from "../utils/boxScoreAccess.js";
import { persistHqCollapsedState, readHqCollapsedState } from "../utils/hqCardState.js";
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

function CollapsibleCard({ title, collapsed, onToggle, children }) {
  return (
    <SectionCard
      title={title}
      actions={<Button size="sm" variant="outline" onClick={onToggle}>{collapsed ? "Expand" : "Collapse"}</Button>}
    >
      {!collapsed && children}
      {collapsed && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>Collapsed</div>}
    </SectionCard>
  );
}

export default function FranchiseHQ({ league, onNavigate, onOpenBoxScore, onTeamSelect }) {
  const vm = useMemo(() => getHQViewModel(league), [league]);
  const weekly = useMemo(() => evaluateWeeklyContext(vm.league), [vm.league]);
  const latest = useMemo(() => findLatestUserCompletedGame(vm.league), [vm.league]);
  const nextGame = useMemo(() => getNextGame(vm.league), [vm.league]);
  const recentGames = useMemo(() => getArchivedRecentGames(5), [vm.league?.seasonId, vm.league?.week]);
  const latestArchived = useMemo(() => getArchivedRecentGames(1)?.[0] ?? null, [vm.league?.seasonId, vm.league?.week]);
  const [collapsed, setCollapsed] = useState(() => readHqCollapsedState());

  useEffect(() => {
    persistHqCollapsedState(collapsed);
  }, [collapsed]);

  if (!vm.userTeam) {
    return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  }

  const team = vm.userTeam;
  const cap = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const record = formatRecord(team);
  const urgentItems = (weekly?.urgentItems ?? []).slice(0, 4);

  return (
    <div className="app-screen-stack franchise-hq" style={{ display: "grid", gap: "var(--space-3)" }}>
      <SectionCard title="This Week" actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("Schedule")}>Schedule</Button>}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{vm.league?.year} · Week {vm.league?.week ?? 1} · {vm.league?.phase ?? "regular"}</div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>{record} · {team?.conf ?? ""} {team?.div ?? ""}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            Owner {weekly?.pressure?.owner?.state ?? "Stable"} · Fans {weekly?.pressure?.fans?.state ?? "Steady"} · Media {weekly?.pressure?.media?.state ?? "Steady"}
          </div>
        </div>
      </SectionCard>

      <h3 style={{ margin: 0 }}>Team</h3>
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

      <h3 style={{ margin: 0 }}>League</h3>
      <SectionCard title="League Pulse" actions={<Button size="sm" variant="outline" onClick={() => onNavigate?.("League")}>League Hub</Button>}>
        <div style={{ display: "grid", gap: 6 }}>
          <div><strong>Race note:</strong> {weekly?.storylineCards?.[0]?.title ?? "Playoff race snapshots populate as season advances."}</div>
          <div><strong>Major move:</strong> {(vm.league?.newsItems ?? []).find((n) => /trade|signed|contract|free agency/i.test(`${n?.headline} ${n?.body}`))?.headline ?? "No major transaction note."}</div>
        </div>
      </SectionCard>

      <CollapsibleCard title="News Preview" collapsed={collapsed.leagueNews} onToggle={() => setCollapsed((prev) => ({ ...prev, leagueNews: !prev.leagueNews }))}>
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
            </button>
          ))}
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Stat Leaders" collapsed={collapsed.statLeaders} onToggle={() => setCollapsed((prev) => ({ ...prev, statLeaders: !prev.statLeaders }))}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Open League → Leaders for full table details.</div>
        <Button size="sm" variant="outline" onClick={() => onNavigate?.("Leaders")}>Open Leaders</Button>
      </CollapsibleCard>

      <h3 style={{ margin: 0 }}>Recent Games</h3>
      <SectionCard title="Latest Finals">
        {recentGames.length === 0 ? <div style={{ color: "var(--text-muted)" }}>No completed games yet.</div> : (
          <div style={{ display: "grid", gap: 8 }}>
            {recentGames.map((game, idx) => {
              const week = Number(game?.week ?? 0);
              const presentation = buildCompletedGamePresentation({
                ...game,
                homeScore: game?.score?.home,
                awayScore: game?.score?.away,
              }, { seasonId: vm.league?.seasonId, week, source: "hq_recent_games" });
              return (
                <button
                  key={`${week}-${game.homeId}-${game.awayId}-${idx}`}
                  type="button"
                  className="btn"
                  data-testid="recent-game-card"
                  style={{ textAlign: "left", cursor: presentation.canOpen ? "pointer" : "not-allowed" }}
                  onClick={() => onOpenBoxScore?.(game?.id)}
                  disabled={!presentation.canOpen}
                  title={presentation.canOpen ? "View Box Score" : presentation.statusLabel}
                >
                  <strong>Week {week}: {game?.awayAbbr} {game?.score?.away} - {game?.score?.home} {game?.homeAbbr}</strong>
                  <div data-testid="archive-status" style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{presentation.canOpen ? "View Box Score ›" : presentation.statusLabel}</div>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      {(latestArchived || latest?.game) && (
        <SectionCard title="Last User Game">
          <Button
            size="sm"
            data-testid="box-score-trigger"
            onClick={() => {
              const gameId = latestArchived?.id ?? latest?.gameId;
              if (gameId) onOpenBoxScore?.(gameId);
            }}
          >
            Open latest box score
          </Button>
        </SectionCard>
      )}
    </div>
  );
}
