/**
 * DragAndDropDepthChart.jsx — Drag-and-drop position depth chart
 *
 * Displays position groups in starters / depth / special-teams rows.
 * Players can be dragged up/down within or across position groups.
 *
 * Props:
 *  - league: league object (has userTeam.roster)
 *  - actions: { updateDepthChart(positions) }
 *  - onPlayerSelect(playerId)
 */

import React, { useState, useCallback, useMemo, useRef } from "react";

// Position groups definition
const POSITION_GROUPS = [
  { key: "QB",  label: "QB Room",       positions: ["QB"] },
  { key: "RB",  label: "Backfield",     positions: ["RB", "FB"] },
  { key: "WR",  label: "Wide Receivers",positions: ["WR"] },
  { key: "TE",  label: "Tight Ends",    positions: ["TE"] },
  { key: "OL",  label: "Offensive Line",positions: ["LT","LG","C","RG","RT","OL"] },
  { key: "DL",  label: "D-Line",        positions: ["DE","DT","NT","DL"] },
  { key: "LB",  label: "Linebackers",   positions: ["OLB","MLB","ILB","LB"] },
  { key: "DB",  label: "Secondary",     positions: ["CB","FS","SS","S"] },
  { key: "ST",  label: "Special Teams", positions: ["K","P","LS"] },
];

const STARTERS = { QB: 1, RB: 2, WR: 3, TE: 2, OL: 5, DL: 4, LB: 3, DB: 4, ST: 3 };

function posColor(pos = "") {
  const map = {
    QB: "#FF9F0A", RB: "#34C759", WR: "#0A84FF", TE: "#5E5CE6",
    OL: "#64D2FF", DL: "#FF453A", LB: "#FF6B35", CB: "#FFD60A",
    S:  "#30D158", K: "#AEC6CF", P: "#AEC6CF",
  };
  const key = Object.keys(map).find(k => pos.startsWith(k));
  return map[key] || "#9FB0C2";
}

function ovrColor(ovr = 70) {
  if (ovr >= 88) return "#BF5AF2";
  if (ovr >= 78) return "#0A84FF";
  if (ovr >= 68) return "#34C759";
  if (ovr >= 58) return "#FF9F0A";
  return "#636366";
}

// ── Player Row ─────────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  depth,           // 1-based index within group
  groupKey,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onPlayerSelect,
  injuryColor,
}) {
  const inj = player.injury || (player.injuredWeeks > 0 ? {} : null);
  const pc = posColor(player.pos);
  const oc = ovrColor(player.ovr ?? 70);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, groupKey, player.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(groupKey, player.id); }}
      onDrop={(e) => onDrop(e, groupKey, player.id)}
      onClick={() => onPlayerSelect?.(player.id)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px",
        background: isDragOver
          ? "rgba(10,132,255,0.12)"
          : isDragging
            ? "rgba(255,255,255,0.04)"
            : "transparent",
        borderRadius: 8,
        cursor: "grab",
        border: `1px solid ${isDragOver ? "var(--accent)" : "transparent"}`,
        transition: "background 0.12s, border-color 0.12s",
        opacity: isDragging ? 0.45 : 1,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Depth number */}
      <span style={{
        fontSize: "0.65rem", fontWeight: 800,
        color: depth === 1 ? "var(--accent)" : "var(--text-subtle)",
        minWidth: 16, textAlign: "center",
      }}>
        {depth}
      </span>

      {/* Drag handle */}
      <span style={{
        fontSize: "0.75rem", color: "var(--text-subtle)",
        cursor: "grab", flexShrink: 0,
      }}>
        ⠿
      </span>

      {/* OVR badge */}
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: `${oc}20`, border: `2px solid ${oc}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.65rem", fontWeight: 900, color: oc,
      }}>
        {player.ovr ?? "?"}
      </div>

      {/* Player info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "0.8rem", fontWeight: 700, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {player.name || "Unknown"}
          {inj && (
            <span style={{
              marginLeft: 6, fontSize: "0.6rem",
              background: "#FF453A22", color: "#FF453A",
              border: "1px solid #FF453A44",
              borderRadius: 4, padding: "1px 4px", fontWeight: 800,
            }}>
              INJ
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
          <span style={{
            fontSize: "0.6rem", fontWeight: 800, color: pc,
            background: `${pc}18`, border: `1px solid ${pc}33`,
            borderRadius: 4, padding: "1px 5px",
          }}>
            {player.pos}
          </span>
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
            Age {player.age ?? "?"}
          </span>
        </div>
      </div>

      {/* Salary */}
      {player.contract?.salary != null && (
        <span style={{ fontSize: "0.65rem", color: "var(--text-subtle)", flexShrink: 0 }}>
          ${(player.contract.salary / 1e6).toFixed(1)}M
        </span>
      )}
    </div>
  );
}

// ── Position Group ─────────────────────────────────────────────────────────────

function PositionGroup({
  group,
  players,
  dragState,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPlayerSelect,
}) {
  const starterCount = STARTERS[group.key] ?? 1;
  const starters = players.slice(0, starterCount);
  const depth = players.slice(starterCount);

  return (
    <div style={{
      background: "var(--surface)",
      border: "1.5px solid var(--hairline)",
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{
        padding: "8px 12px",
        background: "var(--surface-strong, rgba(255,255,255,0.04))",
        borderBottom: "1px solid var(--hairline)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text)",
          textTransform: "uppercase", letterSpacing: "0.8px" }}>
          {group.label}
        </span>
        <span style={{ fontSize: "0.62rem", color: "var(--text-subtle)" }}>
          {players.length} player{players.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Starters section */}
      {starters.length > 0 && (
        <div style={{ padding: "4px 6px" }}>
          <div style={{
            fontSize: "0.58rem", fontWeight: 800, color: "#34C759",
            textTransform: "uppercase", letterSpacing: "0.8px",
            padding: "4px 6px 2px",
          }}>
            Starters
          </div>
          {starters.map((p, i) => (
            <PlayerRow
              key={p.id}
              player={p}
              depth={i + 1}
              groupKey={group.key}
              isDragging={dragState.dragging?.playerId === p.id}
              isDragOver={dragState.over?.groupKey === group.key && dragState.over?.playerId === p.id}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onPlayerSelect={onPlayerSelect}
            />
          ))}
        </div>
      )}

      {/* Depth section */}
      {depth.length > 0 && (
        <div style={{
          padding: "4px 6px",
          borderTop: starters.length > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
        }}>
          <div style={{
            fontSize: "0.58rem", fontWeight: 800, color: "var(--text-subtle)",
            textTransform: "uppercase", letterSpacing: "0.8px",
            padding: "4px 6px 2px",
          }}>
            Depth
          </div>
          {depth.map((p, i) => (
            <PlayerRow
              key={p.id}
              player={p}
              depth={starterCount + i + 1}
              groupKey={group.key}
              isDragging={dragState.dragging?.playerId === p.id}
              isDragOver={dragState.over?.groupKey === group.key && dragState.over?.playerId === p.id}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onPlayerSelect={onPlayerSelect}
            />
          ))}
        </div>
      )}

      {players.length === 0 && (
        <div style={{
          padding: "14px 12px", textAlign: "center",
          color: "var(--text-subtle)", fontSize: "0.75rem",
        }}>
          No players at this position
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DragAndDropDepthChart({ league, actions, onPlayerSelect }) {
  const userTeam = league?.teams?.find(t => t.id === league.userTeamId);
  const roster = userTeam?.roster ?? [];

  // Local chart state (ordering per group)
  const [chartOrder, setChartOrder] = useState(() => {
    const init = {};
    for (const g of POSITION_GROUPS) {
      const players = roster
        .filter(p => g.positions.some(pos => p.pos === pos || p.pos?.startsWith(pos)))
        .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
      init[g.key] = players.map(p => p.id);
    }
    return init;
  });

  const [dragState, setDragState] = useState({ dragging: null, over: null });
  const [activeGroup, setActiveGroup] = useState(null); // null = show all

  // Rebuild player list from chart order
  const groupedPlayers = useMemo(() => {
    const playerById = Object.fromEntries(roster.map(p => [p.id, p]));
    const result = {};
    for (const g of POSITION_GROUPS) {
      const ids = chartOrder[g.key] || [];
      result[g.key] = ids.map(id => playerById[id]).filter(Boolean);
    }
    return result;
  }, [chartOrder, roster]);

  const handleDragStart = useCallback((e, groupKey, playerId) => {
    setDragState(s => ({ ...s, dragging: { groupKey, playerId } }));
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ groupKey, playerId }));
  }, []);

  const handleDragOver = useCallback((groupKey, playerId) => {
    setDragState(s => ({ ...s, over: { groupKey, playerId } }));
  }, []);

  const handleDrop = useCallback((e, targetGroupKey, targetPlayerId) => {
    e.preventDefault();
    let src;
    try {
      src = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      src = dragState.dragging;
    }
    if (!src) { setDragState({ dragging: null, over: null }); return; }

    const { groupKey: srcGroupKey, playerId: srcPlayerId } = src;

    setChartOrder(prev => {
      const newOrder = { ...prev };

      // Remove from source
      const srcList = [...(newOrder[srcGroupKey] || [])].filter(id => id !== srcPlayerId);

      if (srcGroupKey === targetGroupKey) {
        // Reorder within same group
        const targetIdx = srcList.indexOf(targetPlayerId);
        const insertAt = targetIdx === -1 ? srcList.length : targetIdx;
        srcList.splice(insertAt, 0, srcPlayerId);
        newOrder[srcGroupKey] = srcList;
      } else {
        // Move to different group (if compatible) — just append
        newOrder[srcGroupKey] = srcList;
        const dstList = [...(newOrder[targetGroupKey] || [])];
        const targetIdx = dstList.indexOf(targetPlayerId);
        const insertAt = targetIdx === -1 ? dstList.length : targetIdx;
        dstList.splice(insertAt, 0, srcPlayerId);
        newOrder[targetGroupKey] = dstList;
      }

      // Persist to worker if action available
      if (actions?.updateDepthChart) {
        const positions = {};
        for (const [gk, ids] of Object.entries(newOrder)) {
          positions[gk] = ids;
        }
        actions.updateDepthChart(positions).catch(() => {});
      }

      return newOrder;
    });

    setDragState({ dragging: null, over: null });
  }, [dragState.dragging, actions]);

  const handleDragEnd = useCallback(() => {
    setDragState({ dragging: null, over: null });
  }, []);

  const visibleGroups = activeGroup
    ? POSITION_GROUPS.filter(g => g.key === activeGroup)
    : POSITION_GROUPS;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 40 }}>
      {/* Position group filter tabs */}
      <div style={{
        display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14,
      }}>
        <button
          onClick={() => setActiveGroup(null)}
          style={{
            padding: "5px 12px", borderRadius: 8, border: "none",
            background: !activeGroup ? "var(--accent)" : "var(--surface)",
            color: !activeGroup ? "#fff" : "var(--text-muted)",
            fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
          }}
        >
          All
        </button>
        {POSITION_GROUPS.map(g => (
          <button
            key={g.key}
            onClick={() => setActiveGroup(g.key === activeGroup ? null : g.key)}
            style={{
              padding: "5px 12px", borderRadius: 8, border: "none",
              background: activeGroup === g.key ? "var(--accent)" : "var(--surface)",
              color: activeGroup === g.key ? "#fff" : "var(--text-muted)",
              fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            {g.key}
          </button>
        ))}
      </div>

      {/* Hint */}
      <div style={{
        fontSize: "0.68rem", color: "var(--text-subtle)",
        marginBottom: 12, display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>⠿</span>
        <span>Drag players to reorder depth chart</span>
      </div>

      {/* Groups */}
      <div onDragEnd={handleDragEnd}>
        {visibleGroups.map(g => (
          <PositionGroup
            key={g.key}
            group={g}
            players={groupedPlayers[g.key] ?? []}
            dragState={dragState}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onPlayerSelect={onPlayerSelect}
          />
        ))}
      </div>
    </div>
  );
}
