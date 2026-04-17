import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ACTION_LABELS } from "../constants/navigationCopy.js";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM, formatPercent } from "../utils/numberFormatting.js";
import { buildIncomingOfferPresentation } from "../utils/tradeOfferPresentation.js";
import { buildNeedsAttentionItems, buildPrimaryAction } from "../utils/weeklyHubLayout.js";
import { findLatestUserCompletedGame } from "../utils/completedGameSelectors.js";
import { buildCompletedGamePresentation } from "../utils/boxScoreAccess.js";

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

function SectionHeader({ title, subtitle }) {
  return (
    <div className="weekly-section-head">
      <h3 className="weekly-section__title">{title}</h3>
      {subtitle ? <p className="weekly-section__subtitle">{subtitle}</p> : null}
    </div>
  );
}

export default function WeeklyHub({ league, onNavigate, onAdvanceWeek, busy, simulating, onOpenBoxScore }) {
  const user = useMemo(() => getUserTeam(league), [league]);
  const nextGame = useMemo(() => getNextGame(league), [league]);
  const weeklyContext = useMemo(() => evaluateWeeklyContext(league), [league]);
  const latestCompletedGame = useMemo(() => findLatestUserCompletedGame(league), [league]);
  const latestResultPresentation = useMemo(() => buildCompletedGamePresentation(latestCompletedGame?.game ?? null, { seasonId: league?.seasonId, week: latestCompletedGame?.week, source: "weekly_hub_last_game" }), [league?.seasonId, latestCompletedGame]);

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

  const standingsSnapshot = useMemo(() => {
    const teams = Array.isArray(league?.teams) ? league.teams : [];
    const userTeam = teams.find((team) => Number(team.id) === Number(league?.userTeamId));
    if (!userTeam) return null;
    const byPct = [...teams].sort((a, b) => {
      const aGames = (a.wins ?? 0) + (a.losses ?? 0) + (a.ties ?? 0);
      const bGames = (b.wins ?? 0) + (b.losses ?? 0) + (b.ties ?? 0);
      const aPct = aGames ? ((a.wins ?? 0) + 0.5 * (a.ties ?? 0)) / aGames : 0;
      const bPct = bGames ? ((b.wins ?? 0) + 0.5 * (b.ties ?? 0)) / bGames : 0;
      return bPct - aPct;
    });
    const conferenceTeams = byPct.filter((team) => Number(team.conf) === Number(userTeam.conf));
    const confRank = conferenceTeams.findIndex((team) => Number(team.id) === Number(userTeam.id)) + 1;
    const playoffLine = conferenceTeams[6] ?? null;
    return {
      confRank,
      overallRank: byPct.findIndex((team) => Number(team.id) === Number(userTeam.id)) + 1,
      playoffLineRecord: playoffLine ? `${playoffLine.wins ?? 0}-${playoffLine.losses ?? 0}` : "—",
    };
  }, [league]);

  const topOffer = weeklyContext?.incomingOffers?.[0] ?? null;

  const standingsMeta = useMemo(() => {
    const teams = Array.isArray(league?.teams) ? league.teams : [];
    const userTeam = teams.find((team) => Number(team?.id) === Number(league?.userTeamId));
    if (!userTeam) return { standingsPosition: 'Unranked', divisionName: 'Division' };
    const divisionTeams = teams.filter((team) => Number(team?.conf) === Number(userTeam?.conf) && Number(team?.div) === Number(userTeam?.div));
    const byPct = [...divisionTeams].sort((a, b) => {
      const aGames = (a?.wins ?? 0) + (a?.losses ?? 0) + (a?.ties ?? 0);
      const bGames = (b?.wins ?? 0) + (b?.losses ?? 0) + (b?.ties ?? 0);
      const aPct = aGames ? ((a?.wins ?? 0) + 0.5 * (a?.ties ?? 0)) / aGames : 0;
      const bPct = bGames ? ((b?.wins ?? 0) + 0.5 * (b?.ties ?? 0)) / bGames : 0;
      return bPct - aPct;
    });
    const divRank = byPct.findIndex((team) => Number(team?.id) === Number(userTeam?.id)) + 1;
    const divisionLabels = ['East', 'North', 'South', 'West'];
    const divisionName = `${Number(userTeam?.conf) === 0 ? 'AFC' : 'NFC'} ${divisionLabels[Number(userTeam?.div)] ?? 'Division'}`;
    return { standingsPosition: divRank > 0 ? `#${divRank}` : 'Unranked', divisionName };
  }, [league]);

  const quickActions = useMemo(() => ([
    { icon: '🧭', label: 'Team', sub: 'Depth + game plan', tab: 'Team' },
    { icon: '📋', label: 'Roster', sub: 'Lineup and contracts', tab: 'Roster' },
    { icon: '📈', label: 'League', sub: 'Standings and leaders', tab: 'League' },
    { icon: '💸', label: 'Free Agency', sub: 'Market movement', tab: 'Free Agency' },
    { icon: '🎯', label: 'Draft', sub: 'Big board and picks', tab: 'Draft' },
    { icon: '📰', label: 'News', sub: 'Latest stories', tab: 'News' },
  ]), []);

  const topOfferSummary = topOffer ? buildIncomingOfferPresentation({ offer: topOffer, league, userTeamId: league?.userTeamId }) : null;

  const handlePrimaryAction = () => {
    if (primaryAction.type === "boxscore" && primaryAction.gameId) return onOpenBoxScore?.(primaryAction.gameId);
    if (primaryAction.type === "navigate") return onNavigate?.(primaryAction.tab);
    return onAdvanceWeek?.();
  };

  return (
    <div className="weekly-hub-v2 weekly-hub-v3 app-screen-stack">
      <div className="hub-hero card-enter">
        <div className="hub-hero__eyebrow">WEEK {league?.week ?? 1} · SEASON {league?.seasonId ?? league?.year ?? '—'}</div>
        <div className="hub-hero__title">{user?.name ?? 'Your Team'}</div>
        <div className="hub-hero__record">{user?.wins ?? 0}–{user?.losses ?? 0}{(user?.ties ?? 0) > 0 ? `–${user?.ties ?? 0}` : ''}</div>
        <div className="hub-hero__meta">{standingsMeta.standingsPosition} in {standingsMeta.divisionName}</div>
      </div>

      <div className="hub-action-grid">
        {quickActions.map((item) => (
          <button key={item.tab} className="hub-action-card card-enter" onClick={() => onNavigate?.(item.tab)}>
            <span className="hub-action-card__icon" aria-hidden>{item.icon}</span>
            <span className="hub-action-card__label">{item.label}</span>
            <span className="hub-action-card__sub">{item.sub}</span>
          </button>
        ))}
      </div>

      <section className="weekly-section">
        <SectionHeader title="This Week" subtitle="Primary action first, then urgent follow-ups." />
        <Card variant="primary" className="weekly-primary weekly-hero">
          <CardHeader className="weekly-primary__header">
            <div className="weekly-hero__identity">
              <CardTitle className="weekly-hero__title">{primaryAction.label}</CardTitle>
              <p className="weekly-primary__subtitle">{primaryAction.detail}</p>
            </div>
            <div className="weekly-hud__meta">
              <Badge variant="outline">{phaseLabel(league.phase)}</Badge>
              {nextGame ? <Badge>{`W${nextGame.week} ${nextGame.isHome ? 'vs' : '@'} ${nextGame.opp?.abbr ?? 'TBD'}`}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="weekly-hero__actions">
            <Button size="lg" className="weekly-hero__action-main" disabled={busy || simulating} onClick={handlePrimaryAction}>
              {busy || simulating ? ACTION_LABELS.working : primaryAction.cta}
            </Button>
            <Button size="sm" variant="secondary" onClick={onAdvanceWeek} disabled={busy || simulating}>{simulating ? ACTION_LABELS.simulating : ACTION_LABELS.advanceWeek}</Button>
          </CardContent>
        </Card>
        {allAttentionItems.length > 0 ? (
          <div className="weekly-urgent-list" style={{ marginTop: 8 }}>
            {allAttentionItems.slice(0, 3).map((item, idx) => (
              <button key={`${item.label}-${idx}`} className={`weekly-urgent-item tone-${item.tone}`} onClick={() => onNavigate?.(item.tab)}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <span>›</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="weekly-section">
        <SectionHeader title="Team Snapshot" subtitle="Compact context: record, owner confidence, and cap." />
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
              <p className="weekly-card-eyebrow">Next opponent</p>
              <strong>{nextGame ? `Week ${nextGame.week} ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.name ?? nextGame.opp?.abbr ?? "TBD"}` : "No upcoming matchup"}</strong>
              <p>{nextGame ? "Prepare lineup and game plan before kickoff." : "Advance to generate the next matchup."}</p>
            </CardContent>
          </Card>
          <Card variant="secondary" className="weekly-hub-card">
            <CardContent className="weekly-hub-card__body">
              <p className="weekly-card-eyebrow">Cap</p>
              <strong>{formatMoneyM(cap.capRoom)} room</strong>
              <p>{Number(cap.capRoom ?? 0) < 0 ? "Over cap: open Financials now." : "Cap is stable this week."}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="weekly-section">
        <SectionHeader title="Results" subtitle="One direct path to the latest completed game." />
        <Card variant="secondary" className="weekly-hub-card">
          <CardContent className="weekly-hub-card__body">
            <p className="weekly-card-eyebrow">Latest completed game</p>
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
      </section>

      <details className="weekly-expandable">
        <summary className="weekly-expandable__summary">
          <div>
            <h3 className="weekly-section__title">League</h3>
            <p className="weekly-section__subtitle">Compact standings + top league signal.</p>
          </div>
          <span className="weekly-expandable__chevron">▾</span>
        </summary>
        <div className="weekly-expandable__body">
          <div className="weekly-card-grid">
            <Card variant="secondary" className="weekly-hub-card">
              <CardContent className="weekly-hub-card__body">
                <p className="weekly-card-eyebrow">Standings</p>
                <strong>{standingsSnapshot ? `Conference #${standingsSnapshot.confRank}` : "Unavailable"}</strong>
                <p>{standingsSnapshot ? `Overall #${standingsSnapshot.overallRank} · Playoff line ${standingsSnapshot.playoffLineRecord}` : "Standings fill in as games are played."}</p>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Standings")}>Open standings</Button>
              </CardContent>
            </Card>
            <Card variant="secondary" className="weekly-hub-card">
              <CardContent className="weekly-hub-card__body">
                <p className="weekly-card-eyebrow">League desk</p>
                <strong>{topOffer ? `${topOffer.offeringTeamAbbr ?? "Team"} made an offer` : "No major league alerts"}</strong>
                <p>{topOffer ? (topOfferSummary?.estimateLabel ?? topOffer.reason ?? "Open Trade Center for details.") : "Open league tabs for standings, leaders, and news."}</p>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.(topOffer ? "Trade Center" : "League")}>{topOffer ? "Open trade center" : "Open league"}</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </details>
    </div>
  );
}
