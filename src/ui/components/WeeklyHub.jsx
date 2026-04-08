import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ACTION_LABELS } from "../constants/navigationCopy.js";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM, formatPercent } from "../utils/numberFormatting.js";
import { derivePregameAngles, deriveWeeklyHonors, derivePostgameStory, normalizeTeamId } from "../utils/gamePresentation.js";
import { buildIncomingOfferPresentation, getOfferIdentity } from "../utils/tradeOfferPresentation.js";
import { buildTeamIntelligence } from "../utils/teamIntelligence.js";
import { deriveTeamCoachingIdentity } from "../utils/coachingIdentity.js";
import { buildNeedsAttentionItems, buildPrimaryAction, buildTeamSnapshot, getDefaultExpandedSections } from "../utils/weeklyHubLayout.js";
import { resolveCompletedGameId } from "../utils/gameResultIdentity.js";
import FranchiseInvestmentsPanel from "./FranchiseInvestmentsPanel.jsx";
import { ScreenHeader } from "./ScreenSystem.jsx";
import { buildHeaderMetadata } from "../utils/screenSystem.js";

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

function phaseLabel(phase) {
  if (phase === "regular") return "Regular Season";
  if (phase === "playoffs") return "Playoffs";
  if (phase === "preseason") return "Preseason";
  if (phase === "draft") return "Draft";
  if (phase === "free_agency") return "Free Agency";
  if (phase === "offseason_resign") return "Re-Signing";
  return "Offseason";
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="weekly-section-head">
      <h3 className="weekly-section__title">{title}</h3>
      {subtitle ? <p className="weekly-section__subtitle">{subtitle}</p> : null}
    </div>
  );
}

function ExpandableSection({ title, subtitle, defaultOpen, children }) {
  return (
    <details className="weekly-expandable" open={defaultOpen}>
      <summary className="weekly-expandable__summary">
        <div>
          <h3 className="weekly-section__title">{title}</h3>
          {subtitle ? <p className="weekly-section__subtitle">{subtitle}</p> : null}
        </div>
        <span className="weekly-expandable__chevron">▾</span>
      </summary>
      <div className="weekly-expandable__body">{children}</div>
    </details>
  );
}

export default function WeeklyHub({ league, actions, onNavigate, onAdvanceWeek, busy, simulating, onPlayerSelect, onTeamSelect, onOpenBoxScore }) {
  const defaults = getDefaultExpandedSections();
  const user = useMemo(() => getUserTeam(league), [league]);
  const nextGame = useMemo(() => getNextGame(league), [league]);
  const weeklyContext = useMemo(() => evaluateWeeklyContext(league), [league]);
  const teamIntel = useMemo(() => buildTeamIntelligence(user, { week: league?.week ?? 1 }), [user, league?.week]);
  const weeklyHonors = useMemo(() => deriveWeeklyHonors(league), [league]);
  const coachingIdentity = useMemo(() => deriveTeamCoachingIdentity(user, { pressure: weeklyContext?.pressure, intel: teamIntel, direction: weeklyContext?.direction }), [user, weeklyContext, teamIntel]);
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
  const latestUserGameId = useMemo(() => {
    const targetWeek = Number(league?.week ?? 1) - 1;
    if (!league?.seasonId || targetWeek < 1) return null;
    const weekData = league?.schedule?.weeks?.find((w) => Number(w?.week) === targetWeek);
    const userGame = (weekData?.games ?? []).find((g) => {
      const homeId = normalizeTeamId(g?.home);
      const awayId = normalizeTeamId(g?.away);
      return g?.played && (homeId === league?.userTeamId || awayId === league?.userTeamId);
    });
    if (!userGame) return null;
    return resolveCompletedGameId(userGame, { seasonId: league.seasonId, week: targetWeek });
  }, [league]);

  if (!league || !user || !weeklyContext) return null;

  const cap = deriveTeamCapSnapshot(user, { fallbackCapTotal: 255 });
  const ownerMood = league.ownerMood ?? league.ownerApproval;
  const ownerDisplay = formatPercent(ownerMood, "—", { digits: 0 });
  const pressure = weeklyContext?.pressure;
  const topOffer = weeklyContext?.incomingOffers?.[0] ?? null;
  const topOfferSummary = topOffer ? buildIncomingOfferPresentation({ offer: topOffer, league, userTeamId: league?.userTeamId }) : null;
  const topOfferIdentity = topOffer ? getOfferIdentity(topOffer) : null;
  const attentionItems = buildNeedsAttentionItems(weeklyContext, { limit: 5 });
  const primaryAction = buildPrimaryAction({ league, nextGame, topNeeds: attentionItems, topOffer, latestUserGameId });
  const snapshotTiles = buildTeamSnapshot({
    user,
    weeklyContext,
    cap: formatMoneyM(cap.capRoom),
    nextGame,
    userLastGameStory,
  });
  const pregameAngles = nextGame ? derivePregameAngles({ league, game: null, week: nextGame.week }) : [];

  const handlePrimaryAction = () => {
    if (primaryAction.type === "boxscore" && primaryAction.gameId) return onOpenBoxScore?.(primaryAction.gameId);
    if (primaryAction.type === "navigate") return onNavigate?.(primaryAction.tab);
    return onAdvanceWeek?.();
  };

  return (
    <div className="weekly-hub-v2 weekly-hub-v3 app-screen-stack">
      <ScreenHeader
        title="Weekly Hub"
        subtitle="Your command center for this week: context, priorities, and next action."
        eyebrow={`${user.name} · ${phaseLabel(league.phase)}`}
        metadata={buildHeaderMetadata([
          { label: "Week", value: league.week ?? 1 },
          { label: "Record", value: `${user.wins ?? 0}-${user.losses ?? 0}${(user.ties ?? 0) ? `-${user.ties}` : ""}` },
          { label: "Cap", value: formatMoneyM(cap.capRoom) },
        ])}
      />
      <Card variant="primary" className="weekly-primary weekly-hero">
        <CardHeader className="weekly-primary__header">
          <div className="weekly-hero__identity">
            <p className="weekly-hud__eyebrow">{user.name} · {phaseLabel(league.phase)} · Week {league.week ?? 1}</p>
            <CardTitle className="weekly-hero__title">{primaryAction.label}</CardTitle>
            <p className="weekly-primary__subtitle">{primaryAction.detail}</p>
          </div>
          <div className="weekly-hud__meta">
            <Badge variant="outline">{user.wins ?? 0}-{user.losses ?? 0}{(user.ties ?? 0) ? `-${user.ties}` : ""}</Badge>
            <Badge>Owner {pressure?.owner?.state ?? "Stable"} {ownerDisplay}</Badge>
            {pressure?.fans?.state ? <Badge variant="secondary">Fans {pressure.fans.state}</Badge> : null}
            {pressure?.media?.state ? <Badge variant="outline">Media {pressure.media.state}</Badge> : null}
            <Badge variant="secondary">Cap {formatMoneyM(cap.capRoom)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="weekly-hero__actions">
          <Button size="lg" className="weekly-hero__action-main" disabled={busy || simulating} onClick={handlePrimaryAction}>
            {busy || simulating ? ACTION_LABELS.working : primaryAction.cta}
          </Button>
          <Button size="sm" variant="secondary" onClick={onAdvanceWeek} disabled={busy || simulating}>{simulating ? ACTION_LABELS.simulating : ACTION_LABELS.advanceWeek}</Button>
          {(weeklyContext.phaseShortcuts ?? []).slice(0, 3).map((shortcut) => (
            <Button key={shortcut.tab} size="sm" variant="outline" onClick={() => onNavigate?.(shortcut.tab)}>{shortcut.label}</Button>
          ))}
        </CardContent>
      </Card>

      <section className="weekly-section">
        <SectionHeader title="What just happened" subtitle="Result context first, then what is next." />
        <div className="weekly-card-grid">
          <Card variant="secondary" className="weekly-hub-card">
            <CardContent className="weekly-hub-card__body">
              <p className="weekly-card-eyebrow">Latest Result</p>
              <strong>{userLastGameStory?.headline ?? "No completed game yet"}</strong>
              <p>{userLastGameStory?.detail ?? "Play a game to populate recap context."}</p>
              <Button size="sm" variant="outline" onClick={() => (latestUserGameId ? onOpenBoxScore?.(latestUserGameId) : onNavigate?.("Schedule"))}>Review box score</Button>
            </CardContent>
          </Card>
          <Card variant="secondary" className="weekly-hub-card">
            <CardContent className="weekly-hub-card__body">
              <p className="weekly-card-eyebrow">Next Opponent</p>
              <strong>{nextGame ? `Week ${nextGame.week} ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.name ?? nextGame.opp?.abbr ?? "TBD"}` : "No upcoming matchup"}</strong>
              <p>{pregameAngles[0]?.label ?? weeklyContext.phasePriority}</p>
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("Schedule")}>Open schedule</Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="weekly-section">
        <SectionHeader title="Actions needed now" subtitle="Urgent items only. Top 5 max." />
        <div className="weekly-urgent-list">
          {attentionItems.map((item, idx) => (
            <button key={`${item.label}-${idx}`} className={`weekly-urgent-item tone-${item.tone}`} onClick={() => onNavigate?.(item.tab)}>
              <div>
                <div className="weekly-inline-meta">
                  <strong>{item.label}</strong>
                  <Badge variant={item.level === "blocker" ? "destructive" : "outline"}>{item.level === "blocker" ? "Blocker" : "Recommended"}</Badge>
                </div>
                <span>{item.detail}</span>
              </div>
              <span>›</span>
            </button>
          ))}
        </div>
      </section>

      <section className="weekly-section">
        <SectionHeader title="Team snapshot" subtitle="Compact status only." />
        <div className="weekly-stat-grid">
          {snapshotTiles.map((tile) => (
            <Card key={tile.label} variant="secondary" className="weekly-stat-tile">
              <CardContent className="weekly-stat-tile__body">
                <span>{tile.label}</span>
                <strong>{tile.value}</strong>
                <small>{tile.context}</small>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <ExpandableSection title="Front office / organization" subtitle="Investments, ownership, and infrastructure." defaultOpen={defaults.frontOffice}>
        <div className="weekly-card-grid">
          <Card variant="secondary" className="weekly-hub-card">
            <CardHeader><CardTitle className="text-sm">Franchise investments</CardTitle></CardHeader>
            <CardContent><FranchiseInvestmentsPanel team={user} actions={actions} compact onNavigate={onNavigate} /></CardContent>
          </Card>
          <Card variant="secondary" className="weekly-hub-card">
            <CardContent className="weekly-hub-card__body">
              <p className="weekly-card-eyebrow">Pressure & ownership digest</p>
              <div className="weekly-digest-list">
                <div><strong>Owner:</strong> {pressure?.owner?.state ?? "Stable"}</div>
                <div><strong>Fans:</strong> {pressure?.fans?.state ?? "Hopeful"}</div>
                <div><strong>Media:</strong> {pressure?.media?.state ?? "Watching"}</div>
                <div><strong>Directives:</strong> {(pressure?.directives ?? []).slice(0, 2).map((d) => `${d.theme} (${d.progress}%)`).join(" · ") || "No active directives"}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("🤖 GM Advisor")}>Open owner directives</Button>
            </CardContent>
          </Card>
          {teamIntel?.organization && (
            <Card variant="secondary" className="weekly-hub-card">
              <CardContent className="weekly-hub-card__body">
                <p className="weekly-card-eyebrow">Organization quality digest</p>
                <div className="weekly-digest-list">
                  <div><strong>Development:</strong> {teamIntel.organization.developmentEnvironment?.state}</div>
                  <div><strong>Recovery:</strong> {teamIntel.organization.recoveryEnvironment?.state}</div>
                  <div><strong>FA destination:</strong> {teamIntel.organization.freeAgentDestination?.state}</div>
                  <div><strong>Scouting:</strong> {teamIntel.organization.scoutingConfidence?.state}</div>
                </div>
                <small>{teamIntel.organization.developmentEnvironment?.reasons?.[0] ?? "No additional notes."}</small>
              </CardContent>
            </Card>
          )}
        </div>
      </ExpandableSection>

      <ExpandableSection title="More / expanded insights" subtitle="Storylines and long-form guidance." defaultOpen={defaults.insights}>
        <div className="weekly-card-stack">
          <Card variant="secondary" className="weekly-hub-card">
            <CardContent className="weekly-hub-card__body">
              <p className="weekly-card-eyebrow">League storylines</p>
              <div className="weekly-digest-list">
                {(weeklyContext.storylineCards?.length ? weeklyContext.storylineCards : [{ title: "No major storyline spikes", detail: "League picture is stable.", tab: "Standings" }]).slice(0, 2).map((story, idx) => (
                  <button key={`${story.title}-${idx}`} className="weekly-digest-action" onClick={() => onNavigate?.(story.tab ?? "Standings")}>{story.title} — {story.detail}</button>
                ))}
              </div>
            </CardContent>
          </Card>

          {weeklyHonors && (
            <Card variant="secondary" className="weekly-hub-card">
              <CardContent className="weekly-hub-card__body">
                <p className="weekly-card-eyebrow">Weekly honors</p>
                <div className="weekly-digest-list">
                  {weeklyHonors.teamOfWeekId != null && <div>Team: <button className="btn-link" onClick={() => onTeamSelect?.(weeklyHonors.teamOfWeekId)}>{league?.teams?.find((t) => t.id === weeklyHonors.teamOfWeekId)?.name ?? "Open team"}</button></div>}
                  {weeklyHonors.playerOfWeek && <div>Player: <button className="btn-link" onClick={() => onPlayerSelect?.(weeklyHonors.playerOfWeek.playerId)}>{weeklyHonors.playerOfWeek.name}</button></div>}
                  {weeklyHonors.rookieOfWeek && <div>Rookie: <button className="btn-link" onClick={() => onPlayerSelect?.(weeklyHonors.rookieOfWeek.playerId)}>{weeklyHonors.rookieOfWeek.name}</button></div>}
                </div>
              </CardContent>
            </Card>
          )}

          {coachingIdentity && (
            <Card variant="secondary" className="weekly-hub-card">
              <CardContent className="weekly-hub-card__body">
                <p className="weekly-card-eyebrow">Coaching pulse</p>
                <strong>{coachingIdentity.continuity.label} · {coachingIdentity.seat.label}</strong>
                <p>{coachingIdentity.philosophy.offSchemeName} / {coachingIdentity.philosophy.defSchemeName}</p>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Staff")}>Open staff operations</Button>
              </CardContent>
            </Card>
          )}

          {topOffer && (
            <Card variant="secondary" className="weekly-hub-card">
              <CardContent className="weekly-hub-card__body">
                <p className="weekly-card-eyebrow">Top trade offer</p>
                <strong>{topOffer.offeringTeamAbbr ?? "Team"} is calling</strong>
                <p>{topOffer.reason}</p>
                {topOfferSummary ? <small>{topOfferIdentity?.label} · {topOfferSummary.estimateLabel}</small> : null}
                <div className="weekly-inline-actions">
                  <Button size="sm" onClick={() => actions?.acceptIncomingTrade?.(topOffer.id)}>Accept</Button>
                  <Button size="sm" variant="secondary" onClick={() => actions?.rejectIncomingTrade?.(topOffer.id)}>Reject</Button>
                  <Button size="sm" variant="outline" onClick={() => onNavigate?.("Trades")}>Open trades</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ExpandableSection>
    </div>
  );
}
