import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM } from "../utils/numberFormatting.js";
import { findLatestUserCompletedGame } from "../utils/completedGameSelectors.js";
import FranchiseSummaryPanel from "./FranchiseSummaryPanel.jsx";

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getNextGame(league) {
  if (!league?.schedule?.weeks) return null;
  for (const week of league.schedule.weeks) {
    for (const game of week.games ?? []) {
      if (game.played) continue;
      const homeId = Number(typeof game.home === "object" ? game.home.id : game.home);
      const awayId = Number(typeof game.away === "object" ? game.away.id : game.away);
      if (homeId !== Number(league.userTeamId) && awayId !== Number(league.userTeamId)) continue;
      const isHome = homeId === Number(league.userTeamId);
      const oppId = isHome ? awayId : homeId;
      const opp = (league.teams ?? []).find((t) => Number(t.id) === oppId);
      return { week: week.week, isHome, opp };
    }
  }
  return null;
}

function conferenceContext(league, userTeam) {
  if (!league?.teams?.length || !userTeam) return null;
  const pct = (team) => {
    const wins = safeNumber(team.wins);
    const losses = safeNumber(team.losses);
    const ties = safeNumber(team.ties);
    const games = wins + losses + ties;
    return games ? (wins + ties * 0.5) / games : 0;
  };
  const confTeams = [...league.teams]
    .filter((t) => Number(t.conf) === Number(userTeam.conf))
    .sort((a, b) => pct(b) - pct(a));
  const confRank = confTeams.findIndex((t) => Number(t.id) === Number(userTeam.id)) + 1;
  const playoffLine = confTeams[6] ?? null;
  return {
    confRank: confRank > 0 ? confRank : null,
    playoffLine: playoffLine ? `${playoffLine.wins ?? 0}-${playoffLine.losses ?? 0}` : "—",
  };
}

function getPrimaryAction({ weekly, latestGameId, nextGame, busy, simulating }) {
  const blocker = (weekly?.urgentItems ?? []).find((item) => item?.level === "blocker");
  if (latestGameId) {
    return {
      label: "Review Box Score",
      cta: "Review Box Score",
      detail: "Use the last game trends before making this week’s calls.",
      onClick: "box",
      disabled: false,
    };
  }
  if (blocker) {
    const lineupTabs = ["Injuries", "Depth Chart", "Roster"];
    const isLineupFix = lineupTabs.includes(blocker.tab);
    return {
      label: isLineupFix ? "Set Lineup" : "Open Game Plan",
      cta: isLineupFix ? "Set Lineup" : "Open Game Plan",
      detail: blocker.detail,
      tab: blocker.tab ?? "Game Plan",
      onClick: "navigate",
      disabled: false,
    };
  }
  if (nextGame) {
    return {
      label: "Finalize Week Plan",
      cta: "Set Lineup",
      detail: `Week ${nextGame.week} ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.name ?? "TBD"} is next. Lock depth, then review roster fit.`,
      tab: "Roster",
      onClick: "navigate",
      disabled: false,
    };
  }
  return {
    label: "Advance Week",
    cta: simulating ? "Simulating…" : "Advance Week",
    detail: "No blockers active. Keep the season moving.",
    onClick: "advance",
    disabled: busy || simulating,
  };
}

function trendWord(delta, positiveWord = "improving", negativeWord = "slipping") {
  if (delta > 0) return positiveWord;
  if (delta < 0) return negativeWord;
  return "stable";
}

function storylineTag(card) {
  const text = `${card?.title ?? ""} ${card?.detail ?? ""}`.toLowerCase();
  if (text.includes("playoff")) return "Playoff Race";
  if (text.includes("owner") || text.includes("pressure") || text.includes("seat")) return "Hot Seat";
  if (text.includes("rival") || text.includes("division")) return "Rivalry";
  if (text.includes("injur")) return "Injury Watch";
  if (text.includes("breakout") || text.includes("rookie")) return "Breakout";
  if (text.includes("trade")) return "Trade Buzz";
  return "League Watch";
}

function deriveSmartDestination(item = {}) {
  const rawTab = item?.tab;
  const detail = `${item?.label ?? ""} ${item?.detail ?? ""} ${item?.why ?? ""}`.toLowerCase();
  if (rawTab === "Transactions") {
    if (detail.includes("offer") || detail.includes("inbox") || detail.includes("counter")) return "Transactions:Offers";
    if (detail.includes("explore") || detail.includes("partner")) return "Transactions:Finder";
    return "Transactions:Summary";
  }
  if (rawTab === "Roster" || rawTab === "Depth Chart") {
    if (detail.includes("depth") || detail.includes("starter")) return "Roster:depth|STARTERS";
    if (detail.includes("expir")) return "Roster:table|EXPIRING";
    if (detail.includes("injur")) return "Roster:table|INJURED";
    if (detail.includes("develop")) return "Roster:table|DEVELOPMENT";
    return "Roster:table|ALL";
  }
  if (rawTab === "Stats" || detail.includes("leader") || detail.includes("passing") || detail.includes("rushing") || detail.includes("receiving")) {
    if (detail.includes("defens") || detail.includes("sack") || detail.includes("tackle")) return "Stats:defense";
    if (detail.includes("rush")) return "Stats:rushing";
    if (detail.includes("receiv")) return "Stats:receiving";
    return "Stats:passing";
  }
  return rawTab;
}

export default function FranchiseHQ({ league, onNavigate, onAdvanceWeek, busy, simulating, onOpenBoxScore }) {
  const userTeam = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)), [league]);
  const weekly = useMemo(() => evaluateWeeklyContext(league), [league]);
  const nextGame = useMemo(() => getNextGame(league), [league]);
  const latest = useMemo(() => findLatestUserCompletedGame(league), [league]);
  const standing = useMemo(() => conferenceContext(league, userTeam), [league, userTeam]);
  if (!league || !userTeam) return null;

  const cap = deriveTeamCapSnapshot(userTeam, { fallbackCapTotal: 255 });
  const urgent = (weekly?.urgentItems ?? weekly?.needsAttention ?? []).slice(0, 4);
  const storylines = (weekly?.storylineCards ?? []).slice(0, 4);
  const record = `${safeNumber(userTeam.wins)}-${safeNumber(userTeam.losses)}${safeNumber(userTeam.ties) ? `-${safeNumber(userTeam.ties)}` : ""}`;
  const recent = Array.isArray(userTeam.recentResults) ? userTeam.recentResults.slice(-5) : [];
  const recentWins = recent.filter((r) => r === "W").length;
  const pressureScore = safeNumber(weekly?.pressure?.owner?.score, 50);
  const injuries = safeNumber(weekly?.pressurePoints?.injuriesCount);
  const expiring = safeNumber(weekly?.pressurePoints?.expiringCount);
  const latestDelta = recent.length ? recentWins - (recent.length - recentWins) : 0;
  const primaryAction = getPrimaryAction({ weekly, latestGameId: latest?.gameId, nextGame, busy, simulating });
  const isEarlySave = safeNumber(league?.week, 1) <= 1 && safeNumber(userTeam?.wins) + safeNumber(userTeam?.losses) + safeNumber(userTeam?.ties) === 0;
  const needsCutdown = league?.phase === "preseason" && safeNumber(userTeam?.rosterCount) > 53;

  const pulseTiles = [
    {
      label: "Momentum",
      value: recent.length ? `${recent.join(" ")}` : "No trend yet",
      trend: recent.length ? trendWord(latestDelta, "rising", "slipping") : "stable",
      note: recent.length ? `${recentWins}-${recent.length - recentWins} in last ${recent.length}` : "Need completed games",
    },
    {
      label: "Playoff Outlook",
      value: standing?.confRank ? `Conf #${standing.confRank}` : "Race forming",
      trend: standing?.confRank && standing.confRank <= 7 ? "improving" : "tightening",
      note: `Cut line: ${standing?.playoffLine ?? "—"}`,
    },
    {
      label: "Cap Health",
      value: `${formatMoneyM(cap.capRoom)} room`,
      trend: cap.capRoom >= 12 ? "flexible" : cap.capRoom >= 0 ? "tightening" : "worsening",
      note: cap.capRoom >= 12 ? "Cap still flexible before free agency" : "Cap runway is narrowing",
    },
    {
      label: "Injury Status",
      value: `${injuries} active`,
      trend: injuries === 0 ? "stable" : injuries <= 2 ? "improving" : "worsening",
      note: injuries <= 1 ? "Injury situation stabilizing" : "Depth stress this week",
    },
    {
      label: "Pressure",
      value: weekly?.pressure?.owner?.state ?? "Stable",
      trend: pressureScore >= 70 ? "rising" : pressureScore <= 40 ? "cooling" : "stable",
      note: pressureScore >= 70 ? "Pressure rising after back-to-back losses" : "Temperature manageable",
    },
  ];

  const handlePrimary = () => {
    if (primaryAction.onClick === "box") return onOpenBoxScore?.(latest.gameId);
    if (primaryAction.onClick === "navigate") return onNavigate?.(primaryAction.tab ?? "Game Plan");
    return onAdvanceWeek?.();
  };

  return (
    <div className="app-screen-stack franchise-hq">
      <section className="card franchise-hq-hero">
        <div className="franchise-hq-hero__top">
          <div>
            <p className="franchise-hq-hero__eyebrow">{userTeam.name} · {league.year} · Week {league.week ?? 1} · {league.phase ?? "regular"}</p>
            <h2 className="franchise-hq-hero__title">{latest?.story?.headline ?? (nextGame ? `Week ${nextGame.week} ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.name ?? "TBD"}` : "Season opener ahead")}</h2>
            <p className="franchise-hq-hero__subtitle">
              {isEarlySave ? "Welcome to your new franchise. Set your lineup, review roster roles, and establish your week-1 identity." : primaryAction.detail}
            </p>
          </div>
          <div className="franchise-hq-hero__meta">
            <Badge>{record}</Badge>
            <Badge variant="outline">Conf #{standing?.confRank ?? "—"}</Badge>
            <Badge variant="secondary">Playoff line {standing?.playoffLine ?? "—"}</Badge>
          </div>
        </div>

        <div className="franchise-hq-hero__cta">
          <Button size="lg" onClick={handlePrimary} disabled={primaryAction.disabled} className="franchise-hq-hero__cta-main">
            {primaryAction.cta}
          </Button>
        </div>

        <div className="franchise-hq-chip-row">
          {isEarlySave && <span className="franchise-hq-chip">Season opener setup</span>}
          {needsCutdown && <span className="franchise-hq-chip">⚠ Cutdown required</span>}
          <span className="franchise-hq-chip">Cap {formatMoneyM(cap.capRoom)}</span>
          <span className="franchise-hq-chip">Injuries {injuries}</span>
          <span className="franchise-hq-chip">Expiring {expiring}</span>
          <span className="franchise-hq-chip">Owner {weekly?.pressure?.owner?.state ?? "Stable"}</span>
          <span className="franchise-hq-chip">Last 5 {recent.length ? recent.join("") : "—"}</span>
        </div>
      </section>

      <section className="card franchise-hq-flow">
        <div className="franchise-hq-flow__col">
          <p className="franchise-hq-flow__label">Last Game</p>
          <strong>{latest?.story?.headline ?? "Season opener still ahead"}</strong>
          <p>{latest?.story?.detail ?? "No completed game yet — your opener sets the tone."}</p>
        </div>
        <div className="franchise-hq-flow__col">
          <p className="franchise-hq-flow__label">Next Game</p>
          <strong>{nextGame ? `Week ${nextGame.week} ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.name ?? "TBD"}` : "No upcoming matchup"}</strong>
          <p>{isEarlySave ? "Start with roster/depth decisions, then open Game Plan before kickoff." : (weekly?.phasePriority ?? "Keep momentum and execute your plan.")}</p>
        </div>
      </section>

      <details className="weekly-expandable" open>
        <summary className="weekly-expandable__summary">
          <div>
            <h3 className="weekly-section__title">Franchise Pulse</h3>
            <p className="weekly-section__subtitle">Quick-read trend strip.</p>
          </div>
          <span className="weekly-expandable__chevron">▾</span>
        </summary>
        <div className="weekly-expandable__body">
          <div className="franchise-pulse-grid">
            {pulseTiles.map((tile) => (
              <div key={tile.label} className="franchise-pulse-tile">
                <span>{tile.label}</span>
                <strong>{tile.value}</strong>
                <em>{tile.trend}</em>
                <small>{tile.note}</small>
              </div>
            ))}
          </div>
        </div>
      </details>

      <section className="card franchise-hq-urgent">
        <div className="franchise-hq-section-head">
          <strong>Urgent Actions</strong>
          <span>Do these first</span>
        </div>
        <div className="franchise-hq-urgent-list">
          {urgent.map((item, idx) => (
            <button key={`${item.label}-${idx}`} className={`franchise-hq-urgent-item tone-${item.tone ?? "info"}`} onClick={() => onNavigate?.(deriveSmartDestination(item))}>
              <div>
                <div className="franchise-hq-urgent-item__meta">
                  <strong>{item.label}</strong>
                  <Badge variant={item.level === "blocker" ? "destructive" : "outline"}>{item.level === "blocker" ? "Blocker" : "Recommended"}</Badge>
                </div>
                <p>{item.detail}</p>
              </div>
              <span>Open →</span>
            </button>
          ))}
          {!urgent.length ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{isEarlySave ? "Start here: review roster, set depth chart, and check your opening matchup." : "No urgent blockers this week."}</div> : null}
        </div>
      </section>

      <details className="weekly-expandable">
        <summary className="weekly-expandable__summary">
          <div>
            <h3 className="weekly-section__title">Top Storylines</h3>
            <p className="weekly-section__subtitle">Narratives shaping this week.</p>
          </div>
          <span className="weekly-expandable__chevron">▾</span>
        </summary>
        <div className="weekly-expandable__body">
          <div className="franchise-story-list">
            {storylines.map((s, idx) => (
              <button key={`${s.title}-${idx}`} className="franchise-story-item" onClick={() => onNavigate?.(deriveSmartDestination(s) ?? "League") }>
                <div className="franchise-story-item__head">
                  <span className="franchise-story-tag">{storylineTag(s)}</span>
                  <span>View</span>
                </div>
                <strong>{s.title}</strong>
                <p>{s.detail}</p>
              </button>
            ))}
            {!storylines.length ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No major storyline spikes right now.</div> : null}
          </div>
        </div>
      </details>

      <FranchiseSummaryPanel league={league} />
    </div>
  );
}
