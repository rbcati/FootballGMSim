/**
 * SeasonRecap.jsx — Animated season summary with awards, stats, and highlights
 *
 * Provides a broadcast-style recap of the completed season with sequential
 * slide-in animations for each section.
 */

import React, { useState, useEffect, useMemo } from "react";
import { deriveFranchisePressure } from "../utils/pressureModel.js";
import { buildTeamIntelligence } from "../utils/teamIntelligence.js";
import { deriveTeamCoachingIdentity, buildCoachingNarrativeCards } from "../utils/coachingIdentity.js";
import { franchiseInvestmentSummary } from "../utils/franchiseInvestments.js";
import { buildCompletedGamePresentation, openResolvedBoxScore } from "../utils/boxScoreAccess.js";

function AnimatedSection({ delay = 0, children, title, icon }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!visible) return null;

  return (
    <div className="fade-in" style={{
      marginBottom: 16,
      animation: `slideInUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards`,
    }}>
      {title && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--hairline)",
        }}>
          {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "var(--surface-strong, #1a1a2e)", borderRadius: "var(--radius-md, 8px)",
      padding: "12px", textAlign: "center",
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PlayerAwardCard({ name, pos, team, ovr, stat, awardName, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      background: "var(--surface-strong, #1a1a2e)", borderRadius: "var(--radius-md, 8px)",
      cursor: "pointer", border: "1px solid var(--hairline)",
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        background: "linear-gradient(135deg, #FFD700, #FFA500)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 900, color: "#1a1a2e",
      }}>
        {pos}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{name}</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{team} · {awardName}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <span className="ovr-pill" style={{ fontWeight: 800 }}>{ovr}</span>
        {stat && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{stat}</div>}
      </div>
    </div>
  );
}

function GradePill({ grade }) {
  const tone = grade === "A" ? "var(--success)" : grade === "B" ? "#74d680" : grade === "C" ? "var(--warning)" : grade === "D" ? "#ff7b7b" : "var(--danger)";
  return <span style={{ border: `1px solid ${tone}55`, color: tone, background: `${tone}18`, borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>{grade}</span>;
}

function ConfettiOverlay() {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 200,
      overflow: "hidden", pointerEvents: "none", zIndex: 10,
    }}>
      {Array.from({ length: 30 }, (_, i) => {
        const colors = ["#FFD700", "#FF6B35", "#0A84FF", "#34C759", "#FF453A", "#5E5CE6"];
        const color = colors[i % colors.length];
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const size = 4 + Math.random() * 6;
        return (
          <div key={i} style={{
            position: "absolute",
            left: `${left}%`,
            top: -10,
            width: size, height: size * 0.6,
            background: color,
            borderRadius: 1,
            animation: `confettiFall ${2 + Math.random()}s ${delay}s ease-in forwards`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }} />
        );
      })}
    </div>
  );
}


function buildSeasonNarrative({ champion, standings, userTeam, year }) {
  const top = standings?.[0];
  const second = standings?.[1];
  const champGap = top && second ? (top.wins - second.wins) : null;
  if (!champion) return `${year} wrapped without a confirmed champion in state.`;
  if (champGap != null && champGap >= 2) {
    return `${champion.name} controlled the year from the top tier and finished ${champion.wins}-${champion.losses}.`;
  }
  if (champGap != null && champGap <= 0) {
    return `${champion.name} survived a tight race and closed the season on the right side of one-score pressure.`;
  }
  if (userTeam && champion.id === userTeam.id) {
    return `Your club finished the job. ${champion.name} turned this season into a title run.`;
  }
  return `${champion.name} completed a balanced championship path and separated late in the season.`;
}

function getAwardWinnerCards(league) {
  const races = league?.awardRaces?.awards ?? null;
  const slots = [
    ['mvp', 'MVP'],
    ['opoy', 'OPOY'],
    ['dpoy', 'DPOY'],
    ['oroy', 'OROY'],
    ['droy', 'DROY'],
  ];
  return slots.map(([key, label]) => {
    const board = races?.[key]?.league ?? races?.[key]?.afc ?? races?.[key]?.nfc ?? [];
    const leader = Array.isArray(board) ? board[0] : null;
    if (!leader) return null;
    return { key, label, leader };
  }).filter(Boolean);
}

export default function SeasonRecap({ league, onPlayerSelect, onTeamSelect, onNavigate, onOpenBoxScore }) {
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const teams = league?.teams || [];
  const userTeam = teams.find(t => t.id === league?.userTeamId);
  const year = league?.year ?? 2025;

  // Find champion
  const champion = league?.championTeamId
    ? teams.find(t => t.id === league.championTeamId)
    : teams.sort((a, b) => b.wins - a.wins)[0];

  // Team context summaries from real standings data
  const awards = useMemo(() => {
    if (!teams.length) return {};

    const sorted = [...teams].sort((a, b) => b.ptsFor - a.ptsFor);
    const bestOffense = sorted[0];
    const bestDefense = [...teams].sort((a, b) => a.ptsAgainst - b.ptsAgainst)[0];
    return { bestOffense, bestDefense };
  }, [teams]);

  // Standing rankings
  const standings = useMemo(() => {
    return [...teams].sort((a, b) => {
      const aWp = (a.wins + 0.5 * (a.ties || 0)) / Math.max(1, a.wins + a.losses + (a.ties || 0));
      const bWp = (b.wins + 0.5 * (b.ties || 0)) / Math.max(1, b.wins + b.losses + (b.ties || 0));
      return bWp - aWp;
    });
  }, [teams]);

  const seasonNarrative = buildSeasonNarrative({ champion, standings, userTeam, year });
  const awardWatches = getAwardWinnerCards(league);
  const pressure = useMemo(() => deriveFranchisePressure(league), [league]);
  const teamIntel = useMemo(() => buildTeamIntelligence(userTeam, { week: league?.week ?? 1 }), [userTeam, league?.week]);
  const coachingIdentity = useMemo(() => deriveTeamCoachingIdentity(userTeam, { pressure, intel: teamIntel, direction: teamIntel?.direction }), [userTeam, pressure, teamIntel]);
  const chemistry = teamIntel?.chemistry;
  const investments = useMemo(() => franchiseInvestmentSummary(userTeam), [userTeam]);
  const carouselCards = useMemo(() => buildCoachingNarrativeCards(league, { limit: 3 }), [league]);
  const completedGames = useMemo(() => {
    const seasonId = league?.seasonId;
    if (!seasonId) return [];
    const rows = [];
    for (const week of league?.schedule?.weeks ?? []) {
      for (const game of week?.games ?? []) {
        if (!game?.played) continue;
        rows.push({
          game,
          week: Number(week?.week ?? league?.week ?? 1),
          presentation: buildCompletedGamePresentation(game, { seasonId, week: Number(week?.week ?? 1), source: "season_recap" }),
        });
      }
    }
    return rows.slice(-8).reverse();
  }, [league]);
  const archivedReview = useMemo(() => {
    const rows = Array.isArray(league?.leagueHistory) ? league.leagueHistory : [];
    const currentYear = Number(league?.year ?? 0);
    const latest = [...rows].reverse().find((row) => Number(row?.year ?? 0) === currentYear) ?? rows[rows.length - 1] ?? null;
    return latest?.userTeamSummary ?? null;
  }, [league]);
  const seasonReview = archivedReview?.seasonReview ?? null;
  const playerCards = Array.isArray(archivedReview?.playerReportCards) ? archivedReview.playerReportCards : [];
  const offseasonPlan = archivedReview?.offseasonPlan ?? null;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", position: "relative" }}>
      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(250px) rotate(720deg); opacity: 0; }
        }
        @keyframes trophyBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>

      {showConfetti && <ConfettiOverlay />}

      {/* Champion Banner */}
      <AnimatedSection delay={0}>
        <div style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #2d1f4e 50%, #1a1a2e 100%)",
          borderRadius: "var(--radius-lg, 12px)", padding: 24, textAlign: "center",
          border: "2px solid #FFD700", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "radial-gradient(circle at 50% 0%, rgba(255,215,0,0.15), transparent 70%)",
          }} />
          <div style={{
            fontSize: 48, marginBottom: 8,
            animation: "trophyBounce 2s ease-in-out infinite",
          }}>🏆</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#FFD700", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>
            {year} Season Champion
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "white", marginBottom: 4 }}>
            {champion?.name || "TBD"}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>
            {champion?.wins ?? 0}-{champion?.losses ?? 0} · Pts For: {champion?.ptsFor ?? 0}
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection delay={300} title="Season storyline" icon="📰">
        <div style={{ padding: 12, borderRadius: 10, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{seasonNarrative}</strong>
          <div style={{ marginTop: 6 }}>Final table context: {standings?.[0]?.abbr ?? standings?.[0]?.name ?? "—"} finished ahead of {standings?.[1]?.abbr ?? standings?.[1]?.name ?? "—"}.</div>
        </div>
        {awardWatches.length > 0 && (
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {awardWatches.slice(0, 3).map((award) => (
              <button key={award.key} onClick={() => award.leader?.playerId != null ? onPlayerSelect?.(award.leader.playerId) : null} style={{ textAlign: "left", border: "1px solid var(--hairline)", borderRadius: 8, padding: "8px 10px", background: "var(--surface-strong, #1a1a2e)", color: "var(--text)", cursor: award.leader?.playerId != null ? "pointer" : "default" }}>
                <strong>{award.label}</strong>: {award.leader.name} {award.leader.teamAbbr ? `(${award.leader.teamAbbr})` : ""}
              </button>
            ))}
          </div>
        )}
      </AnimatedSection>

      {/* Your Team Summary */}
      {userTeam && (
        <AnimatedSection delay={500} title="Your Season" icon="🏈">
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
          }}>
            <StatCard
              label="Record"
              value={`${userTeam.wins}-${userTeam.losses}`}
              color={userTeam.wins > userTeam.losses ? "var(--success)" : "var(--danger)"}
            />
            <StatCard
              label="Points For"
              value={userTeam.ptsFor ?? 0}
              sub={`${Math.round((userTeam.ptsFor ?? 0) / Math.max(1, userTeam.wins + userTeam.losses))} PPG`}
            />
            <StatCard
              label="Points Against"
              value={userTeam.ptsAgainst ?? 0}
              sub={`${Math.round((userTeam.ptsAgainst ?? 0) / Math.max(1, userTeam.wins + userTeam.losses))} PPG`}
            />
          </div>
          <div style={{
            marginTop: 8, padding: 10, borderRadius: "var(--radius-md, 8px)",
            background: "var(--surface-strong, #1a1a2e)", fontSize: 12, color: "var(--text-muted)",
          }}>
            <strong style={{ color: "var(--text)" }}>{userTeam.name}</strong> finished the season ranked{" "}
            <strong style={{ color: "var(--accent)" }}>
              #{standings.findIndex(t => t.id === userTeam.id) + 1}
            </strong>{" "}
            overall with a team OVR of {userTeam.ovr}.
          </div>
        </AnimatedSection>
      )}
      {seasonReview && (
        <AnimatedSection delay={580} title="Front-office diagnosis" icon="🧪">
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)", fontSize: 12, color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text)" }}>{seasonReview.teamIdentitySummary}</strong>
              <div style={{ marginTop: 6 }}>Offense: {seasonReview.offensiveStyleSummary}</div>
              <div>Defense: {seasonReview.defensiveStyleSummary}</div>
              <div style={{ marginTop: 6 }}>Sack diagnosis: {seasonReview.sackAttribution?.explanation}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
                <strong style={{ color: "var(--success)" }}>Top strengths</strong>
                {(seasonReview.strengths ?? []).map((s) => <div key={s} style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>• {s}</div>)}
              </div>
              <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
                <strong style={{ color: "var(--warning)" }}>Top weaknesses</strong>
                {(seasonReview.weaknesses ?? []).map((s) => <div key={s} style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>• {s}</div>)}
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {(seasonReview.unitGrades ?? []).slice(0, 8).map((unit) => (
                <div key={unit.key} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)", display: "flex", gap: 8, alignItems: "center" }}>
                  <GradePill grade={unit.grade} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{unit.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{unit.explanation}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AnimatedSection>
      )}

      {offseasonPlan && (
        <AnimatedSection delay={600} title="Offseason priorities" icon="🗂️">
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
              <strong style={{ color: "var(--text)" }}>Free agency priorities</strong>
              {(offseasonPlan.freeAgencyPriorities ?? []).slice(0, 3).map((item) => <div key={item.focus} style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>#{item.priority} {item.focus}</div>)}
            </div>
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
              <strong style={{ color: "var(--text)" }}>Draft priorities</strong>
              {(offseasonPlan.draftPriorities ?? []).slice(0, 3).map((item) => <div key={item.focus} style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>#{item.priority} {item.focus}</div>)}
            </div>
          </div>
        </AnimatedSection>
      )}

      {playerCards.length > 0 && (
        <AnimatedSection delay={640} title="Player report cards" icon="📒">
          <div style={{ display: "grid", gap: 6 }}>
            {playerCards.slice(0, 12).map((p) => (
              <div key={p.playerId} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <GradePill grade={p.grade} />
                  <strong style={{ color: "var(--text)", fontSize: 12 }}>{p.name} · {p.pos}</strong>
                  <span style={{ fontSize: 10, color: "var(--text-subtle)" }}>{p.offseasonTag}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>{p.verdict}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-subtle)" }}>{p.gmView}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-subtle)" }}>{p.ownerView}</div>
              </div>
            ))}
          </div>
        </AnimatedSection>
      )}

      <AnimatedSection delay={650} title="Completed games" icon="📘">
        <div style={{ display: "grid", gap: 8 }}>
          {completedGames.length === 0 ? (
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", color: "var(--text-muted)", fontSize: 12 }}>
              No completed games are archived in the active season context yet.
            </div>
          ) : completedGames.map((row) => {
            const homeTeam = teams.find((t) => Number(t.id) === Number(row.game.home));
            const awayTeam = teams.find((t) => Number(t.id) === Number(row.game.away));
            const clickable = Boolean(row.presentation?.canOpen && onOpenBoxScore);
            return (
              <button
                key={row.presentation?.resolvedGameId ?? `${row.week}-${row.game?.home}-${row.game?.away}`}
                onClick={() => openResolvedBoxScore(row.game, { seasonId: league?.seasonId, week: row.week, source: "season_recap" }, onOpenBoxScore)}
                style={{
                  textAlign: "left",
                  border: "1px solid var(--hairline)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "var(--surface-strong, #1a1a2e)",
                  color: "var(--text)",
                  cursor: clickable ? "pointer" : "default",
                  opacity: clickable ? 1 : 0.75,
                }}
                title={clickable ? row.presentation?.ctaLabel : row.presentation?.statusLabel}
              >
                <strong>Week {row.week} · {awayTeam?.abbr ?? "AWY"} {row.game.awayScore ?? "—"} - {row.game.homeScore ?? "—"} {homeTeam?.abbr ?? "HME"}</strong>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{clickable ? row.presentation?.ctaLabel : row.presentation?.statusLabel}</div>
              </button>
            );
          })}
        </div>
      </AnimatedSection>

      {pressure && (
        <AnimatedSection delay={620} title="Organization reaction" icon="🏛️">
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
              <strong style={{ color: "var(--text)" }}>Owner {pressure.owner.state}</strong> ({pressure.owner.score}/100)
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{pressure.owner.reasons?.[0] ?? "Owner sees a stable trajectory."}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
              <strong style={{ color: "var(--text)" }}>Fans {pressure.fans.state}</strong> ({pressure.fans.score}/100)
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{pressure.narrativeNotes.fan}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
              <strong style={{ color: "var(--text)" }}>Media {pressure.media.state}</strong> ({pressure.media.score}/100)
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{pressure.narrativeNotes.media}</div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>{pressure.consequence}</div>
          </div>
        </AnimatedSection>
      )}

      {investments && (
        <AnimatedSection delay={700} title="Franchise investments" icon="🏟️">
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
              <strong style={{ color: "var(--text)" }}>{investments.stadiumLabel}</strong> · {investments.concessionsLabel}
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Training {investments.profile.trainingLevel}/5 improved free-agent appeal by {investments.freeAgentAppealDelta >= 0 ? "+" : ""}{investments.freeAgentAppealDelta}.</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Scouting {investments.profile.scoutingLevel}/5 with {investments.scoutingRegionLabel} emphasis boosted confidence by {investments.scoutingConfidenceDelta >= 0 ? "+" : ""}{investments.scoutingConfidenceDelta}.</div>
            </div>
          </div>
        </AnimatedSection>
      )}
      {teamIntel?.organization && (
        <AnimatedSection delay={760} title="Organization quality" icon="🧭">
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
              <strong style={{ color: "var(--text)" }}>Development: {teamIntel.organization.developmentEnvironment.state}</strong>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{teamIntel.organization.developmentEnvironment.reasons?.[0]}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
              <strong style={{ color: "var(--text)" }}>Recovery: {teamIntel.organization.recoveryEnvironment.state}</strong>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{teamIntel.organization.recoveryEnvironment.reasons?.[0]}</div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>Destination quality: {teamIntel.organization.freeAgentDestination.state} · Scout confidence: {teamIntel.organization.scoutingConfidence.state}.</div>
          </div>
        </AnimatedSection>
      )}


      {chemistry && (
        <AnimatedSection delay={760} title="Locker-room chemistry" icon="🧠">
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
              <strong style={{ color: "var(--text)" }}>{chemistry.state}</strong> ({chemistry.score}/100)
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{chemistry.reasons?.[0] ?? "Chemistry stayed stable through the season."}</div>
            </div>
            {(chemistry.leaders ?? []).slice(0, 2).map((leader) => (
              <div key={`srec-leader-${leader.playerId}`} style={{ fontSize: 12, color: "var(--text-muted)" }}>
                • {leader.role}: <strong style={{ color: "var(--text)" }}>{leader.name}</strong>
              </div>
            ))}
            {(chemistry.tensions ?? []).slice(0, 1).map((t) => (
              <div key={`srec-ten-${t.text}`} style={{ fontSize: 12, color: "var(--warning)" }}>⚠ {t.text}</div>
            ))}
          </div>
        </AnimatedSection>
      )}

      {(coachingIdentity || carouselCards.length > 0) && (
        <AnimatedSection delay={840} title="Coaching continuity & carousel" icon="🎙️">
          <div style={{ display: "grid", gap: 8 }}>
            {coachingIdentity && (
              <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
                <strong style={{ color: "var(--text)" }}>{coachingIdentity.continuity.label}</strong> · {coachingIdentity.seat.label}
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{coachingIdentity.continuity.detail}</div>
                <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 4 }}>{coachingIdentity.philosophy.offSchemeName} / {coachingIdentity.philosophy.defSchemeName}</div>
              </div>
            )}
            {carouselCards.slice(0, 2).map((card) => (
              <div key={card.id} style={{ padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface-strong, #1a1a2e)" }}>
                <strong style={{ color: "var(--text)" }}>{card.title}</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{card.detail}</div>
              </div>
            ))}
          </div>
        </AnimatedSection>
      )}

      {/* Team Superlatives */}
      <AnimatedSection delay={1000} title="Team Superlatives" icon="⭐">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {awards.bestOffense && (
            <div onClick={() => onTeamSelect?.(awards.bestOffense.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: "var(--surface-strong, #1a1a2e)", borderRadius: "var(--radius-md, 8px)",
              cursor: "pointer",
            }}>
              <span style={{ fontSize: 20 }}>⚔️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Best Offense</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{awards.bestOffense.name}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>
                {awards.bestOffense.ptsFor} pts
              </div>
            </div>
          )}
          {awards.bestDefense && (
            <div onClick={() => onTeamSelect?.(awards.bestDefense.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: "var(--surface-strong, #1a1a2e)", borderRadius: "var(--radius-md, 8px)",
              cursor: "pointer",
            }}>
              <span style={{ fontSize: 20 }}>🛡️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Best Defense</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{awards.bestDefense.name}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                {awards.bestDefense.ptsAgainst} pts allowed
              </div>
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Final Standings */}
      <AnimatedSection delay={1500} title="Final Standings" icon="📊">
        <div className="stat-box" style={{ overflow: "hidden" }}>
          {standings.slice(0, 16).map((team, i) => {
            const isUser = team.id === league?.userTeamId;
            const isChamp = team.id === champion?.id;
            const wp = ((team.wins + 0.5 * (team.ties || 0)) / Math.max(1, team.wins + team.losses + (team.ties || 0))).toFixed(3);
            return (
              <div key={team.id} onClick={() => onTeamSelect?.(team.id)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                borderBottom: "1px solid var(--hairline)", cursor: "pointer",
                background: isUser ? "var(--accent)" + "0d" : isChamp ? "rgba(255,215,0,0.05)" : "transparent",
              }}>
                <div style={{ width: 20, fontSize: 11, fontWeight: 800, color: "var(--text-subtle)", textAlign: "center" }}>
                  {i + 1}
                </div>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: isChamp ? "rgba(255,215,0,0.15)" : "var(--surface-strong, #1a1a2e)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 900, color: isChamp ? "#FFD700" : "var(--text-muted)",
                }}>
                  {team.abbr?.slice(0, 3)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                    {team.name}
                    {isChamp && <span style={{ marginLeft: 4, fontSize: 10 }}>🏆</span>}
                    {isUser && <span style={{ marginLeft: 4, fontSize: 9, color: "var(--accent)" }}>(You)</span>}
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  {team.wins}-{team.losses}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", width: 35, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {wp}
                </div>
              </div>
            );
          })}
        </div>
      </AnimatedSection>

      {/* League Stats */}
      <AnimatedSection delay={2000} title="League Stats" icon="📈">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          <StatCard
            label="Total Points"
            value={teams.reduce((s, t) => s + (t.ptsFor ?? 0), 0)}
          />
          <StatCard
            label="Avg Team OVR"
            value={teams.length ? Math.round(teams.reduce((s, t) => s + t.ovr, 0) / teams.length) : 0}
          />
          <StatCard
            label="Games Played"
            value={Math.round(teams.reduce((s, t) => s + t.wins + t.losses + (t.ties || 0), 0) / 2)}
          />
          <StatCard
            label="Avg PPG"
            value={(() => {
              const totalGames = teams.reduce((s, t) => s + t.wins + t.losses + (t.ties || 0), 0) / 2;
              const totalPts = teams.reduce((s, t) => s + (t.ptsFor ?? 0), 0);
              return totalGames > 0 ? Math.round(totalPts / totalGames / 2) : 0;
            })()}
            sub="per team"
          />
        </div>
      </AnimatedSection>

      {/* Share Button */}
      <AnimatedSection delay={2500}>
        <div style={{ display: "grid", gap: 8 }}>
          <button
            onClick={() => {
              const text = `${year} Season Recap\n🏆 Champion: ${champion?.name || "TBD"} (${champion?.wins}-${champion?.losses})\n${userTeam ? `My team: ${userTeam.name} (${userTeam.wins}-${userTeam.losses})` : ""}\n#FootballGMSim`;
              navigator.clipboard?.writeText(text);
            }}
            style={{
              width: "100%", padding: 12, fontSize: 13, fontWeight: 700,
              background: "var(--surface-strong, #1a1a2e)", color: "var(--text)",
              border: "1px solid var(--hairline)", borderRadius: "var(--radius-md, 8px)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            📋 Copy Season Summary
          </button>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => onNavigate?.("History")} style={secondaryBtnStyle}>Open season archive</button>
            <button onClick={() => onNavigate?.("Hall of Fame")} style={secondaryBtnStyle}>View Hall of Fame</button>
            <button onClick={() => onNavigate?.("Leaders")} style={secondaryBtnStyle}>See league leaders</button>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}

const secondaryBtnStyle = {
  padding: "8px 10px",
  fontSize: 11,
  borderRadius: "var(--radius-md, 8px)",
  border: "1px solid var(--hairline)",
  background: "var(--surface-strong, #1a1a2e)",
  color: "var(--text)",
  cursor: "pointer",
};
