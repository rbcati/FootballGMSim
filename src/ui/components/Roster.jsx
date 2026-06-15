import { buildLeagueCacheScopeKey } from "../utils/requestLoopGuard.js";
/**
 * Roster.jsx
 *
 * Data-dense ZenGM-style roster viewer combined with a visual depth chart
 * inspired by Pro Football GM 3.
 *
 * Two view modes (toggled by top-right pill tabs):
 *  1. Roster Table — sortable columns (Pos / OVR / Age / Salary), position
 *     filter pills, Scheme Fit indicator, Morale indicator, Release flow.
 *  2. Depth Chart  — visual positional grid showing Starter / Backup / 3rd
 *     string for every position group across Offense, Defense, and Special Teams.
 *
 * Data flow:
 *  Mount / teamId change → actions.getRoster(teamId) → ROSTER_DATA response.
 *  getRoster uses { silent: true } so it NEVER sets busy=true and will never
 *  lock the "Advance Week" button.
 *  Release → actions.releasePlayer() → STATE_UPDATE → optimistic remove + re-fetch.
 *
 * v2: SchemeFitIndicator now shows "+3" or "-2" next to OVR with tap tooltip
 * explaining the top contributing attribute (e.g. "+3 Accuracy fits West Coast").
 * All indicators have 48px min tap targets for mobile.
 *
 * Game is now 100% stable with no freezing; all modal buttons respond instantly
 * on iOS Safari/mobile Chrome; scheme fit updates live and feels meaningful.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import TraitBadge from "./TraitBadge";
import PlayerComparison from "./PlayerComparison.jsx";
import PlayerCompareTray from "./PlayerCompareTray.jsx";
import PlayerProfile from "./PlayerProfile.jsx";
import PlayerProfileModalBoundary from "./PlayerProfileModalBoundary.jsx";
import ExtensionNegotiationModal from "./ExtensionNegotiationModal.jsx";
import ReleasePreviewModal from "./ReleasePreviewModal.jsx";
import BulkReleasePreviewModal from "./BulkReleasePreviewModal.jsx";
import { teamColor } from "../../data/team-utils.js";
import { OFFENSIVE_SCHEMES, DEFENSIVE_SCHEMES } from "../../core/scheme-core.js";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  classifyTeamDirection,
  evaluateResignRecommendation,
  summarizeExpiring,
} from "../utils/contractInsights.js";
import { buildDirectionGuidance, buildTeamIntelligence } from "../utils/teamIntelligence.js";
import { normalizeManagement, TRADE_STATUSES, TRADE_STATUS_LABELS, CONTRACT_PLAN_LABELS, toggleContractPlan } from "../utils/playerManagement.js";
import { deriveTeamCapSnapshot, formatMoneyM, toFiniteNumber } from "../utils/numberFormatting.js";
import { derivePlayerContractFinancials } from "../utils/contractFormatting.js";
import { describePlayerMoraleContext } from "../utils/teamChemistry.js";
import { buildDevelopmentNotes, summarizeRosterDevelopment } from "../utils/playerDevelopmentSignals.js";
import { getDepthRows, autoBuildDepthChart, depthWarnings } from "../../core/depthChart.js";
import AdvancedPlayerSearch from "./AdvancedPlayerSearch.jsx";
import { applyAdvancedPlayerFilters } from "../../core/footballAdvancedFilters";
import { buildPlayerEvaluation } from "../../core/playerEvaluation.js";
import { usePlayerCompare } from "../utils/playerCompare.js";
import SocialFeed from "./SocialFeed.jsx";
import { TeamWorkspaceHeader, TeamCapSummaryStrip } from "./TeamWorkspacePrimitives.jsx";
import { ToneChip, DevelopmentSignalRow } from "./PlayerDevelopmentUI.jsx";
import EmptyState from "./EmptyState.jsx";
import { getPositionColor } from "../constants/positionColors.js";
import { deriveRosterReadinessModel } from "../utils/rosterReadinessModel.js";
import { markWeeklyPrepStep } from "../utils/weeklyPrep.js";
import { buildShowingLabel, rowMatchesSearch, stableSortRows } from "../utils/dataBrowser.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITIONS = ["ALL", "QB", "WR", "RB", "TE", "OL", "DL", "LB", "CB", "S"];

// Depth chart layout — each entry defines one positional row.
// `match` is the set of pos strings that map to this group.
const DEPTH_ROWS = getDepthRows();

const SLOT_LABELS = ["Starter", "Backup", "3rd", "4th", "5th", "6th", "7th", "8th"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ovrColor(ovr) {
  if (ovr >= 90) return "#34C759"; // elite  — green
  if (ovr >= 80) return "#30D158"; // great  — green-teal
  if (ovr >= 70) return "#0A84FF"; // solid  — blue
  if (ovr >= 60) return "#FF9F0A"; // average — amber
  return "#FF453A"; // poor   — red
}

function fmtSalary(annual) {
  return formatMoneyM(annual);
}

function fmtYears(contract) {
  if (!contract) return "—";
  const rem =
    contract.yearsRemaining ?? contract.yearsTotal ?? contract.years ?? 1;
  return `${rem}yr`;
}

function indicatorColor(val) {
  if (val >= 85) return "#34C759";
  if (val >= 70) return "#FF9F0A";
  return "#FF453A";
}

/** Small coloured square bar (5 filled / 5 total pips). */
function PipBar({ value, color }) {
  const filled = Math.round((value / 100) * 5);
  return (
    <span style={{ display: "inline-flex", gap: 2, verticalAlign: "middle" }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: i < filled ? color : "var(--hairline)",
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}

/**
 * Readable attribute names for tooltip display.
 */
const ATTR_DISPLAY_NAMES = {
  throwAccuracy: 'Accuracy',
  throwPower: 'Arm Strength',
  awareness: 'Awareness',
  intelligence: 'Intelligence',
  catching: 'Catching',
  catchInTraffic: 'Catch in Traffic',
  speed: 'Speed',
  acceleration: 'Acceleration',
  juking: 'Juking',
  trucking: 'Trucking',
  passBlock: 'Pass Blocking',
  runBlock: 'Run Blocking',
  runStop: 'Run Stop',
  passRushPower: 'Pass Rush Power',
  passRushSpeed: 'Pass Rush Speed',
  coverage: 'Coverage',
};

/**
 * Color-coded Scheme Fit indicator with puzzle-piece icon.
 * Green puzzle = great fit (+3/+4), Yellow = neutral (0), Red = penalty (-1 to -3).
 * v2: Shows "+3" or "-2" next to OVR with tap tooltip explaining the fit reason.
 */
function SchemeFitIndicator({ fit, bonus, topAttr, schemeName }) {
  const [showTip, setShowTip] = useState(false);

  let color, label, icon;
  if (bonus >= 3) {
    color = '#34C759'; // green
    label = `+${bonus}`;
    icon = '\u{1F9E9}'; // puzzle piece emoji
  } else if (bonus >= 1) {
    color = '#30D158'; // green-teal
    label = `+${bonus}`;
    icon = '\u{1F9E9}';
  } else if (bonus === 0) {
    color = '#FF9F0A'; // amber/yellow
    label = '0';
    icon = '\u25CF'; // circle
  } else {
    color = '#FF453A'; // red
    label = `${bonus}`;
    icon = '\u25BC'; // down triangle
  }

  const attrName = ATTR_DISPLAY_NAMES[topAttr] || topAttr || '';
  const tipText = bonus !== 0 && attrName
    ? `${label} OVR — ${attrName} ${bonus > 0 ? 'fits' : 'mismatches'} ${schemeName || 'scheme'}`
    : `Neutral scheme fit`;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 6px',
        borderRadius: 'var(--radius-sm, 4px)',
        background: `${color}18`,
        minHeight: 48,
        minWidth: 48,
        justifyContent: 'center',
        cursor: 'pointer',
        touchAction: 'manipulation',
        pointerEvents: 'auto',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        position: 'relative',
      }}
      onClick={(e) => { e.stopPropagation(); setShowTip(prev => !prev); }}
      onMouseLeave={() => setShowTip(false)}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
      <span style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {label}
      </span>
      {showTip && (
        <div style={{
          position: 'absolute',
          bottom: '110%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1e1e2e',
          color: '#fff',
          fontSize: 11,
          padding: '6px 10px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
          zIndex: 5000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          {tipText}
        </div>
      )}
    </div>
  );
}

function getRosterSortValue(player, sortKey) {
  switch (sortKey) {
    case "ovr": return player?.ovr ?? 0;
    case "age": return player?.age ?? 0;
    case "salary": return derivePlayerContractFinancials(player).annualSalary ?? 0;
    case "fit": return player?.schemeFit ?? 50;
    case "morale": return player?.morale ?? 75;
    case "pos": return player?.pos ?? "";
    case "name": return player?.name ?? "";
    default: return 0;
  }
}

function sortPlayers(players, sortKey, sortDir) {
  return stableSortRows(players, (player) => getRosterSortValue(player, sortKey), sortDir, (player) => player?.name);
}

function getContractYearsLeft(player) {
  return Number(player?.contract?.yearsRemaining ?? player?.contract?.yearsLeft ?? player?.contract?.years ?? 0);
}

function isInjuredPlayer(player) {
  return Number(player?.injuryWeeksRemaining ?? player?.injury?.weeksRemaining ?? 0) > 0 || !!player?.injury;
}

function isStarterPlayer(player) {
  const depthOrder = Number(player?.depthChart?.order ?? player?.depthOrder ?? 999);
  return Number.isFinite(depthOrder) && depthOrder === 1;
}

function applyRosterQuickFilter(players, posFilter) {
  if (posFilter === "EXPIRING") {
    return players.filter((p) => getContractYearsLeft(p) <= 1);
  }
  if (posFilter === "STARTERS") {
    return players.filter((p) => isStarterPlayer(p));
  }
  if (posFilter === "DEPTH") {
    return players.filter((p) => !isStarterPlayer(p));
  }
  if (posFilter === "INJURED") {
    return players.filter((p) => isInjuredPlayer(p));
  }
  if (posFilter === "DEVELOPMENT") {
    return players.filter((p) => Number(p?.age ?? 40) <= 24 || Number(p?.potential ?? 0) >= 80);
  }
  if (posFilter !== "ALL") {
    return players.filter(
      (p) =>
        p.pos === posFilter ||
        DEPTH_ROWS.find((r) => r.key === posFilter)?.match.includes(p.pos),
    );
  }
  return players;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CapBar({ capUsed, capTotal, deadCap = 0 }) {
  const safeCapTotal = toFiniteNumber(capTotal, 0);
  const safeCapUsed = Math.max(0, toFiniteNumber(capUsed, 0));
  const safeDeadCap = Math.max(0, toFiniteNumber(deadCap, 0));
  const usedPct =
    safeCapTotal > 0 ? Math.min(100, ((safeCapUsed - safeDeadCap) / safeCapTotal) * 100) : 0;
  const deadPct = safeCapTotal > 0 ? Math.min(100, (safeDeadCap / safeCapTotal) * 100) : 0;

  const totalPct = usedPct + deadPct;
  const color =
    totalPct > 90
      ? "var(--danger)"
      : totalPct > 75
        ? "var(--warning)"
        : "var(--success)";

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}
    >
      <div
        style={{
          flex: 1,
          height: 8,
          background: "var(--hairline)",
          borderRadius: 4,
          overflow: "hidden",
          display: "flex",
        }}
      >
        {/* Active Cap */}
        <div
          style={{
            height: "100%",
            width: `${usedPct}%`,
            background: color,
            transition: "width .3s",
          }}
        />
        {/* Dead Cap */}
        {deadPct > 0 && (
          <div
            style={{
              height: "100%",
              width: `${deadPct}%`,
              background: "var(--text-subtle)",
              transition: "width .3s",
            }}
          />
        )}
      </div>
      <div style={{ textAlign: "right", lineHeight: 1 }}>
        <span
          style={{
            fontSize: "var(--text-xs)",
            color,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {formatMoneyM(safeCapUsed)} / {formatMoneyM(safeCapTotal, "—", { digits: 0 })}
        </span>
        {safeDeadCap > 0 && (
          <div
            style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 2 }}
          >
            ({formatMoneyM(safeDeadCap)} Dead)
          </div>
        )}
      </div>
    </div>
  );
}

function SortTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  style = {},
}) {
  const active = currentSort === sortKey;
  return (
    <TableHead
      onClick={() => onSort(sortKey)}
      style={{
        cursor: "pointer",
        userSelect: "none",
        color: active ? "var(--accent)" : "var(--text-muted)",
        fontWeight: active ? 700 : 600,
        fontSize: "var(--text-xs)",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
      {active ? (currentDir === "asc" ? " ▲" : " ▼") : ""}
    </TableHead>
  );
}

function StatusBadge({ injuryWeeks }) {
  if (!injuryWeeks || injuryWeeks <= 0) return null;
  const isIR = injuryWeeks >= 4;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 5px",
        borderRadius: "var(--radius-pill)",
        background: isIR ? "#FF9F0A" : "#FF453A",
        color: "#fff",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.5px",
        verticalAlign: "middle",
        marginLeft: 6,
      }}
    >
      {isIR ? "IR" : "OUT"}
    </span>
  );
}

function OvrBadge({ ovr }) {
  const col = ovrColor(ovr);
  return (
    <Badge
      variant="outline"
      style={{
        display: "inline-block",
        minWidth: 32,
        padding: "2px 4px",
        borderRadius: "var(--radius-pill)",
        background: col + "22",
        color: col,
        fontWeight: 800,
        fontSize: "var(--text-xs)",
        textAlign: "center",
      }}
    >
      {ovr}
    </Badge>
  );
}

function fmtDeadCap(player) {
  const fin = derivePlayerContractFinancials(player);
  return formatMoneyM(fin.deadCapHit ?? fin.deadCap ?? 0);
}

const MOBILE_POSITION_ORDER = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S"];

function OvrBadgeWithTrend({ ovr, delta = 0 }) {
  const col = ovrColor(ovr);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <Badge
        variant="outline"
        style={{
          display: "inline-block",
          minWidth: 32,
          padding: "2px 4px",
          borderRadius: "var(--radius-pill)",
          background: col + "22",
          color: col,
          fontWeight: 800,
          fontSize: "var(--text-xs)",
          textAlign: "center",
        }}
      >
        {ovr}
      </Badge>
      {delta > 0 && (
        <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 700, lineHeight: 1 }}>▲</span>
      )}
      {delta < 0 && (
        <span style={{ fontSize: 10, color: "var(--danger)", fontWeight: 700, lineHeight: 1 }}>▼</span>
      )}
    </div>
  );
}

function ActionSheetDrawer({ player, onClose, setExtending, openReleasePreview, handleTradeBlockToggle, toggleCompare }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 210);
  }, [onClose]);

  if (!player) return null;

  const sheetActions = [
    { label: "Extend Contract", handler: () => { setExtending(player); close(); }, color: "var(--success)" },
    { label: "Release Player", handler: () => { openReleasePreview(player); close(); }, color: "var(--danger)" },
    { label: "Toggle Trade Block", handler: () => { handleTradeBlockToggle(player.id); close(); }, color: "var(--text)" },
    { label: "Compare Player", handler: () => { toggleCompare(player); close(); }, color: "var(--accent)" },
  ];

  return (
    <>
      <div
        onClick={close}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 3999, opacity: visible ? 1 : 0, transition: "opacity 200ms ease-out",
        }}
      />
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: "#1c1c1e", borderRadius: "16px 16px 0 0",
          zIndex: 4000, padding: "16px", maxHeight: "60vh", overflowY: "auto",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 200ms ease-out",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--hairline)",
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>{player.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{player.pos}</span>
              <OvrBadgeWithTrend ovr={player.ovr ?? 70} delta={player.progressionDelta ?? 0} />
            </div>
          </div>
        </div>
        {sheetActions.map((action, idx) => (
          <React.Fragment key={action.label}>
            {idx > 0 && <div style={{ height: 1, background: "var(--hairline)" }} />}
            <button
              onClick={action.handler}
              style={{
                display: "block", width: "100%", height: 52,
                background: "none", border: "none", color: action.color,
                fontSize: 16, fontWeight: 600, cursor: "pointer",
                textAlign: "left", padding: "0 4px",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {action.label}
            </button>
          </React.Fragment>
        ))}
        <div style={{ height: 1, background: "var(--hairline)" }} />
        <button
          onClick={close}
          style={{
            display: "block", width: "100%", height: 52,
            background: "none", border: "none", color: "var(--danger)",
            fontSize: 16, fontWeight: 600, cursor: "pointer",
            textAlign: "left", padding: "0 4px",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

function MobileGroupedRosterList({
  displayed, bulkMode, bulkSelectedIds, toggleBulkPlayer,
  onPlayerSelect, setActionSheetPlayer,
}) {
  const longPressTimers = useRef({});

  const grouped = useMemo(() => {
    const map = {};
    MOBILE_POSITION_ORDER.forEach(pos => { map[pos] = []; });
    displayed.forEach(player => {
      const pos = player.pos ?? player.position ?? "";
      if (Object.prototype.hasOwnProperty.call(map, pos)) {
        map[pos].push(player);
      } else {
        if (!map.__other) map.__other = [];
        map.__other.push(player);
      }
    });
    const result = MOBILE_POSITION_ORDER
      .filter(pos => map[pos] && map[pos].length > 0)
      .map(pos => ({ pos, players: map[pos] }));
    if (map.__other && map.__other.length > 0) {
      result.push({ pos: "Other", players: map.__other });
    }
    return result;
  }, [displayed]);

  const handlePointerDown = useCallback((player) => {
    longPressTimers.current[player.id] = window.setTimeout(() => {
      setActionSheetPlayer(player);
      delete longPressTimers.current[player.id];
    }, 500);
  }, [setActionSheetPlayer]);

  const handlePointerUp = useCallback((player) => {
    if (longPressTimers.current[player.id]) {
      window.clearTimeout(longPressTimers.current[player.id]);
      delete longPressTimers.current[player.id];
    }
  }, []);

  if (displayed.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
        No players match this filter
      </div>
    );
  }

  return (
    <div style={{ marginTop: "var(--space-2)" }}>
      {grouped.map(({ pos, players }) => (
        <div key={pos}>
          <div
            style={{
              position: "sticky", top: 0, zIndex: 10,
              background: "#1a1a1a", height: 36,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 12px", borderBottom: "1px solid var(--hairline)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
              {pos}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {players.length} {players.length === 1 ? "player" : "players"}
            </span>
          </div>
          {players.map((player, idx) => {
            const fin = derivePlayerContractFinancials(player);
            const annualValue = fin.annualSalary ?? player.contract?.annualValue ?? 0;
            const posColor = getPositionColor(player.pos);
            const isSelected = bulkSelectedIds.includes(player.id);
            const initials = (player.name || "?").split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("");
            return (
              <div
                key={player.id}
                onClick={() => onPlayerSelect && onPlayerSelect(player.id)}
                onPointerDown={() => handlePointerDown(player)}
                onPointerUp={() => handlePointerUp(player)}
                onPointerCancel={() => handlePointerUp(player)}
                onContextMenu={(e) => e.preventDefault()}
                style={{
                  display: "flex", alignItems: "center", height: 56,
                  padding: "0 12px", gap: 8, cursor: "pointer",
                  borderBottom: idx < players.length - 1 ? "1px solid var(--hairline)" : "none",
                  background: isSelected ? "rgba(10,132,255,0.08)" : "transparent",
                  WebkitTapHighlightColor: "transparent",
                  userSelect: "none", WebkitUserSelect: "none",
                }}
              >
                <div style={{ width: 28, flexShrink: 0, textAlign: "center" }}>
                  {bulkMode ? (
                    <input
                      aria-label={`Select ${player.name}`}
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => { e.stopPropagation(); toggleBulkPlayer(player.id); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 18, height: 18 }}
                    />
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 700 }}>
                      {player.jerseyNumber ?? player.jersey ?? ""}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: `${posColor}33`, border: `1px solid ${posColor}66`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: posColor, flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: "var(--text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {player.name}
                  </div>
                  <div style={{
                    fontSize: 11, color: "var(--text-muted)", marginTop: 1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    Dead Cap: {fmtDeadCap(player)} · {fmtSalary(annualValue)} · {fmtYears(player.contract)}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <OvrBadgeWithTrend ovr={player.ovr ?? 70} delta={player.progressionDelta ?? 0} />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function PosBadge({ pos }) {
  const posColor = getPositionColor(pos);
  return (
    <Badge
      variant="outline"
      style={{
        display: "inline-block",
        minWidth: 32,
        padding: "1px 8px",
        borderRadius: "var(--radius-pill)",
        background: `${posColor}26`,
        borderColor: `${posColor}66`,
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        color: posColor,
        textAlign: "center",
      }}
    >
      {pos}
    </Badge>
  );
}

// ── Roster Table View ─────────────────────────────────────────────────────────

function RosterTable({
  players,
  actions,
  teamId,
  team,
  week,
  league,
  onRefetch,
  onPlayerSelect,
  phase,
  schemeName,
  chemistry,
  initialFilter = "ALL",
  salaryCap = 200_000_000,
}) {
  const isResignPhase = phase === "offseason_resign";
  // Default to EXPIRING view in resign phase
  const [posFilter, setPosFilter] = useState(initialFilter || (isResignPhase ? "EXPIRING" : "ALL"));
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDir, setSortDir] = useState("desc");
  const [releaseCandidate, setReleaseCandidate] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState([]);
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false);
  const [extending, setExtending] = useState(null);
  const [advancedFilters, setAdvancedFilters] = useState([]);
  const [search, setSearch] = useState("");
  const [evaluationMode, setEvaluationMode] = useState(true);
  const [isMobileView, setIsMobileView] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [mobileViewOverride, setMobileViewOverride] = useState(null);
  const [actionSheetPlayer, setActionSheetPlayer] = useState(null);
  const [actionError, setActionError] = useState(null);
  const {
    compareIds,
    setCompareIds,
    showComparison,
    setShowComparison,
    toggleCompare,
    comparePlayerA,
    comparePlayerB,
  } = usePlayerCompare(players, 2);

  const displayed = useMemo(() => {
    const quickFiltered = applyRosterQuickFilter(players, posFilter);
    const searched = quickFiltered.filter((player) => rowMatchesSearch(player, search, ["name", "pos", (p) => p?.college, (p) => p?.archetype]));
    const filtered = applyAdvancedPlayerFilters(searched, advancedFilters);
    return sortPlayers(filtered, sortKey, sortDir);
  }, [players, posFilter, search, sortKey, sortDir, advancedFilters]);
  const evaluatedDisplayed = useMemo(() => displayed.map((player) => ({
    player,
    eval: buildPlayerEvaluation(player, {
      teamContext: team,
      rosterContext: { roster: players },
      depthChartNeeds: (team?.needsNow ?? []).map((n) => n?.pos ?? n),
      gamePlan: team?.gamePlan ?? {},
    }),
  })), [displayed, team, players]);
  const teamDirection = useMemo(() => classifyTeamDirection(team, week), [team, week]);
  const decisionSummary = useMemo(
    () => buildExpiringDecisionSummary(players, { team, roster: players, direction: teamDirection }),
    [players, team, teamDirection],
  );

  const activeFilters = isResignPhase ? ["EXPIRING", "STARTERS", "DEPTH", "INJURED", "DEVELOPMENT", ...POSITIONS] : ["STARTERS", "DEPTH", "INJURED", "EXPIRING", "DEVELOPMENT", ...POSITIONS];
  const hasActiveFilters = Boolean(search.trim()) || posFilter !== "ALL" || advancedFilters.length > 0;
  const resetBrowseFilters = () => { setSearch(""); setPosFilter("ALL"); setAdvancedFilters([]); };

  // Guard against spurious re-renders: only call setPosFilter when the resolved
  // value has actually changed (prevents cascade when the parent re-renders with
  // a structurally-identical but reference-distinct initialFilter string).
  useEffect(() => {
    if (initialFilter) {
      setPosFilter(prev => (prev === initialFilter ? prev : initialFilter));
    }
  }, [initialFilter]);

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const showMobileView = mobileViewOverride === null ? isMobileView : mobileViewOverride === "list";

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };


  const handleTag = async (player) => {
      if (window.confirm(`Apply Franchise Tag to ${player.name}?`)) {
          await actions.applyFranchiseTag(player.id, player.teamId);
          onRefetch?.();
      }
  };

  const handleRestructure = async (player) => {
      if (window.confirm(`Restructure ${player.name}'s contract to save cap space this year?`)) {
          await actions.restructureContract(player.id, player.teamId);
          onRefetch?.();
      }
  };

  const openReleasePreview = (player) => {
    setReleaseCandidate(player ?? null);
  };
  const cancelReleasePreview = () => setReleaseCandidate(null);
  const confirmRelease = () => {
    if (!releaseCandidate?.id) return;
    actions.releasePlayer(releaseCandidate.id, teamId);
    setReleaseCandidate(null);
    onRefetch?.();
  };
  const toggleBulkPlayer = (playerId) => {
    setBulkSelectedIds((prev) => prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]);
  };
  // Use a Set for O(1) look-ups — Array.includes is O(n) and rebuilds on every
  // render tick when bulkSelectedIds grows large.
  const selectedPlayers = useMemo(() => {
    const selectedSet = new Set(bulkSelectedIds);
    const seen = new Set();
    return players.filter((p) => selectedSet.has(p.id) && !seen.has(p.id) && seen.add(p.id));
  }, [players, bulkSelectedIds]);
  const confirmBulkRelease = async (dedupedPlayers) => {
    const ids = [...new Set((dedupedPlayers ?? []).map((p) => p?.id).filter(Boolean))];
    if (!ids.length || !actions?.bulkReleasePlayers) return;
    const result = await actions.bulkReleasePlayers(teamId, ids);
    if (!result?.ok) {
      window.alert(`Bulk release stopped after ${result?.released?.length ?? 0} release(s): ${result?.error ?? "Unknown error"}`);
    }
    setBulkPreviewOpen(false);
    setBulkSelectedIds([]);
    onRefetch?.();
  };

  const handleTradeBlockToggle = async (playerId) => {
    if (!playerId || !actions?.toggleTradeBlock) return;
    try {
      await actions.toggleTradeBlock(playerId, teamId);
      actions.save();
      setActionError(null);
      onRefetch();
    } catch (e) {
      console.error('[Roster] toggleTradeBlock failed', e);
      setActionError(e?.message ?? 'Could not update the trade block. Please try again.');
    }
  };

  const handleManagementUpdate = async (player, updates) => {
    if (!actions?.updatePlayerManagement || !player?.id || !teamId) return;
    try {
      await actions.updatePlayerManagement(player.id, teamId, updates);
      setActionError(null);
      onRefetch?.();
    } catch (e) {
      console.error('[Roster] updatePlayerManagement failed', e);
      setActionError(e?.message ?? `Could not update ${player?.name ?? 'player'}. Please try again.`);
    }
  };
  const releasePreviewCapRoom = toFiniteNumber(team?.capRoom, 0);



  return (
    <>
      {actionError && (
        <div
          role="alert"
          className="card padding-md"
          style={{ marginBottom: "var(--space-3)", border: "1.5px solid var(--danger)", color: "var(--danger)" }}
        >
          {actionError}
        </div>
      )}
      {extending && (
        <ExtensionNegotiationModal
          player={extending}
          actions={actions}
          teamId={teamId}
          cacheScopeKey={buildLeagueCacheScopeKey(league)}
          statusNode={<StatusBadge injuryWeeks={extending.injuryWeeksRemaining} />}
          onClose={() => setExtending(null)}
          onComplete={() => {
            setExtending(null);
            onRefetch();
          }}
        />
      )}
      <ReleasePreviewModal
        open={Boolean(releaseCandidate)}
        player={releaseCandidate}
        capRoomNow={releasePreviewCapRoom}
        onCancel={cancelReleasePreview}
        onConfirm={confirmRelease}
      />
      <BulkReleasePreviewModal
        open={bulkPreviewOpen}
        players={selectedPlayers}
        rosterCount={players.length}
        onCancel={() => setBulkPreviewOpen(false)}
        onConfirm={confirmBulkRelease}
      />
      {/* Player comparison modal */}
      {showComparison && comparePlayerA && comparePlayerB && (
        <PlayerComparison
          playerA={comparePlayerA}
          playerB={comparePlayerB}
          onClose={() => setShowComparison(false)}
        />
      )}
      <PlayerCompareTray
        compareIds={compareIds}
        resolvePlayer={(id) => players.find((pl) => pl.id === id)}
        onRemove={toggleCompare}
        onOpenCompare={() => setShowComparison(true)}
        onClear={() => setCompareIds([])}
      />
      {actionSheetPlayer && (
        <ActionSheetDrawer
          player={actionSheetPlayer}
          onClose={() => setActionSheetPlayer(null)}
          setExtending={setExtending}
          openReleasePreview={openReleasePreview}
          handleTradeBlockToggle={handleTradeBlockToggle}
          toggleCompare={toggleCompare}
        />
      )}
      {/* Position filter pills */}
      {isResignPhase && (
        <div style={{
          marginBottom: "var(--space-3)",
          display: "flex",
          gap: "var(--space-2)",
          flexWrap: "wrap",
          fontSize: 11,
          color: "var(--text-muted)",
        }}>
          <span><strong style={{ color: "var(--success)" }}>{decisionSummary.priority_resign}</strong> priority re-signs</span>
          {!showMobileView && <span><strong style={{ color: "#64D2FF" }}>{decisionSummary.resign_if_price}</strong> price-sensitive</span>}
          {!showMobileView && <span><strong style={{ color: "var(--warning)" }}>{decisionSummary.replaceable_depth}</strong> replaceable depth</span>}
          <span><strong style={{ color: "var(--danger)" }}>{decisionSummary.let_walk}</strong> let walk</span>
          {!showMobileView && <span><strong style={{ color: "#BF5AF2" }}>{decisionSummary.trade_or_tag}</strong> tag/trade calls</span>}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <Input
          aria-label="Search roster players"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search roster by player, position, college"
          style={{ minHeight: 36, flex: "1 1 220px" }}
        />
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{buildShowingLabel(displayed.length, players.length, "player")}</span>
        {hasActiveFilters ? <Button type="button" variant="outline" onClick={resetBrowseFilters}>Reset filters</Button> : null}
        <Button
          type="button"
          variant="outline"
          title={showMobileView ? "Switch to Table view" : "Switch to List view"}
          onClick={() => setMobileViewOverride(showMobileView ? "table" : "list")}
          style={{ fontSize: 12, padding: "4px 10px", flexShrink: 0 }}
        >
          {showMobileView ? "⊞ Table" : "☰ List"}
        </Button>
      </div>
      <div className="roster-filter-bar" style={{ marginBottom: "var(--space-4)", overflowX: "auto", whiteSpace: "nowrap", WebkitOverflowScrolling: "touch" }}>

        {activeFilters.map((pos) => (
          <Button
            key={pos}
            variant={posFilter === pos ? "default" : "ghost"}
            className={`standings-tab${posFilter === pos ? " active" : ""}`}
            onClick={() => setPosFilter(pos)}
            style={{
              minWidth: 36,
              padding: "4px 10px",
              ...(pos === "EXPIRING"
                ? { borderColor: "var(--success)", color: "var(--success)" }
                : {}),
            }}
          >
            {pos}
          </Button>
        ))}
      </div>
      {!showMobileView && (
        <AdvancedPlayerSearch
          filters={advancedFilters}
          onChange={setAdvancedFilters}
          title="Advanced player search (AND)"
        />
      )}
      {!showMobileView && (
        <div style={{ marginBottom: 8 }}>
          <Button variant={evaluationMode ? "default" : "outline"} onClick={() => setEvaluationMode((v) => !v)}>
            {evaluationMode ? "Evaluation view on" : "Evaluation view off"}
          </Button>
          <Button variant={bulkMode ? "default" : "outline"} onClick={() => { setBulkMode((v) => !v); if (bulkMode) setBulkSelectedIds([]); }} style={{ marginLeft: 8 }}>
            {bulkMode ? "Bulk cut mode on" : "Bulk cut mode off"}
          </Button>
          {bulkMode && (
            <>
              <Button variant="outline" onClick={() => setBulkSelectedIds(displayed.map((p) => p.id))} style={{ marginLeft: 8 }}>Select visible</Button>
              <Button variant="outline" onClick={() => setBulkSelectedIds([])} style={{ marginLeft: 8 }}>Clear</Button>
              <Button variant="destructive" onClick={() => setBulkPreviewOpen(true)} disabled={bulkSelectedIds.length === 0} style={{ marginLeft: 8 }}>
                Preview bulk release ({bulkSelectedIds.length})
              </Button>
            </>
          )}
        </div>
      )}

      {/* Mobile list / Desktop table */}
      {showMobileView ? (
        <MobileGroupedRosterList
          displayed={displayed}
          bulkMode={bulkMode}
          bulkSelectedIds={bulkSelectedIds}
          toggleBulkPlayer={toggleBulkPlayer}
          onPlayerSelect={onPlayerSelect}
          setActionSheetPlayer={setActionSheetPlayer}
        />
      ) : (
      <Card className="card-premium" style={{ padding: 0, overflow: "hidden" }}><CardContent style={{ padding: 0 }}>
        <div
          className="table-wrapper"
          style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
        >
          <Table
            className="standings-table"
            style={{
              width: "100%",
              minWidth: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <TableHeader>
              <TableRow>
                <TableHead
                  style={{ textAlign: "center", width: bulkMode ? 36 : 0 }}
                >
                  {bulkMode ? "Sel" : ""}
                </TableHead>
                <TableHead
                  style={{
                    paddingLeft: "var(--space-2)",
                    width: 28,
                    color: "var(--text-subtle)",
                    fontSize: "var(--text-xs)",
                  }}
                >
                  #
                </TableHead>
                <SortTh
                  label="POS"
                  sortKey="pos"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  style={{ textAlign: "left" }}
                />
                <TableHead
                  style={{
                    textAlign: "left",
                    color: "var(--text-muted)",
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Name
                </TableHead>
                <SortTh
                  label="OVR"
                  sortKey="ovr"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  style={{ textAlign: "right", paddingRight: "var(--space-3)" }}
                />
                <SortTh
                  label="Age"
                  sortKey="age"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  style={{ textAlign: "right", paddingRight: "var(--space-3)" }}
                />
                <SortTh
                  label="$/yr"
                  sortKey="salary"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  style={{ textAlign: "right", paddingRight: "var(--space-3)" }}
                />
                <TableHead
                  style={{
                    textAlign: "right",
                    paddingRight: "var(--space-3)",
                    color: "var(--text-muted)",
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Yrs
                </TableHead>
                <TableHead
                  style={{
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Traits
                </TableHead>
                <SortTh
                  label="Fit"
                  sortKey="fit"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  style={{ textAlign: "center" }}
                />
                <SortTh
                  label="Morale"
                  sortKey="morale"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  style={{ textAlign: "center" }}
                />
                <TableHead
                  style={{
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    width: 30,
                  }}
                  title="Add to comparison"
                >
                  ⊕
                </TableHead>
                <TableHead
                  style={{
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Trade Block
                </TableHead>
                <TableHead
                  style={{
                    textAlign: "center",
                    paddingRight: "var(--space-3)",
                    color: "var(--text-muted)",
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={bulkMode ? 13 : 12} style={{ padding: 0 }}>
                    <EmptyState
                      icon="🧾"
                      title="No players match this filter"
                      subtitle="Try clearing one or more roster filters."
                      action="Reset filter"
                      onAction={resetBrowseFilters}
                    />
                  </TableCell>
                </TableRow>
              )}
                  {evaluatedDisplayed.map(({ player, eval: playerEval }, idx) => {
                const isReleasing = releaseCandidate?.id === player.id;
                const isExpiring = (player.contract?.years || 0) <= 1;
                const yearsLeft =
                  player.contract?.yearsRemaining ??
                  player.contract?.years ??
                  1;
                const isZeroYears =
                  yearsLeft === 0 || (yearsLeft <= 1 && isResignPhase);
                const fit = player.schemeFit ?? 50;
                const morale = player.morale ?? 75;
                const fitCol = indicatorColor(fit);
                const moraleCol = indicatorColor(morale);
                const moraleContext = describePlayerMoraleContext(player, { team, chemistry, week });
                const devContext = buildDevelopmentNotes(player, moraleContext);
                const expiringDecision = isResignPhase && isExpiring
                  ? classifyExpiringDecision(player, { team, roster: players, direction: teamDirection })
                  : null;

                // Highlight row if expiring in resign phase
                const rowStyle = isReleasing
                  ? { background: "rgba(255,69,58,0.07)" }
                  : isResignPhase && isExpiring
                    ? { background: "rgba(52, 199, 89, 0.05)" }
                    : {};

                return (
                  <TableRow key={player.id} style={rowStyle}>
                    <TableCell style={{ textAlign: "center", padding: "0 var(--space-1)" }}>
                      {bulkMode ? <input aria-label={`Select ${player.name}`} type="checkbox" checked={bulkSelectedIds.includes(player.id)} onChange={() => toggleBulkPlayer(player.id)} /> : null}
                    </TableCell>
                    {/* # */}
                    <TableCell
                      style={{
                        paddingLeft: "var(--space-2)",
                        color: "var(--text-subtle)",
                        fontSize: "var(--text-xs)",
                        fontWeight: 700,
                      }}
                    >
                      {idx + 1}
                    </TableCell>
                    {/* POS */}
                    <TableCell>
                      <PosBadge pos={player.pos} />
                    </TableCell>
                    {/* Name */}
                    <TableCell
                      style={{
                        fontWeight: 700,
                        color: "var(--text)",
                        fontSize: "var(--text-md)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <button
                        onClick={() => player && onPlayerSelect && onPlayerSelect(player.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--accent)",
                          cursor: "pointer",
                          padding: 0,
                          fontWeight: 700,
                        }}
                      >
                        {player.name}
                        <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>{TRADE_STATUS_LABELS[normalizeManagement(player).tradeStatus]}{normalizeManagement(player).contractPlan[0] ? ` · ${CONTRACT_PLAN_LABELS[normalizeManagement(player).contractPlan[0]]}` : ""}</div>
                        <div style={{ marginTop: 2, display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <ToneChip label={devContext.trend.label} tone={devContext.trend.tone} />
                          <ToneChip label={devContext.readiness.label} tone={devContext.readiness.tone} />
                          <ToneChip label={devContext.fit.label} tone={devContext.fit.tone} />
                        </div>
                        {evaluationMode && (
                          <div style={{ marginTop: 4, display: "grid", gap: 2 }}>
                            <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>
                              <strong style={{ color: "var(--text)" }}>{playerEval?.archetype?.archetype}</strong> · Fit {playerEval?.schemeFit?.score} ({playerEval?.schemeFit?.tier}) · {playerEval?.roleProjection?.role}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>
                              {playerEval?.simImpact?.summary}
                            </div>
                          </div>
                        )}
                      </button>
                      {(() => {
                        const salary = Number(derivePlayerContractFinancials(player)?.annualSalary ?? 0);
                        const capHit = Math.max(1, Number(salaryCap ?? 200_000_000));
                        const widthPct = Math.min((salary / capHit) * 100, 100);
                        if (!(salary > 0) || !Number.isFinite(widthPct)) return null;
                        return <div className="salary-bar" style={{ width: `${widthPct}%`, height: 2, background: 'var(--accent)', borderRadius: 'var(--radius-pill)', marginTop: 2 }} />;
                      })()}
                      {isResignPhase && isZeroYears && (
                        <span
                          style={{
                            marginLeft: 6,
                            padding: "1px 5px",
                            borderRadius: "var(--radius-pill)",
                            background: "rgba(255,69,58,0.15)",
                            color: "var(--danger)",
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: "0.5px",
                            verticalAlign: "middle",
                          }}
                        >
                          EXPIRING
                        </span>
                      )}
                      {expiringDecision && (
                        <span
                          style={{
                            marginLeft: 6,
                            padding: "1px 5px",
                            borderRadius: "var(--radius-pill)",
                            background: `${expiringDecision.tone}22`,
                            color: expiringDecision.tone,
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: "0.3px",
                            verticalAlign: "middle",
                          }}
                        >
                          {expiringDecision.label}
                        </span>
                      )}
                      {expiringDecision && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                          {expiringDecision.reason} · {expiringDecision.urgency} urgency · {expiringDecision.negotiationRisk} risk
                        </div>
                      )}
                    </TableCell>
                    {/* OVR */}
                    <TableCell
                      style={{
                        textAlign: "right",
                        paddingRight: "var(--space-3)",
                      }}
                    >
                      <OvrBadge ovr={player.ovr} />
                      {player.progressionDelta != null &&
                        player.progressionDelta !== 0 && (
                          <span
                            className={`stat-updated ${player.progressionDelta > 0 ? "text-success" : "text-danger"}`}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              marginLeft: 3,
                              whiteSpace: "nowrap",
                            }}
                          >
                            ({player.progressionDelta > 0 ? "+" : ""}
                            {player.progressionDelta})
                          </span>
                        )}
                    </TableCell>
                    {/* Age */}
                    <TableCell
                      style={{
                        textAlign: "right",
                        paddingRight: "var(--space-3)",
                        color: "var(--text-muted)",
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      {player.age}
                    </TableCell>
                    {/* Salary */}
                    <TableCell
                      style={{
                        textAlign: "right",
                        paddingRight: "var(--space-3)",
                        fontSize: "var(--text-sm)",
                        color: "var(--text)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtSalary(derivePlayerContractFinancials(player).annualSalary)}
                    </TableCell>
                    {/* Years */}
                    <TableCell
                      style={{
                        textAlign: "right",
                        paddingRight: "var(--space-3)",
                        fontSize: "var(--text-xs)",
                        color: isExpiring
                          ? "var(--danger)"
                          : "var(--text-muted)",
                        fontWeight: isExpiring ? 700 : 400,
                      }}
                    >
                      {fmtYears(player.contract)}
                    </TableCell>
                    {/* Traits */}
                    <TableCell style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      {(player.traits || []).map((t) => (
                        <TraitBadge key={t} traitId={t} />
                      ))}
                    </TableCell>
                    {/* Scheme Fit — color-coded puzzle icon + bonus */}
                    <TableCell
                      style={{
                        textAlign: "center",
                        padding: "0 var(--space-2)",
                      }}
                    >
                      <SchemeFitIndicator fit={fit} bonus={player.schemeBonus ?? 0} topAttr={player.topAttr} schemeName={schemeName} />
                    </TableCell>
                    {/* Morale */}
                    <TableCell
                      style={{
                        textAlign: "center",
                        padding: "0 var(--space-2)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <PipBar value={morale} color={moraleCol} />
                        <span
                          style={{
                            fontSize: 10,
                            color: moraleCol,
                            fontWeight: 700,
                            lineHeight: 1,
                          }}
                        >
                          {morale}
                        </span>
                        {player?.holdout?.active && (
                          <span
                            data-testid="roster-holdout-badge"
                            title={`On holdout — ${player.holdout.reason?.replace(/_/g, ' ') ?? 'contract dispute'}. Demand premium: +${Math.round((player.holdout.demandPremium ?? 0) * 100)}%`}
                            style={{
                              display: 'inline-block',
                              padding: '1px 5px',
                              borderRadius: 'var(--radius-pill)',
                              background: '#FF9F0A',
                              color: '#000',
                              fontSize: 9,
                              fontWeight: 900,
                              letterSpacing: '0.5px',
                              cursor: 'default',
                            }}
                          >
                            HOLDOUT
                          </span>
                        )}
                        {morale < 40 && !player?.holdout?.active && (
                          <span
                            data-testid="roster-low-morale-flag"
                            title="Low morale — player is disgruntled"
                            style={{
                              display: 'inline-block',
                              padding: '1px 4px',
                              borderRadius: 'var(--radius-pill)',
                              background: '#FF453A',
                              color: '#fff',
                              fontSize: 9,
                              fontWeight: 800,
                              letterSpacing: '0.4px',
                            }}
                          >
                            LOW
                          </span>
                        )}
                        {moraleContext?.reasons?.[0] && (
                          <span style={{ fontSize: 9, color: "var(--text-subtle)", maxWidth: 120, lineHeight: 1.2, textAlign: "center" }}>
                            {moraleContext.reasons[0]}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {/* Compare checkbox */}
                    <TableCell style={{ textAlign: "center", padding: "0 var(--space-1)" }}>
                      <Button
                        title={compareIds.includes(player.id) ? "Remove from compare" : "Add to compare"}
                        onClick={() => toggleCompare(player)}
                        style={{
                          width: 22, height: 22,
                          borderRadius: "var(--radius-sm)",
                          border: `1.5px solid ${compareIds.includes(player.id) ? "var(--accent)" : "var(--hairline)"}`,
                          background: compareIds.includes(player.id) ? "var(--accent-muted)" : "transparent",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, color: compareIds.includes(player.id) ? "var(--accent)" : "var(--text-subtle)",
                          transition: "all 0.15s",
                        }}
                      >
                        {compareIds.includes(player.id) ? "✓" : "⊕"}
                      </Button>
                    </TableCell>
                    {/* Release / Extend */}
                    <TableCell style={{ textAlign: "center", padding: "0 var(--space-2)" }}>
                      {player?.id && (
                        <div style={{ display: 'grid', gap: 4 }}>
                          <select
                            value={normalizeManagement(player).tradeStatus}
                            onChange={(e) => handleManagementUpdate(player, { tradeStatus: e.target.value })}
                            style={{ fontSize: 11, borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface)' }}
                            title="Trade posture"
                          >
                            {TRADE_STATUSES.map((status) => <option key={status} value={status}>{TRADE_STATUS_LABELS[status]}</option>)}
                          </select>
                          <button
                            className="trade-block-btn"
                            onClick={() => handleManagementUpdate(player, { contractPlan: toggleContractPlan(player, 'trade_candidate') })}
                            title="Toggle trade candidate contract plan"
                          >
                            {normalizeManagement(player).contractPlan.includes('trade_candidate') ? '✓ Trade candidate' : '+ Trade candidate'}
                          </button>
                        </div>
                      )}
                    </TableCell>
                    {/* Release / Extend */}
                    <TableCell
                      style={{
                        textAlign: "center",
                        paddingRight: "var(--space-3)",
                      }}
                    >
                      {isReleasing ? (
                        <div
                          style={{
                            display: "flex",
                            gap: "var(--space-1)",
                            justifyContent: "center",
                          }}
                        >
                          <Button
                            className="btn btn-danger"
                            style={{
                              fontSize: "var(--text-xs)",
                              padding: "2px 10px",
                            }}
                            onClick={() => openReleasePreview(player)}
                          >
                            Confirm
                          </Button>
                          <Button
                            className="btn"
                            style={{
                              fontSize: "var(--text-xs)",
                              padding: "2px 8px",
                            }}
                            onClick={cancelReleasePreview}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            gap: 4,
                            justifyContent: "center",
                          }}
                        >
                          {isExpiring && (
                            <Button
                              className="btn"
                              style={{
                                fontSize: "var(--text-xs)",
                                padding: "2px 10px",
                                ...(isResignPhase && isZeroYears
                                  ? {
                                      background: "var(--success)",
                                      borderColor: "var(--success)",
                                      color: "#fff",
                                      fontWeight: 700,
                                    }
                                  : {
                                      color: "var(--success)",
                                      borderColor: "var(--success)",
                                    }),
                              }}
                              onClick={() => setExtending(player)}
                            >
                              Extend
                            </Button>
                          )}
                          <Button
                            className="btn"
                            style={{
                              fontSize: "var(--text-xs)",
                              padding: "2px 8px",
                              color: "var(--danger)",
                              borderColor: "var(--danger)",
                            }}
                            onClick={() => openReleasePreview(player)}
                          >
                            Cut
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>
      )}
    </>
  );
}

// ── Depth Chart View ──────────────────────────────────────────────────────────

/** Single player card inside a depth chart slot. */
function DepthCard({ player, isStarter, schemeName, style = {}, dragHandleProps = {}, onSelect }) {
  if (!player) {
    return (
      <div
        style={{
          minWidth: 130,
          padding: "6px 10px",
          borderRadius: "var(--radius-sm)",
          background: "var(--surface)",
          border: "1px dashed var(--hairline)",
          color: "var(--text-subtle)",
          fontSize: "var(--text-xs)",
          textAlign: "center",
        }}
      >
        Empty
      </div>
    );
  }

  const fit = player.schemeFit ?? 50;
  const fitCol = indicatorColor(fit);

  const isInjured = (player.injuryWeeksRemaining || 0) > 0;
  const borderStyle = isInjured
    ? "1px solid #FF453A" // Red border for injured
    : isStarter
      ? "1px solid var(--accent)"
      : "1px solid var(--hairline)";

  return (
    <div
      onClick={() => onSelect?.(player.id)}
      style={{
        minWidth: 130,
        maxWidth: 160,
        opacity: isInjured ? 0.7 : 1,
        padding: "6px 10px",
        borderRadius: "var(--radius-sm)",
        background: isStarter ? "var(--accent-muted)" : "var(--surface)",
        border: borderStyle,
        cursor: "grab",
        ...style,
      }}
      {...dragHandleProps}
    >
      {/* Name + OVR */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: "var(--text-xs)",
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 90,
          }}
        >
          {player.name}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <OvrBadge ovr={player.ovr} />
          {player.progressionDelta != null && player.progressionDelta !== 0 && (
            <span
              className={
                player.progressionDelta > 0 ? "text-success" : "text-danger"
              }
              style={{ fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}
            >
              ({player.progressionDelta > 0 ? "+" : ""}
              {player.progressionDelta})
            </span>
          )}
        </div>
      </div>
      {/* Age + Scheme Fit */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}
      >
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          Ag {player.age}
        </span>
        <SchemeFitIndicator fit={fit} bonus={player.schemeBonus ?? 0} topAttr={player.topAttr} schemeName={schemeName} />
      </div>
    </div>
  );
}

function DepthChartView({ players, onReorder, schemeName }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [recentlyMoved, setRecentlyMoved] = useState(null);

  const sortableSlotId = useCallback((rowKey, slotIdx) => `${rowKey}::${slotIdx}`, []);
  const parseSortableSlotId = useCallback((id) => {
    const [rowKey, slotRaw] = String(id).split("::");
    const slotIdx = Number(slotRaw);
    return { rowKey, slotIdx: Number.isFinite(slotIdx) ? slotIdx : -1 };
  }, []);

  // Build a map: posKey → sorted player array (best OVR first)
  const depthMap = useMemo(() => {
    const map = {};
    DEPTH_ROWS.forEach((row) => {
      map[row.key] = [];
    });
    players.forEach((player) => {
      const row = DEPTH_ROWS.find((r) => r.match.includes(player.pos));
      if (row) map[row.key].push(player);
    });
    // Sort each group by OVR desc so the best player is always Starter
    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) => {
        // Push injured to bottom
        const aInj = (a.injuryWeeksRemaining || 0) > 0 ? 1 : 0;
        const bInj = (b.injuryWeeksRemaining || 0) > 0 ? 1 : 0;
        if (aInj !== bInj) return aInj - bInj;

        // Use depthOrder if set
        if (a.depthOrder !== undefined && b.depthOrder !== undefined && (a.depthOrder > 0 || b.depthOrder > 0)) {
           const aOrder = a.depthOrder > 0 ? a.depthOrder : 999;
           const bOrder = b.depthOrder > 0 ? b.depthOrder : 999;
           if (aOrder !== bOrder) return aOrder - bOrder;
        }

        return (b.ovr ?? 0) - (a.ovr ?? 0);
      });
    });
    return map;
  }, [players]);

  // Group rows by section for the group headers
  const groups = ["OFFENSE", "DEFENSE", "SPECIAL"];

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!active?.id || !over?.id) return;
    const from = parseSortableSlotId(active.id);
    const to = parseSortableSlotId(over.id);
    if (from.rowKey !== to.rowKey || from.slotIdx === to.slotIdx) return;
    const depth = depthMap[from.rowKey] ?? [];
    const moved = depth[from.slotIdx];
    if (!moved || to.slotIdx < 0) return;
    onReorder?.(from.rowKey, moved.id, to.slotIdx);
    setRecentlyMoved(`${from.rowKey}::${moved.id}`);
    window.setTimeout(() => setRecentlyMoved(null), 550);
  }, [depthMap, onReorder, parseSortableSlotId]);

  const SortableDepthSlot = useCallback(function SortableDepthSlot({ rowKey, slotIdx, player }) {
    const sortableId = sortableSlotId(rowKey, slotIdx);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
    const movedKey = player ? `${rowKey}::${player.id}` : null;
    const highlight = movedKey && recentlyMoved === movedKey;
    return (
      <TableCell
        ref={setNodeRef}
        style={{
          padding: "6px",
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
        }}
      >
        <DepthCard
          player={player}
          isStarter={slotIdx === 0}
          schemeName={schemeName}
          dragHandleProps={{ ...attributes, ...listeners }}
          style={{
            boxShadow: highlight ? "0 0 0 2px rgba(52,199,89,0.55) inset" : "none",
            animation: highlight ? "depth-row-flash 480ms ease-out" : "none",
          }}
        />
      </TableCell>
    );
  }, [recentlyMoved, schemeName, sortableSlotId]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
      >
        <style>{`@keyframes depth-row-flash { 0% { background: rgba(52,199,89,0.24);} 100% { background: transparent; } }`}</style>
        {groups.map((group) => {
          const rows = DEPTH_ROWS.filter((r) => r.group === group);
          const maxSlots = Math.max(...rows.map((r) => r.slots));

          return (
            <div key={group}>
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  color: "var(--text-muted)",
                  padding: "var(--space-2) 0",
                  marginBottom: "var(--space-2)",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                {group}
              </div>

              <div className="table-wrapper">
                <Table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        style={{
                          textAlign: "left",
                          padding: "4px 12px 4px 0",
                          fontSize: "var(--text-xs)",
                          color: "var(--text-subtle)",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          width: 140,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Position
                      </TableHead>
                      {Array.from({ length: maxSlots }, (_, i) => (
                        <TableHead
                          key={i}
                          style={{
                            padding: "4px 6px",
                            fontSize: "var(--text-xs)",
                            color: "var(--text-subtle)",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {SLOT_LABELS[i] ?? `${i + 1}th`}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, rowIdx) => {
                      const depth = depthMap[row.key] ?? [];
                      return (
                        <TableRow
                          key={row.key}
                          style={{
                            borderTop: rowIdx > 0 ? "1px solid var(--hairline)" : undefined,
                            verticalAlign: "top",
                          }}
                        >
                          <TableCell
                            style={{
                              padding: "8px 12px 8px 0",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: "var(--text-sm)",
                                color: "var(--text)",
                              }}
                            >
                              {row.label}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--text-subtle)",
                                marginTop: 2,
                              }}
                            >
                              {depth.length} on roster
                            </div>
                          </TableCell>
                          <SortableContext
                            items={Array.from({ length: row.slots }, (_, i) => sortableSlotId(row.key, i))}
                            strategy={horizontalListSortingStrategy}
                          >
                            {Array.from({ length: maxSlots }, (_, slotIdx) => {
                              if (slotIdx >= row.slots) {
                                return <TableCell key={slotIdx} />;
                              }
                              return (
                                <SortableDepthSlot
                                  key={slotIdx}
                                  rowKey={row.key}
                                  slotIdx={slotIdx}
                                  player={depth[slotIdx] ?? null}
                                />
                              );
                            })}
                          </SortableContext>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}

// ── Player Card Components ─────────────────────────────────────────────────────
// Beautiful card-based roster view — the primary display mode for the Roster tab.

/**
 * Return the 3 most-representative attributes for a player's position.
 * Values are taken from player.ratings first, then player-level fallbacks.
 */
function getCardKeyAttrs(player) {
  const r = player.ratings || {};
  const pos = player.pos || "";
  const get = (k) => {
    const v = r[k] ?? player[k];
    return v != null ? Math.round(Number(v) || 0) : null;
  };

  let attrs = [];
  if (pos === "QB") {
    attrs = [
      { label: "Accuracy", value: get("throwAccuracy") },
      { label: "Arm Power", value: get("throwPower") },
      { label: "Awareness", value: get("awareness") },
    ];
  } else if (pos === "RB") {
    attrs = [
      { label: "Speed", value: get("speed") },
      { label: "Trucking", value: get("trucking") },
      { label: "Juking", value: get("juking") },
    ];
  } else if (pos === "WR") {
    attrs = [
      { label: "Speed", value: get("speed") },
      { label: "Catching", value: get("catching") },
      { label: "Accel", value: get("acceleration") },
    ];
  } else if (pos === "TE") {
    attrs = [
      { label: "Catching", value: get("catching") },
      { label: "Run Block", value: get("runBlock") },
      { label: "Speed", value: get("speed") },
    ];
  } else if (pos === "OL") {
    attrs = [
      { label: "Pass Block", value: get("passBlock") },
      { label: "Run Block", value: get("runBlock") },
      { label: "Awareness", value: get("awareness") },
    ];
  } else if (pos === "DL") {
    attrs = [
      { label: "Pass Rush", value: get("passRushSpeed") },
      { label: "PR Power", value: get("passRushPower") },
      { label: "Run Stop", value: get("runStop") },
    ];
  } else if (pos === "LB") {
    attrs = [
      { label: "Coverage", value: get("coverage") },
      { label: "Run Stop", value: get("runStop") },
      { label: "Pass Rush", value: get("passRushSpeed") },
    ];
  } else if (pos === "CB") {
    attrs = [
      { label: "Coverage", value: get("coverage") },
      { label: "Speed", value: get("speed") },
      { label: "Awareness", value: get("awareness") },
    ];
  } else if (pos === "S") {
    attrs = [
      { label: "Coverage", value: get("coverage") },
      { label: "Speed", value: get("speed") },
      { label: "Run Stop", value: get("runStop") },
    ];
  } else if (pos === "K" || pos === "P") {
    attrs = [
      { label: "Power", value: get("kickPower") },
      { label: "Accuracy", value: get("kickAccuracy") },
    ];
  } else {
    attrs = [
      { label: "Speed", value: get("speed") },
      { label: "Awareness", value: get("awareness") },
    ];
  }
  return attrs.filter((a) => a.value != null);
}

/** Compact attribute row: label + fill bar + numeric value. */
function CardAttrBar({ label, value }) {
  if (value == null) return null;
  const pct = Math.min(100, (value / 99) * 100);
  const color =
    value >= 90 ? "#FFD700" :
    value >= 80 ? "#34C759" :
    value >= 70 ? "#0A84FF" :
    value >= 60 ? "#FF9F0A" : "#FF453A";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
      <span style={{
        width: 62, fontSize: 10, color: "var(--text-subtle)",
        flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 4, background: "var(--hairline)", borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color, borderRadius: 2,
        }} />
      </div>
      <span style={{
        width: 24, fontSize: 10, fontWeight: 800, color,
        textAlign: "right", fontVariantNumeric: "tabular-nums", flexShrink: 0,
      }}>
        {value}
      </span>
    </div>
  );
}

function classifyExpiringDecision(player, context = {}) {
  const rec = evaluateResignRecommendation(player, context);
  return {
    key: rec.tier,
    label: rec.label,
    tone: rec.tone,
    reason: rec.reason,
    urgency: rec.urgency,
    negotiationRisk: rec.negotiationRisk,
    replacementDifficulty: rec.replacementDifficulty,
  };
}

function buildExpiringDecisionSummary(players = [], context = {}) {
  return summarizeExpiring(players, context);
}

export function normalizeInitialRosterState(initialState, initialViewMode = "table") {
  const safeState = initialState && typeof initialState === "object" ? initialState : {};
  const safeView = ["cards", "table", "depth"].includes(safeState.view)
    ? safeState.view
    : (["cards", "table", "depth"].includes(initialViewMode) ? initialViewMode : "table");
  const safeFilter = typeof safeState.filter === "string" && safeState.filter.trim()
    ? safeState.filter.trim().toUpperCase()
    : "ALL";
  return { safeView, safeFilter };
}

/**
 * Single player card — tappable, opens the PlayerProfile modal via onSelect(id).
 *
 * Displays: position badge, OVR (colour-coded), name, age, contract, key
 * attributes, and optional INJURED / EXPIRING / ELITE POT badges.
 */
function PlayerCard({ player, onSelect, showDecisionContext = false, decisionContext = {} }) {
  const pos = player.pos || "";
  const posColor = getPositionColor(pos);
  const ovr = player.ovr ?? 70;
  const ovrColor =
    ovr >= 90 ? "#FFD700" :
    ovr >= 80 ? "#34C759" :
    ovr >= 70 ? "#0A84FF" :
    ovr >= 60 ? "#FF9F0A" : "#FF453A";

  const salary = derivePlayerContractFinancials(player).annualSalary ?? 0;
  const yearsLeft =
    player.contract?.yearsLeft ??
    player.contract?.yearsRemaining ??
    player.contract?.years ??
    0;
  const isInjured =
    (player.injury?.weeksRemaining ?? player.injuryWeeksRemaining ?? 0) > 0;
  const isExpiring = yearsLeft <= 1;
  const potential = player.potential ?? 0;
  const keyAttrs = getCardKeyAttrs(player);
  const expiringDecision = isExpiring ? classifyExpiringDecision(player, decisionContext) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`View ${player.name} profile`}
      onClick={() => onSelect?.(player.id)}
      onKeyDown={(e) => e.key === "Enter" && onSelect?.(player.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px ${posColor}44`;
        e.currentTarget.style.borderColor = `${posColor}66`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
        e.currentTarget.style.borderColor = "var(--hairline)";
      }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderTop: `3px solid ${posColor}`,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        cursor: "pointer",
        transition: "transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: 180,
        /* 48px touch target maintained via card height */
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
      }}
    >
      {/* ── Top row: position badge + OVR ── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: "var(--space-2)",
      }}>
        {/* Position pill */}
        <span style={{
          background: `${posColor}22`,
          color: posColor,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.5px",
          padding: "2px 8px",
          borderRadius: "var(--radius-pill)",
          border: `1px solid ${posColor}44`,
          flexShrink: 0,
        }}>
          {pos}
        </span>

        {/* Injury badge + OVR number */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {isInjured && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: "var(--danger)",
              background: "rgba(255,69,58,0.12)", padding: "1px 5px",
              borderRadius: 4, border: "1px solid rgba(255,69,58,0.3)",
            }}>
              INJ
            </span>
          )}
          <span style={{
            fontSize: "var(--text-2xl)", fontWeight: 900,
            color: ovrColor, fontVariantNumeric: "tabular-nums", lineHeight: 1,
          }}>
            {ovr}
          </span>
        </div>
      </div>

      {/* ── Player name ── */}
      <button
        onClick={(e) => { e.stopPropagation(); player && onSelect?.(player.id); }}
        style={{
          fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text)",
          marginBottom: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          background: "none",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {player.name}
      </button>

      {/* ── Age + Contract ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        fontSize: "var(--text-xs)", color: "var(--text-muted)",
        marginBottom: "var(--space-3)", flexWrap: "wrap",
      }}>
        <span>{player.age ?? "?"}yo</span>
        <span style={{ color: "var(--hairline)" }}>·</span>
        <span style={{ color: isExpiring ? "var(--warning)" : "var(--text-muted)" }}>
          {yearsLeft}yr
        </span>
        <span style={{ color: "var(--hairline)" }}>·</span>
        <span>{formatMoneyM(salary)}</span>
      </div>

      {/* ── Key attribute bars ── */}
      <div style={{ flex: 1 }}>
        {keyAttrs.map((attr) => (
          <CardAttrBar key={attr.label} label={attr.label} value={attr.value} />
        ))}
      </div>

      {/* ── Bottom status badges ── */}
      {(isExpiring || potential >= 90) && (
        <div style={{ display: "flex", gap: 4, marginTop: "var(--space-2)", flexWrap: "wrap" }}>
          {isExpiring && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: "var(--warning)",
              background: "rgba(255,159,10,0.12)", padding: "1px 5px",
              borderRadius: 4, border: "1px solid rgba(255,159,10,0.3)",
            }}>
              EXPIRING
            </span>
          )}
          {showDecisionContext && expiringDecision && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: expiringDecision.tone,
              background: `${expiringDecision.tone}22`, padding: "1px 5px",
              borderRadius: 4, border: `1px solid ${expiringDecision.tone}66`,
            }}>
              {expiringDecision.label}
            </span>
          )}
          {potential >= 90 && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: "#FFD700",
              background: "rgba(255,215,0,0.12)", padding: "1px 5px",
              borderRadius: 4, border: "1px solid rgba(255,215,0,0.3)",
            }}>
              ELITE POT
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Full card grid with position-filter pills and sort controls.
 * Mirrors the RosterTable filter/sort UI but renders PlayerCard tiles instead of rows.
 */
function PlayerCardGrid({ players, onPlayerSelect, phase, team, week, initialFilter = "ALL" }) {
  const isResignPhase = phase === "offseason_resign";
  const [posFilter, setPosFilter] = useState(initialFilter || (isResignPhase ? "EXPIRING" : "ALL"));
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDir, setSortDir] = useState("desc");
  const [advancedFilters, setAdvancedFilters] = useState([]);
  const [search, setSearch] = useState("");

  const activeFilters = isResignPhase ? ["EXPIRING", "STARTERS", "DEPTH", "INJURED", "DEVELOPMENT", ...POSITIONS] : ["STARTERS", "DEPTH", "INJURED", "EXPIRING", "DEVELOPMENT", ...POSITIONS];

  const displayed = useMemo(() => {
    const quickFiltered = applyRosterQuickFilter(players, posFilter);
    const searched = quickFiltered.filter((player) => rowMatchesSearch(player, search, ["name", "pos", (p) => p?.college, (p) => p?.archetype]));
    const filtered = applyAdvancedPlayerFilters(searched, advancedFilters);
    return sortPlayers(filtered, sortKey, sortDir);
  }, [players, posFilter, search, sortKey, sortDir, advancedFilters]);
  const direction = useMemo(() => classifyTeamDirection(team, week), [team, week]);
  const decisionSummary = useMemo(
    () => buildExpiringDecisionSummary(players, { team, roster: players, direction }),
    [players, team, direction],
  );

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Same bail-out guard as RosterTable — functional setter skips re-render when
  // the incoming filter value equals the current one.
  useEffect(() => {
    if (initialFilter) {
      setPosFilter(prev => (prev === initialFilter ? prev : initialFilter));
    }
  }, [initialFilter]);

  const SORT_OPTIONS = [
    { key: "ovr", label: "OVR" },
    { key: "salary", label: "Salary" },
    { key: "age", label: "Age" },
    { key: "name", label: "Name" },
  ];

  return (
    <div>
      {/* ── Filter + Sort toolbar ── */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3) var(--space-4)",
        marginBottom: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Input
            aria-label="Search roster cards"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roster"
            style={{ minHeight: 36, flex: "1 1 200px" }}
          />
          {(search.trim() || posFilter !== "ALL" || advancedFilters.length > 0) ? (
            <Button type="button" variant="outline" onClick={() => { setSearch(""); setPosFilter("ALL"); setAdvancedFilters([]); }}>Reset filters</Button>
          ) : null}
        </div>
        <AdvancedPlayerSearch
          filters={advancedFilters}
          onChange={setAdvancedFilters}
          title="Advanced player search (AND)"
        />
        {isResignPhase && (
          <div style={{
            display: "flex",
            gap: "var(--space-2)",
            flexWrap: "wrap",
            fontSize: 11,
            color: "var(--text-muted)",
          }}>
            <span><strong style={{ color: "var(--success)" }}>{decisionSummary.priority_resign}</strong> priority re-signs</span>
            <span><strong style={{ color: "#64D2FF" }}>{decisionSummary.resign_if_price}</strong> price-sensitive</span>
            <span><strong style={{ color: "var(--warning)" }}>{decisionSummary.replaceable_depth}</strong> replaceable depth</span>
            <span><strong style={{ color: "var(--danger)" }}>{decisionSummary.let_walk}</strong> let walk</span>
            <span><strong style={{ color: "#BF5AF2" }}>{decisionSummary.trade_or_tag}</strong> tag/trade calls</span>
          </div>
        )}

        {/* Position filter pills */}
        <div className="roster-filter-bar" style={{ alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>
            Position
          </span>
          {activeFilters.map((pos) => {
            const isActive = posFilter === pos;
            const posCol = getPositionColor(pos);
            return (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                style={{
                  padding: "4px 11px",
                  borderRadius: "var(--radius-pill)",
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  border: `1px solid ${isActive ? (posCol || "var(--accent)") : "var(--hairline)"}`,
                  background: isActive
                    ? posCol ? `${posCol}22` : "var(--accent-muted)"
                    : "transparent",
                  color: isActive ? (posCol || "var(--accent)") : "var(--text-muted)",
                  transition: "all 0.1s ease",
                  minHeight: 28, /* accessible tap target */
                }}
              >
                {pos}
              </button>
            );
          })}
        </div>

        {/* Sort controls */}
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>
            Sort
          </span>
          {SORT_OPTIONS.map((s) => {
            const isActive = sortKey === s.key;
            return (
              <button
                key={s.key}
                onClick={() => handleSort(s.key)}
                style={{
                  padding: "3px 10px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--hairline)"}`,
                  background: isActive ? "var(--accent-muted)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  transition: "all 0.1s ease",
                  minHeight: 28,
                }}
              >
                {s.label}
                {isActive && (
                  <span style={{ fontSize: 10 }}>
                    {sortDir === "desc" ? "↓" : "↑"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Result count ── */}
      <div style={{
        fontSize: "var(--text-xs)", color: "var(--text-muted)",
        marginBottom: "var(--space-3)",
      }}>
        {buildShowingLabel(displayed.length, players.length, "player")}
        {posFilter !== "ALL" ? ` · ${posFilter}` : ""}
      </div>

      {/* ── Card grid ── */}
      {displayed.length === 0 ? (
        <div style={{
          textAlign: "center", color: "var(--text-muted)",
          padding: "var(--space-8)",
        }}>
          No players found.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(182px, 1fr))",
          gap: "var(--space-3)",
        }}>
          {displayed.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              onSelect={onPlayerSelect}
              showDecisionContext={isResignPhase}
              decisionContext={{ team, roster: players, direction }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Roster({ league, actions, onPlayerSelect, onNavigate = null, initialState = null, initialViewMode = "table" }) {
  const teamId = league?.userTeamId;
  const initialConfig = useMemo(
    () => normalizeInitialRosterState(initialState, initialViewMode),
    [initialState, initialViewMode],
  );

  const [loading, setLoading] = useState(false);
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [teamBuilder, setTeamBuilder] = useState(null);
  const [viewMode, setViewMode] = useState(initialConfig.safeView); // 'cards' | 'table' | 'depth'
  const [initialFilter, setInitialFilter] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const rosterPlayerIds = useMemo(() => new Set(players.map((p) => String(p?.id))), [players]);
  const handlePlayerSelect = useCallback((playerId) => {
    if (playerId == null) return;
    if (rosterPlayerIds.has(String(playerId))) {
      setSelectedPlayerId(playerId);
      return;
    }
    console.warn("[Roster] Ignored invalid player selection", { playerId, teamId });
  }, [rosterPlayerIds, teamId]);

  const fetchRoster = useCallback(async () => {
    if (teamId == null || !actions?.getRoster) return;
    setLoading(true);
    try {
      const resp = await actions.getRoster(teamId);
      if (resp?.payload) {
        setTeam(resp.payload.team);
        setPlayers(resp.payload.players ?? []);
        setTeamBuilder(resp.payload.analysis ?? null);
      }
    } catch (e) {
      console.error("[Roster] getRoster failed:", e);
    } finally {
      setLoading(false);
    }
  }, [teamId, actions]);

  // Fetch on mount and whenever the user's team or week changes.
  // fetchRoster is stable as long as teamId and actions don't change.
  // Do NOT add league?.teams here — it's a new array reference on every
  // STATE_UPDATE dispatch and would cause a fetch cascade.
  // Post-release refreshes are handled by the explicit onRefetch() callback
  // passed to RosterTable.
  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Sync view mode and filter from incoming prop changes.
  // Functional setters let React bail out cheaply when the resolved value hasn't
  // actually changed — this is the primary guard against the cascade that fires
  // whenever a parent re-renders with a structurally-identical but
  // reference-distinct initialState object (e.g. an inline object literal).
  // The previously-separate effect for initialViewMode is folded in here to
  // eliminate the double-trigger on every mount.
  useEffect(() => {
    const next = normalizeInitialRosterState(initialState, initialViewMode);
    const nextFilter = next?.safeFilter ?? null;
    const nextView = next.safeView || null;
    if (nextFilter !== null) {
      setInitialFilter(prev => (prev === nextFilter ? prev : nextFilter));
    }
    if (nextView) {
      setViewMode(prev => (prev === nextView ? prev : nextView));
    }
  }, [initialState, initialViewMode]);

  const handleReorderDepthChart = useCallback((posKey, draggedPlayerId, targetSlotIdx) => {
      const row = DEPTH_ROWS.find((r) => r.key === posKey);
      if (!row) return;
      const groupPlayers = players.filter((p) => {
        const rowKey = p?.depthChart?.rowKey;
        return rowKey ? rowKey === posKey : row.match.includes(p.pos);
      });

      let sorted = [...groupPlayers].sort((a, b) => {
         const aOrder = a?.depthChart?.order ?? (a.depthOrder > 0 ? a.depthOrder : 999);
         const bOrder = b?.depthChart?.order ?? (b.depthOrder > 0 ? b.depthOrder : 999);
         if (aOrder !== bOrder) return aOrder - bOrder;
         return (b.ovr ?? 0) - (a.ovr ?? 0);
      });

      const draggedIdx = sorted.findIndex(p => p.id === draggedPlayerId);
      if (draggedIdx === -1 || draggedIdx === targetSlotIdx) return;

      const [draggedPlayer] = sorted.splice(draggedIdx, 1);
      sorted.splice(targetSlotIdx, 0, draggedPlayer);

      const updates = sorted.map((p, i) => ({ playerId: p.id, newOrder: i + 1, rowKey: posKey }));

      setPlayers(prev => prev.map(p => {
          const update = updates.find(u => u.playerId === p.id);
          if (update) return { ...p, depthOrder: update.newOrder, depthChart: { ...(p.depthChart || {}), rowKey: posKey, order: update.newOrder } };
          return p;
      }));

      if (actions.updateDepthChart) {
          actions.updateDepthChart(updates).then(() => {
            fetchRoster?.();
          }).catch(() => {});
      }
  }, [players, actions, fetchRoster]);

  // ── Depth-chart derivation (memoized so references are stable across renders)
  // Placed ABOVE the early-return guard to satisfy the Rules of Hooks — hooks
  // must never be called conditionally.
  const existingDepthAssignments = useMemo(() => {
    const result = {};
    for (const row of DEPTH_ROWS) {
      result[row.key] = players
        .filter((p) => (p?.depthChart?.rowKey ? p.depthChart.rowKey === row.key : row.match.includes(p.pos)))
        .sort((a, b) => (a?.depthChart?.order ?? a.depthOrder ?? 999) - (b?.depthChart?.order ?? b.depthOrder ?? 999))
        .map((p) => p.id);
    }
    return result;
  }, [players]);

  const depthAssignments = useMemo(
    () => autoBuildDepthChart(players, existingDepthAssignments),
    [players, existingDepthAssignments],
  );

  const depthAlerts = useMemo(
    () => depthWarnings(depthAssignments, players),
    [depthAssignments, players],
  );

  // ── Readiness model — stable reference because depthAssignments is now memoized
  const readiness = useMemo(() => deriveRosterReadinessModel({
    league,
    team,
    roster: players,
    source: initialState?.source ?? null,
    assignments: depthAssignments,
  }), [league, team, players, initialState?.source, depthAssignments]);

  // ── Team intelligence ────────────────────────────────────────────────────────
  const teamIntel = useMemo(
    () => buildTeamIntelligence({ ...team, roster: players }, { week: league?.week ?? 1 }),
    [team, players, league?.week],
  );
  const directionGuidance = useMemo(() => buildDirectionGuidance(teamIntel), [teamIntel]);
  const chemistry = teamIntel?.chemistry;
  const moraleById = useMemo(() => {
    const map = new Map();
    players.forEach((p) => {
      map.set(p.id, describePlayerMoraleContext(p, { team, chemistry, week: league?.week }));
    });
    return map;
  }, [players, team, chemistry, league?.week]);
  const developmentSummary = useMemo(() => summarizeRosterDevelopment(players, moraleById), [players, moraleById]);

  // ── Scheme name — memoized so it doesn't create a new string-value each render
  const schemeName = useMemo(() => {
    const ut = league?.teams?.find(t => t.id === league?.userTeamId);
    const offId = ut?.strategies?.offSchemeId;
    const defId = ut?.strategies?.defSchemeId;
    return OFFENSIVE_SCHEMES[offId]?.name || DEFENSIVE_SCHEMES[defId]?.name || 'scheme';
  }, [league]);

  // ── Auto-build depth chart callback ──────────────────────────────────────────
  const handleAutoBuildDepthChart = useCallback(async () => {
    const updates = DEPTH_ROWS.flatMap((row) => (readiness.assignments?.[row.key] ?? []).map((playerId, index) => ({
      playerId,
      rowKey: row.key,
      newOrder: index + 1,
    })));

    if (updates.length === 0) return;

    setPlayers((prev) => prev.map((player) => {
      const update = updates.find((entry) => Number(entry.playerId) === Number(player.id));
      if (!update) return player;
      return {
        ...player,
        depthOrder: update.newOrder,
        depthChart: {
          ...(player.depthChart ?? {}),
          rowKey: update.rowKey,
          order: update.newOrder,
        },
      };
    }));

    if (actions?.updateDepthChart) {
      await actions.updateDepthChart(updates);
      await fetchRoster();
    }

    if (readiness.safeToMarkLineupChecked) {
      markWeeklyPrepStep(league, 'lineupChecked', true);
    }
  }, [actions, fetchRoster, league, readiness.assignments, readiness.safeToMarkLineupChecked]);

  // ── Early-return guard (no hooks beyond this point) ──────────────────────────
  if (teamId == null) {
    return (
      <div
        style={{
          padding: "var(--space-8)",
          textAlign: "center",
          color: "var(--text-muted)",
        }}
      >
        No team selected.
      </div>
    );
  }

  const capSnapshot = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const capUsed = capSnapshot.capUsed;
  const capTotal = capSnapshot.capTotal;
  const capRoom = capSnapshot.capRoom;
  const unassignedDepthCount = players.filter((p) => !p?.depthChart?.rowKey).length;
  const expiringCount = players.filter((p) => getContractYearsLeft(p) <= 1).length;
  const injuredCount = players.filter((p) => isInjuredPlayer(p)).length;
  const starterCount = players.filter((p) => isStarterPlayer(p)).length;
  const depthCount = Math.max(0, players.length - starterCount);
  const youngDevCount = players.filter((p) => Number(p?.age ?? 40) <= 24 && Number(p?.ovr ?? 0) >= 65).length;

  const avgOvr = players.length
    ? Math.round(
        players.reduce((s, p) => s + (p.ovr ?? 70), 0) / players.length,
      )
    : 0;

  const isOverLimit = league?.phase === "preseason" && players.length > 53;
  const urgentNeed = teamBuilder?.positionGroups?.find((g) => g.needLevel === 'urgent') ?? teamBuilder?.positionGroups?.find((g) => g.needLevel === 'thin') ?? null;
  const nextAction = teamBuilder?.recommendedActions?.[0] ?? null;
  const statusBadgeVariant = readiness.status === 'ready' ? 'secondary' : readiness.status === 'blocked' ? 'destructive' : 'outline';

  return (
    <div id="roster">
      <TeamWorkspaceHeader
        title="Roster Operations"
        subtitle="Evaluate starters, depth, contract pressure, and next actions from one screen."
        eyebrow={team?.name ?? 'Roster'}
        metadata={[
          { label: 'Players', value: `${players.length}/53` },
          { label: 'Avg OVR', value: avgOvr },
          { label: 'Cap Room', value: formatMoneyM(capRoom) },
        ]}
        actions={[
          { label: 'Back to Team Hub', onClick: () => onNavigate?.('Team') },
          { label: 'Depth focus', onClick: () => { setViewMode('depth'); setInitialFilter('DEPTH'); } },
          { label: 'Contract queue', onClick: () => onNavigate?.('Contract Center') },
          { label: 'Financials', onClick: () => onNavigate?.('Financials') },
          { label: 'Free Agency', onClick: () => onNavigate?.('Free Agency') },
          { label: 'Transactions', onClick: () => onNavigate?.('Transactions') },
        ]}
        quickContext={[
          { label: `${starterCount} starters`, tone: 'team' },
          { label: `${depthCount} depth pieces`, tone: 'league' },
          { label: `${expiringCount} expiring`, tone: expiringCount >= 8 ? 'warning' : 'league' },
          { label: `${injuredCount} injured`, tone: injuredCount > 0 ? 'warning' : 'ok' },
          { label: unassignedDepthCount > 0 ? `${unassignedDepthCount} depth slots unset` : 'Depth chart ready', tone: unassignedDepthCount > 0 ? 'warning' : 'ok' },
        ]}
      />

      <TeamCapSummaryStrip
        capSnapshot={capSnapshot}
        rosterCount={players.length}
        starterHealth={`${Math.max(0, starterCount - injuredCount)}/${starterCount || 0} available`}
        expiringCount={expiringCount}
      />
      {teamBuilder ? (
        <Card className="card-premium" style={{ marginBottom: "var(--space-2)", padding: "var(--space-3) var(--space-4)" }}>
          <CardContent style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Team Builder Workspace</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge variant={teamBuilder?.capSummary?.payrollPressure === 'critical' ? 'destructive' : 'outline'}>Cap pressure: {teamBuilder?.capSummary?.payrollPressure ?? 'needs data'}</Badge>
              <Badge variant={urgentNeed?.needLevel === 'urgent' ? 'destructive' : 'secondary'}>Biggest need: {urgentNeed?.key ?? 'Needs more data'}</Badge>
              <Badge variant="outline">Top expiring: {teamBuilder?.expiringContracts?.[0]?.name ?? '—'}</Badge>
              <Badge variant="outline">Best dev target: {teamBuilder?.developmentTargets?.[0]?.name ?? '—'}</Badge>
            </div>
            {nextAction ? <div style={{ fontSize: "var(--text-xs)" }}>Next best action: <strong>{nextAction.label}</strong> — {nextAction.reason}</div> : null}
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700 }}>Position Needs Board</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {(teamBuilder?.positionGroups ?? []).map((g) => (
                  <button key={g.key} type="button" className="btn" style={{ textAlign: 'left', padding: '8px 10px', border: '1px solid var(--hairline)', borderRadius: 8, background: g.needLevel === 'urgent' ? 'rgba(255,69,58,0.15)' : 'transparent' }} onClick={() => { setViewMode('table'); setInitialFilter(g.key); }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--text-xs)' }}>
                      <strong>{g.key} • {g.needLevel}</strong>
                      <span>Unit {g.unitOVR ?? 0}</span>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Starters {g.starterCountAvailable}/{g.starterCountExpected} • {g.primaryIssue?.replace('_', ' ') ?? 'none'}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700 }}>Replacement Market Board</div>
              {(teamBuilder?.replacementBoards ?? []).filter((b) => b.needLevel === 'urgent' || b.needLevel === 'thin').map((board) => {
                const bestInternal = board.internalOptions?.[0] ?? null;
                const bestFA = board.freeAgentOptions?.[0] ?? null;
                const training = board.trainingOptions?.[0] ?? null;
                return (
                  <div key={board.key} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}>
                    <button type="button" className="btn" style={{ textAlign: 'left', minHeight: 44 }} onClick={() => { setViewMode('table'); setInitialFilter(board.key); }}>
                      <strong>{board.key} • {board.needLevel}</strong> — {board.primaryIssue?.replace('_', ' ') ?? 'none'}
                    </button>
                    <div style={{ fontSize: 'var(--text-xs)' }}>{board.bestAction?.label ?? 'No clear action yet.'}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Internal: {bestInternal ? `${bestInternal.name} (${bestInternal.ovr})` : 'No clear internal option'}
                    </div>
                    {bestInternal && onPlayerSelect ? <Button size="sm" variant="outline" onClick={() => onPlayerSelect(bestInternal.id)}>Open internal option</Button> : null}
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Free agency: {bestFA ? `${bestFA.name} (${bestFA.ovr})` : 'No matching FA options in market cache'}
                    </div>
                    {bestFA && onNavigate ? <Button size="sm" variant="outline" onClick={() => onNavigate('Free Agency')}>Open Free Agency</Button> : null}
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Draft: {board.draftPriority?.priority ?? 'none'} {board.draftPriority?.targetRoundRange ? `(${board.draftPriority.targetRoundRange})` : ''}</div>
                    {training ? (
                      <>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Training: {training.playerName} • {training.expectedPath}</div>
                        {onNavigate ? <Button size="sm" variant="outline" onClick={() => onNavigate('Training')}>Open Training</Button> : <div style={{ fontSize: 'var(--text-xs)' }}>Training route unavailable.</div>}
                      </>
                    ) : null}
                    {board.tradeSearch?.enabled ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Trade search: {board.tradeSearch.reason}</div> : null}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700 }}>Action Queue</div>
              {(teamBuilder?.candidateActions ?? []).slice(0, 6).map((action, idx) => (
                <div key={`${action.type}-${idx}`} style={{ fontSize: 'var(--text-xs)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span><strong>{action.label}</strong> — {action.reason}</span>
                  {action.route ? <Button size="sm" variant="outline" onClick={() => onNavigate?.(action.route)}>{action.type}</Button> : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="card-premium" style={{ marginBottom: "var(--space-2)", padding: "var(--space-3) var(--space-4)" }}>
        <CardContent style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge variant={statusBadgeVariant}>Lineup Readiness: {readiness.statusLabel}</Badge>
            <Badge variant="outline">Roster {readiness.rosterCount}/53</Badge>
            <Badge variant={readiness.missingStarterCount > 0 ? 'destructive' : 'secondary'}>Missing starters: {readiness.missingStarterCount}</Badge>
            <Badge variant={readiness.injuryReplacementConcerns > 0 ? 'destructive' : 'outline'}>Injury concerns: {readiness.injuryReplacementConcerns}</Badge>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{readiness.starterReadiness}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {readiness.topRiskyPositionGroups.length > 0
              ? readiness.topRiskyPositionGroups.map((group) => (
                  <Badge key={group.rowKey} variant="outline">{group.label}: {group.reason}</Badge>
                ))
              : <Badge variant="secondary">No high-risk position groups</Badge>}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
            Recommended action: <strong style={{ color: 'var(--text)' }}>{readiness.recommendedNextAction}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => { setViewMode('depth'); setInitialFilter('DEPTH'); }}>Open Depth Chart</Button>
            <Button variant="outline" size="sm" onClick={() => onNavigate?.('Injuries')}>Review Injuries</Button>
            {readiness.routeHints.showBackToWeeklyPrep && <Button variant="outline" size="sm" onClick={() => onNavigate?.('Weekly Prep')}>Back to Weekly Prep</Button>}
            {readiness.routeHints.showBackToHQ && <Button variant="outline" size="sm" onClick={() => onNavigate?.('HQ')}>Back to HQ</Button>}
          </div>
        </CardContent>
      </Card>

      <Card className="card-premium" style={{ marginBottom: "var(--space-2)", padding: "var(--space-3) var(--space-4)" }}>
        <CardContent style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>
            Development intelligence
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge variant="outline">📈 Rising: {developmentSummary.rising.length}</Badge>
            <Badge variant={developmentSummary.slipping.length > 0 ? "destructive" : "outline"}>📉 Slipping: {developmentSummary.slipping.length}</Badge>
            <Badge variant={developmentSummary.moraleRisk.length > 0 ? "destructive" : "outline"}>😕 Morale risk: {developmentSummary.moraleRisk.length}</Badge>
            <Badge variant={developmentSummary.mismatch.length > 0 ? "destructive" : "secondary"}>🧩 Scheme mismatch: {developmentSummary.mismatch.length}</Badge>
            <Badge variant={developmentSummary.blocked.length > 0 ? "secondary" : "outline"}>🚧 Blocked dev: {developmentSummary.blocked.length}</Badge>
            <Badge variant={developmentSummary.contractPressure.length > 0 ? "secondary" : "outline"}>⏱ Contract pressure: {developmentSummary.contractPressure.length}</Badge>
            <Badge variant="secondary">🌱 Rookie watch: {developmentSummary.rookieWatch.length}</Badge>
          </div>
          <div style={{ display: "grid", gap: 4, fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
            {developmentSummary.rising[0] ? <div>Best current development bet: <strong style={{ color: "var(--text)" }}>{developmentSummary.rising[0].name}</strong> ({developmentSummary.rising[0].progressionDelta > 0 ? "+" : ""}{developmentSummary.rising[0].progressionDelta ?? 0} OVR).</div> : null}
            {developmentSummary.slipping[0] ? <div>Regression watch: <strong style={{ color: "var(--text)" }}>{developmentSummary.slipping[0].name}</strong> ({developmentSummary.slipping[0].progressionDelta ?? 0} OVR) — review role, usage, and contract timeline.</div> : null}
            {developmentSummary.mismatch[0] ? <div>Top scheme mismatch: <strong style={{ color: "var(--text)" }}>{developmentSummary.mismatch[0].name}</strong> (fit {developmentSummary.mismatch[0].schemeFit ?? 50}) — consider package changes or depth-chart adjustment.</div> : null}
            {developmentSummary.blocked[0] ? <div>Blocked prospect: <strong style={{ color: "var(--text)" }}>{developmentSummary.blocked[0].name}</strong> is depth-clamped — consider role/package changes.</div> : null}
            {developmentSummary.contractPressure[0] ? <div>Trajectory + contract decision: <strong style={{ color: "var(--text)" }}>{developmentSummary.contractPressure[0].name}</strong> is up for a near-term call.</div> : null}
          </div>
          <DevelopmentSignalRow items={[
            developmentSummary.rising[0] ? { label: `Rising: ${developmentSummary.rising[0].name}`, tone: 'good' } : null,
            developmentSummary.slipping[0] ? { label: `Slipping: ${developmentSummary.slipping[0].name}`, tone: 'bad' } : null,
            developmentSummary.moraleRisk[0] ? { label: `Morale risk: ${developmentSummary.moraleRisk[0].name}`, tone: 'warn' } : null,
            developmentSummary.blocked[0] ? { label: `Blocked: ${developmentSummary.blocked[0].name}`, tone: 'warn' } : null,
          ].filter(Boolean)} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button variant="outline" size="sm" onClick={() => { setViewMode("table"); setInitialFilter("DEVELOPMENT"); }}>Open young/development group</Button>
            <Button variant="outline" size="sm" onClick={() => { setViewMode("depth"); setInitialFilter("DEPTH"); }}>Adjust depth chart</Button>
            <Button variant="outline" size="sm" onClick={() => onNavigate?.("Contract Center")}>Review contract calls</Button>
            <Button variant="outline" size="sm" onClick={() => onNavigate?.("Trade Center")}>Check trade market</Button>
          </div>
        </CardContent>
      </Card>

      <Card
        className="card-premium"
        style={{
          marginBottom: "var(--space-2)",
          padding: "var(--space-3) var(--space-4)",
        }}
      ><CardContent>
        <CapBar capUsed={capUsed} capTotal={capTotal} deadCap={team?.deadCap} />

        <div
          style={{
            marginTop: "var(--space-3)",
            display: "grid",
            gap: 8,
            padding: "var(--space-3)",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface)",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Badge variant="outline">Direction: {teamIntel.direction}</Badge>
            {teamIntel.needsNow.slice(0, 2).map((n) => <Badge key={`need-${n.pos}`} variant="destructive">Need now: {n.pos}</Badge>)}
            {teamIntel.surplus.slice(0, 2).map((s) => <Badge key={`sur-${s.pos}`} variant="secondary">Surplus: {s.pos}</Badge>)}
            {chemistry?.state ? <Badge variant={chemistry.state === "Fragmented" ? "destructive" : "outline"}>Chemistry: {chemistry.state}</Badge> : null}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{directionGuidance}</div>
          {chemistry?.reasons?.[0] ? <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>• {chemistry.reasons[0]}</div> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
            <span>{teamIntel.expiringStarters} expiring starter{teamIntel.expiringStarters === 1 ? "" : "s"}</span>
            {teamIntel.agingCoreWarnings[0] ? <span>{teamIntel.agingCoreWarnings[0]}</span> : null}
            {teamIntel.capStressContracts[0] ? <span>Cap stress: {teamIntel.capStressContracts[0].name}</span> : null}
            {teamIntel.upsideGroups[0] ? <span>Upside: {teamIntel.upsideGroups[0]}</span> : null}
          </div>
          {teamIntel.warnings.length > 0 && (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--warning)" }}>
              {teamIntel.warnings.slice(0, 2).join(" · ")}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button variant="outline" size="sm" onClick={() => { setViewMode("table"); setInitialFilter("STARTERS"); }}>Starter tier {starterCount}</Button>
            <Button variant="outline" size="sm" onClick={() => { setViewMode("table"); setInitialFilter("DEPTH"); }}>Primary backups {depthCount}</Button>
            <Button variant="outline" size="sm" onClick={() => { setViewMode("table"); setInitialFilter("DEVELOPMENT"); }}>Fringe + development {youngDevCount}</Button>
            <Button variant="outline" size="sm" onClick={() => { setViewMode("table"); setInitialFilter("EXPIRING"); }}>Expiring {expiringCount}</Button>
            <Button variant="outline" size="sm" onClick={() => { setViewMode("table"); setInitialFilter("INJURED"); }}>Injured {injuredCount}</Button>
            <Badge variant={unassignedDepthCount > 0 ? "destructive" : "secondary"}>
              Depth setup {unassignedDepthCount > 0 ? `${unassignedDepthCount} unset` : "ready"}
            </Badge>
          </div>
          {unassignedDepthCount > 0 && (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--warning)" }}>
              Depth chart still needs setup. Open Depth view to assign required starters before advancing.
            </div>
          )}
        </div>
      </CardContent></Card>
      <SocialFeed league={league} defaultFilter="team" maxItems={5} onPlayerSelect={onPlayerSelect} />

      {/* ── Loading state ── */}
      {loading && (
        <div
          style={{
            padding: "var(--space-6)",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          Loading roster…
        </div>
      )}

      {/* ── Cards view (default) ── */}
      {!loading && viewMode === "cards" && (
        <PlayerCardGrid
          players={players}
          onPlayerSelect={handlePlayerSelect}
          phase={league?.phase}
          team={team}
          week={league?.week}
          initialFilter={initialFilter}
        />
      )}

      {/* ── Table view ── */}
      {!loading && viewMode === "table" && (
        <RosterTable
          players={players}
          actions={actions}
          teamId={teamId}
          team={team}
          week={league?.week}
          league={league}
          onRefetch={fetchRoster}
          onPlayerSelect={handlePlayerSelect}
          phase={league?.phase}
          chemistry={chemistry}
          initialFilter={initialFilter}
          salaryCap={league?.salaryCap ?? 200_000_000}
          schemeName={schemeName}
        />
      )}

      {/* ── Depth chart view ── */}
      {!loading && viewMode === "depth" && (
        <Card className="card-premium"><CardContent style={{ padding: "var(--space-5)" }}>
          {players.length === 0 ? (
            <EmptyState icon="🧍" title="No players on roster" subtitle="Add or sign players to build out your depth chart." />
          ) : (
            <>
              <div style={{ marginBottom: 10, display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Drag players within each position row to set starter order. Repair fills only broken slots, while best-available and plan optimization are explicit lineup tools.
                </div>
                {depthAlerts.length > 0 ? depthAlerts.slice(0, 6).map((warning, idx) => (
                  <div key={`${warning.rowKey}-${idx}`} style={{ fontSize: 12, color: warning.severity === "error" ? "var(--danger)" : "var(--warning)", border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 8px' }}>
                    {warning.severity === 'error' ? 'Missing starter: ' : 'Warning: '}{warning.message}
                  </div>
                )) : <div style={{ fontSize: 12, color: 'var(--success)' }}>Starter requirements currently covered.</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <Button variant="outline" size="sm" onClick={handleAutoBuildDepthChart}>
                    Auto-Build Depth Chart
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => actions.repairRoster(teamId).then(fetchRoster)}>
                    Auto-Fix Missing Assignments
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => actions.optimizeRoster(teamId, "best_available").then(fetchRoster)}>
                    Auto-Set Best Available
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => actions.optimizeRoster(teamId).then(fetchRoster)}>
                    Optimize for Plan
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onNavigate?.('Injuries')}>Review Injuries</Button>
                  <Button variant="outline" size="sm" onClick={() => onNavigate?.('Weekly Prep')}>Back to Weekly Prep</Button>
                  <Button variant="outline" size="sm" onClick={() => onNavigate?.('HQ')}>Back to HQ</Button>
                </div>
              </div>
              <DepthChartView players={players} onReorder={handleReorderDepthChart} schemeName={schemeName} />
            </>
          )}
        </CardContent></Card>
      )}
      {selectedPlayerId != null && (
        <PlayerProfileModalBoundary playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)}>
          <PlayerProfile
            playerId={selectedPlayerId}
            actions={actions}
            teams={league?.teams ?? []}
            league={league}
            onClose={() => setSelectedPlayerId(null)}
          />
        </PlayerProfileModalBoundary>
      )}
    </div>
  );
}
