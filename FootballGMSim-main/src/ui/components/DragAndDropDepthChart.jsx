/**
 * DragAndDropDepthChart.jsx — Drag-and-drop position depth chart
 *
 * Displays position groups in starters / depth / special-teams rows.
 * Players can be dragged and reordered within each position group.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { derivePlayerContractFinancials, formatContractMoney } from "../utils/contractFormatting.js";
import { TeamWorkspaceHeader, TeamCapSummaryStrip } from "./TeamWorkspacePrimitives.jsx";
import { deriveTeamCapSnapshot } from "../utils/numberFormatting.js";

const POSITION_GROUPS = [
  { key: "QB", label: "QB Room", positions: ["QB"] },
  { key: "RB", label: "Backfield", positions: ["RB", "FB"] },
  { key: "WR", label: "Wide Receivers", positions: ["WR"] },
  { key: "TE", label: "Tight Ends", positions: ["TE"] },
  { key: "OL", label: "Offensive Line", positions: ["LT", "LG", "C", "RG", "RT", "OL"] },
  { key: "DL", label: "D-Line", positions: ["DE", "DT", "NT", "DL"] },
  { key: "LB", label: "Linebackers", positions: ["OLB", "MLB", "ILB", "LB"] },
  { key: "DB", label: "Secondary", positions: ["CB", "FS", "SS", "S"] },
  { key: "ST", label: "Special Teams", positions: ["K", "P", "LS"] },
];

const STARTERS = { QB: 1, RB: 2, WR: 3, TE: 2, OL: 5, DL: 4, LB: 3, DB: 4, ST: 3 };

function schemeFitColor(fit) {
  if (fit == null) return "#636366";
  if (fit >= 70) return "#34C759";
  if (fit >= 50) return "#FF9F0A";
  return "#FF453A";
}

function posColor(pos = "") {
  const map = {
    QB: "#FF9F0A", RB: "#34C759", WR: "#0A84FF", TE: "#5E5CE6",
    OL: "#64D2FF", DL: "#FF453A", LB: "#FF6B35", CB: "#FFD60A",
    S: "#30D158", K: "#AEC6CF", P: "#AEC6CF",
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

function inGroup(group, player) {
  return group.positions.some(pos => player?.pos === pos || player?.pos?.startsWith(pos));
}

function buildChartOrder(roster) {
  const init = {};
  for (const g of POSITION_GROUPS) {
    const players = roster
      .filter((p) => inGroup(g, p))
      .sort((a, b) => {
        const aOrder = a?.depthChart?.order ?? a?.depthOrder ?? 999;
        const bOrder = b?.depthChart?.order ?? b?.depthOrder ?? 999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (b.ovr ?? 0) - (a.ovr ?? 0);
      });
    init[g.key] = players.map((p) => p.id);
  }
  return init;
}

function mergeRosterIntoOrder(prevOrder, roster) {
  const playerById = new Map(roster.map((p) => [p.id, p]));
  const next = {};
  for (const g of POSITION_GROUPS) {
    const validIds = new Set(roster.filter((p) => inGroup(g, p)).map((p) => p.id));
    const carried = (prevOrder[g.key] || []).filter((id) => validIds.has(id) && playerById.has(id));
    const missing = [...validIds].filter((id) => !carried.includes(id));
    next[g.key] = [...carried, ...missing];
  }
  return next;
}

function sortableId(groupKey, playerId) {
  return `${groupKey}::${playerId}`;
}

function parseSortableId(id) {
  const [groupKey, rawPlayerId] = String(id).split("::");
  return { groupKey, playerId: rawPlayerId };
}

function PlayerRow({ player, depth, groupKey, onPlayerSelect, recentlyMoved }) {
  const id = sortableId(groupKey, player.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    background: isDragging ? "rgba(255,255,255,0.04)" : "transparent",
    borderRadius: 8,
    cursor: "grab",
    border: "1px solid transparent",
    opacity: isDragging ? 0.45 : 1,
    userSelect: "none",
    WebkitUserSelect: "none",
    boxShadow: recentlyMoved ? "0 0 0 2px rgba(52,199,89,0.45) inset" : "none",
    animation: recentlyMoved ? "depth-row-flash 480ms ease-out" : "none",
  };

  const inj = player.injury || (player.injuredWeeks > 0 ? {} : null);
  const pc = posColor(player.pos);
  const oc = ovrColor(player.ovr ?? 70);
  const contract = derivePlayerContractFinancials(player);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={() => onPlayerSelect?.(player.id)}>
      <span style={{ fontSize: "0.65rem", fontWeight: 800, color: depth === 1 ? "var(--accent)" : "var(--text-subtle)", minWidth: 16, textAlign: "center" }}>{depth}</span>
      <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)", cursor: "grab", flexShrink: 0 }}>⠿</span>

      <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: `${oc}20`, border: `2px solid ${oc}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 900, color: oc }}>
        {player.ovr ?? "?"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {player.name || "Unknown"}
          {inj && (
            <span style={{ marginLeft: 6, fontSize: "0.6rem", background: "#FF453A22", color: "#FF453A", border: "1px solid #FF453A44", borderRadius: 4, padding: "1px 4px", fontWeight: 800 }}>
              INJ
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
          <span style={{ fontSize: "0.6rem", fontWeight: 800, color: pc, background: `${pc}18`, border: `1px solid ${pc}33`, borderRadius: 4, padding: "1px 5px" }}>
            {player.pos}
          </span>
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>Age {player.age ?? "?"}</span>
        </div>
      </div>

      {player.schemeFit != null && (
        <div style={{ flexShrink: 0, fontSize: "0.58rem", fontWeight: 800, color: schemeFitColor(player.schemeFit), background: `${schemeFitColor(player.schemeFit)}18`, border: `1px solid ${schemeFitColor(player.schemeFit)}44`, borderRadius: 4, padding: "1px 5px", minWidth: 30, textAlign: "center" }} title={`Scheme fit: ${Math.round(player.schemeFit)}%`}>
          {Math.round(player.schemeFit)}%
        </div>
      )}

      {contract.annualSalary != null && (
        <span style={{ fontSize: "0.65rem", color: "var(--text-subtle)", flexShrink: 0 }}>{formatContractMoney(contract.annualSalary)}</span>
      )}
    </div>
  );
}

function PositionGroup({ group, players, onPlayerSelect, recentlyMovedId }) {
  const starterCount = STARTERS[group.key] ?? 1;
  const starters = players.slice(0, starterCount);
  const depth = players.slice(starterCount);

  return (
    <div style={{ background: "var(--surface)", border: "1.5px solid var(--hairline)", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
      <div style={{ padding: "8px 12px", background: "var(--surface-strong, rgba(255,255,255,0.04))", borderBottom: "1px solid var(--hairline)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.8px" }}>{group.label}</span>
        <span style={{ fontSize: "0.62rem", color: "var(--text-subtle)" }}>{players.length} player{players.length !== 1 ? "s" : ""}</span>
      </div>

      <SortableContext items={players.map((p) => sortableId(group.key, p.id))} strategy={verticalListSortingStrategy}>
        {starters.length > 0 && (
          <div style={{ padding: "4px 6px" }}>
            <div style={{ fontSize: "0.58rem", fontWeight: 800, color: "#34C759", textTransform: "uppercase", letterSpacing: "0.8px", padding: "4px 6px 2px" }}>Starters</div>
            {starters.map((p, i) => (
              <PlayerRow key={p.id} player={p} depth={i + 1} groupKey={group.key} onPlayerSelect={onPlayerSelect} recentlyMoved={recentlyMovedId === p.id} />
            ))}
          </div>
        )}

        {depth.length > 0 && (
          <div style={{ padding: "4px 6px", borderTop: starters.length > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <div style={{ fontSize: "0.58rem", fontWeight: 800, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.8px", padding: "4px 6px 2px" }}>Depth</div>
            {depth.map((p, i) => (
              <PlayerRow key={p.id} player={p} depth={starterCount + i + 1} groupKey={group.key} onPlayerSelect={onPlayerSelect} recentlyMoved={recentlyMovedId === p.id} />
            ))}
          </div>
        )}
      </SortableContext>

      {players.length === 0 && (
        <div style={{ padding: "14px 12px", textAlign: "center", color: "var(--text-subtle)", fontSize: "0.75rem" }}>
          No players at this position
        </div>
      )}
    </div>
  );
}

export default function DragAndDropDepthChart({ league, actions, onPlayerSelect, onNavigate = null }) {
  const userTeam = league?.teams?.find((t) => t.id === league.userTeamId);
  const roster = userTeam?.roster ?? [];

  const [chartOrder, setChartOrder] = useState(() => buildChartOrder(roster));
  const [activeGroup, setActiveGroup] = useState(null);
  const [recentlyMovedId, setRecentlyMovedId] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    setChartOrder((prev) => mergeRosterIntoOrder(prev, roster));
  }, [roster]);

  const groupedPlayers = useMemo(() => {
    const playerById = Object.fromEntries(roster.map((p) => [p.id, p]));
    const result = {};
    for (const g of POSITION_GROUPS) {
      result[g.key] = (chartOrder[g.key] || []).map((id) => playerById[id]).filter(Boolean);
    }
    return result;
  }, [chartOrder, roster]);

  const persistOrder = useCallback((nextOrder) => {
    if (!actions?.updateDepthChart) return;
    actions.updateDepthChart(nextOrder).catch(() => {});
  }, [actions]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!active || !over) return;

    const from = parseSortableId(active.id);
    const to = parseSortableId(over.id);
    if (from.groupKey !== to.groupKey || from.playerId === to.playerId) return;

    setChartOrder((prev) => {
      const list = [...(prev[from.groupKey] || [])];
      const oldIndex = list.findIndex((id) => String(id) === from.playerId);
      const newIndex = list.findIndex((id) => String(id) === to.playerId);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const reordered = arrayMove(list, oldIndex, newIndex);
      const next = { ...prev, [from.groupKey]: reordered };
      persistOrder(next);
      return next;
    });

    const movedId = roster.find((p) => String(p.id) === from.playerId)?.id ?? null;
    setRecentlyMovedId(movedId);
    window.setTimeout(() => setRecentlyMovedId(null), 550);
  }, [persistOrder, roster]);

  const visibleGroups = activeGroup ? POSITION_GROUPS.filter((g) => g.key === activeGroup) : POSITION_GROUPS;

  const handleAutoSort = useCallback(() => {
    const playerById = Object.fromEntries(roster.map((p) => [p.id, p]));
    setChartOrder((prev) => {
      const next = {};
      for (const g of POSITION_GROUPS) {
        next[g.key] = [...(prev[g.key] || [])].sort((a, b) => {
          const pa = playerById[a];
          const pb = playerById[b];
          const ovrA = pa?.schemeAdjustedOVR ?? pa?.ovr ?? 0;
          const ovrB = pb?.schemeAdjustedOVR ?? pb?.ovr ?? 0;
          return ovrB - ovrA;
        });
      }
      persistOrder(next);
      return next;
    });
    setRecentlyMovedId(-1);
    window.setTimeout(() => setRecentlyMovedId(null), 450);
  }, [roster, persistOrder]);

  const avgSchemeFit = useMemo(() => {
    const fits = roster.map((p) => p.schemeFit).filter((f) => f != null);
    if (!fits.length) return null;
    return Math.round(fits.reduce((s, f) => s + f, 0) / fits.length);
  }, [roster]);

  const capSnapshot = deriveTeamCapSnapshot(userTeam ?? {}, { fallbackCapTotal: 255 });
  const missingStarterGroups = POSITION_GROUPS
    .map((g) => ({ key: g.key, missing: Math.max(0, (STARTERS[g.key] ?? 1) - ((groupedPlayers[g.key] ?? []).length)) }))
    .filter((g) => g.missing > 0);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 40 }} className="app-screen-stack">
      <style>{`@keyframes depth-row-flash { 0% { background: rgba(52,199,89,0.24);} 100% { background: transparent; } }`}</style>

      <TeamWorkspaceHeader
        title="Depth Chart Operations"
        subtitle="Set starting roles, protect coverage at every position group, and align scheme fit."
        eyebrow={userTeam?.name ?? 'Depth Chart'}
        metadata={[
          { label: 'Roster', value: `${roster.length}/53` },
          { label: 'Missing starter groups', value: missingStarterGroups.length },
          { label: 'Avg fit', value: avgSchemeFit != null ? `${avgSchemeFit}%` : '—' },
        ]}
        actions={[
          { label: 'Roster', onClick: () => onNavigate?.('Roster') },
          { label: 'Contracts', onClick: () => onNavigate?.('Contract Center') },
          { label: 'Free Agency', onClick: () => onNavigate?.('Free Agency') },
        ]}
        quickContext={[
          { label: 'Auto-sort uses scheme adjusted OVR', tone: 'league' },
          { label: missingStarterGroups.length ? `${missingStarterGroups.length} groups missing starters` : 'Starter groups covered', tone: missingStarterGroups.length ? 'warning' : 'ok' },
        ]}
      />

      <TeamCapSummaryStrip capSnapshot={capSnapshot} rosterCount={roster.length} />

      {missingStarterGroups.length > 0 ? (
        <div className="card" style={{ padding: '10px', borderColor: 'rgba(255,159,10,.4)' }}>
          <div style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 700, marginBottom: 4 }}>Lineup warning</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Missing starter coverage in: {missingStarterGroups.map((g) => `${g.key} (${g.missing})`).join(', ')}.
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>

        <button
          onClick={handleAutoSort}
          style={{ padding: "5px 14px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent-muted, rgba(10,132,255,0.12))", color: "var(--accent)", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          title="Sort each position group by scheme-adjusted OVR"
        >
          ⚡ Auto-Sort by Fit
        </button>
        {avgSchemeFit != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: "0.65rem", color: "var(--text-subtle)" }}>Avg Fit</span>
            <span style={{ fontSize: "0.75rem", fontWeight: 800, color: schemeFitColor(avgSchemeFit) }}>{avgSchemeFit}%</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <button onClick={() => setActiveGroup(null)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: !activeGroup ? "var(--accent)" : "var(--surface)", color: !activeGroup ? "#fff" : "var(--text-muted)", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>All</button>
        {POSITION_GROUPS.map((g) => (
          <button key={g.key} onClick={() => setActiveGroup(g.key === activeGroup ? null : g.key)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: activeGroup === g.key ? "var(--accent)" : "var(--surface)", color: activeGroup === g.key ? "#fff" : "var(--text-muted)", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>{g.key}</button>
        ))}
      </div>

      <div style={{ fontSize: "0.68rem", color: "var(--text-subtle)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <span>⠿</span>
        <span>Drag to reorder depth inside each position group. Auto-Sort by Fit ranks players using scheme-adjusted OVR within each group</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {visibleGroups.map((g) => (
          <PositionGroup
            key={g.key}
            group={g}
            players={groupedPlayers[g.key] ?? []}
            onPlayerSelect={onPlayerSelect}
            recentlyMovedId={recentlyMovedId}
          />
        ))}
      </DndContext>
    </div>
  );
}
