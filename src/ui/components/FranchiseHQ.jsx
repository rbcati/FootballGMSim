import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM } from "../utils/numberFormatting.js";
import { getHQViewModel } from "../../state/selectors.js";
import { buildCompletedGamePresentation } from "../utils/boxScoreAccess.js";
import { EmptyState, SectionCard, StatCard } from "./common/UiPrimitives.jsx";
import { StatusChip, CompactListRow } from "./ScreenSystem.jsx";
import { getRecentGames as getArchivedRecentGames } from "../../core/archive/gameArchive.ts";
import { autoBuildDepthChart, depthWarnings } from "../../core/depthChart.js";
import {
  getTeamStatusLine,
  getActionContext,
  getActionDestination,
  rankHqPriorityItems,
  getTeamSnapshotNotes,
} from "../utils/hqHelpers.js";

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

const HQHero = ({ team, league, record, statusLine, nextGame, onAdvanceWeek, onNavigate, busy, simulating }) => (
  <section
    className="card"
    style={{
      padding: "var(--space-3)",
      border: "1px solid color-mix(in srgb, var(--accent) 25%, var(--hairline))",
      background: "linear-gradient(145deg, color-mix(in srgb, var(--surface) 94%, var(--accent) 6%) 0%, var(--surface) 100%)",
      display: "grid",
      gap: "var(--space-2)",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
          {league?.year} · Week {league?.week} · {String(league?.phase ?? "regular").replaceAll("_", " ")}
        </div>
        <h1 style={{ margin: "2px 0 0", fontSize: "clamp(1.1rem, 4.8vw, 1.5rem)", lineHeight: 1.1 }}>
          {team?.city} {team?.name}
        </h1>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 2 }}>
          {record} · {team?.conf} {team?.div}
        </div>
      </div>
      <StatusChip label={statusLine} tone="team" />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-2)", alignItems: "center" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase" }}>Next opponent</div>
        <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {nextGame ? `${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.name ?? "TBD"} (${formatRecord(nextGame.opp)})` : "Open week / schedule TBD"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Button size="sm" variant="outline" onClick={() => onNavigate?.("Game Plan")}>Prepare Game</Button>
        <Button size="sm" className="app-advance-btn" onClick={onAdvanceWeek} disabled={busy || simulating}>
          {busy || simulating ? "Working…" : "Advance Week"}
        </Button>
      </div>
    </div>
  </section>
);

export default function FranchiseHQ({ league, onNavigate, onOpenBoxScore, onTeamSelect, onAdvanceWeek, busy, simulating }) {
  const vm = useMemo(() => getHQViewModel(league), [league]);
  const [lineupToast, setLineupToast] = useState(null);
  const weekly = useMemo(() => evaluateWeeklyContext(vm.league), [vm.league]);
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
  const featuredPriority = rankedPriorities.featured;
  const secondaryPriorities = rankedPriorities.secondary;
  const snapshotNotes = getTeamSnapshotNotes(team, weekly, cap.capRoom);

  const teamDevelopments = (vm.league?.newsItems ?? [])
    .filter((item) => item?.teamId == null || Number(item?.teamId) === Number(vm.league?.userTeamId))
    .slice(0, 3);

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
    setLineupToast(
      hasBlockingLineupIssue
        ? "Depth chart still has missing starters. Fix red-warning rows to finalize lineup."
        : "Lineup is valid. Opening depth chart.",
    );
    window.setTimeout(() => setLineupToast(null), 2200);
    onNavigate?.("Roster:depth|ALL");
  };

  const commandCenterActions = [
    { label: "Set lineup", type: "lineup", onClick: handleSetLineup },
    { label: "Game plan", type: "gameplan", onClick: () => onNavigate?.(getActionDestination("gameplan", nextGame)) },
    { label: "News & injuries", type: "news", onClick: () => onNavigate?.(getActionDestination("news", nextGame)) },
    { label: "Scout opponent", type: "opponent", onClick: () => onNavigate?.(getActionDestination("opponent", nextGame)) },
  ]
    .map((a) => ({ ...a, context: getActionContext(a.type, weekly, nextGame) }))
    .slice(0, 4);

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
  const lastGameStory = (() => {
    if (!lastGame) return "Play your next game to unlock recap context.";
    const margin = Math.abs(safeNum(lastGame?.score?.home) - safeNum(lastGame?.score?.away));
    if (margin <= 3) return "One-possession finish; late-game execution decided it.";
    if (margin >= 14) return "Lopsided outcome; trench and turnover battles tilted early.";
    return "Momentum swung in the second half and decided the final margin.";
  })();
  const recapCtaLabel = latestGamePresentation?.canOpen
    ? (latestGamePresentation?.ctaLabel?.toLowerCase().includes("tactical") ? "Tactical Recap" : "Box Score")
    : "View Result";

  const leagueLeadersSnapshot = (() => {
    const teams = Array.isArray(vm.league?.teams) ? vm.league.teams : [];
    if (!teams.length) return [];
    const bestRecord = [...teams].sort((a, b) => (safeNum(b.wins) - safeNum(b.losses)) - (safeNum(a.wins) - safeNum(a.losses)))[0];
    const topOffense = [...teams].sort((a, b) => safeNum(b.ptsFor) - safeNum(a.ptsFor))[0];
    const topDefense = [...teams].sort((a, b) => safeNum(a.ptsAgainst) - safeNum(b.ptsAgainst))[0];
    return [
      { label: "Best record", value: bestRecord?.abbr ?? bestRecord?.name ?? "—" },
      { label: "Top offense", value: topOffense?.abbr ?? topOffense?.name ?? "—" },
      { label: "Top defense", value: topDefense?.abbr ?? topDefense?.name ?? "—" },
    ];
  })();

  const matchupGap = nextGame?.opp ? safeNum(team?.ovr) - safeNum(nextGame.opp?.ovr) : null;
  const offenseGap = nextGame?.opp ? safeNum(team?.offenseRating ?? team?.offRating ?? team?.offense) - safeNum(nextGame.opp?.offenseRating ?? nextGame.opp?.offRating ?? nextGame.opp?.offense) : null;
  const defenseGap = nextGame?.opp ? safeNum(team?.defenseRating ?? team?.defRating ?? team?.defense) - safeNum(nextGame.opp?.defenseRating ?? nextGame.opp?.defRating ?? nextGame.opp?.defense) : null;
  const matchupNote =
    matchupGap == null
      ? "Use schedule + game plan to prep your next checkpoint."
      : matchupGap >= 5
        ? "You hold the OVR edge—avoid self-inflicted mistakes."
        : matchupGap <= -5
          ? "Talent deficit on paper—scheme and turnovers become critical."
          : "Even matchup—situational football and depth should swing it.";

  return (
    <div className="app-screen-stack franchise-hq" style={{ display: "grid", gap: "var(--space-2)" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: "var(--space-2)" }}>
        <SectionCard title="This Week" subtitle="Contextual prep actions before kickoff.">
          <div style={{ display: "grid", gap: 6 }}>
            {commandCenterActions.map((action) => (
              <CompactListRow
                key={action.label}
                title={action.label}
                subtitle={action.context}
                meta={<StatusChip label="Prep" tone="team" />}
              >
                <Button size="sm" variant="outline" onClick={action.onClick}>{action.label}</Button>
              </CompactListRow>
            ))}
          </div>
          {lineupToast ? <div style={{ fontSize: "var(--text-xs)", color: "var(--accent)", marginTop: 6 }}>{lineupToast}</div> : null}
        </SectionCard>

        <SectionCard title="Priority Queue" subtitle="Ranked by urgency and impact.">
          {featuredPriority ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", padding: "10px", background: "color-mix(in srgb, var(--danger) 10%, var(--surface))" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
                  <div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase" }}>Urgent</div>
                    <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{featuredPriority.label}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>{featuredPriority.detail}</div>
                  </div>
                  <Button size="sm" onClick={() => onNavigate?.(featuredPriority?.tab ?? "Team")}>{featuredPriority.verb || "Review now"}</Button>
                </div>
              </div>

              {secondaryPriorities.map((item, idx) => (
                <CompactListRow
                  key={`${item.label}-${idx}`}
                  title={item.label}
                  subtitle={item.detail}
                  meta={<StatusChip label={item.level === "blocker" ? "Urgent" : item.level === "recommendation" ? "Recommended" : "Info"} tone={getSeverityTone(item.level)} />}
                >
                  <Button size="sm" variant="outline" onClick={() => onNavigate?.(item?.tab ?? "Team")}>{item.verb || "Review"}</Button>
                </CompactListRow>
              ))}
            </div>
          ) : (
            <CompactListRow
              title="No urgent blockers"
              subtitle="Use this week to improve cap, depth, and scouting position."
              meta={<StatusChip label="Info" tone="info" />}
            >
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("Financials")}>Upgrade facility</Button>
            </CompactListRow>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Team Snapshot" subtitle="Interpretive status for roster, cap, and window.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
          <StatCard label="OVR" value={`${safeNum(team?.ovr, 0)}`} note={snapshotNotes.ovrNote} />
          <StatCard label="Cap room" value={formatMoneyM(cap.capRoom)} note={snapshotNotes.capNote} />
          <StatCard label="Roster" value={`${(team?.roster ?? []).length} active`} note={snapshotNotes.rosterNote} />
          <StatCard
            label="Expiring deals"
            value={`${safeNum(weekly?.pressurePoints?.expiringCount)}`}
            note={snapshotNotes.expiringNote}
          />
        </div>
      </SectionCard>

      <section style={{ display: "grid", gap: "var(--space-2)" }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-base)", opacity: 0.9 }}>League Pulse</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "var(--space-2)" }}>
          <SectionCard title="Next Game" actions={nextGame ? <StatusChip label={`Week ${nextGame.week}`} tone="team" /> : null}>
            <div style={{ display: "grid", gap: 5 }}>
              <div style={{ fontWeight: 700 }}>{nextGame ? `${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.name ?? "TBD"}` : "No scheduled matchup"}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                {nextGame?.opp ? `Opponent record: ${formatRecord(nextGame.opp)} · OVR ${safeNum(nextGame.opp?.ovr, 0)}` : "Schedule or playoff bracket context will appear here."}
              </div>
              {nextGame?.opp ? (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  OVR edge: {matchupGap > 0 ? "+" : ""}{safeNum(matchupGap)} · Offense: {offenseGap > 0 ? "+" : ""}{safeNum(offenseGap)} · Defense: {defenseGap > 0 ? "+" : ""}{safeNum(defenseGap)}
                </div>
              ) : null}
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Matchup note: {matchupNote}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.(getActionDestination("opponent", nextGame))}>Scout Matchup</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Game Plan")}>Prepare Game</Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Last Game">
            <div style={{ display: "grid", gap: 5 }}>
              {lastGame ? (
                <>
                  <div style={{ fontWeight: 700 }}>
                    {lastGame.userWon ? "W" : "L"} · {lastGame.awayAbbr} {safeNum(lastGame?.score?.away)} @ {lastGame.homeAbbr} {safeNum(lastGame?.score?.home)}
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{lastGameStory}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    Top performer: {latestGamePresentation?.spotlightPlayer?.name ?? latestGamePresentation?.headline ?? "Team effort carried the result."}
                  </div>
                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenBoxScore?.(latestArchived?.id ?? lastGame?.id)}
                      disabled={latestArchived ? !latestGamePresentation?.canOpen : false}
                    >
                      {recapCtaLabel}
                    </Button>
                  </div>
                </>
              ) : (
                <CompactListRow
                  title="No final yet"
                  subtitle="Your first completed game will unlock recap context and tactical takeaways."
                  meta={<StatusChip label="Info" tone="info" />}
                >
                  <Button size="sm" variant="outline" onClick={() => onNavigate?.("Schedule")}>Open Schedule</Button>
                </CompactListRow>
              )}
            </div>
          </SectionCard>

          <SectionCard title="News & Leaders" actions={<Button size="sm" variant="ghost" onClick={() => onNavigate?.("News")}>News Desk</Button>}>
            {teamDevelopments.length > 0 ? (
              <div style={{ display: "grid", gap: 6 }}>
                {teamDevelopments.map((item, idx) => (
                  <div key={item?.id || idx} style={{ fontSize: "var(--text-sm)", borderBottom: "1px solid var(--hairline)", paddingBottom: 5 }}>
                    <strong>{item.headline}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                <CompactListRow
                  title="News Desk quiet"
                  subtitle="No major team storylines this week."
                  meta={<StatusChip label="League Pulse" tone="info" />}
                />
                {leagueLeadersSnapshot.map((item) => (
                  <div key={item.label} style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    {item.label}: <strong style={{ color: "var(--text)" }}>{item.value}</strong>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </section>
    </div>
  );
}
