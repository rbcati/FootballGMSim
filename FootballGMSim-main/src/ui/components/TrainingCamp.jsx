/**
 * TrainingCamp.jsx — Training Camp & Weekly Practice system
 *
 * Allows users to run drills for position groups, manage practice intensity,
 * and develop players through focused training sessions.
 */

import React, { useState, useMemo, useCallback } from "react";

const POSITION_GROUPS = [
  { id: "qb", label: "QB Room", positions: ["QB"], icon: "🏈", color: "#FF9F0A" },
  { id: "rb", label: "RB Room", positions: ["RB"], icon: "🏃", color: "#34C759" },
  { id: "wr", label: "WR Corps", positions: ["WR"], icon: "📡", color: "#0A84FF" },
  { id: "te", label: "TE Room", positions: ["TE"], icon: "🛡️", color: "#5E5CE6" },
  { id: "ol", label: "O-Line", positions: ["OL"], icon: "⚔️", color: "#64D2FF" },
  { id: "dl", label: "D-Line", positions: ["DL"], icon: "💪", color: "#FF453A" },
  { id: "lb", label: "Linebackers", positions: ["LB"], icon: "🦅", color: "#FF6961" },
  { id: "db", label: "Secondary", positions: ["CB", "S"], icon: "🔒", color: "#FFD60A" },
  { id: "st", label: "Special Teams", positions: ["K", "P"], icon: "🦶", color: "#AEC6CF" },
];

const INTENSITY_LEVELS = [
  { id: "light", label: "Light", color: "#34C759", devMult: 0.6, injuryChance: 0.01, desc: "Low risk, moderate gains" },
  { id: "normal", label: "Normal", color: "#FFD60A", devMult: 1.0, injuryChance: 0.03, desc: "Balanced risk and reward" },
  { id: "hard", label: "Hard", color: "#FF453A", devMult: 1.5, injuryChance: 0.07, desc: "High gains, injury risk" },
];

const DRILL_TYPES = [
  { id: "technique", label: "Technique", desc: "Fundamentals and position skills" },
  { id: "conditioning", label: "Conditioning", desc: "Speed, stamina, durability" },
  { id: "teamwork", label: "Team Drills", desc: "Coordination and chemistry" },
  { id: "film", label: "Film Study", desc: "Mental preparation and awareness" },
];

function ProgressBar({ value, max, color, height = 6, label }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ width: "100%" }}>
      {label && <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>}
      <div style={{
        height, background: "var(--surface-strong, #1a1a2e)", borderRadius: height,
        overflow: "hidden", position: "relative",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color || "var(--accent)",
          borderRadius: height, transition: "width 0.8s cubic-bezier(0.2,0.8,0.2,1)",
        }} />
      </div>
    </div>
  );
}

function PlayerDrillRow({ player, result, onSelect }) {
  if (!player) return null;
  const change = result?.change ?? 0;
  const injured = result?.injured ?? false;

  return (
    <div
      onClick={() => onSelect?.(player.id)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
        borderBottom: "1px solid var(--hairline)", cursor: "pointer",
        background: injured ? "rgba(255,69,58,0.05)" : "transparent",
        transition: "background 0.2s",
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: "50%", background: "var(--surface-strong, #1a1a2e)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800, color: "var(--text-muted)", flexShrink: 0,
      }}>
        {player.pos}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.name}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          Age {player.age} · OVR {player.ovr}
          {player.potential != null && ` · POT ${player.potential}`}
        </div>
      </div>
      {result && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {injured ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)" }}>INJURED</span>
          ) : change !== 0 ? (
            <span style={{
              fontSize: 12, fontWeight: 800,
              color: change > 0 ? "var(--success)" : "var(--danger)",
            }}>
              {change > 0 ? "+" : ""}{change}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>No change</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrainingCamp({ league, actions, onPlayerSelect }) {
  const [intensity, setIntensity] = useState("normal");
  const [focusGroups, setFocusGroups] = useState(new Set());
  const [drillType, setDrillType] = useState("technique");
  const [results, setResults] = useState(null);
  const [expanded, setExpanded] = useState(new Set(["qb"]));
  const [drillsRun, setDrillsRun] = useState(0);

  const isTrainingCamp = league?.phase === "preseason";
  const maxDrills = isTrainingCamp ? 5 : 2;
  const drillsRemaining = maxDrills - drillsRun;

  // Get user team roster
  const roster = useMemo(() => {
    const team = (league?.teams ?? []).find((entry) => Number(entry?.id) === Number(league?.userTeamId));
    return Array.isArray(team?.roster) ? team.roster : [];
  }, [league?.teams, league?.userTeamId]);

  // Group players by position group
  const groups = useMemo(() => {
    const map = {};
    POSITION_GROUPS.forEach(g => { map[g.id] = { ...g, players: [] }; });
    roster.forEach(p => {
      const group = POSITION_GROUPS.find(g => g.positions.includes(p.pos));
      if (group && map[group.id]) map[group.id].players.push(p);
    });
    return map;
  }, [roster]);

  const toggleFocus = useCallback((groupId) => {
    setFocusGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) { next.delete(groupId); }
      else if (next.size < 2) { next.add(groupId); }
      return next;
    });
  }, []);

  const toggleExpand = useCallback((groupId) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const runDrills = useCallback(async () => {
    if (drillsRemaining <= 0) return;

    // Persist training boosts to the worker so the sim engine can use them
    if (actions?.conductDrill) {
      const teamId = league?.userTeamId;
      const posGroups = focusGroups.size > 0 ? Array.from(focusGroups) : [];
      const beforeById = new Map(roster.map((player) => [player.id, player]));
      const response = await actions.conductDrill(teamId, intensity, drillType, posGroups);
      const updatedRoster = Array.isArray(response?.payload?.players) ? response.payload.players : roster;
      const newResults = {};
      updatedRoster.forEach((player) => {
        const previous = beforeById.get(player.id) ?? {};
        const change = Math.max(0, Number(player?.weeklyTrainingBoost ?? 0) - Number(previous?.weeklyTrainingBoost ?? 0));
        const wearDelta = Math.max(0, Number(player?.wearAndTear ?? 0) - Number(previous?.wearAndTear ?? 0));
        const injured = Number(player?.injuryWeeksRemaining ?? player?.injury?.gamesRemaining ?? 0) > Number(previous?.injuryWeeksRemaining ?? previous?.injury?.gamesRemaining ?? 0);
        newResults[player.id] = {
          change,
          injured,
          wearDelta,
          devChance: change > 0 ? Math.min(0.9, 0.35 + change * 0.18) : 0,
        };
      });
      setResults(newResults);
      setDrillsRun(prev => prev + 1);
    }
  }, [roster, intensity, focusGroups, drillType, drillsRun, drillsRemaining, league, actions]);

  // Summary stats
  const summary = useMemo(() => {
    if (!results) return null;
    let improved = 0, injured = 0, totalGain = 0, totalWear = 0;
    Object.values(results).forEach(r => {
      if (r.change > 0) improved++;
      if (r.injured) injured++;
      totalGain += r.change;
      totalWear += Number(r?.wearDelta ?? 0);
    });
    return { improved, injured, totalGain, totalWear, total: Object.keys(results).length };
  }, [results]);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: "var(--space-4, 16px)",
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "var(--text-lg, 18px)", fontWeight: 800, color: "var(--text)" }}>
            {isTrainingCamp ? "Training Camp" : "Weekly Practice"}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs, 12px)", color: "var(--text-muted)" }}>
            {isTrainingCamp ? "Preseason camp — develop your roster" : `Week ${league?.week ?? 1} practice`}
            {" · "}{drillsRemaining} drill{drillsRemaining !== 1 ? "s" : ""} remaining
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="stat-box" style={{ marginBottom: "var(--space-4, 16px)", padding: "12px" }}>
        {/* Intensity */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Practice Intensity
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {INTENSITY_LEVELS.map(level => (
              <button
                key={level.id}
                className="btn"
                onClick={() => setIntensity(level.id)}
                style={{
                  flex: 1, padding: "8px", fontSize: 12, fontWeight: 700,
                  background: intensity === level.id ? level.color + "22" : "var(--surface-strong, #1a1a2e)",
                  color: intensity === level.id ? level.color : "var(--text-muted)",
                  border: `2px solid ${intensity === level.id ? level.color : "transparent"}`,
                  borderRadius: "var(--radius-md, 8px)", cursor: "pointer",
                }}
              >
                {level.label}
                <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>{level.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Drill Type */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Drill Focus
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DRILL_TYPES.map(drill => (
              <button
                key={drill.id}
                className="btn"
                onClick={() => setDrillType(drill.id)}
                style={{
                  padding: "6px 12px", fontSize: 11, fontWeight: 600,
                  background: drillType === drill.id ? "var(--accent)" + "22" : "var(--surface-strong, #1a1a2e)",
                  color: drillType === drill.id ? "var(--accent)" : "var(--text-muted)",
                  border: `1px solid ${drillType === drill.id ? "var(--accent)" : "transparent"}`,
                  borderRadius: "var(--radius-pill, 100px)", cursor: "pointer",
                }}
              >
                {drill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Focus Groups */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Focus Groups (pick up to 2 for bonus development)
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {POSITION_GROUPS.map(g => (
              <button
                key={g.id}
                className="btn"
                onClick={() => toggleFocus(g.id)}
                style={{
                  padding: "5px 10px", fontSize: 11, fontWeight: 600,
                  background: focusGroups.has(g.id) ? g.color + "22" : "var(--surface-strong, #1a1a2e)",
                  color: focusGroups.has(g.id) ? g.color : "var(--text-muted)",
                  border: `1px solid ${focusGroups.has(g.id) ? g.color : "transparent"}`,
                  borderRadius: "var(--radius-pill, 100px)", cursor: "pointer",
                }}
              >
                {g.icon} {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Run Drills Button */}
        <button
          className="btn"
          onClick={runDrills}
          disabled={drillsRemaining <= 0}
          style={{
            width: "100%", padding: "12px", fontSize: 14, fontWeight: 800,
            background: drillsRemaining > 0 ? "var(--accent)" : "var(--surface-strong, #1a1a2e)",
            color: drillsRemaining > 0 ? "white" : "var(--text-subtle)",
            border: "none", borderRadius: "var(--radius-md, 8px)", cursor: drillsRemaining > 0 ? "pointer" : "not-allowed",
          }}
        >
          {drillsRemaining > 0 ? `Run Drills (${drillsRemaining} remaining)` : "No Drills Remaining This Week"}
        </button>
      </div>

      {/* Results Summary */}
      {summary && (
        <div className="stat-box fade-in" style={{
          marginBottom: "var(--space-4, 16px)", padding: "12px",
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, textAlign: "center",
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--success)" }}>{summary.improved}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Players Improved</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--accent)" }}>+{summary.totalGain}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Total OVR Gained</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: summary.injured > 0 ? "var(--danger)" : "var(--text-muted)" }}>
              {summary.injured}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Injuries</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: summary.totalWear > 0 ? "var(--warning, #FFD60A)" : "var(--text-muted)" }}>
              {summary.totalWear.toFixed(1)}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Wear Load</div>
          </div>
        </div>
      )}

      {/* Position Group Cards */}
      {POSITION_GROUPS.map(group => {
        const data = groups[group.id];
        if (!data || data.players.length === 0) return null;
        const isExpanded = expanded.has(group.id);
        const isFocused = focusGroups.has(group.id);
        const groupResults = results ? data.players.map(p => ({ player: p, result: results[p.id] })) : null;
        const groupImproved = groupResults?.filter(r => r.result?.change > 0).length ?? 0;

        return (
          <div key={group.id} className="stat-box" style={{
            marginBottom: "var(--space-3, 12px)", overflow: "hidden",
            border: isFocused ? `1px solid ${group.color}44` : undefined,
          }}>
            <div
              onClick={() => toggleExpand(group.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                cursor: "pointer", borderBottom: isExpanded ? "1px solid var(--hairline)" : "none",
              }}
            >
              <span style={{ fontSize: 18 }}>{group.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                  {group.label}
                  {isFocused && <span style={{ fontSize: 9, color: group.color, marginLeft: 6, fontWeight: 800 }}>FOCUS</span>}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {data.players.length} players
                  {groupResults && ` · ${groupImproved} improved`}
                </div>
              </div>
              <div style={{
                width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-subtle)", fontSize: 14, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}>
                ▼
              </div>
            </div>
            {isExpanded && (
              <div>
                {data.players
                  .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))
                  .map(p => (
                    <PlayerDrillRow
                      key={p.id}
                      player={p}
                      result={results?.[p.id]}
                      onSelect={onPlayerSelect}
                    />
                  ))}
              </div>
            )}
          </div>
        );
      })}

      {roster.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏈</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No roster data available</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Load a league to access training camp</div>
        </div>
      )}
    </div>
  );
}
