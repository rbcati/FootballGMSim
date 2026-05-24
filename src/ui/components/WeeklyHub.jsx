import React, { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ACTION_LABELS } from "../constants/navigationCopy.js";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM, formatPercent } from "../utils/numberFormatting.js";
import { buildIncomingOfferPresentation } from "../utils/tradeOfferPresentation.js";
import { buildNeedsAttentionItems, buildPrimaryAction, buildCommandCenterSummary } from "../utils/weeklyHubLayout.js";
import { findLatestUserCompletedGame } from "../utils/completedGameSelectors.js";
import { buildCompletedGamePresentation } from "../utils/boxScoreAccess.js";
import { buildWeeklyIntelligence, buildActionableWeeklyPriorities } from "../utils/weeklyIntelligence.js";
import { deriveWeeklyPrepState } from "../utils/weeklyPrep.js";
import { buildAdvanceReadinessGate } from "../utils/advanceReadinessGate.js";
import AdvanceReadinessGate from "./AdvanceReadinessGate.jsx";

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
  return "Offseason";
}

function SectionHeader({ title, subtitle, badge }) {
  return (
    <div className="weekly-section-head">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 className="weekly-section__title">{title}</h3>
        {badge ?? null}
      </div>
      {subtitle ? <p className="weekly-section__subtitle">{subtitle}</p> : null}
    </div>
  );
}

const QUICK_ACTIONS = [
  { icon: "🧭", label: "Team", sub: "Depth + game plan", tab: "Team" },
  { icon: "📋", label: "Roster", sub: "Lineup and contracts", tab: "Roster" },
  { icon: "📈", label: "League", sub: "Standings and leaders", tab: "League" },
  { icon: "💸", label: "Free Agency", sub: "Market movement", tab: "Free Agency" },
  { icon: "🎯", label: "Draft", sub: "Big board and picks", tab: "Draft" },
  { icon: "📰", label: "News", sub: "Latest stories", tab: "News" },
];

export default function WeeklyHub({ league, onNavigate, onAdvanceWeek, busy, simulating, onOpenBoxScore }) {
  const user = useMemo(() => getUserTeam(league), [league]);
  const nextGame = useMemo(() => getNextGame(league), [league]);
  const weeklyContext = useMemo(() => evaluateWeeklyContext(league), [league]);
  const latestCompletedGame = useMemo(() => findLatestUserCompletedGame(league), [league]);
  const latestResultPresentation = useMemo(
    () => buildCompletedGamePresentation(latestCompletedGame?.game ?? null, { seasonId: league?.seasonId, week: latestCompletedGame?.week, source: "weekly_hub_last_game" }),
    [league?.seasonId, latestCompletedGame],
  );
  const prep = useMemo(() => deriveWeeklyPrepState(league), [league]);
  const matchupIntel = useMemo(() => buildWeeklyIntelligence({ league, team: user, nextGame, prep }), [league, user, nextGame, prep]);
  const matchupPriorities = useMemo(() => buildActionableWeeklyPriorities({ team: user, nextGame, prep }), [user, nextGame, prep]);

  const gate = useMemo(
    () => buildAdvanceReadinessGate({ league, prep, weeklyContext }),
    [league, prep, weeklyContext],
  );
  const [showGate, setShowGate] = useState(false);

  if (!league || !user || !weeklyContext) return null;

  const cap = deriveTeamCapSnapshot(user, { fallbackCapTotal: 255 });
  const ownerMood = league.ownerMood ?? league.ownerApproval;
  const ownerDisplay = formatPercent(ownerMood, "—", { digits: 0 });
  const allAttentionItems = buildNeedsAttentionItems(weeklyContext, { limit: 6 });
  const primaryAction = buildPrimaryAction({
    league,
    nextGame,
    topNeeds: allAttentionItems,
    topOffer: weeklyContext?.incomingOffers?.[0],
    latestUserGameId: latestCompletedGame?.gameId ?? null,
  });

  const commandSummary = buildCommandCenterSummary({ gate, weeklyContext });

  const standingsMeta = useMemo(() => {
    const teams = Array.isArray(league?.teams) ? league.teams : [];
    const userTeam = teams.find((team) => Number(team?.id) === Number(league?.userTeamId));
    if (!userTeam) return { standingsPosition: "Unranked", divisionName: "Division", confRank: 0, overallRank: 0, playoffLineRecord: "—" };

    const divisionTeams = teams.filter((team) => Number(team?.conf) === Number(userTeam?.conf) && Number(team?.div) === Number(userTeam?.div));
    const byDivPct = [...divisionTeams].sort((a, b) => {
      const aGames = (a?.wins ?? 0) + (a?.losses ?? 0) + (a?.ties ?? 0);
      const bGames = (b?.wins ?? 0) + (b?.losses ?? 0) + (b?.ties ?? 0);
      const aPct = aGames ? ((a?.wins ?? 0) + 0.5 * (a?.ties ?? 0)) / aGames : 0;
      const bPct = bGames ? ((b?.wins ?? 0) + 0.5 * (b?.ties ?? 0)) / bGames : 0;
      return bPct - aPct;
    });
    const divRank = byDivPct.findIndex((team) => Number(team?.id) === Number(userTeam?.id)) + 1;

    const byConfPct = [...teams]
      .filter((team) => Number(team?.conf) === Number(userTeam?.conf))
      .sort((a, b) => {
        const aGames = (a?.wins ?? 0) + (a?.losses ?? 0) + (a?.ties ?? 0);
        const bGames = (b?.wins ?? 0) + (b?.losses ?? 0) + (b?.ties ?? 0);
        const aPct = aGames ? ((a?.wins ?? 0) + 0.5 * (a?.ties ?? 0)) / aGames : 0;
        const bPct = bGames ? ((b?.wins ?? 0) + 0.5 * (b?.ties ?? 0)) / bGames : 0;
        return bPct - aPct;
      });
    const confRank = byConfPct.findIndex((team) => Number(team?.id) === Number(userTeam?.id)) + 1;
    const playoffLine = byConfPct[6] ?? null;

    const byOverallPct = [...teams].sort((a, b) => {
      const aGames = (a?.wins ?? 0) + (a?.losses ?? 0) + (a?.ties ?? 0);
      const bGames = (b?.wins ?? 0) + (b?.losses ?? 0) + (b?.ties ?? 0);
      const aPct = aGames ? ((a?.wins ?? 0) + 0.5 * (a?.ties ?? 0)) / aGames : 0;
      const bPct = bGames ? ((b?.wins ?? 0) + 0.5 * (b?.ties ?? 0)) / bGames : 0;
      return bPct - aPct;
    });
    const overallRank = byOverallPct.findIndex((team) => Number(team?.id) === Number(userTeam?.id)) + 1;

    const divisionLabels = ["East", "North", "South", "West"];
    const divisionName = `${Number(userTeam?.conf) === 0 ? "AFC" : "NFC"} ${divisionLabels[Number(userTeam?.div)] ?? "Division"}`;
    return {
      standingsPosition: divRank > 0 ? `#${divRank}` : "Unranked",
      divisionName,
      confRank: confRank > 0 ? confRank : 0,
      overallRank: overallRank > 0 ? overallRank : 0,
      playoffLineRecord: playoffLine ? `${playoffLine.wins ?? 0}-${playoffLine.losses ?? 0}` : "—",
    };
  }, [league]);

  const topOffer = weeklyContext?.incomingOffers?.[0] ?? null;
  const topOfferSummary = topOffer ? buildIncomingOfferPresentation({ offer: topOffer, league, userTeamId: league?.userTeamId }) : null;
  const incomingOfferCount = Array.isArray(league?.incomingTradeOffers) ? league.incomingTradeOffers.length : 0;

  const handleAdvanceOrGate = () => {
    if (gate.shouldWarn) {
      setShowGate(true);
    } else {
      onAdvanceWeek?.();
    }
  };

  const handleGateAdvanceAnyway = () => {
    setShowGate(false);
    onAdvanceWeek?.();
  };

  const handleGateReview = (dest) => {
    setShowGate(false);
    onNavigate?.(dest);
  };

  const handlePrimaryAction = () => {
    if (primaryAction.type === "boxscore" && primaryAction.gameId) return onOpenBoxScore?.(primaryAction.gameId);
    if (primaryAction.type === "navigate") return onNavigate?.(primaryAction.tab);
    return handleAdvanceOrGate();
  };

  // Actions Required: unified source of truth via commandSummary (gate riskItems + context urgentItems merged)
  const primaryActions = commandSummary.primaryActions;
  const hasActions = primaryActions.length > 0;
  const actionsRequiredBadge = hasActions
    ? <Badge variant="outline" className={`tone-${commandSummary.readinessTone}`}>{commandSummary.criticalCount}</Badge>
    : null;

  return (
    <div className="weekly-hub-v2 weekly-hub-v3 app-screen-stack">

      {/* ── Hero ────────────────────────────────────────────────── */}
      <div className="hub-hero card-enter">
        <div className="hub-hero__eyebrow">WEEK {league?.week ?? 1} · SEASON {league?.seasonId ?? league?.year ?? "—"}</div>
        <div className="hub-hero__title">{user?.name ?? "Your Team"}</div>
        <div className="hub-hero__record">{user?.wins ?? 0}–{user?.losses ?? 0}{(user?.ties ?? 0) > 0 ? `–${user?.ties ?? 0}` : ""}</div>
        <div className="hub-hero__meta">{standingsMeta.standingsPosition} in {standingsMeta.divisionName}</div>
      </div>

      {/* ── GM Weekly Loop Hint (early-game guide, weeks 1–4) ───── */}
      {(league?.week ?? 1) <= 4 ? (
        <div
          className="weekly-loop-hint"
          role="note"
          aria-label="GM weekly loop guide"
          data-testid="gm-loop-hint"
          style={{ padding: '8px 12px', marginBottom: 8, background: 'var(--surface-2, var(--surface))', borderRadius: 8, fontSize: '0.82em', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, opacity: 0.9 }}
        >
          <strong style={{ marginRight: 2 }}>Weekly loop:</strong>
          <button
            style={{ background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer', textDecoration: 'underline', color: 'var(--accent, inherit)', fontSize: 'inherit' }}
            onClick={() => onNavigate?.("Roster")}
            aria-label="Go to Roster and Depth Chart"
          >1) Review roster/depth</button>
          <span aria-hidden="true">→</span>
          <button
            style={{ background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer', textDecoration: 'underline', color: 'var(--accent, inherit)', fontSize: 'inherit' }}
            onClick={() => onNavigate?.("Game Plan")}
            aria-label="Go to Game Plan"
          >2) Set game plan</button>
          <span aria-hidden="true">→</span>
          <button
            style={{ background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer', textDecoration: 'underline', color: 'var(--accent, inherit)', fontSize: 'inherit' }}
            onClick={() => onNavigate?.("Weekly Prep")}
            aria-label="Go to Weekly Prep"
          >3) Check actions required</button>
          <span aria-hidden="true">→</span>
          <span style={{ opacity: 0.75 }}>4) Advance week</span>
        </div>
      ) : null}

      {/* ── Readiness Warning Banner (only when danger-level) ───── */}
      {gate.shouldWarn && gate.severity === "danger" ? (
        <div className={`weekly-readiness-banner tone-danger`} role="alert" aria-live="polite">
          <strong>Advance blocked: </strong>
          {gate.riskItems.find((i) => i.severity === "danger")?.label ?? "Resolve blockers before advancing."}
          <Button size="sm" variant="ghost" style={{ marginLeft: 8 }} onClick={() => setShowGate(true)}>Review</Button>
        </div>
      ) : null}

      {/* ── Incoming Trade Offer Notification ───────────────────── */}
      {incomingOfferCount > 0 ? (
        <div
          className="weekly-readiness-banner tone-warning"
          role="status"
          aria-live="polite"
          data-testid="trade-offer-banner"
          style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}
        >
          <span>
            <strong>
              {incomingOfferCount === 1
                ? "You have 1 pending trade offer"
                : `You have ${incomingOfferCount} pending trade offers`}
            </strong>
            {" — review before advancing."}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate?.("Trade Center")}
            style={{ whiteSpace: "nowrap" }}
          >
            Open Trade Center
          </Button>
        </div>
      ) : null}

      {/* ── Actions Required ─────────────────────────────────────── */}
      <section className="weekly-section" aria-label="Actions Required">
        <SectionHeader
          title="Actions Required"
          subtitle={hasActions ? "Resolve before advancing this week." : "No blockers — you are clear to advance."}
          badge={actionsRequiredBadge}
        />
        {hasActions ? (
          <div className="weekly-urgent-list">
            {primaryActions.slice(0, 3).map((item, idx) => (
              <button
                key={`${item.label}-${idx}`}
                className={`weekly-urgent-item tone-${item.tone}`}
                onClick={() => {
                  const dest = item.tab ?? gate.primaryFixDestination ?? "Weekly Prep";
                  onNavigate?.(dest);
                }}
              >
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <span aria-hidden>›</span>
              </button>
            ))}
            {commandSummary.secondaryActions.length > 0 ? (
              <div style={{ marginTop: 4 }}>
                {commandSummary.secondaryActions.slice(0, 2).map((item, idx) => (
                  <button
                    key={`sec-${item.label}-${idx}`}
                    className={`weekly-urgent-item tone-${item.tone ?? "info"}`}
                    style={{ opacity: 0.8 }}
                    onClick={() => {
                      const dest = item.tab ?? "Weekly Prep";
                      onNavigate?.(dest);
                    }}
                  >
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <span aria-hidden>›</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="weekly-urgent-item tone-ok" style={{ padding: "10px 12px" }}>
            No urgent blockers. Review weekly prep and advance when ready.
          </p>
        )}
      </section>

      {/* ── This Week ────────────────────────────────────────────── */}
      <section className="weekly-section" aria-label="This Week">
        <SectionHeader title="This Week" subtitle="Primary action and advance controls." />
        <Card variant="primary" className="weekly-primary weekly-hero">
          <CardHeader className="weekly-primary__header">
            <div className="weekly-hero__identity">
              <CardTitle className="weekly-hero__title">{primaryAction.label}</CardTitle>
              <p className="weekly-primary__subtitle">{primaryAction.detail}</p>
            </div>
            <div className="weekly-hud__meta">
              <Badge variant="outline">{phaseLabel(league.phase)}</Badge>
              {nextGame ? <Badge>{`W${nextGame.week} ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.abbr ?? "TBD"}`}</Badge> : null}
              {gate.shouldWarn ? (
                <Badge className={`tone-${gate.severity}`}>{commandSummary.readinessLabel}</Badge>
              ) : (
                <Badge className="tone-ok">Ready</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="weekly-hero__actions">
            <Button size="lg" className="weekly-hero__action-main" disabled={busy || simulating} onClick={handlePrimaryAction}>
              {busy || simulating ? ACTION_LABELS.working : primaryAction.cta}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleAdvanceOrGate} disabled={busy || simulating}>
              {simulating ? ACTION_LABELS.simulating : ACTION_LABELS.advanceWeek}
            </Button>
          </CardContent>
        </Card>

        {showGate ? (
          <AdvanceReadinessGate
            gate={gate}
            onAdvanceAnyway={handleGateAdvanceAnyway}
            onReview={handleGateReview}
            onCancel={() => setShowGate(false)}
          />
        ) : null}
      </section>

      {/* ── Pulse ───────────────────────────────────────────────── */}
      <section className="weekly-section" aria-label="Pulse">
        <SectionHeader title="Pulse" subtitle="Record, cap, and owner confidence at a glance." />
        <div className="weekly-card-grid">
          <Card variant="secondary" className="weekly-hub-card">
            <CardContent className="weekly-hub-card__body">
              <p className="weekly-card-eyebrow">Record</p>
              <strong>{user.wins ?? 0}-{user.losses ?? 0}{(user.ties ?? 0) ? `-${user.ties}` : ""}</strong>
              <p>Owner approval {ownerDisplay}</p>
            </CardContent>
          </Card>
          <Card variant="secondary" className="weekly-hub-card">
            <CardContent className="weekly-hub-card__body">
              <p className="weekly-card-eyebrow">Matchup</p>
              <strong>
                {nextGame
                  ? `Week ${nextGame.week} ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.name ?? nextGame.opp?.abbr ?? "TBD"}`
                  : "No upcoming matchup"}
              </strong>
              <p>
                {nextGame
                  ? `${nextGame.opp?.wins ?? 0}-${nextGame.opp?.losses ?? 0} · finalize depth and game plan`
                  : "Advance to generate the next matchup."}
              </p>
              {nextGame ? (
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <Button size="sm" variant="outline" onClick={() => onNavigate?.("Weekly Prep")}>Weekly Prep</Button>
                  <Button size="sm" variant="ghost" onClick={() => onNavigate?.("Game Plan")}>Game Plan</Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card variant="secondary" className="weekly-hub-card">
            <CardContent className="weekly-hub-card__body">
              <p className="weekly-card-eyebrow">Cap</p>
              <strong>{formatMoneyM(cap.capRoom)} room</strong>
              <p>{Number(cap.capRoom ?? 0) < 0 ? "Over cap — open Financials now." : "Cap is stable."}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Matchup Intel (coordinator brief) ───────────────────── */}
      <details className="weekly-expandable" open>
        <summary className="weekly-expandable__summary">
          <div>
            <h3 className="weekly-section__title">{matchupIntel.heading}</h3>
            <p className="weekly-section__subtitle">Coordinator brief and priority actions for this week.</p>
          </div>
          <span className="weekly-expandable__chevron">▾</span>
        </summary>
        <div className="weekly-expandable__body">
          <div className="weekly-intel-insights" role="list" aria-label="Matchup intelligence insights">
            {matchupIntel.insights.map((insight) => (
              <div key={insight.id} role="listitem" className={`weekly-intel-insight tone-${insight.tone ?? "info"}`}>
                <span>{insight.text}</span>
              </div>
            ))}
          </div>
          {matchupPriorities.length > 0 ? (
            <div className="weekly-intel-priorities" aria-label="Weekly priorities" style={{ marginTop: 8 }}>
              {matchupPriorities.map((item) => (
                <div
                  key={item.id}
                  className={`weekly-urgent-item tone-${item.severity === "warning" ? "warning" : "info"}`}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px" }}
                >
                  {item.icon ? <span aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span> : null}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: "block" }}>{item.title}</strong>
                    <span style={{ display: "block", fontSize: "0.85em", opacity: 0.85, marginBottom: 6 }}>{item.description}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => item.targetRoute && onNavigate?.(item.targetRoute)}
                      disabled={!item.targetRoute}
                    >
                      {item.ctaLabel}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="weekly-hub-prep-ctas" style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Weekly Prep")}>Review weekly prep</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Game Plan")}>Review game plan</Button>
          </div>
        </div>
      </details>

      {/* ── Quick Navigation ─────────────────────────────────────── */}
      <section className="weekly-section" aria-label="Quick navigation">
        <SectionHeader title="Go To" subtitle="Quick access to every front-office surface." />
        <div className="hub-action-grid">
          {QUICK_ACTIONS.map((item) => (
            <button key={item.tab} className="hub-action-card card-enter" onClick={() => onNavigate?.(item.tab)}>
              <span className="hub-action-card__icon" aria-hidden>{item.icon}</span>
              <span className="hub-action-card__label">{item.label}</span>
              <span className="hub-action-card__sub">{item.sub}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Latest Result (background context, collapsed) ────────── */}
      <details className="weekly-expandable">
        <summary className="weekly-expandable__summary">
          <div>
            <h3 className="weekly-section__title">Latest Result</h3>
            <p className="weekly-section__subtitle">{latestCompletedGame?.story?.headline ?? "No completed game yet."}</p>
          </div>
          <span className="weekly-expandable__chevron">▾</span>
        </summary>
        <div className="weekly-expandable__body">
          <Card variant="secondary" className="weekly-hub-card">
            <CardContent className="weekly-hub-card__body">
              <p className="weekly-card-eyebrow">Last completed game</p>
              <strong>{latestCompletedGame?.story?.headline ?? "No completed game yet"}</strong>
              <p>{latestCompletedGame?.story?.detail ?? "Play and finish a game to unlock Game Book details."}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => (latestCompletedGame?.gameId ? onOpenBoxScore?.(latestCompletedGame.gameId) : onNavigate?.("Schedule"))}
              >
                {latestCompletedGame?.gameId ? (latestResultPresentation?.ctaLabel ?? "View result") : "Open schedule"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onNavigate?.("Weekly Results")}>
                Weekly Results
              </Button>
            </CardContent>
          </Card>
        </div>
      </details>

      {/* ── League context (background, collapsed) ───────────────── */}
      <details className="weekly-expandable">
        <summary className="weekly-expandable__summary">
          <div>
            <h3 className="weekly-section__title">League</h3>
            <p className="weekly-section__subtitle">
              {standingsMeta.confRank > 0 ? `Conference #${standingsMeta.confRank} · Playoff line ${standingsMeta.playoffLineRecord}` : "Standings and league news."}
            </p>
          </div>
          <span className="weekly-expandable__chevron">▾</span>
        </summary>
        <div className="weekly-expandable__body">
          <div className="weekly-card-grid">
            <Card variant="secondary" className="weekly-hub-card">
              <CardContent className="weekly-hub-card__body">
                <p className="weekly-card-eyebrow">Standings</p>
                <strong>{standingsMeta.confRank > 0 ? `Conference #${standingsMeta.confRank}` : "Unavailable"}</strong>
                <p>
                  {standingsMeta.overallRank > 0
                    ? `Overall #${standingsMeta.overallRank} · Playoff line ${standingsMeta.playoffLineRecord}`
                    : "Standings fill in as games are played."}
                </p>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Standings")}>Open standings</Button>
              </CardContent>
            </Card>
            <Card variant="secondary" className="weekly-hub-card">
              <CardContent className="weekly-hub-card__body">
                <p className="weekly-card-eyebrow">League desk</p>
                <strong>{topOffer ? `${topOffer.offeringTeamAbbr ?? "Team"} made an offer` : "No major league alerts"}</strong>
                <p>
                  {topOffer
                    ? (topOfferSummary?.estimateLabel ?? topOffer.reason ?? "Open Trade Center for details.")
                    : "Open league tabs for standings, leaders, and news."}
                </p>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.(topOffer ? "Trade Center" : "League")}>
                  {topOffer ? "Open trade center" : "Open league"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </details>

    </div>
  );
}
