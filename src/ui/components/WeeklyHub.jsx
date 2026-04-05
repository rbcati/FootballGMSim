import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function getUserTeam(league) {
  return league?.teams?.find((t) => t.id === league?.userTeamId) ?? null;
}

function getNextGame(league) {
  if (!league?.schedule?.weeks) return null;
  for (const week of league.schedule.weeks) {
    for (const game of week.games ?? []) {
      if (game.played) continue;
      const homeId = typeof game.home === "object" ? game.home.id : Number(game.home);
      const awayId = typeof game.away === "object" ? game.away.id : Number(game.away);
      if (homeId !== league.userTeamId && awayId !== league.userTeamId) continue;
      const isHome = homeId === league.userTeamId;
      const oppId = isHome ? awayId : homeId;
      const opp = league.teams?.find((t) => t.id === oppId);
      return { week: week.week, isHome, opp };
    }
  }
  return null;
}

function getInjuries(league) {
  const roster = getUserTeam(league)?.roster ?? [];
  return roster.filter((p) => p.injury || p.injuredWeeks > 0).slice(0, 4);
}

function getUrgentItems(league) {
  const user = getUserTeam(league);
  const injuries = getInjuries(league);
  const upcomingFreeAgents = (user?.roster ?? []).filter((p) => (p.contractYearsLeft ?? p.yearsLeft ?? 2) <= 1).length;
  const ownerMood = league?.ownerMood ?? league?.ownerApproval ?? null;

  const items = [];
  if (injuries.length > 0) {
    items.push({ tone: "danger", label: "Injuries", detail: `${injuries.length} players unavailable`, tab: "Injuries" });
  }
  if (upcomingFreeAgents > 4) {
    items.push({ tone: "warning", label: "Expiring Deals", detail: `${upcomingFreeAgents} contracts need action`, tab: "Contracts Hub" });
  }
  if ((league?.phase === "draft" || league?.phase === "offseason") && !league?.bigBoardLocked) {
    items.push({ tone: "info", label: "Scouting", detail: "Finalize your board", tab: "Scouting Center" });
  }
  if (ownerMood != null && ownerMood < 55) {
    items.push({ tone: "danger", label: "Owner Pressure", detail: "Approval is trending down", tab: "🤖 GM Advisor" });
  }

  if (items.length === 0) {
    items.push({ tone: "ok", label: "All Clear", detail: "No urgent blockers this week", tab: "Weekly Hub" });
  }
  return items.slice(0, 4);
}

function phaseLabel(phase) {
  if (phase === "regular") return "Regular Season";
  if (phase === "playoffs") return "Playoffs";
  if (phase === "preseason") return "Preseason";
  if (phase === "draft") return "Draft";
  if (phase === "free_agency") return "Free Agency";
  return "Offseason";
}

export default function WeeklyHub({ league, onNavigate, onAdvanceWeek, busy, simulating }) {
  const user = useMemo(() => getUserTeam(league), [league]);
  const nextGame = useMemo(() => getNextGame(league), [league]);
  const injuries = useMemo(() => getInjuries(league), [league]);
  const urgentItems = useMemo(() => getUrgentItems(league), [league]);

  if (!league || !user) return null;

  const capSpace = user.capSpace ?? Math.max(0, (user.capTotal ?? 255) - (user.capUsed ?? 0));
  const ownerMood = league.ownerMood ?? league.ownerApproval;
  const tools = [
    { label: "Roster", tab: "Roster" },
    { label: "Game Plan", tab: "Game Plan" },
    { label: "Trades", tab: "Trades" },
    { label: "Staff", tab: "Staff" },
  ];

  return (
    <div className="weekly-hub-v2">
      <Card variant="primary" className="weekly-primary weekly-hero">
        <CardHeader className="weekly-primary__header">
          <div className="weekly-hero__identity">
            <p className="weekly-hud__eyebrow">{phaseLabel(league.phase)} · Week {league.week ?? 1}</p>
            <CardTitle className="weekly-hero__title">{nextGame ? `${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.abbr ?? "TBD"} · Ready to Sim` : "Advance Franchise"}</CardTitle>
            <p className="weekly-primary__subtitle">
              {nextGame ? `${nextGame.opp?.city ?? ""} ${nextGame.opp?.name ?? ""} is up next. Lock your plan, then advance.` : "Set priorities and move the league forward."}
            </p>
          </div>
          <div className="weekly-hud__meta">
            <Badge variant="outline">{user.wins ?? 0}-{user.losses ?? 0}{(user.ties ?? 0) ? `-${user.ties}` : ""}</Badge>
            {ownerMood != null && <Badge>{`Owner ${Math.round(ownerMood)}%`}</Badge>}
            <Badge variant="secondary">Cap ${Number(capSpace).toFixed(1)}M</Badge>
            {injuries.length > 0 && <Badge variant="destructive">{injuries.length} injuries</Badge>}
          </div>
        </CardHeader>
        <CardContent className="weekly-hero__actions">
          <Button
            size="lg"
            className="weekly-hero__action-main"
            disabled={busy || simulating}
            onClick={onAdvanceWeek}
          >
            {simulating ? "Simulating..." : busy ? "Working..." : "Sim Week"}
          </Button>
          <Button variant="secondary" onClick={() => onNavigate?.("Game Plan")} className="weekly-hero__action-secondary">Game Plan</Button>
          <Button variant="secondary" onClick={() => onNavigate?.("Roster")} className="weekly-hero__action-secondary">Roster</Button>
          <Button variant="outline" onClick={() => onNavigate?.("Trades")} className="weekly-hero__action-overflow" aria-label="More actions">
            <span aria-hidden>⋯</span>
            <span>More Tools</span>
          </Button>
        </CardContent>
      </Card>

      <section className="weekly-section">
        <h3 className="weekly-section__title">Needs attention now</h3>
        <div className="weekly-urgent-list">
          {urgentItems.map((item) => (
            <button key={item.label} className={`weekly-urgent-item tone-${item.tone}`} onClick={() => onNavigate?.(item.tab)}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </div>
              <span>›</span>
            </button>
          ))}
        </div>
      </section>

      <section className="weekly-section">
        <h3 className="weekly-section__title">Quick tools</h3>
        <div className="weekly-tools-row">
          {tools.map((tool) => (
            <Button key={tool.tab} variant="secondary" onClick={() => onNavigate?.(tool.tab)}>{tool.label}</Button>
          ))}
        </div>
      </section>

      <section className="weekly-section">
        <h3 className="weekly-section__title">Franchise snapshots</h3>
        <div className="weekly-secondary-grid">
          <Card variant="secondary">
            <CardHeader><CardTitle className="text-sm">Matchup Pulse</CardTitle></CardHeader>
            <CardContent className="text-sm text-[color:var(--text-muted)]">
              {nextGame ? `${nextGame.isHome ? "Home" : "Road"} · ${nextGame.opp?.abbr ?? "TBD"} (${nextGame.opp?.wins ?? 0}-${nextGame.opp?.losses ?? 0})` : "No scheduled game"}
            </CardContent>
          </Card>
          <Card variant="secondary">
            <CardHeader><CardTitle className="text-sm">Approval</CardTitle></CardHeader>
            <CardContent className="text-sm text-[color:var(--text-muted)]">Owner: {ownerMood != null ? `${Math.round(ownerMood)}%` : "N/A"}</CardContent>
          </Card>
          <Card variant="secondary">
            <CardHeader><CardTitle className="text-sm">Injury Watch</CardTitle></CardHeader>
            <CardContent className="text-sm text-[color:var(--text-muted)]">{injuries[0] ? `${injuries[0].name} · ${injuries[0].injury || `${injuries[0].injuredWeeks} wks`}` : "Roster healthy"}</CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
