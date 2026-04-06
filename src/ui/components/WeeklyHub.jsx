import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ACTION_LABELS } from "../constants/navigationCopy.js";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM, formatPercent } from "../utils/numberFormatting.js";
import { derivePregameAngles, deriveWeeklyHonors, derivePostgameStory, normalizeTeamId } from "../utils/gamePresentation.js";
import { buildIncomingOfferPresentation } from "../utils/tradeOfferPresentation.js";

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

export default function WeeklyHub({ league, actions, onNavigate, onAdvanceWeek, busy, simulating, onPlayerSelect, onTeamSelect }) {
  const user = useMemo(() => getUserTeam(league), [league]);
  const nextGame = useMemo(() => getNextGame(league), [league]);
  const injuries = useMemo(() => getInjuries(league), [league]);
  const weeklyContext = useMemo(() => evaluateWeeklyContext(league), [league]);
  const pregameAngles = useMemo(() => {
    if (!nextGame) return [];
    const weekData = league?.schedule?.weeks?.find((w) => Number(w?.week) === Number(nextGame.week));
    const game = (weekData?.games ?? []).find((g) => {
      const homeId = normalizeTeamId(g?.home);
      const awayId = normalizeTeamId(g?.away);
      return homeId === league?.userTeamId || awayId === league?.userTeamId;
    });
    return game ? derivePregameAngles({ league, game, week: nextGame.week }) : [];
  }, [league, nextGame]);
  const weeklyHonors = useMemo(() => deriveWeeklyHonors(league), [league]);
  const userLastGameStory = useMemo(() => {
    const targetWeek = Number(league?.week ?? 1) - 1;
    if (targetWeek < 1) return null;
    const weekData = league?.schedule?.weeks?.find((w) => Number(w?.week) === targetWeek);
    const userGame = (weekData?.games ?? []).find((g) => {
      const homeId = normalizeTeamId(g?.home);
      const awayId = normalizeTeamId(g?.away);
      return g?.played && (homeId === league?.userTeamId || awayId === league?.userTeamId);
    });
    return userGame ? derivePostgameStory({ league, game: userGame, week: targetWeek }) : null;
  }, [league]);

  if (!league || !user || !weeklyContext) return null;

  const cap = deriveTeamCapSnapshot(user, { fallbackCapTotal: 255 });
  const ownerMood = league.ownerMood ?? league.ownerApproval;
  const ownerDisplay = formatPercent(ownerMood, "—", { digits: 0 });
  const topOffer = weeklyContext?.incomingOffers?.[0] ?? null;
  const topOfferSummary = topOffer ? buildIncomingOfferPresentation({ offer: topOffer, league, userTeamId: league?.userTeamId }) : null;
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
        <h3 className="weekly-section__title">League storylines</h3>
        <div className="weekly-urgent-list">
          {(weeklyContext.storylineCards?.length ? weeklyContext.storylineCards : [{ title: 'No major storyline spikes this week', detail: 'The league picture is stable. Use this week to prep depth and game plan edges.', tone: 'ok', tab: 'Standings' }]).map((story, idx) => (
            <button key={`${story.id ?? story.title}-${idx}`} className={`weekly-urgent-item tone-${story.tone ?? 'ok'}`} onClick={() => onNavigate?.(story.tab ?? 'Standings')}>
              <div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{story.title}</strong>
                  <Badge variant="outline">{(story.category ?? 'story').replaceAll('_', ' ')}</Badge>
                </div>
                <span>{story.detail}</span>
              </div>
              <span>›</span>
            </button>
          ))}
        </div>
      </section>

      {nextGame && (
        <section className="weekly-section">
          <h3 className="weekly-section__title">Pregame framing</h3>
          <Card variant="secondary">
            <CardContent className="text-sm text-[color:var(--text-muted)]" style={{ display: "grid", gap: 8, paddingTop: 16 }}>
              <strong style={{ color: "var(--text)" }}>Week {nextGame.week} {nextGame.isHome ? "vs" : "at"} {nextGame.opp?.name ?? nextGame.opp?.abbr ?? "TBD"}</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(pregameAngles.length ? pregameAngles : [{ label: "Standard game week", tone: "ok" }]).map((angle) => (
                  <Badge key={angle.key ?? angle.label} variant={angle.tone === "danger" ? "destructive" : angle.tone === "warning" ? "secondary" : "outline"}>
                    {angle.label}
                  </Badge>
                ))}
              </div>
              <div>Framing is based on schedule context, records, streaks, and rivalry/division state.</div>
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("Schedule")}>Open schedule matchup board</Button>
            </CardContent>
          </Card>
        </section>
      )}

      {(userLastGameStory || weeklyHonors) && (
        <section className="weekly-section">
          <h3 className="weekly-section__title">Postgame pulse</h3>
          <div className="weekly-urgent-list">
            {userLastGameStory && (
              <button className="weekly-urgent-item tone-info" onClick={() => onNavigate?.("Schedule")}>
                <div>
                  <strong>{userLastGameStory.headline}</strong>
                  <span>{userLastGameStory.detail}</span>
                </div>
                <span>›</span>
              </button>
            )}
            {weeklyHonors?.statementWin && (
              <button className="weekly-urgent-item tone-warning" onClick={() => onNavigate?.("Schedule")}>
                <div>
                  <strong>Statement win · Week {weeklyHonors.week}</strong>
                  <span>{weeklyHonors.statementWin.detail}</span>
                </div>
                <span>›</span>
              </button>
            )}
          </div>
        </section>
      )}

      {weeklyHonors && (
        <section className="weekly-section">
          <h3 className="weekly-section__title">Weekly honors</h3>
          <Card variant="secondary">
            <CardContent className="text-sm text-[color:var(--text-muted)]" style={{ display: "grid", gap: 8, paddingTop: 16 }}>
              <strong style={{ color: "var(--text)" }}>Week {weeklyHonors.week} recognition</strong>
              {weeklyHonors.teamOfWeekId != null && (
                <div>Team of the week: <button className="btn-link" style={{ fontSize: "inherit" }} onClick={() => onTeamSelect?.(weeklyHonors.teamOfWeekId)}>{league?.teams?.find((t) => t.id === weeklyHonors.teamOfWeekId)?.name ?? "Open team profile"}</button></div>
              )}
              {weeklyHonors.story && <div>Headline: {weeklyHonors.story.headline}</div>}
              {weeklyHonors.playerOfWeek && (
                <div>
                  Player of the week: <button className="btn-link" style={{ fontSize: "inherit" }} onClick={() => onPlayerSelect?.(weeklyHonors.playerOfWeek.playerId)}>{weeklyHonors.playerOfWeek.name}</button>
                  {weeklyHonors.playerOfWeek.line ? ` · ${weeklyHonors.playerOfWeek.line}` : ""}
                </div>
              )}
              {weeklyHonors.rookieOfWeek && (
                <div>
                  Rookie spotlight: <button className="btn-link" style={{ fontSize: "inherit" }} onClick={() => onPlayerSelect?.(weeklyHonors.rookieOfWeek.playerId)}>{weeklyHonors.rookieOfWeek.name}</button>
                  {weeklyHonors.rookieOfWeek.line ? ` · ${weeklyHonors.rookieOfWeek.line}` : ""}
                </div>
              )}
              {weeklyHonors.topScoringGame && (
                <div>
                  Top scoring game: {league?.teams?.find((t) => t.id === normalizeTeamId(weeklyHonors.topScoringGame.away))?.abbr ?? "AWY"} {weeklyHonors.topScoringGame.awayScore} - {weeklyHonors.topScoringGame.homeScore} {league?.teams?.find((t) => t.id === normalizeTeamId(weeklyHonors.topScoringGame.home))?.abbr ?? "HME"}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <section className="weekly-section">
        <h3 className="weekly-section__title">Team-building guidance</h3>
        <Card variant="secondary">
          <CardContent className="text-sm text-[color:var(--text-muted)]" style={{ display: "grid", gap: 8, paddingTop: 16 }}>
            <strong style={{ color: "var(--text)" }}>{weeklyContext?.directionGuidance}</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(weeklyContext?.teamIntel?.needsNow ?? []).slice(0, 3).map((n) => (
                <Badge key={`wn-${n.pos}`} variant="destructive">Need now: {n.pos}</Badge>
              ))}
              {(weeklyContext?.teamIntel?.surplus ?? []).slice(0, 2).map((s) => (
                <Badge key={`ws-${s.pos}`} variant="outline">Surplus: {s.pos}</Badge>
              ))}
            </div>
            {(weeklyContext?.teamIntel?.warnings ?? []).slice(0, 2).map((w, idx) => (
              <div key={`${w}-${idx}`}>• {w}</div>
            ))}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("Roster")}>Open Roster</Button>
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("Trades")}>Open Trades</Button>
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("Free Agency")}>Open Free Agency</Button>
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("Draft Room")}>Open Draft</Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="weekly-section">
        <h3 className="weekly-section__title">Pressure points</h3>
        <div className="weekly-secondary-grid">
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Owner Pressure</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{ownerDisplay}</CardContent></Card>
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Cap Situation</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{formatMoneyM(cap.capRoom)} room</CardContent></Card>
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Expiring Contracts</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{weeklyContext.pressurePoints?.expiringCount ?? 0} expiring</CardContent></Card>
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Injuries</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{weeklyContext.pressurePoints?.injuriesCount ?? 0} active injuries</CardContent></Card>
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Trade Activity</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{weeklyContext.pressurePoints?.incomingTradeCount ?? 0} incoming offers</CardContent></Card>
          <Card variant="secondary"><CardHeader><CardTitle className="text-sm">Market Pulse</CardTitle></CardHeader><CardContent className="text-sm text-[color:var(--text-muted)]">{weeklyContext.marketPulse}</CardContent></Card>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <strong style={{ color: "var(--text)" }}>You Receive</strong>
                  {([...(topOfferSummary?.receive?.players ?? []), ...(topOfferSummary?.receive?.picks ?? [])].slice(0, 3)).map((item) => (
                    <div key={item.key}>• {item.label}</div>
                  ))}
                </div>
                <div>
                  <strong style={{ color: "var(--text)" }}>You Give</strong>
                  {([...(topOfferSummary?.give?.players ?? []), ...(topOfferSummary?.give?.picks ?? [])].slice(0, 3)).map((item) => (
                    <div key={item.key}>• {item.label}</div>
                  ))}
                </div>
              </div>
              {topOfferSummary ? (
                <div>
                  <div><strong style={{ color: "var(--text)" }}>{topOfferSummary.userImpact.abbr}</strong> OVR {topOfferSummary.userImpact.ovr.before} → {topOfferSummary.userImpact.ovr.after} · {topOfferSummary.userImpact.capLine}</div>
                  <div><strong style={{ color: "var(--text)" }}>{topOfferSummary.offeringImpact.abbr}</strong> OVR {topOfferSummary.offeringImpact.ovr.before} → {topOfferSummary.offeringImpact.ovr.after} · {topOfferSummary.offeringImpact.capLine}</div>
                </div>
              ) : null}
              {topOfferSummary ? <div><strong style={{ color: "var(--text)" }}>GM read:</strong> {topOfferSummary.recommendation}</div> : null}
              <div>{topOffer.reason}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(topOfferSummary?.tags ?? []).slice(0, 3).map((tag) => <Badge key={`hub-tag-${tag}`} variant="outline">{tag}</Badge>)}
                <Badge variant="outline">{topOffer.stance ?? "Market call"}</Badge>
                <Badge variant={topOffer.urgency === "high" ? "destructive" : "secondary"}>{topOffer.urgency === "high" ? "High urgency" : "Standard urgency"}</Badge>
                <Badge variant="outline">AI framing: {topOffer.offerType?.replaceAll("_", " ") ?? "trade call"}</Badge>
                <Badge variant="outline">Final acceptance uses AI logic</Badge>
              </div>
              {topOfferSummary ? <div style={{ fontSize: "var(--text-xs)" }}>{topOfferSummary.estimateLabel}</div> : null}
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

      <section className="weekly-section">
        <h3 className="weekly-section__title">League universe</h3>
        <Card variant="secondary">
          <CardContent className="text-sm text-[color:var(--text-muted)]" style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 16 }}>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Draft Room")}>Draft room</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Draft Board")}>Big board</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Mock Draft")}>Mock draft planner</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Analytics")}>Open analytics hub</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Financials")}>Review cap & contracts</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Injuries")}>League injury report</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("History")}>Open season archive</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Hall of Fame")}>View Hall of Fame</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Leaders")}>Browse stat leaders</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Season Recap")}>Open season recap</Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
