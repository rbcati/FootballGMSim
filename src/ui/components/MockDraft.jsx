/**
 * MockDraft.jsx — Mock Draft simulation, Big Board, Combine, and Team Needs
 *
 * Runs client-side mock drafts using league team needs and prospect data.
 */

import React, { useState, useMemo, useCallback } from "react";

// Seeded RNG for reproducible mock results
function seededRng(seed) {
  let s = seed | 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

const COLLEGES = [
  "Alabama","Ohio State","Georgia","Clemson","LSU","Michigan","Oklahoma","Texas",
  "USC","Oregon","Penn State","Notre Dame","Florida","Auburn","Tennessee","Miami",
  "Wisconsin","Iowa","Stanford","UCLA","Florida State","Texas A&M","Virginia Tech",
  "Nebraska","Washington","NC State","Arkansas","Ole Miss","Kentucky","Baylor",
  "Utah","Pittsburgh","Minnesota","Illinois","Purdue","Boston College","Syracuse",
  "Wake Forest","Duke","Colorado","Arizona State","Oregon State","TCU","Kansas State",
  "Iowa State","Oklahoma State","West Virginia","BYU","Cincinnati","Houston",
];

const POSITIONS = ["QB","RB","WR","TE","OL","DL","LB","CB","S","K","P"];
const POSITION_WEIGHTS = { QB:8, RB:6, WR:10, TE:4, OL:12, DL:10, LB:8, CB:8, S:5, K:1, P:1 };

const COMBINE_EVENTS = [
  { id: "forty", label: "40-Yard Dash", unit: "s", lower: true },
  { id: "bench", label: "Bench Press", unit: "reps", lower: false },
  { id: "vertical", label: "Vertical Jump", unit: "\"", lower: false },
  { id: "broad", label: "Broad Jump", unit: "\"", lower: false },
  { id: "cone", label: "3-Cone Drill", unit: "s", lower: true },
  { id: "shuttle", label: "20-Yard Shuttle", unit: "s", lower: true },
];

function scoutGrade(ovr) {
  if (ovr >= 90) return { grade: "A+", color: "#34C759" };
  if (ovr >= 85) return { grade: "A", color: "#34C759" };
  if (ovr >= 80) return { grade: "B+", color: "#0A84FF" };
  if (ovr >= 75) return { grade: "B", color: "#0A84FF" };
  if (ovr >= 70) return { grade: "C+", color: "#FFD60A" };
  if (ovr >= 65) return { grade: "C", color: "#FFD60A" };
  if (ovr >= 60) return { grade: "D+", color: "#FF9F0A" };
  return { grade: "D", color: "#FF453A" };
}

function generateProspects(rng, count = 250) {
  const prospects = [];
  const totalWeight = Object.values(POSITION_WEIGHTS).reduce((s, w) => s + w, 0);

  for (let i = 0; i < count; i++) {
    const roll = rng() * totalWeight;
    let cumulative = 0;
    let pos = "WR";
    for (const [p, w] of Object.entries(POSITION_WEIGHTS)) {
      cumulative += w;
      if (roll <= cumulative) { pos = p; break; }
    }

    const baseOvr = Math.round(40 + rng() * 55);
    const potential = Math.min(99, baseOvr + Math.round(rng() * 15));
    const age = 21 + Math.floor(rng() * 3);

    const combine = {};
    COMBINE_EVENTS.forEach(evt => {
      if (evt.id === "forty") combine[evt.id] = +(4.3 + rng() * 0.8).toFixed(2);
      else if (evt.id === "bench") combine[evt.id] = Math.round(10 + rng() * 30);
      else if (evt.id === "vertical") combine[evt.id] = +(28 + rng() * 14).toFixed(1);
      else if (evt.id === "broad") combine[evt.id] = Math.round(100 + rng() * 30);
      else if (evt.id === "cone") combine[evt.id] = +(6.5 + rng() * 1.2).toFixed(2);
      else if (evt.id === "shuttle") combine[evt.id] = +(4.0 + rng() * 0.7).toFixed(2);
    });

    const firstNames = ["Marcus","Jayden","Caleb","Drake","Aiden","Malik","Tyler","Brandon","Josh","Devon",
      "Trey","Andre","Chris","Jordan","Isaiah","Darius","Terrell","Antonio","Michael","Devin",
      "Cameron","Keegan","Hunter","Cole","Bryce","Jalen","Zach","Trevor","Patrick","Sean"];
    const lastNames = ["Williams","Johnson","Smith","Davis","Brown","Jones","Wilson","Thomas","Anderson",
      "Jackson","White","Harris","Martin","Thompson","Robinson","Clark","Lewis","Walker","Allen","Young"];

    prospects.push({
      id: `prospect_${i}`,
      name: `${firstNames[Math.floor(rng() * firstNames.length)]} ${lastNames[Math.floor(rng() * lastNames.length)]}`,
      pos, ovr: baseOvr, potential, age,
      college: COLLEGES[Math.floor(rng() * COLLEGES.length)],
      combine,
      rank: 0, // will be sorted
    });
  }

  prospects.sort((a, b) => b.ovr - a.ovr || b.potential - a.potential);
  prospects.forEach((p, i) => { p.rank = i + 1; });
  return prospects;
}

function getTeamNeeds(team, rng) {
  const needs = [...POSITIONS].filter(p => p !== "K" && p !== "P")
    .sort(() => rng() - 0.5)
    .slice(0, 3);
  return needs;
}

function runMockDraft(teams, prospects, userTeamId, rng) {
  const picks = [];
  const available = [...prospects];
  const teamNeeds = {};
  teams.forEach(t => { teamNeeds[t.id] = getTeamNeeds(t, rng); });

  // 7 rounds, 32 picks per round
  const totalPicks = Math.min(7 * teams.length, available.length);
  const draftOrder = [];

  // Reverse order of standings (worst first)
  const sorted = [...teams].sort((a, b) => {
    const aWp = (a.wins + 0.5 * (a.ties || 0)) / Math.max(1, a.wins + a.losses + (a.ties || 0));
    const bWp = (b.wins + 0.5 * (b.ties || 0)) / Math.max(1, b.wins + b.losses + (b.ties || 0));
    return aWp - bWp;
  });

  for (let round = 0; round < 7; round++) {
    sorted.forEach(team => { draftOrder.push({ teamId: team.id, round: round + 1 }); });
  }

  for (let i = 0; i < Math.min(totalPicks, draftOrder.length); i++) {
    const { teamId, round } = draftOrder[i];
    const needs = teamNeeds[teamId] || [];

    // Find best available matching a need
    let pick = null;
    for (const need of needs) {
      const idx = available.findIndex(p => p.pos === need);
      if (idx !== -1) { pick = available.splice(idx, 1)[0]; break; }
    }
    // Fall back to BPA
    if (!pick && available.length > 0) {
      pick = available.shift();
    }
    if (!pick) break;

    const team = teams.find(t => t.id === teamId);
    picks.push({
      overall: i + 1,
      round,
      pick: (i % teams.length) + 1,
      teamId,
      teamAbbr: team?.abbr || "???",
      teamName: team?.name || "Unknown",
      player: pick,
      isUser: teamId === userTeamId,
    });
  }

  return picks;
}

function PickCard({ pick, onPlayerSelect }) {
  const { grade, color } = scoutGrade(pick.player.ovr);
  return (
    <div
      onClick={() => onPlayerSelect?.(pick.player.id)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
        borderBottom: "1px solid var(--hairline)",
        background: pick.isUser ? "var(--accent)" + "0d" : "transparent",
        borderLeft: pick.isUser ? "3px solid var(--accent)" : "3px solid transparent",
        cursor: "pointer",
      }}
    >
      <div style={{
        width: 28, fontSize: 11, fontWeight: 800, color: "var(--text-subtle)",
        textAlign: "center", flexShrink: 0,
      }}>
        #{pick.overall}
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: pick.isUser ? "var(--accent)" + "22" : "var(--surface-strong, #1a1a2e)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 900, color: pick.isUser ? "var(--accent)" : "var(--text-muted)",
        flexShrink: 0,
      }}>
        {pick.teamAbbr?.slice(0, 3)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {pick.player.name}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {pick.player.pos} · {pick.player.college} · Age {pick.player.age}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span className="ovr-pill" style={{ fontSize: 11, fontWeight: 800 }}>{pick.player.ovr}</span>
        <div style={{ fontSize: 10, fontWeight: 700, color, marginTop: 2 }}>{grade}</div>
      </div>
    </div>
  );
}

export default function MockDraft({ league, actions, onPlayerSelect }) {
  const [subTab, setSubTab] = useState("mock");
  const [mockResults, setMockResults] = useState(null);
  const [mockCount, setMockCount] = useState(0);
  const [posFilter, setPosFilter] = useState("ALL");
  const [expandedRounds, setExpandedRounds] = useState(new Set([1]));

  const seed = (league?.year ?? 2025) * 100 + (league?.week ?? 1);
  const rng = useMemo(() => seededRng(seed), [seed]);
  const prospects = useMemo(() => generateProspects(seededRng(seed + 999), 250), [seed]);

  const teams = league?.teams || [];
  const userTeamId = league?.userTeamId;

  const runMock = useCallback(() => {
    const mockRng = seededRng(seed + mockCount * 7 + Date.now() % 1000);
    const picks = runMockDraft(teams, [...prospects], userTeamId, mockRng);
    setMockResults(picks);
    setMockCount(prev => prev + 1);
    setExpandedRounds(new Set([1]));
  }, [teams, prospects, userTeamId, seed, mockCount]);

  const teamNeeds = useMemo(() => {
    const needs = {};
    const needRng = seededRng(seed + 500);
    teams.forEach(t => { needs[t.id] = getTeamNeeds(t, needRng); });
    return needs;
  }, [teams, seed]);

  const filteredProspects = useMemo(() => {
    if (posFilter === "ALL") return prospects;
    return prospects.filter(p => p.pos === posFilter);
  }, [prospects, posFilter]);

  const toggleRound = (round) => {
    setExpandedRounds(prev => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  const tabs = [
    { id: "mock", label: "Mock Draft" },
    { id: "board", label: "Big Board" },
    { id: "combine", label: "Combine" },
    { id: "needs", label: "Team Needs" },
  ];

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h2 style={{ fontSize: "var(--text-lg, 18px)", fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
        Draft Central
      </h2>
      <p style={{ fontSize: "var(--text-xs, 12px)", color: "var(--text-muted)", marginBottom: 12 }}>
        {league?.year} NFL Draft · {prospects.length} prospects · 7 rounds
      </p>

      {/* Sub-tabs */}
      <div className="standings-tabs" style={{ marginBottom: 16 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`standings-tab${subTab === t.id ? " active" : ""}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Mock Draft Tab ── */}
      {subTab === "mock" && (
        <div>
          <button
            className="btn"
            onClick={runMock}
            style={{
              width: "100%", padding: 12, fontSize: 14, fontWeight: 800,
              background: "var(--accent)", color: "white", border: "none",
              borderRadius: "var(--radius-md, 8px)", cursor: "pointer", marginBottom: 16,
            }}
          >
            {mockResults ? "Run New Mock Draft" : "Simulate Mock Draft"}
          </button>

          {mockResults && (
            <div>
              {[1, 2, 3, 4, 5, 6, 7].map(round => {
                const roundPicks = mockResults.filter(p => p.round === round);
                if (roundPicks.length === 0) return null;
                const isExpanded = expandedRounds.has(round);
                const userPick = roundPicks.find(p => p.isUser);

                return (
                  <div key={round} className="stat-box" style={{ marginBottom: 8, overflow: "hidden" }}>
                    <div
                      onClick={() => toggleRound(round)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 12px", cursor: "pointer",
                        borderBottom: isExpanded ? "1px solid var(--hairline)" : "none",
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>
                          Round {round}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                          {roundPicks.length} picks
                        </span>
                      </div>
                      {userPick && !isExpanded && (
                        <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>
                          Your pick: {userPick.player.name} ({userPick.player.pos})
                        </span>
                      )}
                      <span style={{
                        color: "var(--text-subtle)", transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                        transition: "transform 0.2s",
                      }}>▼</span>
                    </div>
                    {isExpanded && roundPicks.map(pick => (
                      <PickCard key={pick.overall} pick={pick} onPlayerSelect={onPlayerSelect} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {!mockResults && (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Run a mock draft to see projected picks</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>AI simulates all 7 rounds based on team needs</div>
            </div>
          )}
        </div>
      )}

      {/* ── Big Board Tab ── */}
      {subTab === "board" && (
        <div>
          {/* Position filter */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
            <button className="btn" onClick={() => setPosFilter("ALL")}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600,
                background: posFilter === "ALL" ? "var(--accent)" + "22" : "var(--surface-strong, #1a1a2e)",
                color: posFilter === "ALL" ? "var(--accent)" : "var(--text-muted)",
                border: `1px solid ${posFilter === "ALL" ? "var(--accent)" : "transparent"}`,
                borderRadius: "var(--radius-pill, 100px)", cursor: "pointer",
              }}>ALL</button>
            {POSITIONS.filter(p => p !== "K" && p !== "P").map(pos => (
              <button key={pos} className="btn" onClick={() => setPosFilter(pos)}
                style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600,
                  background: posFilter === pos ? "var(--accent)" + "22" : "var(--surface-strong, #1a1a2e)",
                  color: posFilter === pos ? "var(--accent)" : "var(--text-muted)",
                  border: `1px solid ${posFilter === pos ? "var(--accent)" : "transparent"}`,
                  borderRadius: "var(--radius-pill, 100px)", cursor: "pointer",
                }}>{pos}</button>
            ))}
          </div>

          <div className="stat-box" style={{ overflow: "hidden" }}>
            {filteredProspects.slice(0, 100).map((p, i) => {
              const { grade, color } = scoutGrade(p.ovr);
              return (
                <div key={p.id} onClick={() => onPlayerSelect?.(p.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                    borderBottom: "1px solid var(--hairline)", cursor: "pointer",
                  }}>
                  <div style={{ width: 24, fontSize: 11, fontWeight: 800, color: "var(--text-subtle)", textAlign: "center" }}>
                    {p.rank}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.pos} · {p.college} · Age {p.age}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="ovr-pill" style={{ fontSize: 11, fontWeight: 800 }}>{p.ovr}</span>
                    <div style={{ fontSize: 9, color, fontWeight: 700, marginTop: 1 }}>{grade}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-subtle)", width: 30, textAlign: "right" }}>
                    POT {p.potential}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Combine Tab ── */}
      {subTab === "combine" && (
        <div>
          <div className="stat-box" style={{ overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "40px 1fr 50px repeat(6, 60px)",
              padding: "8px 10px", borderBottom: "2px solid var(--hairline)",
              fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase",
            }}>
              <div>#</div><div>Player</div><div>Pos</div>
              {COMBINE_EVENTS.map(e => <div key={e.id} style={{ textAlign: "center" }}>{e.label.split(" ")[0]}</div>)}
            </div>
            {prospects.slice(0, 50).map((p, i) => (
              <div key={p.id} onClick={() => onPlayerSelect?.(p.id)}
                style={{
                  display: "grid", gridTemplateColumns: "40px 1fr 50px repeat(6, 60px)",
                  padding: "6px 10px", borderBottom: "1px solid var(--hairline)",
                  fontSize: 11, alignItems: "center", cursor: "pointer",
                }}>
                <div style={{ fontWeight: 700, color: "var(--text-subtle)" }}>{i + 1}</div>
                <div style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ fontWeight: 700, color: "var(--text-muted)" }}>{p.pos}</div>
                {COMBINE_EVENTS.map(evt => {
                  const val = p.combine[evt.id];
                  // Highlight top performers
                  const allVals = prospects.slice(0, 50).map(pr => pr.combine[evt.id]);
                  const best = evt.lower ? Math.min(...allVals) : Math.max(...allVals);
                  const isTop = val === best;
                  return (
                    <div key={evt.id} style={{
                      textAlign: "center",
                      fontWeight: isTop ? 800 : 400,
                      color: isTop ? "var(--success)" : "var(--text-muted)",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {val}{evt.unit}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Team Needs Tab ── */}
      {subTab === "needs" && (
        <div>
          {teams.sort((a, b) => {
            if (a.id === userTeamId) return -1;
            if (b.id === userTeamId) return 1;
            const aWp = (a.wins + 0.5 * (a.ties || 0)) / Math.max(1, a.wins + a.losses + (a.ties || 0));
            const bWp = (b.wins + 0.5 * (b.ties || 0)) / Math.max(1, b.wins + b.losses + (b.ties || 0));
            return aWp - bWp;
          }).map(team => {
            const needs = teamNeeds[team.id] || [];
            const isUser = team.id === userTeamId;
            return (
              <div key={team.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                borderBottom: "1px solid var(--hairline)",
                background: isUser ? "var(--accent)" + "0d" : "transparent",
                borderLeft: isUser ? "3px solid var(--accent)" : "3px solid transparent",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "var(--surface-strong, #1a1a2e)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 900, color: isUser ? "var(--accent)" : "var(--text-muted)",
                  flexShrink: 0,
                }}>
                  {team.abbr?.slice(0, 3)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                    {team.name} {isUser && <span style={{ fontSize: 10, color: "var(--accent)" }}>(You)</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {team.wins}-{team.losses} · OVR {team.ovr}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {needs.map((n, i) => (
                    <span key={i} style={{
                      padding: "2px 6px", borderRadius: "var(--radius-pill, 100px)",
                      fontSize: 10, fontWeight: 700,
                      background: i === 0 ? "var(--danger)" + "22" : i === 1 ? "var(--warning)" + "22" : "var(--surface-strong, #1a1a2e)",
                      color: i === 0 ? "var(--danger)" : i === 1 ? "var(--warning)" : "var(--text-muted)",
                    }}>
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
