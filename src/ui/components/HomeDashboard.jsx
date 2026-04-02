/**
 * HomeDashboard.jsx — PREMIUM UPGRADE (FULL VERSION - NETLIFY FIXED)
 * 100% of original code preserved + glassmorphism / hover-lift / Advance Week CTA
 * Syntax error at borderRadius fixed
 */

import React, { useMemo } from "react";
import { OvrPill } from "./LeagueDashboard.jsx";
import PlayerCard from "./PlayerCard.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Helpers (100% original) ────────────────────────────────────────────────────

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF","#34C759","#FF9F0A","#FF453A","#5E5CE6",
    "#64D2FF","#FFD60A","#30D158","#FF6961","#AEC6CF",
    "#FF6B35","#B4A0E5",
  ];
  let hash = 0;
  for (let i = 0; i < abbr.length; i++)
    hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function TeamCircle({ abbr, size = 44, isUser = false }) {
  const color = teamColor(abbr);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${color}22`,
      border: `2.5px solid ${isUser ? "var(--accent)" : color}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 900, fontSize: size * 0.28,
      color: isUser ? "var(--accent)" : color,
      flexShrink: 0, letterSpacing: "-0.5px",
    }}>
      {abbr?.slice(0, 3) ?? "?"}
    </div>
  );
}

function winPct(w, l, t) {
  const g = w + l + t;
  return g === 0 ? ".000" : ((w + t * 0.5) / g).toFixed(3).replace(/^0/, "");
}

function FormStrip({ results = [] }) {
  if (!results.length) return <span style={{ color: "var(--text-subtle)", fontSize: "var(--text-xs)" }}>No games yet</span>;
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {results.slice(-5).map((r, i) => (
        <span
          key={i}
          className={`form-dot form-dot-${r.toLowerCase()}`}
          title={r === "W" ? "Win" : r === "L" ? "Loss" : "Tie"}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

function getRecentForm(schedule, teamId) {
  if (!schedule?.weeks) return [];
  const results = [];
  for (const week of [...schedule.weeks].reverse()) {
    if (results.length >= 5) break;
    for (const game of week.games ?? []) {
      if (!game.played) continue;
      const isHome = Number(game.home) === teamId || game.home?.id === teamId;
      const isAway = Number(game.away) === teamId || game.away?.id === teamId;
      if (!isHome && !isAway) continue;
      const userScore = isHome ? game.homeScore : game.awayScore;
      const oppScore = isHome ? game.awayScore : game.homeScore;
      if (userScore > oppScore) results.push("W");
      else if (userScore < oppScore) results.push("L");
      else results.push("T");
    }
  }
  return results.reverse();
}

function getNextGame(schedule, teamId, teamById) {
  if (!schedule?.weeks) return null;
  for (const week of schedule.weeks) {
    for (const game of week.games ?? []) {
      if (game.played) continue;
      const homeId = typeof game.home === "object" ? game.home.id : Number(game.home);
      const awayId = typeof game.away === "object" ? game.away.id : Number(game.away);
      if (homeId === teamId || awayId === teamId) {
        const isHome = homeId === teamId;
        const oppId = isHome ? awayId : homeId;
        const opp = teamById[oppId];
        return { week: week.week, isHome, opp, oppId };
      }
    }
  }
  return null;
}

// ── Premium SectionCard (glassmorphism + hover-lift) ───────────────────────────
function SectionCard({ title, icon, children, accent }) {
  return (
    <Card className="card-premium hover-lift" style={{
      border: accent ? `1px solid ${accent}33` : undefined,
    }}>
      <CardHeader className="flex flex-row items-center gap-2 py-3 px-5 border-b border-[color:var(--hairline)]" style={{
        background: accent ? `${accent}0a` : "var(--surface-strong)",
      }}>
        {icon && <span style={{ fontSize: "1rem" }}>{icon}</span>}
        <CardTitle className="text-xs font-bold uppercase tracking-widest" style={{ color: accent ?? "var(--text-muted)" }}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 px-5">
        {children}
      </CardContent>
    </Card>
  );
}

// ── NEW: Large Advance Week CTA ────────────────────────────────────────────────
function AdvanceWeekCTA({ phase, week, onAdvanceWeek, isBusy }) {
  const label = phase === "regular" ? `Sim Week ${week}` :
                phase === "preseason" ? "Start Season" :
                phase === "free_agency" ? "Enter Draft" : "Advance Phase";
  return (
    <Button
      onClick={onAdvanceWeek}
      disabled={isBusy}
      className="btn-premium w-full py-4 text-xl font-bold mb-6"
      style={{ minHeight: "68px" }}
    >
      {isBusy ? "Simulating..." : label}
    </Button>
  );
}

// ── Sub-components (100% original, now inside premium cards) ───────────────────

function TeamSnapshotCard({ userTeam, league, streak }) {
  const color = teamColor(userTeam.abbr);
  const divName = typeof userTeam.div === "number"
    ? ["East","North","South","West"][userTeam.div] ?? "?"
    : userTeam.div ?? "?";
  const confName = typeof userTeam.conf === "number"
    ? ["AFC","NFC"][userTeam.conf] ?? "?"
    : userTeam.conf ?? "?";

  const confIdx = typeof userTeam.conf === "number" ? userTeam.conf : userTeam.conf === "AFC" ? 0 : 1;
  const divIdx2 = typeof userTeam.div === "number" ? userTeam.div : { East:0, North:1, South:2, West:3 }[userTeam.div] ?? 0;
  const divTeams = (league.teams ?? [])
    .filter(t => {
      const tc = typeof t.conf === "number" ? t.conf : t.conf === "AFC" ? 0 : 1;
      const td = typeof t.div === "number" ? t.div : { East:0, North:1, South:2, West:3 }[t.div] ?? 0;
      return tc === confIdx && td === divIdx2;
    })
    .sort((a,b) => (b.wins + (b.ties??0)*0.5) - (a.wins + (a.ties??0)*0.5) || b.wins - a.wins);
  const divRank = divTeams.findIndex(t => t.id === userTeam.id) + 1;

  const capRoom = userTeam.capRoom ?? (userTeam.capTotal ?? 301.2) - (userTeam.capUsed ?? 0);
  const capColor = capRoom > 20 ? "var(--success)" : capRoom > 5 ? "var(--warning)" : "var(--danger)";

  const streakLabel = streak ? `${streak.count}${streak.type}` : null;
  const streakColor = streak?.type === "W" ? "var(--success)" : streak?.type === "L" ? "var(--danger)" : "var(--warning)";

  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}18 0%, transparent 60%)`,
      border: `1px solid ${color}44`,
      borderRadius: "var(--radius-xl)",
      padding: "var(--space-5)",
      backdropFilter: "var(--glass-blur)",
      WebkitBackdropFilter: "var(--glass-blur)",
      boxShadow: `0 4px 24px ${color}22`,
      gridColumn: "1 / -1",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
        <TeamCircle abbr={userTeam.abbr} size={64} isUser />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>
              {userTeam.name}
            </div>
            {streakLabel && (
              <span style={{
                fontSize: "0.65rem", fontWeight: 800,
                color: streakColor,
                background: `${streakColor === "var(--success)" ? "#34C759" : streakColor === "var(--danger)" ? "#FF453A" : "#FF9F0A"}18`,
                padding: "1px 6px", borderRadius: 4,
              }}>
                {streak.count >= 3 ? "🔥 " : ""}{streakLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 2 }}>
            {confName} {divName} · Season {league.year ?? ""}
          </div>
        </div>
        <OvrPill ovr={userTeam.ovr} size="lg" />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "var(--space-3)",
      }}>
        {[
          { label: "Record", value: `${userTeam.wins}-${userTeam.losses}${(userTeam.ties ?? 0) > 0 ? `-${userTeam.ties}` : ""}`, color: "var(--text)" },
          { label: "Win %", value: winPct(userTeam.wins, userTeam.losses, userTeam.ties ?? 0), color: "var(--text)" },
          { label: "Div Rank", value: `#${divRank} ${divName}`, color: divRank === 1 ? "var(--success)" : "var(--text-muted)" },
          { label: "Cap Space", value: `$${capRoom.toFixed(1)}M`, color: capColor },
        ].map(({ label, value, color: vc }) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: vc, lineHeight: 1.2 }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NextGameCard({ nextGame, league }) {
  if (!nextGame) {
    return (
      <SectionCard title="Next Game" icon="🏈">
        <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", textAlign: "center", padding: "var(--space-4) 0" }}>
          No upcoming games scheduled
        </div>
      </SectionCard>
    );
  }

  const { week, isHome, opp } = nextGame;
  const oppColor = teamColor(opp?.abbr ?? "");
  const isPlayoffs = week >= 19;
  const weekLabel = isPlayoffs
    ? ["Wild Card","Divisional","Championship","Super Bowl"][week - 19] ?? `Week ${week}`
    : `Week ${week}`;

  return (
    <SectionCard title="Next Game" icon="🏈" accent="var(--accent)">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {weekLabel} · {isHome ? "HOME" : "AWAY"}
          </span>
          {isPlayoffs && (
            <span style={{ fontSize: "var(--text-xs)", background: "rgba(255,215,0,0.15)", color: "#FFD700", padding: "2px 8px", borderRadius: "var(--radius-pill)", fontWeight: 700 }}>
              PLAYOFFS
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <TeamCircle abbr={opp?.abbr ?? "???"} size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "var(--text-base)", color: "var(--text)" }}>
              {isHome ? "vs " : "@ "}{opp?.name ?? opp?.abbr ?? "Unknown"}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
              {opp ? `${opp.wins}-${opp.losses}${opp.ties ? `-${opp.ties}` : ""} · OVR ${opp.ovr}` : ""}
            </div>
          </div>
          {opp && <OvrPill ovr={opp.ovr} />}
        </div>

        {opp && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-2)",
            paddingTop: "var(--space-2)",
            borderTop: "1px solid var(--hairline)",
          }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
              <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>PF: </span>
              {opp.ptsFor ?? "—"}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
              <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>PA: </span>
              {opp.ptsAgainst ?? "—"}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function RecentFormCard({ form }) {
  return (
    <SectionCard title="Recent Form" icon="📈">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <FormStrip results={form} />
        {form.length > 0 && (
          <div style={{ display: "flex", gap: "var(--space-4)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            <span>W: <strong style={{ color: "var(--success)" }}>{form.filter(r => r === "W").length}</strong></span>
            <span>L: <strong style={{ color: "var(--danger)" }}>{form.filter(r => r === "L").length}</strong></span>
            {form.includes("T") && <span>T: <strong style={{ color: "var(--warning)" }}>{form.filter(r => r === "T").length}</strong></span>}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function InjuryReportCard({ injuries = [], onPlayerSelect }) {
  if (!injuries.length) {
    return (
      <SectionCard title="Injury Report" icon="🏥">
        <div style={{ color: "var(--success)", fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span>✓</span> All players healthy
        </div>
      </SectionCard>
    );
  }

  const severeInjuries = [...injuries].sort((a, b) => (b.weeksLeft ?? 0) - (a.weeksLeft ?? 0)).slice(0, 5);

  return (
    <SectionCard title="Injury Report" icon="🏥" accent="var(--danger)">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {severeInjuries.map((inj, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: "var(--space-3)",
              padding: "var(--space-2) var(--space-3)",
              background: "var(--surface)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--hairline)",
              cursor: onPlayerSelect ? "pointer" : "default",
            }}
            onClick={() => onPlayerSelect?.(inj.playerId)}
          >
            {inj.weeksLeft > 4 ? (
              <Badge variant="destructive" className="text-[10px]">{inj.type ?? "Injured"}</Badge>
            ) : (
              <Badge variant="warning" className="text-[10px]">{inj.type ?? "Injured"}</Badge>
            )}
            <span style={{ flex: 1, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text)" }}>
              {inj.playerName ?? "Unknown"}
            </span>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
              {inj.pos ?? ""} · {inj.weeksLeft > 0 ? `${inj.weeksLeft}w` : "Day-to-Day"}
            </span>
          </div>
        ))}
        {injuries.length > 5 && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textAlign: "center" }}>
            +{injuries.length - 5} more on IR
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function DivisionSnapshotCard({ userTeam, teams, onTeamSelect }) {
  const confIdx = typeof userTeam.conf === "number" ? userTeam.conf : userTeam.conf === "AFC" ? 0 : 1;
  const divIdx2 = typeof userTeam.div === "number" ? userTeam.div : { East:0, North:1, South:2, West:3 }[userTeam.div] ?? 0;

  const divTeams = useMemo(() => (teams ?? [])
    .filter(t => {
      const tc = typeof t.conf === "number" ? t.conf : t.conf === "AFC" ? 0 : 1;
      const td = typeof t.div === "number" ? t.div : { East:0, North:1, South:2, West:3 }[t.div] ?? 0;
      return tc === confIdx && td === divIdx2;
    })
    .sort((a,b) => {
      const pa = (a.wins + (a.ties??0)*0.5) / Math.max(1, a.wins+a.losses+(a.ties??0));
      const pb = (b.wins + (b.ties??0)*0.5) / Math.max(1, b.wins+b.losses+(b.ties??0));
      return pb - pa;
    }),
  [teams, confIdx, divIdx2]);

  const confName = ["AFC","NFC"][confIdx] ?? "?";
  const divName = ["East","North","South","West"][divIdx2] ?? "?";

  // Max wins for bar scaling
  const maxWins = Math.max(1, ...divTeams.map(t => t.wins));

  return (
    <SectionCard title={`${confName} ${divName} Standings`} icon="📊">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {divTeams.map((team, i) => {
          const isUser = team.id === userTeam.id;
          const gp = team.wins + team.losses + (team.ties ?? 0);
          const pct = gp > 0 ? (team.wins + (team.ties ?? 0) * 0.5) / gp : 0;
          const pctWidth = Math.max(4, Math.round((team.wins / Math.max(1, maxWins)) * 100));
          const rankColor = i === 0 ? "#FFD60A" : "var(--text-subtle)";
          return (
            <div
              key={team.id}
              style={{
                display: "flex", alignItems: "center", gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-3)",
                background: isUser ? "var(--accent-muted)" : "var(--surface)",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${isUser ? "var(--accent)" : "var(--hairline)"}`,
                cursor: "pointer",
              }}
              onClick={() => onTeamSelect?.(team.id)}
            >
              <span style={{ width: 16, fontWeight: 800, color: rankColor, fontSize: "var(--text-xs)", textAlign: "center" }}>
                {i + 1}
              </span>
              <TeamCircle abbr={team.abbr} size={26} isUser={isUser} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontWeight: isUser ? 700 : 500, fontSize: "var(--text-xs)", color: isUser ? "var(--accent)" : "var(--text)" }}>
                    {team.abbr}
                  </span>
                  <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {team.wins}-{team.losses}{(team.ties ?? 0) > 0 ? `-${team.ties}` : ""} · {pct.toFixed(3).replace(/^0/, "")}
                  </span>
                </div>
                <div style={{ height: 3, background: "var(--surface-strong)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pctWidth}%`,
                    background: isUser ? "var(--accent)" : i === 0 ? "#FFD60A" : "var(--text-subtle)",
                    borderRadius: "var(--radius-pill)",
                    opacity: 0.75,
                  }} />
                </div>
              </div>
              <OvrPill ovr={team.ovr} />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function LeagueNewsCard({ league }) {
  const news = useMemo(() => {
    const items = league?.news ?? league?.newsLog ?? [];
    return [...items].reverse().slice(0, 5);
  }, [league]);

  if (!news.length) return null;

  const typeIcon = (type) => {
    switch (type) {
      case "injury": return "🏥";
      case "trade": return "🔄";
      case "signing": return "✍️";
      case "feat": return "⭐";
      case "award": return "🏆";
      case "draft": return "🎓";
      default: return "📰";
    }
  };

  return (
    <SectionCard title="Latest News" icon="📰" accent="var(--accent)">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {news.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex", gap: "var(--space-2)",
              padding: "var(--space-2) 0",
              borderBottom: i < news.length - 1 ? "1px solid var(--hairline)" : "none",
            }}
          >
            <span style={{ fontSize: "0.9rem", flexShrink: 0, marginTop: 1 }}>{typeIcon(item.type)}</span>
            <div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text)", lineHeight: 1.4 }}>
                {item.text ?? item.body ?? item.headline ?? "News item"}
              </div>
              {item.week && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginTop: 2 }}>
                  Week {item.week}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function QuickStatsCard({ userTeam, league }) {
  const gamesPlayed = (userTeam?.wins ?? 0) + (userTeam?.losses ?? 0) + (userTeam?.ties ?? 0);
  const ppg = gamesPlayed > 0 ? (userTeam.ptsFor / gamesPlayed).toFixed(1) : "—";
  const papg = gamesPlayed > 0 ? (userTeam.ptsAgainst / gamesPlayed).toFixed(1) : "—";
  const diff = gamesPlayed > 0
    ? ((userTeam.ptsFor - userTeam.ptsAgainst) / gamesPlayed).toFixed(1)
    : "—";
  const diffNum = gamesPlayed > 0 ? (userTeam.ptsFor - userTeam.ptsAgainst) / gamesPlayed : 0;

  return (
    <SectionCard title="Team Stats" icon="📉">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-3)" }}>
        {[
          { label: "PPG", value: ppg, color: "var(--text)" },
          { label: "PAPG", value: papg, color: "var(--text)" },
          { label: "DIFF", value: diffNum > 0 ? `+${diff}` : diff, color: diffNum >= 0 ? "var(--success)" : "var(--danger)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 800, color }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      {gamesPlayed > 0 && (
        <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--hairline)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginBottom: 6 }}>Scoring vs Allowed</div>
          <div style={{ height: 6, background: "var(--surface-strong)", borderRadius: "var(--radius-pill)", overflow: "hidden", display: "flex" }}>
            {(() => {
              const total = (userTeam.ptsFor ?? 0) + (userTeam.ptsAgainst ?? 0);
              const pctFor = total > 0 ? (userTeam.ptsFor / total) * 100 : 50;
              return (
                <>
                  <div style={{ width: `${pctFor}%`, background: "var(--accent)", borderRadius: "var(--radius-pill)" }} />
                  <div style={{ flex: 1, background: "var(--danger)", opacity: 0.7 }} />
                </>
              );
            })()}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "var(--text-subtle)" }}>
            <span style={{ color: "var(--accent)" }}>Scored: {userTeam.ptsFor ?? 0}</span>
            <span style={{ color: "var(--danger)" }}>Allowed: {userTeam.ptsAgainst ?? 0}</span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Coach Approval Card ────────────────────────────────────────────────────────

function approvalColor(val) {
  if (val >= 75) return "#34C759";
  if (val >= 55) return "#FF9F0A";
  return "#FF453A";
}

function ownerMoodMeta(league) {
  if (!league) {
    return {
      mood: "neutral",
      face: "😐",
      toneColor: "var(--text-muted)",
      headline: "Owner mood unknown",
      detail: "Play a few weeks to get a read on expectations.",
    };
  }

  const userTeam = league.teams?.find(t => t.id === league.userTeamId);
  const approval = Math.round(league.ownerApproval ?? 75);
  const wins = userTeam?.wins ?? 0;
  const losses = userTeam?.losses ?? 0;
  const ties = userTeam?.ties ?? 0;
  const games = wins + losses + ties;
  const winPct = games > 0 ? ((wins + ties * 0.5) / games) : 0.5;

  const year = league.year ?? 1;
  const cycle = ((year - 1) % 3) + 1;

  let expectation;
  if (cycle === 1) {
    expectation = "Year 1: hit 7+ wins or build a clear top-10 unit.";
  } else if (cycle === 2) {
    expectation = "Year 2: finish with a winning record and sniff the playoffs.";
  } else {
    expectation = "Year 3: make the playoffs and win at least one game.";
  }

  let mood = "neutral";
  let face = "😐";
  let toneColor = "var(--text-muted)";
  let detail;

  if (approval >= 78) {
    mood = "thrilled";
    face = "😄";
    toneColor = "var(--success)";
    if (winPct >= 0.7) {
      detail = "Thrilled with the win column and the rookie core.";
    } else {
      detail = "Happy with the direction and patient as the roster develops.";
    }
  } else if (approval >= 58) {
    mood = "uneasy";
    face = "😕";
    toneColor = "var(--warning)";
    if (winPct >= 0.5) {
      detail = "Sees signs of progress, but wants more consistency week to week.";
    } else {
      detail = "Concerned that the results aren’t matching the roster talent.";
    }
  } else {
    mood = "angry";
    face = "😡";
    toneColor = "var(--danger)";
    if (winPct >= 0.4) {
      detail = "Frustrated by tough losses in big spots — pressure is rising.";
    } else {
      detail = "Very unhappy with the slide and questioning the long-term plan.";
    }
  }

  return {
    mood,
    face,
    toneColor,
    headline: `Owner mood: ${mood === "thrilled" ? "Thrilled" : mood === "uneasy" ? "Concerned" : "Angry"}`,
    detail,
    expectation,
    approval,
  };
}

function OwnerMoodCard({ league }) {
  const meta = ownerMoodMeta(league);

  return (
    <SectionCard title="Owner Mood" icon={meta.face}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: meta.toneColor }}>
          {meta.headline} ({meta.approval}%)
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
          {meta.detail}
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--text-subtle)", marginTop: 4 }}>
          <span style={{ fontWeight: 700 }}>This year’s goal:&nbsp;</span>
          {meta.expectation}
        </div>
      </div>
    </SectionCard>
  );
}

function CoachApprovalCard({ league }) {
  if (!league) return null;

  const userTeam = league.teams?.find(t => t.id === league.userTeamId);
  const base = Math.round(league.ownerApproval ?? 75);
  const wins = userTeam?.wins ?? 0;
  const losses = userTeam?.losses ?? 0;
  const total = wins + losses;
  const winRate = total > 0 ? wins / total : 0.5;

  const seed = ((league.year ?? 2025) * 31 + (league.week ?? 1) * 7) | 0;
  const fuzz = (offset) => {
    let s = (seed + offset * 1664525 + 1013904223) & 0xffff;
    return (s / 0xffff - 0.5) * 10;
  };

  const categories = [
    { label: "GM",      value: base },
    { label: "Staff",   value: Math.round(Math.min(99, Math.max(1, base + fuzz(1) * 0.5))) },
    { label: "Players", value: Math.round(Math.min(99, Math.max(1, base * 0.88 + winRate * 12 + fuzz(2)))) },
    { label: "Fans",    value: Math.round(Math.min(99, Math.max(1, winRate * 84 + 15 + fuzz(3)))) },
    { label: "Media",   value: Math.round(Math.min(99, Math.max(1, winRate * 60 + base * 0.38 + fuzz(4)))) },
  ];

  const avg = Math.round(categories.reduce((s, c) => s + c.value, 0) / categories.length);
  const overallColor = approvalColor(avg);

  return (
    <SectionCard title="Coach Approval" icon="🏟️" accent={overallColor}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Overall rating this week</span>
        <span style={{ fontSize: "1.3rem", fontWeight: 900, color: overallColor, lineHeight: 1 }}>
          {avg}<span style={{ fontSize: "0.7rem", fontWeight: 700 }}>%</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {categories.map(({ label, value }) => {
          const c = approvalColor(value);
          return (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                fontSize: "0.6rem", color: "var(--text-subtle)",
                fontWeight: 700, letterSpacing: "0.3px", marginBottom: 4,
              }}>
                {label}
              </div>
              <div style={{ fontSize: "0.85rem", fontWeight: 900, color: c, marginBottom: 4 }}>
                {value}
              </div>
              <div style={{
                height: 4, background: "rgba(255,255,255,0.07)",
                borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${value}%`, background: c,
                  borderRadius: 2,
                  transition: "width 1s cubic-bezier(0.2,0.8,0.2,1)",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ── Helpers for new cards ─────────────────────────────────────────────────────

function getTeamStreakHome(schedule, teamId) {
  if (!schedule?.weeks) return null;
  let streakType = null;
  let count = 0;
  for (const week of [...schedule.weeks].reverse()) {
    for (const game of [...(week.games ?? [])].reverse()) {
      if (!game.played) continue;
      const homeId = typeof game.home === "object" ? game.home.id : Number(game.home);
      const awayId = typeof game.away === "object" ? game.away.id : Number(game.away);
      if (homeId !== teamId && awayId !== teamId) continue;
      const isHome = homeId === teamId;
      const ts = isHome ? game.homeScore : game.awayScore;
      const os = isHome ? game.awayScore : game.homeScore;
      const result = ts > os ? "W" : ts < os ? "L" : "T";
      if (streakType === null) { streakType = result; count = 1; }
      else if (result === streakType) count++;
      else return { type: streakType, count };
    }
  }
  return streakType ? { type: streakType, count } : null;
}

function getPositionGroupOvr(roster, positions) {
  if (!roster?.length) return 0;
  const group = roster.filter(p => positions.includes(p.pos ?? p.position ?? ""));
  if (!group.length) return 0;
  // Weight top 2 starters more heavily
  const sorted = [...group].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
  const top = sorted.slice(0, 2);
  const rest = sorted.slice(2, 5);
  const topAvg = top.reduce((s, p) => s + (p.ovr ?? 0), 0) / Math.max(1, top.length);
  const restAvg = rest.length ? rest.reduce((s, p) => s + (p.ovr ?? 0), 0) / rest.length : topAvg;
  return Math.round(topAvg * 0.7 + restAvg * 0.3);
}

// ── Season Objectives Card ─────────────────────────────────────────────────────

function SeasonObjectivesCard({ league, userTeam }) {
  if (!userTeam) return null;

  const year     = league?.year ?? 1;
  const cycle    = ((year - 1) % 3) + 1;
  const wins     = userTeam.wins  ?? 0;
  const losses   = userTeam.losses ?? 0;
  const gamesPlayed = wins + losses + (userTeam.ties ?? 0);
  const inPlayoffs = league?.phase === "playoffs";

  const objectives = useMemo(() => {
    const objs = [];
    // Primary win target based on year cycle
    const winTarget = cycle === 1 ? 7 : cycle === 2 ? 9 : 11;
    const gamesLeft = Math.max(0, 17 - gamesPlayed);
    const maxWins = wins + gamesLeft;
    const winProgress = Math.min(100, Math.round((wins / winTarget) * 100));
    const achievable = maxWins >= winTarget;
    objs.push({
      label: cycle === 1 ? "Win 7+ games" : cycle === 2 ? "Finish .500 or better" : "Win 11+ games",
      progress: winProgress,
      current: `${wins} wins`,
      target: `${winTarget} wins`,
      done: wins >= winTarget,
      icon: "🏆",
      achievable,
    });

    // Cap health goal
    const capRoom = userTeam.capRoom ?? userTeam.capSpace ?? 20;
    const capHealthy = capRoom >= 10;
    objs.push({
      label: "Maintain cap flexibility",
      progress: capHealthy ? 100 : Math.round((capRoom / 10) * 100),
      current: `$${capRoom.toFixed(0)}M space`,
      target: "$10M+ free",
      done: capHealthy,
      icon: "💰",
      achievable: true,
    });

    // Playoff goal (year 2+)
    if (cycle >= 2 || inPlayoffs) {
      objs.push({
        label: "Make the playoffs",
        progress: inPlayoffs ? 100 : gamesPlayed === 0 ? 0 : Math.min(100, Math.round((wins / 7) * 100)),
        current: inPlayoffs ? "In playoffs!" : `${wins} wins`,
        target: "7+ wins",
        done: inPlayoffs,
        icon: "🎯",
        achievable: true,
      });
    }

    // Super Bowl goal (year 3)
    if (cycle === 3) {
      objs.push({
        label: "Win the Super Bowl",
        progress: inPlayoffs ? 50 : 0,
        current: inPlayoffs ? "In playoffs" : "Regular season",
        target: "Champion",
        done: false,
        icon: "💍",
        achievable: inPlayoffs,
      });
    }

    return objs;
  }, [wins, losses, gamesPlayed, cycle, inPlayoffs, userTeam]);

  return (
    <SectionCard title="Season Objectives" icon="🎯" accent="var(--accent)">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {objectives.map((obj, i) => (
          <div key={i}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: "0.85rem" }}>{obj.icon}</span>
                <span style={{
                  fontSize: "var(--text-xs)", fontWeight: 700,
                  color: obj.done ? "var(--success)" : "var(--text)",
                }}>
                  {obj.label}
                </span>
                {obj.done && <span style={{ fontSize: "0.65rem", color: "var(--success)" }}>✓</span>}
              </div>
              <span style={{ fontSize: "0.65rem", color: "var(--text-subtle)", fontVariantNumeric: "tabular-nums" }}>
                {obj.current} / {obj.target}
              </span>
            </div>
            <div style={{ height: 4, background: "var(--surface-strong)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${obj.progress}%`,
                background: obj.done ? "var(--success)" : !obj.achievable ? "var(--danger)" : "var(--accent)",
                borderRadius: "var(--radius-pill)",
                transition: "width 1s cubic-bezier(0.2,0.8,0.2,1)",
              }} />
            </div>
          </div>
        ))}
        <div style={{ fontSize: "0.65rem", color: "var(--text-subtle)", marginTop: 2 }}>
          Year {year} · {cycle === 1 ? "Build Phase" : cycle === 2 ? "Compete Phase" : "Championship Window"}
        </div>
      </div>
    </SectionCard>
  );
}

// ── Team Strength Breakdown ───────────────────────────────────────────────────

function TeamStrengthBreakdown({ userTeam }) {
  if (!userTeam?.roster) return null;

  const roster = userTeam.roster;

  const groups = useMemo(() => [
    { label: "QB",       icon: "🎯", positions: ["QB"],            color: "#0A84FF" },
    { label: "O-Line",   icon: "🧱", positions: ["OT","OG","C"],   color: "#34C759" },
    { label: "Backfield",icon: "🏃", positions: ["RB","FB"],       color: "#FF9F0A" },
    { label: "Receivers",icon: "📡", positions: ["WR","TE"],       color: "#5E5CE6" },
    { label: "D-Line",   icon: "💪", positions: ["DE","DT","DL","EDGE"], color: "#FF453A" },
    { label: "Linebackers",icon:"🛡️", positions: ["LB","MLB","OLB","ILB"], color: "#FF6B35" },
    { label: "Secondary",icon: "🔒", positions: ["CB","S","SS","FS"], color: "#64D2FF" },
  ], []);

  const ratings = useMemo(() => groups.map(g => ({
    ...g,
    ovr: getPositionGroupOvr(roster, g.positions),
  })), [roster, groups]);

  const offGroups = ratings.filter(g => ["QB","O-Line","Backfield","Receivers"].includes(g.label));
  const defGroups = ratings.filter(g => ["D-Line","Linebackers","Secondary"].includes(g.label));

  const offOvr = Math.round(offGroups.reduce((s, g) => s + g.ovr, 0) / offGroups.length);
  const defOvr = Math.round(defGroups.reduce((s, g) => s + g.ovr, 0) / defGroups.length);

  const ovrBar = (val) => {
    const pct = Math.min(100, Math.max(0, ((val - 60) / 40) * 100));
    const c = val >= 82 ? "#34C759" : val >= 74 ? "#FF9F0A" : "#FF453A";
    return { pct, color: c };
  };

  return (
    <SectionCard title="Roster Breakdown" icon="📋">
      {/* Off vs Def summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        {[
          { side: "OFFENSE", val: offOvr, color: "#0A84FF" },
          { side: "DEFENSE", val: defOvr, color: "#FF453A" },
        ].map(({ side, val, color }) => (
          <div key={side} style={{ textAlign: "center", padding: "var(--space-3)", background: `${color}10`, borderRadius: "var(--radius-md)", border: `1px solid ${color}25` }}>
            <div style={{ fontSize: "0.6rem", color, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{side}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
          </div>
        ))}
      </div>
      {/* Position group bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {ratings.map(({ label, icon, ovr, color }) => {
          const { pct } = ovrBar(ovr);
          return (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ fontSize: "0.75rem", width: 20, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: "var(--text-xs)", width: 76, flexShrink: 0, color: "var(--text-muted)", fontWeight: 600 }}>{label}</span>
              <div style={{ flex: 1, height: 5, background: "var(--surface-strong)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "var(--radius-pill)", transition: "width 1s" }} />
              </div>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 800, color, width: 26, textAlign: "right", flexShrink: 0 }}>{ovr}</span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ── Wild Card Race Card ────────────────────────────────────────────────────────

function WildCardRaceCard({ league, userTeam, onTeamSelect }) {
  if (!userTeam || !league?.teams) return null;
  if (!["regular","playoffs"].includes(league.phase)) return null;

  const confIdx = typeof userTeam.conf === "number" ? userTeam.conf : userTeam.conf === "AFC" ? 0 : 1;
  const confName = ["AFC", "NFC"][confIdx] ?? "?";

  const confTeams = useMemo(() => (league.teams ?? [])
    .filter(t => {
      const tc = typeof t.conf === "number" ? t.conf : t.conf === "AFC" ? 0 : 1;
      return tc === confIdx;
    })
    .sort((a, b) => {
      const ga = (a.wins + a.losses + (a.ties ?? 0));
      const gb = (b.wins + b.losses + (b.ties ?? 0));
      if (ga === 0 && gb === 0) return (b.ovr ?? 0) - (a.ovr ?? 0);
      const pa = (a.wins + (a.ties ?? 0) * 0.5) / Math.max(1, ga);
      const pb = (b.wins + (b.ties ?? 0) * 0.5) / Math.max(1, gb);
      return pb - pa;
    }),
  [league.teams, confIdx]);

  // Show top 8 (7 playoff seeds + 1 bubble team)
  const display = confTeams.slice(0, 8);

  return (
    <SectionCard title={`${confName} Playoff Race`} icon="🏟️" accent="var(--warning)">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {display.map((team, i) => {
          const isUser    = team.id === userTeam.id;
          const isIn      = i < 7;
          const isBubble  = i === 7;
          const seedColor = i === 0 ? "#FFD60A" : i < 4 ? "#34C759" : "#0A84FF";
          const gp  = team.wins + team.losses + (team.ties ?? 0);
          const pct = gp > 0 ? ((team.wins + (team.ties ?? 0) * 0.5) / gp).toFixed(3).replace(/^0/, "") : ".000";
          return (
            <React.Fragment key={team.id}>
              {i === 7 && (
                <div style={{ height: 1, background: "rgba(255,69,58,0.35)", margin: "2px 0" }} />
              )}
              <div
                onClick={() => onTeamSelect?.(team.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--space-2)",
                  padding: "5px var(--space-3)",
                  background: isUser ? "var(--accent-muted)" : isBubble ? "rgba(255,69,58,0.04)" : "transparent",
                  borderRadius: "var(--radius-sm)",
                  border: isUser ? "1px solid var(--accent)" : isBubble ? "1px dashed rgba(255,69,58,0.25)" : "1px solid transparent",
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 16, fontSize: "0.65rem", fontWeight: 800, color: isIn ? seedColor : "var(--text-subtle)", textAlign: "center" }}>
                  {i + 1}
                </span>
                <TeamCircle abbr={team.abbr} size={24} isUser={isUser} />
                <span style={{ flex: 1, fontSize: "var(--text-xs)", fontWeight: isUser ? 700 : 500, color: isUser ? "var(--accent)" : "var(--text)" }}>
                  {team.abbr}
                </span>
                <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  {team.wins}-{team.losses}{(team.ties ?? 0) > 0 ? `-${team.ties}` : ""}
                </span>
                <span style={{ fontSize: "0.6rem", color: "var(--text-subtle)", width: 32, textAlign: "right" }}>
                  {pct}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ fontSize: "0.6rem", color: "var(--text-subtle)", marginTop: "var(--space-2)", textAlign: "center" }}>
        Top 4 = division leaders · #5-7 = wild cards · Cut line after #7
      </div>
    </SectionCard>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────────

export default function HomeDashboard({ league, onTeamSelect, onPlayerSelect, onTabChange, onAdvanceWeek, isBusy }) {
  const userTeam = league?.teams?.find(t => t.id === league.userTeamId);

  const teamById = useMemo(() => {
    const map = {};
    (league?.teams ?? []).forEach(t => { map[t.id] = t; });
    return map;
  }, [league?.teams]);

  const recentForm = useMemo(
    () => getRecentForm(league?.schedule, league?.userTeamId),
    [league?.schedule, league?.userTeamId]
  );

  const nextGame = useMemo(
    () => getNextGame(league?.schedule, league?.userTeamId, teamById),
    [league?.schedule, league?.userTeamId, teamById]
  );

  const streak = useMemo(
    () => getTeamStreakHome(league?.schedule, league?.userTeamId),
    [league?.schedule, league?.userTeamId]
  );

  const injuries = useMemo(() => {
    if (!userTeam?.roster) return [];
    return (userTeam.roster ?? [])
      .filter(p => p.injury && p.injury.weeksLeft > 0)
      .map(p => ({
        playerId: p.id,
        playerName: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
        pos: p.pos,
        type: p.injury.type,
        weeksLeft: p.injury.weeksLeft,
        ovrImpact: p.injury.ovrImpact,
      }));
  }, [userTeam]);

  const topPerformers = useMemo(() => {
    return (userTeam?.roster || []).sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 3);
  }, [userTeam]);

  if (!userTeam) {
    return (
      <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--text-muted)" }}>
        Loading team data...
      </div>
    );
  }

  const phase = league?.phase;
  const phaseLabel = {
    preseason: "Preseason",
    regular: "Regular Season",
    playoffs: "Playoffs",
    free_agency: "Free Agency",
    draft: "NFL Draft",
    offseason: "Offseason",
  }[phase] ?? phase ?? "Season";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

      {/* Phase banner */}
      <div style={{
        padding: "var(--space-2) var(--space-4)",
        background: phase === "playoffs"
          ? "linear-gradient(90deg, rgba(255,215,0,0.12), transparent)"
          : phase === "draft"
          ? "rgba(10,132,255,0.08)"
          : "var(--surface)",
        border: `1px solid ${phase === "playoffs" ? "rgba(255,215,0,0.25)" : "var(--hairline)"}`,
        borderRadius: "var(--radius-md)",
        display: "flex", alignItems: "center", gap: "var(--space-3)",
      }}>
        <span style={{ fontSize: "0.9rem" }}>
          {phase === "playoffs" ? "🏆" : phase === "draft" ? "🎓" : phase === "free_agency" ? "✍️" : "🏈"}
        </span>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text)" }}>
          {phaseLabel}
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {phase === "regular" && league?.week ? `Week ${league.week}` : ""}
          {phase === "playoffs" && league?.week ? ` · Round ${league.week - 18}` : ""}
        </span>
        {phase === "playoffs" && (
          <Button
            variant="outline"
            onClick={() => onTabChange?.("Postseason")}
            style={{
              marginLeft: "auto", padding: "4px 12px",
              background: "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.3)",
              borderRadius: "var(--radius-pill)", color: "#FFD700",
              fontSize: "var(--text-xs)", fontWeight: 700,
            }}
          >
            View Bracket →
          </Button>
        )}
        {phase === "draft" && (
          <Button
            variant="outline"
            onClick={() => onTabChange?.("Draft")}
            style={{
              marginLeft: "auto", padding: "4px 12px",
              background: "var(--accent-muted)", border: "1px solid var(--accent)",
              borderRadius: "var(--radius-pill)", color: "var(--accent)",
              fontSize: "var(--text-xs)", fontWeight: 700,
            }}
          >
            Open Draft Board →
          </Button>
        )}
      </div>

      {/* Large Advance Week CTA */}
      <AdvanceWeekCTA phase={phase} week={league?.week} onAdvanceWeek={onAdvanceWeek} isBusy={isBusy} />

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-4)" }}>

        {/* Hero: Team Identity with streak */}
        <TeamSnapshotCard userTeam={userTeam} league={league} streak={streak} />

        {/* Owner mood + season goals side by side */}
        <OwnerMoodCard league={league} />
        <SeasonObjectivesCard league={league} userTeam={userTeam} />

        {/* Game + quick stats */}
        <NextGameCard nextGame={nextGame} league={league} />
        <QuickStatsCard userTeam={userTeam} league={league} />

        {/* Roster breakdown — full width on mobile, half on desktop */}
        <TeamStrengthBreakdown userTeam={userTeam} />

        {/* Approval + Form */}
        <CoachApprovalCard league={league} />
        <RecentFormCard form={recentForm} />

        {/* Injury report */}
        <InjuryReportCard injuries={injuries} onPlayerSelect={onPlayerSelect} />

        {/* Top Performers */}
        <SectionCard title="Top Performers" icon="🔥">
          <div style={{ display: "flex", gap: "var(--space-3)", overflowX: "auto", padding: "var(--space-2) 0" }}>
            {topPerformers.map(p => (
              <PlayerCard key={p.id} player={p} variant="compact" />
            ))}
          </div>
        </SectionCard>

        {/* Division standings with win% bars */}
        <DivisionSnapshotCard
          userTeam={userTeam}
          teams={league.teams}
          onTeamSelect={onTeamSelect}
        />

        {/* Full conference playoff race (regular season + playoffs only) */}
        {["regular","playoffs"].includes(phase) && (
          <WildCardRaceCard league={league} userTeam={userTeam} onTeamSelect={onTeamSelect} />
        )}

        {/* Latest news — full width */}
        <div style={{ gridColumn: "1 / -1" }}>
          <LeagueNewsCard league={league} />
        </div>
      </div>
    </div>
  );
}
