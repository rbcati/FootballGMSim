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
import { getTeamStatusLine, getActionContext } from "../utils/hqHelpers.js";

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

const HQHero = ({ team, league, record, statusLine, nextGame, onAdvanceWeek, onNavigate, busy, simulating }) => {
  return (
    <div className="hq-hero-section card" style={{
      padding: 'var(--space-4)',
      background: 'linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 95%, var(--accent)) 100%)',
      border: '1px solid var(--hairline)',
      display: 'grid',
      gap: 'var(--space-3)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>
            {league.year} · Week {league.week} · {league.phase}
          </div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 900, lineHeight: 1 }}>
            {team.city} {team.name}
          </h1>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--accent)' }}>
            {record} · {team.conf} {team.div}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
           <StatusChip label={statusLine} tone="team" />
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: 'rgba(0,0,0,0.1)',
        borderRadius: 'var(--radius-md)'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Next Opponent</div>
          <div style={{ fontWeight: 700 }}>{nextGame ? `${nextGame.isHome ? 'vs' : '@'} ${nextGame.opp?.name}` : 'No upcoming game'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            onClick={() => onNavigate?.("Game Plan")}
            variant="outline"
            size="sm"
          >
            Prepare
          </Button>
          <Button
            onClick={onAdvanceWeek}
            disabled={busy || simulating}
            size="sm"
            className="app-advance-btn"
          >
            {busy || simulating ? "Working…" : "Advance Week"}
          </Button>
        </div>
      </div>
    </div>
  );
};

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
  const statusLine = useMemo(() => getTeamStatusLine(team, vm.league, weekly), [team, vm.league, weekly]);
  const urgentItems = (weekly?.urgentItems ?? []).slice(0, 6);

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
        verb: "Fix lineup"
      });
    }
    if (vm.league?.phase === "regular" && remainingRegularSeasonGames <= 3) {
      queue.unshift({
        label: "Trade window is closing",
        detail: `${remainingRegularSeasonGames} regular-season game${remainingRegularSeasonGames === 1 ? "" : "s"} left.`,
        tab: "Transactions",
        tone: "warning",
        verb: "Review market"
      });
    }
    return queue.slice(0, 4);
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

  const commandCenterActions = [
    { label: "Set Lineup", type: 'lineup', onClick: handleSetLineup },
    { label: "Game Plan", type: 'gameplan', onClick: () => onNavigate?.("Game Plan") },
    { label: "News & Injuries", type: 'news', onClick: () => onNavigate?.("News") },
    { label: "Matchup", type: 'opponent', onClick: () => onNavigate?.("Schedule") },
  ].map(a => ({ ...a, context: getActionContext(a.type, weekly, nextGame) }));

  const getCapStatus = (capRoom) => {
     if (capRoom < 2) return "Tight";
     if (capRoom < 10) return "Healthy";
     return "Flexible";
  };

  const getRosterStatus = (roster, injuries) => {
     if (injuries > 4) return "Thin (Injuries)";
     if (roster.length < 50) return "Incomplete";
     return "Healthy";
  };

  return (
    <div className="app-screen-stack franchise-hq" style={{ display: "grid", gap: "var(--space-3)" }}>

      <HQHero
        team={team}
        league={vm.league}
        record={record}
        statusLine={statusLine}
        nextGame={nextGame}
        onAdvanceWeek={onAdvanceWeek}
        onNavigate={onNavigate}
        busy={busy}
        simulating={simulating}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-3)' }}>

        <SectionCard title="Command Center" subtitle="Contextual preparation for the current week.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {commandCenterActions.map(action => (
              <button
                key={action.label}
                className="btn btn-outline"
                onClick={action.onClick}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '10px',
                  height: 'auto',
                  textAlign: 'left'
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{action.label}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 400 }}>{action.context}</span>
              </button>
            ))}
          </div>
          {lineupToast ? <div style={{ fontSize: "var(--text-xs)", color: "var(--accent)", marginTop: 4 }}>{lineupToast}</div> : null}
        </SectionCard>

        <SectionCard title="Priority Queue">
          {phasePriorityQueue.length === 0 ? <div style={{ color: "var(--text-muted)", padding: 8 }}>No immediate blockers.</div> : (
            <div style={{ display: "grid", gap: 6 }}>
              {phasePriorityQueue.map((item, idx) => (
                <div
                  key={`${item.label}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: idx === 0 ? 'rgba(var(--accent-rgb, 10, 132, 255), 0.1)' : 'var(--surface-muted)',
                    border: idx === 0 ? '1px solid var(--accent)' : '1px solid var(--hairline)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{item.label}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{item.detail}</div>
                  </div>
                  <Button size="sm" onClick={() => onNavigate?.(item?.tab ?? "Team")}>
                    {item.verb || "Open"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>

      <SectionCard title="Team Snapshot">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          <StatCard
            label="OVR Rating"
            value={`${safeNum(team?.ovr, 0)}`}
            note={team.ovr > 80 ? 'Contender' : 'Building'}
          />
          <StatCard
            label="Cap Space"
            value={formatMoneyM(cap.capRoom)}
            note={getCapStatus(cap.capRoom)}
          />
          <StatCard
            label="Roster Health"
            value={`${(team?.roster ?? []).length} active`}
            note={getRosterStatus(team.roster, safeNum(weekly?.pressurePoints?.injuriesCount))}
          />
          <StatCard
            label="Expiring"
            value={`${safeNum(weekly?.pressurePoints?.expiringCount)}`}
            note={weekly?.pressurePoints?.expiringCount > 3 ? 'Action needed' : 'Stable'}
          />
        </div>
      </SectionCard>

      <div className="league-pulse-section" style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <h3 style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-base)', opacity: 0.8 }}>League Pulse</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
          <SectionCard title="Next Game" actions={nextGame ? <StatusChip label={`Week ${nextGame.week}`} tone="team" /> : null}>
            {nextGame ? (
              <LinkedGameSummaryCard
                label="Upcoming Matchup"
                title={`${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.abbr ?? "TBD"} (${formatRecord(nextGame.opp)})`}
                subtitle="View Preview"
                onOpen={() => onNavigate?.("Schedule")}
              />
            ) : <div style={{ color: "var(--text-muted)" }}>No upcoming game.</div>}
          </SectionCard>

          <SectionCard title="Last Game">
            {!latestArchived ? <div style={{ color: "var(--text-muted)" }}>No results yet.</div> : (
              <LinkedGameSummaryCard
                label={`Week ${latestArchived?.week ?? vm.league?.week} Final`}
                title={`${latestArchived?.awayAbbr} ${latestArchived?.score?.away} @ ${latestArchived?.homeAbbr} ${latestArchived?.score?.home}`}
                subtitle={latestGamePresentation?.ctaLabel ?? "View result"}
                onOpen={() => onOpenBoxScore?.(latestArchived?.id)}
                disabled={!latestGamePresentation?.canOpen}
              />
            )}
          </SectionCard>

          <SectionCard title="News Desk" actions={<Button size="sm" variant="ghost" onClick={() => onNavigate?.("News")}>View All</Button>}>
             <div style={{ display: "grid", gap: 4 }}>
              {teamDevelopments.map((item, idx) => (
                <div key={item?.id || idx} style={{ fontSize: 'var(--text-sm)', borderBottom: '1px solid var(--hairline)', paddingBottom: 4 }}>
                  <strong>{item.headline}</strong>
                </div>
              ))}
              {teamDevelopments.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 'var(--text-sm)' }}>No major stories.</div>}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
