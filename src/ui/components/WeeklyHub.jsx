import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ACTION_LABELS } from "../constants/navigationCopy.js";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM, formatPercent } from "../utils/numberFormatting.js";

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

function phaseLabel(phase) {
  if (phase === "regular") return "Regular Season";
  if (phase === "playoffs") return "Playoffs";
  if (phase === "preseason") return "Preseason";
  if (phase === "draft") return "Draft";
  if (phase === "free_agency") return "Free Agency";
  if (phase === "offseason_resign") return "Re-Signing";
  return "Offseason";
}

function summarizeOfferAssets(offer, side) {
  const players = side === "offering" ? offer?.offeringPlayerName : offer?.receivingPlayerName;
  const picks = side === "offering" ? offer?.offeringPickSnapshots : offer?.receivingPickSnapshots;
  const pickText = Array.isArray(picks) && picks.length
    ? picks.slice(0, 2).map((pk) => pk?.label ?? `${pk?.season ?? pk?.year ?? "Future"} R${pk?.round ?? "?"}`).join(", ")
    : null;
  if (players && pickText) return `${players} + ${pickText}`;
  if (players) return players;
  if (pickText) return pickText;
  return "Undisclosed package";
}

export default function WeeklyHub({ league, actions, onNavigate, onAdvanceWeek, busy, simulating }) {
  const user = useMemo(() => getUserTeam(league), [league]);
  const nextGame = useMemo(() => getNextGame(league), [league]);
  const injuries = useMemo(() => getInjuries(league), [league]);
  const weeklyContext = useMemo(() => evaluateWeeklyContext(league), [league]);

  if (!league || !user || !weeklyContext) return null;

  const cap = deriveTeamCapSnapshot(user, { fallbackCapTotal: 255 });
  const ownerMood = league.ownerMood ?? league.ownerApproval;
  const ownerDisplay = formatPercent(ownerMood, "—", { digits: 0 });
  const topOffer = weeklyContext?.incomingOffers?.[0] ?? null;
  const topPriorities = weeklyContext.topPriorities?.length
    ? weeklyContext.topPriorities
    : [{ tone: "ok", level: "recommendation", label: "All Clear", detail: "No urgent blockers right now.", why: "You can safely advance once prep is set.", tab: "Weekly Hub" }];

  return (
    <div className="weekly-hub-v2">
      <Card variant="primary" className="weekly-primary weekly-hero">
        <CardHeader className="weekly-primary__header">
          <div className="weekly-hero__identity">
            <p className="weekly-hud__eyebrow">{phaseLabel(league.phase)} · Week {league.week ?? 1}</p>
            <CardTitle className="weekly-hero__title">
              {nextGame ? `${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.abbr ?? "TBD"} · ${ACTION_LABELS.readyToAdvance}` : ACTION_LABELS.advanceFranchise}
            </CardTitle>
            <p className="weekly-primary__subtitle">
              {weeklyContext.phasePriority}
            </p>
          </div>
          <div className="weekly-hud__meta">
            <Badge variant="outline">{user.wins ?? 0}-{user.losses ?? 0}{(user.ties ?? 0) ? `-${user.ties}` : ""}</Badge>
            <Badge>{`Owner ${ownerDisplay}`}</Badge>
            <Badge variant="secondary">Cap {formatMoneyM(cap.capRoom)}</Badge>
            {injuries.length > 0 && <Badge variant="destructive">{injuries.length} injuries</Badge>}
          </div>
        </CardHeader>
        <CardContent className="weekly-hero__actions" style={{ display: "grid", gap: 10 }}>
          <Button
            size="lg"
            className="weekly-hero__action-main"
            disabled={busy || simulating}
            onClick={onAdvanceWeek}
          >
            {simulating ? ACTION_LABELS.simulating : busy ? ACTION_LABELS.working : ACTION_LABELS.advanceWeek}
          </Button>
          <div className="weekly-tools-row">
            {(weeklyContext.phaseShortcuts ?? []).slice(0, 4).map((shortcut) => (
              <Button key={shortcut.tab} variant="secondary" onClick={() => onNavigate?.(shortcut.tab)}>{shortcut.label}</Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="weekly-section">
        <h3 className="weekly-section__title">Top priorities</h3>
        <div className="weekly-urgent-list">
          {topPriorities.map((item, idx) => (
            <button key={`${item.label}-${idx}`} className={`weekly-urgent-item tone-${item.tone}`} onClick={() => onNavigate?.(item.tab)}>
              <div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{item.label}</strong>
                  <Badge variant={item.level === "blocker" ? "destructive" : "outline"}>{item.level === "blocker" ? "Blocker" : "Recommended"}</Badge>
                </div>
                <span>{item.detail}</span>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginTop: 2 }}>{item.why}</div>
              </div>
              <span>›</span>
            </button>
          ))}
        </div>
      </section>

      <section className="weekly-section">
        <h3 className="weekly-section__title">Pressure points</h3>
        <div className="weekly-secondary-grid">
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Owner Pressure</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{ownerDisplay}</CardContent></Card>
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Cap Situation</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{formatMoneyM(cap.capRoom)} room</CardContent></Card>
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Expiring Contracts</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{weeklyContext.pressurePoints?.expiringCount ?? 0} expiring</CardContent></Card>
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Injuries</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{weeklyContext.pressurePoints?.injuriesCount ?? 0} active injuries</CardContent></Card>
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Trade Activity</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{weeklyContext.pressurePoints?.incomingTradeCount ?? 0} incoming offers</CardContent></Card>
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Next Milestone</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{nextGame ? `Week ${nextGame.week}: ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.abbr ?? "TBD"}` : weeklyContext.pressurePoints?.nextMilestone}</CardContent></Card>
        </div>
      </section>

      {topOffer && (
        <section className="weekly-section">
          <h3 className="weekly-section__title">Incoming trade offer</h3>
          <Card variant="secondary">
            <CardHeader>
              <CardTitle className="text-sm">{topOffer.offeringTeamAbbr ?? "Team"} is calling</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-[color:var(--text-muted)]" style={{ display: "grid", gap: 8 }}>
              <div><strong style={{ color: "var(--text)" }}>They offer:</strong> {summarizeOfferAssets(topOffer, "offering")}</div>
              <div><strong style={{ color: "var(--text)" }}>They want:</strong> {summarizeOfferAssets(topOffer, "receiving")}</div>
              <div>{topOffer.reason}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Badge variant="outline">{topOffer.stance ?? "Market call"}</Badge>
                <Badge variant={topOffer.urgency === "high" ? "destructive" : "secondary"}>{topOffer.urgency === "high" ? "High urgency" : "Standard urgency"}</Badge>
                <Badge variant="outline">AI framing: {topOffer.offerType?.replaceAll("_", " ") ?? "trade call"}</Badge>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="sm" onClick={() => actions?.acceptIncomingTrade?.(topOffer.id)}>Accept</Button>
                <Button size="sm" variant="secondary" onClick={() => actions?.rejectIncomingTrade?.(topOffer.id)}>Reject</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Trades")}>Review in Trades</Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="weekly-section">
        <h3 className="weekly-section__title">Phase guidance</h3>
        <Card variant="secondary">
          <CardContent className="text-sm text-[color:var(--text-muted)]" style={{ display: "grid", gap: 4, paddingTop: 16 }}>
            <strong style={{ color: "var(--text)" }}>{weeklyContext?.focus?.title ?? "Keep advancing with discipline."}</strong>
            <div>{weeklyContext?.focus?.subtitle ?? "Stay active in every phase."}</div>
            <div>GM pulse: {weeklyContext?.advisorPulse}</div>
            {league.phase === "offseason_resign" && <div>Start in <strong style={{ color: "var(--text)" }}>FA Hub</strong> for market pressure and expiring risk. Move to <strong style={{ color: "var(--text)" }}>Free Agency</strong> when you are ready to submit or revise specific bids.</div>}
            {league.phase === "free_agency" && <div>Start in <strong style={{ color: "var(--text)" }}>FA Hub</strong> to scan market pressure, then use <strong style={{ color: "var(--text)" }}>Free Agency</strong> as the transaction workspace for contract entry and cap checks.</div>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
