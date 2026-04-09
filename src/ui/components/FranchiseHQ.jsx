import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { evaluateWeeklyContext } from "../utils/weeklyContext.js";
import { deriveTeamCapSnapshot, formatMoneyM } from "../utils/numberFormatting.js";
import { findLatestUserCompletedGame } from "../utils/completedGameSelectors.js";
import FranchiseSummaryPanel from "./FranchiseSummaryPanel.jsx";

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

export default function FranchiseHQ({ league, onNavigate, onAdvanceWeek, busy, simulating, onOpenBoxScore }) {
  const userTeam = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)), [league]);
  const weekly = useMemo(() => evaluateWeeklyContext(league), [league]);
  const nextGame = useMemo(() => getNextGame(league), [league]);
  const latest = useMemo(() => findLatestUserCompletedGame(league), [league]);
  if (!league || !userTeam) return null;

  const cap = deriveTeamCapSnapshot(userTeam, { fallbackCapTotal: 255 });
  const urgent = (weekly?.needsAttention ?? []).slice(0, 3);
  const storylines = (weekly?.storylineCards ?? []).slice(0, 3);

  return (
    <div className="app-screen-stack">
      <FranchiseSummaryPanel league={league} />
      <section className="card" style={{ padding: "var(--space-3)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
          <div><span className="text-muted">Next Opponent</span><div style={{ fontWeight: 800 }}>{nextGame ? `Week ${nextGame.week} ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.name ?? "TBD"}` : "No upcoming game"}</div></div>
          <div><span className="text-muted">Latest Result</span><div style={{ fontWeight: 800 }}>{latest?.story?.headline ?? "No completed game yet"}</div></div>
          <div><span className="text-muted">Cap / Payroll</span><div style={{ fontWeight: 800 }}>{formatMoneyM(cap.capRoom)} room · {formatMoneyM(cap.capUsed)} payroll</div></div>
          <div><span className="text-muted">Expiring / Injuries</span><div style={{ fontWeight: 800 }}>{weekly?.pressurePoints?.expiringCount ?? 0} expiring · {weekly?.pressurePoints?.injuriesCount ?? 0} injuries</div></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <Button size="sm" onClick={onAdvanceWeek} disabled={busy || simulating}>{simulating ? "Simulating…" : "Advance Week"}</Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate?.("Schedule")}>Schedule</Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate?.("Roster")}>Roster</Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate?.("Transactions")}>Transactions</Button>
          <Button size="sm" variant="outline" onClick={() => latest?.gameId ? onOpenBoxScore?.(latest.gameId) : onNavigate?.("Schedule")}>Latest Box Score</Button>
        </div>
      </section>

      <section className="card" style={{ padding: "var(--space-3)" }}>
        <strong>Urgent Actions</strong>
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {urgent.map((item, idx) => (
            <button key={`${item.label}-${idx}`} className="weekly-urgent-item" onClick={() => onNavigate?.(item.tab)}>
              <div>
                <div style={{ fontWeight: 700 }}>{item.label}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{item.detail}</div>
              </div>
              <span>›</span>
            </button>
          ))}
          {!urgent.length ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No urgent blockers this week.</div> : null}
        </div>
      </section>

      <section className="card" style={{ padding: "var(--space-3)" }}>
        <strong>Top Storylines</strong>
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {storylines.map((s, idx) => (
            <button key={`${s.title}-${idx}`} className="weekly-urgent-item" onClick={() => onNavigate?.(s.tab ?? "League")}>
              <div>
                <div style={{ fontWeight: 700 }}>{s.title}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{s.detail}</div>
              </div>
              <span>›</span>
            </button>
          ))}
          {!storylines.length ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No major storyline spikes right now.</div> : null}
        </div>
      </section>
    </div>
  );
}

