import React, { useState, useMemo, useCallback } from "react";
import { buildTeamIntelligence, classifyNeedFitForProspect } from "../utils/teamIntelligence.js";

function seededRng(seed) {
  let s = seed | 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function runMockDraft(teams, prospects, userTeamId, rng, needsMap) {
  const picks = [];
  const available = [...prospects].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
  const totalPicks = Math.min(7 * teams.length, available.length);
  const sorted = [...teams].sort((a, b) => {
    const aWp = (a.wins + 0.5 * (a.ties || 0)) / Math.max(1, a.wins + a.losses + (a.ties || 0));
    const bWp = (b.wins + 0.5 * (b.ties || 0)) / Math.max(1, b.wins + b.losses + (b.ties || 0));
    return aWp - bWp;
  });

  const order = [];
  for (let round = 0; round < 7; round++) sorted.forEach((team) => order.push({ teamId: team.id, round: round + 1 }));

  for (let i = 0; i < Math.min(totalPicks, order.length); i++) {
    const { teamId, round } = order[i];
    const teamNeeds = needsMap.get(teamId) ?? [];

    const needRoll = rng();
    const pickIdx = available.findIndex((p) => teamNeeds.includes(p.pos));
    let chosenIdx = 0;
    let reason = "Best available talent";

    if (pickIdx >= 0 && needRoll > 0.35) {
      chosenIdx = pickIdx;
      reason = `Need fit at ${available[pickIdx]?.pos}`;
    } else {
      const upsideIdx = available.findIndex((p) => (Number(p.potential ?? p.ovr ?? 60) - Number(p.ovr ?? 60)) >= 10);
      if (upsideIdx >= 0 && round >= 3 && needRoll > 0.75) {
        chosenIdx = upsideIdx;
        reason = "Upside swing";
      }
    }

    const pick = available.splice(chosenIdx, 1)[0];
    if (!pick) break;

    const team = teams.find((t) => t.id === teamId);
    picks.push({
      overall: i + 1,
      round,
      pick: (i % teams.length) + 1,
      teamId,
      teamAbbr: team?.abbr || "???",
      teamName: team?.name || "Unknown",
      player: pick,
      isUser: teamId === userTeamId,
      reason,
    });
  }

  return picks;
}

function PickCard({ pick, onPlayerSelect }) {
  return (
    <div
      onClick={() => onPlayerSelect?.(pick.player.id)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
        borderBottom: "1px solid var(--hairline)",
        background: pick.isUser ? "var(--accent)0d" : "transparent",
        borderLeft: pick.isUser ? "3px solid var(--accent)" : "3px solid transparent",
        cursor: "pointer",
      }}
    >
      <div style={{ width: 28, fontSize: 11, fontWeight: 800, color: "var(--text-subtle)", textAlign: "center", flexShrink: 0 }}>#{pick.overall}</div>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: pick.isUser ? "var(--accent)22" : "var(--surface-strong, #1a1a2e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: pick.isUser ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }}>{pick.teamAbbr?.slice(0, 3)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pick.player.name}</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{pick.player.pos} · {pick.player.college ?? "—"} · {pick.reason}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span className="ovr-pill" style={{ fontSize: 11, fontWeight: 800 }}>{pick.player.ovr ?? 60}</span>
      </div>
    </div>
  );
}

export default function MockDraft({ league, onPlayerSelect }) {
  const [mockResults, setMockResults] = useState(null);
  const [mockCount, setMockCount] = useState(0);
  const [expandedRounds, setExpandedRounds] = useState(new Set([1]));

  const seed = (league?.year ?? 2025) * 100 + (league?.week ?? 1);
  const teams = league?.teams || [];
  const userTeamId = league?.userTeamId;
  const prospects = useMemo(() => {
    const list = Array.isArray(league?.draftClass) ? [...league.draftClass] : [];
    return list.sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
  }, [league?.draftClass]);

  const needsMap = useMemo(() => {
    const map = new Map();
    teams.forEach((team) => {
      const intel = buildTeamIntelligence(team, { week: league?.week ?? 1 });
      map.set(team.id, [...intel.needsNow.map((n) => n.pos), ...intel.needsLater.map((n) => n.pos)]);
    });
    return map;
  }, [teams, league?.week]);

  const userIntel = useMemo(() => buildTeamIntelligence(teams.find((t) => t.id === userTeamId), { week: league?.week ?? 1 }), [teams, userTeamId, league?.week]);

  const runMock = useCallback(() => {
    const mockRng = seededRng(seed + mockCount * 7 + Date.now() % 1000);
    const picks = runMockDraft(teams, prospects, userTeamId, mockRng, needsMap);
    setMockResults(picks);
    setMockCount((prev) => prev + 1);
    setExpandedRounds(new Set([1]));
  }, [teams, prospects, userTeamId, seed, mockCount, needsMap]);

  const likelyGoneSoon = useMemo(() => {
    if (!mockResults) return [];
    const userFirst = mockResults.find((p) => p.isUser);
    if (!userFirst) return [];
    return mockResults.filter((p) => p.overall < userFirst.overall).slice(-8).map((p) => p.player);
  }, [mockResults]);

  const positionRuns = useMemo(() => {
    if (!mockResults) return [];
    const firstRound = mockResults.filter((p) => p.round === 1);
    const counts = new Map();
    firstRound.forEach((p) => counts.set(p.player.pos, (counts.get(p.player.pos) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [mockResults]);

  const toggleRound = (round) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round); else next.add(round);
      return next;
    });
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h2 style={{ fontSize: "var(--text-lg, 18px)", fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Mock Draft Planner</h2>
      <p style={{ fontSize: "var(--text-xs, 12px)", color: "var(--text-muted)", marginBottom: 12 }}>{league?.year} Draft · Uses live class + team intelligence · estimate-based</p>

      <div className="stat-box" style={{ marginBottom: 12, padding: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Your likely needs: {userIntel.needsNow.map((n) => n.pos).join(", ") || "None urgent"} · Later: {userIntel.needsLater.map((n) => n.pos).join(", ") || "None"}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-subtle)" }}>
          Guidance is directional: position runs and value pockets are estimates, not guarantees.
        </div>
      </div>

      <button className="btn" onClick={runMock} style={{ width: "100%", padding: 12, fontSize: 14, fontWeight: 800, background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-md, 8px)", cursor: "pointer", marginBottom: 16 }}>
        {mockResults ? "Run New Mock Draft" : "Simulate Mock Draft"}
      </button>

      {mockResults && (
        <>
          <div className="stat-box" style={{ marginBottom: 12, padding: 12, display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>Draft pulse</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Likely gone before your first pick: {likelyGoneSoon.slice(0, 5).map((p) => `${p.name} (${p.pos})`).join(" · ") || "Not enough data"}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Likely round-1 runs: {positionRuns.map(([pos, count]) => `${pos} (${count})`).join(" · ") || "No run signal"}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Trade-down signal: {positionRuns.some(([, c]) => c >= 4) ? "Consider moving down if your target tier has depth." : "No strong reason to force a trade-down."}</div>
          </div>

          {[1, 2, 3, 4, 5, 6, 7].map((round) => {
            const roundPicks = mockResults.filter((p) => p.round === round);
            if (roundPicks.length === 0) return null;
            const isExpanded = expandedRounds.has(round);
            const userPick = roundPicks.find((p) => p.isUser);

            return (
              <div key={round} className="stat-box" style={{ marginBottom: 8, overflow: "hidden" }}>
                <div onClick={() => toggleRound(round)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", cursor: "pointer", borderBottom: isExpanded ? "1px solid var(--hairline)" : "none" }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>Round {round}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>{roundPicks.length} picks</span>
                  </div>
                  {userPick && !isExpanded && <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>Your pick: {userPick.player.name} ({classifyNeedFitForProspect(userPick.player.pos, userIntel).bucket})</span>}
                  <span style={{ color: "var(--text-subtle)", transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
                </div>
                {isExpanded && roundPicks.map((pick) => <PickCard key={pick.overall} pick={pick} onPlayerSelect={onPlayerSelect} />)}
              </div>
            );
          })}
        </>
      )}

      {!mockResults && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Run a mock draft to map likely board flow.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Uses current class + roster-driven needs; no fake certainty.</div>
        </div>
      )}
    </div>
  );
}
