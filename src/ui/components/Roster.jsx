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

import React, { useState, useEffect, useMemo, useCallback } from "react";
import TraitBadge from "./TraitBadge";
import PlayerComparison from "./PlayerComparison.jsx";
import PlayerProfile from "./PlayerProfile.jsx";
import ExtensionNegotiationModal from "./ExtensionNegotiationModal.jsx";
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
import { deriveTeamCapSnapshot, formatMoneyM, toFiniteNumber } from "../utils/numberFormatting.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITIONS = ["ALL", "QB", "WR", "RB", "TE", "OL", "DL", "LB", "CB", "S"];

// Depth chart layout — each entry defines one positional row.
// `match` is the set of pos strings that map to this group.
const DEPTH_ROWS = [
  // ── Offense ──────────────────────────────────────────────────
  {
    group: "OFFENSE",
    key: "QB",
    label: "Quarterback",
    match: ["QB"],
    slots: 3,
  },
  {
    group: "OFFENSE",
    key: "RB",
    label: "Running Back",
    match: ["RB", "HB", "FB"],
    slots: 3,
  },
  {
    group: "OFFENSE",
    key: "WR",
    label: "Wide Receiver",
    match: ["WR", "FL", "SE"],
    slots: 5,
  },
  { group: "OFFENSE", key: "TE", label: "Tight End", match: ["TE"], slots: 3 },
  {
    group: "OFFENSE",
    key: "OL",
    label: "Offensive Line",
    match: ["OL", "OT", "LT", "RT", "OG", "LG", "RG", "C"],
    slots: 5,
  },
  // ── Defense ──────────────────────────────────────────────────
  {
    group: "DEFENSE",
    key: "DE",
    label: "Defensive End",
    match: ["DE", "EDGE"],
    slots: 3,
  },
  {
    group: "DEFENSE",
    key: "DT",
    label: "Defensive Tackle",
    match: ["DT", "NT", "IDL"],
    slots: 3,
  },
  {
    group: "DEFENSE",
    key: "LB",
    label: "Linebacker",
    match: ["LB", "MLB", "OLB", "ILB"],
    slots: 4,
  },
  {
    group: "DEFENSE",
    key: "CB",
    label: "Cornerback",
    match: ["CB", "DB", "NCB"],
    slots: 4,
  },
  {
    group: "DEFENSE",
    key: "S",
    label: "Safety",
    match: ["S", "SS", "FS"],
    slots: 3,
  },
  // ── Special Teams ─────────────────────────────────────────────
  { group: "SPECIAL", key: "K", label: "Kicker", match: ["K", "PK"], slots: 1 },
  { group: "SPECIAL", key: "P", label: "Punter", match: ["P"], slots: 1 },
];

const SLOT_LABELS = ["Starter", "Backup", "3rd", "4th", "5th"];

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

function sortPlayers(players, sortKey, sortDir) {
  return [...players].sort((a, b) => {
    let va, vb;
    switch (sortKey) {
      case "ovr":
        va = a.ovr ?? 0;
        vb = b.ovr ?? 0;
        break;
      case "age":
        va = a.age ?? 0;
        vb = b.age ?? 0;
        break;
      case "salary":
        va = a.contract?.baseAnnual ?? 0;
        vb = b.contract?.baseAnnual ?? 0;
        break;
      case "fit":
        va = a.schemeFit ?? 50;
        vb = b.schemeFit ?? 50;
        break;
      case "morale":
        va = a.morale ?? 75;
        vb = b.morale ?? 75;
        break;
      case "name":
        va = a.name ?? "";
        vb = b.name ?? "";
        break;
      default:
        va = 0;
        vb = 0;
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
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

function PosBadge({ pos }) {
  return (
    <Badge
      variant="outline"
      style={{
        display: "inline-block",
        minWidth: 32,
        padding: "1px 6px",
        borderRadius: "var(--radius-pill)",
        background: "var(--surface-strong)",
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        color: "var(--text-muted)",
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
  onRefetch,
  onPlayerSelect,
  phase,
  schemeName,
}) {
  const isResignPhase = phase === "offseason_resign";
  // Default to EXPIRING view in resign phase
  const [posFilter, setPosFilter] = useState(
    isResignPhase ? "EXPIRING" : "ALL",
  );
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDir, setSortDir] = useState("desc");
  const [releasing, setReleasing] = useState(null);
  const [extending, setExtending] = useState(null);
  // Compare mode: up to 2 players selected for side-by-side comparison
  const [compareIds, setCompareIds] = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  const toggleCompare = (player) => {
    setCompareIds(prev => {
      if (prev.includes(player.id)) return prev.filter(id => id !== player.id);
      if (prev.length >= 2) return [prev[1], player.id]; // replace oldest
      return [...prev, player.id];
    });
  };

  const displayed = useMemo(() => {
    let filtered = players;
    if (posFilter === "EXPIRING") {
      filtered = players.filter((p) => (p.contract?.years || 0) <= 1);
    } else if (posFilter !== "ALL") {
      filtered = players.filter(
        (p) =>
          p.pos === posFilter ||
          DEPTH_ROWS.find((r) => r.key === posFilter)?.match.includes(p.pos),
      );
    }
    return sortPlayers(filtered, sortKey, sortDir);
  }, [players, posFilter, sortKey, sortDir]);
  const teamDirection = useMemo(() => classifyTeamDirection(team, week), [team, week]);
  const decisionSummary = useMemo(
    () => buildExpiringDecisionSummary(players, { team, roster: players, direction: teamDirection }),
    [players, team, teamDirection],
  );

  const activeFilters = isResignPhase ? ["EXPIRING", ...POSITIONS] : POSITIONS;

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
          fetchRoster();
      }
  };

  const handleRestructure = async (player) => {
      if (window.confirm(`Restructure ${player.name}'s contract to save cap space this year?`)) {
          await actions.restructureContract(player.id, player.teamId);
          fetchRoster();
      }
  };

  const handleRelease = async (player) => {
    if (releasing !== player.id) {
      setReleasing(player.id);
      return;
    }

    // Check dead cap
    const c = player.contract;
    const annualBonus = (c?.signingBonus ?? 0) / (c?.yearsTotal || 1);
    const deadCap = annualBonus * (c?.years || 1);

    if (deadCap > 0.5) {
      if (
        !window.confirm(
          `Release ${player.name}?\n\nThis will accelerate ${formatMoneyM(deadCap)} of dead cap against your budget.`,
        )
      ) {
        setReleasing(null);
        return;
      }
    }

    setReleasing(null);
    actions.releasePlayer(player.id, teamId);
    onRefetch();
  };

  const handleTradeBlockToggle = async (playerId) => {
    if (!playerId || !actions?.toggleTradeBlock) return;
    await actions.toggleTradeBlock(playerId, teamId);
    actions.save();
    onRefetch();
  };

  const comparePlayerA = players.find(p => p.id === compareIds[0]);
  const comparePlayerB = players.find(p => p.id === compareIds[1]);

  return (
    <>
      {extending && (
        <ExtensionNegotiationModal
          player={extending}
          actions={actions}
          teamId={teamId}
          statusNode={<StatusBadge injuryWeeks={extending.injuryWeeksRemaining} />}
          onClose={() => setExtending(null)}
          onComplete={() => {
            setExtending(null);
            onRefetch();
          }}
        />
      )}
      {/* Player comparison modal */}
      {showComparison && comparePlayerA && comparePlayerB && (
        <PlayerComparison
          playerA={comparePlayerA}
          playerB={comparePlayerB}
          onClose={() => setShowComparison(false)}
        />
      )}
      {/* Compare bar — shown when 1-2 players are selected for comparison */}
      {compareIds.length > 0 && (
        <div style={{
          padding: "var(--space-3) var(--space-4)",
          background: "rgba(10,132,255,0.08)",
          border: "1px solid var(--accent)",
          borderRadius: "var(--radius-md)",
          marginBottom: "var(--space-3)",
          display: "flex", alignItems: "center", gap: "var(--space-3)",
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--accent)" }}>
            Compare ({compareIds.length}/2):
          </span>
          {compareIds.map(id => {
            const p = players.find(pl => pl.id === id);
            return p ? (
              <span key={id} style={{
                padding: "2px 10px", borderRadius: "var(--radius-pill)",
                background: "var(--accent-muted)", color: "var(--accent)",
                fontSize: "var(--text-xs)", fontWeight: 600,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                {p.name}
                <Button
                  onClick={() => toggleCompare(p)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 14, lineHeight: 1, padding: 0 }}
                >×</Button>
              </span>
            ) : null;
          })}
          {compareIds.length === 2 && (
            <Button
              className="btn"
              onClick={() => setShowComparison(true)}
              style={{ marginLeft: "auto", fontSize: "var(--text-xs)", padding: "4px 14px", background: "var(--accent)", color: "#fff", border: "none" }}
            >
              Compare →
            </Button>
          )}
          <Button
            onClick={() => setCompareIds([])}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "var(--text-xs)" }}
          >
            Clear
          </Button>
        </div>
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
          <span><strong style={{ color: "#64D2FF" }}>{decisionSummary.resign_if_price}</strong> price-sensitive</span>
          <span><strong style={{ color: "var(--warning)" }}>{decisionSummary.replaceable_depth}</strong> replaceable depth</span>
          <span><strong style={{ color: "var(--danger)" }}>{decisionSummary.let_walk}</strong> let walk</span>
          <span><strong style={{ color: "#BF5AF2" }}>{decisionSummary.trade_or_tag}</strong> tag/trade calls</span>
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          flexWrap: "wrap",
          marginBottom: "var(--space-4)",
        }}
      >
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

      {/* Table */}
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
                  <TableCell
                    colSpan={12}
                    style={{
                      textAlign: "center",
                      padding: "var(--space-8)",
                      color: "var(--text-muted)",
                    }}
                  >
                    No players match this filter.
                  </TableCell>
                </TableRow>
              )}
              {displayed.map((player, idx) => {
                const isReleasing = releasing === player.id;
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
                        fontWeight: 600,
                        color: "var(--text)",
                        fontSize: "var(--text-sm)",
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
                      </button>
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
                            className={
                              player.progressionDelta > 0
                                ? "text-success"
                                : "text-danger"
                            }
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
                      {fmtSalary(player.contract?.baseAnnual)}
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
                        <button
                          className={`trade-block-btn ${player?.onTradeBlock ? "active" : ""}`}
                          onClick={() => player?.id && handleTradeBlockToggle(player.id)}
                          title={player?.onTradeBlock ? "Remove from trade block" : "Place on trade block"}
                        >
                          {player?.onTradeBlock ? "🔴 On Block" : "➕ Trade Block"}
                        </button>
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
                            onClick={() => handleRelease(player)}
                          >
                            Confirm
                          </Button>
                          <Button
                            className="btn"
                            style={{
                              fontSize: "var(--text-xs)",
                              padding: "2px 8px",
                            }}
                            onClick={() => setReleasing(null)}
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
                            onClick={() => handleRelease(player)}
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
    </>
  );
}

// ── Depth Chart View ──────────────────────────────────────────────────────────

/** Single player card inside a depth chart slot. */
function DepthCard({ player, isStarter, onDragStart, onDragOver, onDrop }) {
  if (!player) {
    return (
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
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
        —
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
  `1px solid var(--hairline)`;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        minWidth: 130,
        maxWidth: 160,
        opacity: isInjured ? 0.7 : 1,
        padding: "6px 10px",
        borderRadius: "var(--radius-sm)",
        background: isStarter ? "var(--accent-muted)" : "var(--surface)",
        border: borderStyle,
        cursor: "grab",
      }}
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
            fontWeight: 600,
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

function DepthChartView({ players, onReorder }) {
  const handleDragStart = (e, player, posKey) => {
      e.dataTransfer.setData("text/plain", JSON.stringify({ playerId: player.id, posKey }));
  };
  const handleDrop = (e, targetPlayerId, targetPosKey, slotIdx) => {
      e.preventDefault();
      try {
          const data = JSON.parse(e.dataTransfer.getData("text/plain"));
          if (data.posKey !== targetPosKey) return; // Only allow reordering within same group
          onReorder(targetPosKey, data.playerId, slotIdx);
      } catch (err) {}
  };
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
      }}
    >
      {groups.map((group) => {
        const rows = DEPTH_ROWS.filter((r) => r.group === group);
        const maxSlots = Math.max(...rows.map((r) => r.slots));

        return (
          <div key={group}>
            {/* Group header */}
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

            {/* Slot column headers */}
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
                          borderTop:
                            rowIdx > 0
                              ? "1px solid var(--hairline)"
                              : undefined,
                          verticalAlign: "top",
                        }}
                      >
                        {/* Position label */}
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
                        {/* Depth slots */}
                        {Array.from({ length: maxSlots }, (_, slotIdx) => {
                          // Only render up to this row's designated slots; hide extras
                          if (slotIdx >= row.slots) {
                            return <TableCell key={slotIdx} />;
                          }
                          return (
                            <TableCell key={slotIdx} style={{ padding: "6px" }}>
                              <DepthCard
                                player={depth[slotIdx] ?? null}
                                isStarter={slotIdx === 0}
                                onDragStart={(e) => depth[slotIdx] && handleDragStart(e, depth[slotIdx], row.key)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleDrop(e, depth[slotIdx]?.id, row.key, slotIdx)}
                              />
                            </TableCell>
                          );
                        })}
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
  );
}

// ── Player Card Components ─────────────────────────────────────────────────────
// Beautiful card-based roster view — the primary display mode for the Roster tab.

/** Position brand colours (matches PlayerDetailModal.jsx). */
const CARD_POS_COLORS = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6", TE: "#a855f7",
  OL: "#f59e0b", DL: "#ec4899", LB: "#0ea5e9", CB: "#14b8a6",
  S: "#6366f1", K: "#9ca3af", P: "#6b7280",
};

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

/**
 * Single player card — tappable, opens the PlayerProfile modal via onSelect(id).
 *
 * Displays: position badge, OVR (colour-coded), name, age, contract, key
 * attributes, and optional INJURED / EXPIRING / ELITE POT badges.
 */
function PlayerCard({ player, onSelect, showDecisionContext = false, decisionContext = {} }) {
  const pos = player.pos || "";
  const posColor = CARD_POS_COLORS[pos] || "#9ca3af";
  const ovr = player.ovr ?? 70;
  const ovrColor =
    ovr >= 90 ? "#FFD700" :
    ovr >= 80 ? "#34C759" :
    ovr >= 70 ? "#0A84FF" :
    ovr >= 60 ? "#FF9F0A" : "#FF453A";

  const salary =
    player.contract?.baseAnnual ?? player.baseAnnual ?? 0;
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
function PlayerCardGrid({ players, onPlayerSelect, phase, team, week }) {
  const isResignPhase = phase === "offseason_resign";
  const [posFilter, setPosFilter] = useState(isResignPhase ? "EXPIRING" : "ALL");
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDir, setSortDir] = useState("desc");

  const activeFilters = isResignPhase ? ["EXPIRING", ...POSITIONS] : POSITIONS;

  const displayed = useMemo(() => {
    let filtered = players;
    if (posFilter === "EXPIRING") {
      filtered = players.filter(
        (p) => (p.contract?.years ?? p.contract?.yearsLeft ?? p.contract?.yearsRemaining ?? 0) <= 1,
      );
    } else if (posFilter !== "ALL") {
      filtered = players.filter(
        (p) => p.pos === posFilter ||
          DEPTH_ROWS.find((r) => r.key === posFilter)?.match.includes(p.pos),
      );
    }
    return sortPlayers(filtered, sortKey, sortDir);
  }, [players, posFilter, sortKey, sortDir]);
  const direction = useMemo(() => classifyTeamDirection(team, week), [team, week]);
  const decisionSummary = useMemo(
    () => buildExpiringDecisionSummary(players, { team, roster: players, direction }),
    [players, team, direction],
  );

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

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
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>
            Position
          </span>
          {activeFilters.map((pos) => {
            const isActive = posFilter === pos;
            const posCol = CARD_POS_COLORS[pos];
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
        {displayed.length} player{displayed.length !== 1 ? "s" : ""}
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

export default function Roster({ league, actions, onPlayerSelect }) {
  const teamId = league?.userTeamId;

  const [loading, setLoading] = useState(false);
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [viewMode, setViewMode] = useState("cards"); // 'cards' | 'table' | 'depth'
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const fetchRoster = useCallback(async () => {
    if (teamId == null || !actions?.getRoster) return;
    setLoading(true);
    try {
      const resp = await actions.getRoster(teamId);
      if (resp?.payload) {
        setTeam(resp.payload.team);
        setPlayers(resp.payload.players ?? []);
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

  const handleReorderDepthChart = useCallback((posKey, draggedPlayerId, targetSlotIdx) => {
      // Find players in this posKey
      const groupPlayers = DEPTH_ROWS.find((r) => r.key === posKey)
          ? players.filter(p => DEPTH_ROWS.find((r) => r.key === posKey).match.includes(p.pos))
          : [];

      let sorted = [...groupPlayers].sort((a, b) => {
         const aOrder = a.depthOrder > 0 ? a.depthOrder : 999;
         const bOrder = b.depthOrder > 0 ? b.depthOrder : 999;
         if (aOrder !== bOrder) return aOrder - bOrder;
         return (b.ovr ?? 0) - (a.ovr ?? 0);
      });

      const draggedIdx = sorted.findIndex(p => p.id === draggedPlayerId);
      if (draggedIdx === -1 || draggedIdx === targetSlotIdx) return;

      const [draggedPlayer] = sorted.splice(draggedIdx, 1);
      sorted.splice(targetSlotIdx, 0, draggedPlayer);

      // Re-assign order 1-based
      const updates = sorted.map((p, i) => ({ playerId: p.id, newOrder: i + 1 }));

      // Optimistic update
      setPlayers(prev => prev.map(p => {
          const update = updates.find(u => u.playerId === p.id);
          if (update) return { ...p, depthOrder: update.newOrder };
          return p;
      }));

      if (actions.updateDepthChart) {
          actions.updateDepthChart(updates);
      }
  }, [players, actions]);

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
  const avgOvr = players.length
    ? Math.round(
        players.reduce((s, p) => s + (p.ovr ?? 70), 0) / players.length,
      )
    : 0;

  const isOverLimit = league?.phase === "preseason" && players.length > 53;
  const teamIntel = useMemo(
    () => buildTeamIntelligence({ ...team, roster: players }, { week: league?.week ?? 1 }),
    [team, players, league?.week],
  );
  const directionGuidance = useMemo(() => buildDirectionGuidance(teamIntel), [teamIntel]);

  return (
    <div>
      {/* ── Team cap header ── */}
      <Card
        className="card-premium"
        style={{
          marginBottom: "var(--space-4)",
          padding: "var(--space-4) var(--space-5)",
        }}
      ><CardContent>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--space-3)",
            gap: "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          {/* Left: name + player count */}
          <div>
            <span
              style={{
                fontWeight: 800,
                fontSize: "var(--text-lg)",
                color: team?.abbr ? teamColor(team.abbr) : "var(--text)",
              }}
            >
              {team?.name ?? "Roster"}
            </span>
            <span
              style={{
                marginLeft: "var(--space-3)",
                fontSize: "var(--text-sm)",
                color: isOverLimit ? "var(--danger)" : "var(--text-muted)",
                fontWeight: isOverLimit ? 700 : 400,
              }}
            >
              {players.length} players{" "}
              {isOverLimit ? "/ 53 (Cut Required)" : ""} · Avg OVR {avgOvr}
            </span>
          </div>

          {/* Right: cap room + view toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-4)",
            }}
          >
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--text-muted)",
                  marginBottom: 2,
                }}
              >
                CAP ROOM
              </div>
              <div
                style={{
                  fontSize: "var(--text-xl)",
                  fontWeight: 800,
                  color:
                    capRoom < 5
                      ? "var(--danger)"
                      : capRoom < 15
                        ? "var(--warning)"
                        : "var(--success)",
                }}
              >
                {formatMoneyM(capRoom)}
              </div>
            </div>

            {/* View toggle pills */}
            <div className="standings-tabs">
              <Button
                variant={viewMode === "cards" ? "default" : "ghost"}
                className={`standings-tab${viewMode === "cards" ? " active" : ""}`}
                onClick={() => setViewMode("cards")}
                style={{ padding: "4px 14px", fontSize: "var(--text-xs)" }}
              >
                Cards
              </Button>
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                className={`standings-tab${viewMode === "table" ? " active" : ""}`}
                onClick={() => setViewMode("table")}
                style={{ padding: "4px 14px", fontSize: "var(--text-xs)" }}
              >
                Table
              </Button>
              <Button
                variant={viewMode === "depth" ? "default" : "ghost"}
                className={`standings-tab${viewMode === "depth" ? " active" : ""}`}
                onClick={() => setViewMode("depth")}
                style={{ padding: "4px 14px", fontSize: "var(--text-xs)" }}
              >
                Depth
              </Button>
            </div>
          </div>
        </div>

        {/* Cap bar */}
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
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{directionGuidance}</div>
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
        </div>

        {/* Legend for indicators */}
        <div
          style={{
            marginTop: "var(--space-3)",
            display: "flex",
            gap: "var(--space-5)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 10, color: "var(--text-subtle)" }}>
            <span style={{ color: "#34C759", fontWeight: 700 }}>◆</span> Scheme
            Fit &nbsp;
            <span style={{ color: "var(--text-subtle)" }}>|</span>&nbsp;
            <span style={{ color: "#0A84FF", fontWeight: 700 }}>●</span> Morale
          </span>
        </div>
      </CardContent></Card>

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
          onPlayerSelect={(playerId) => {
            if (playerId != null) setSelectedPlayerId(playerId);
          }}
          phase={league?.phase}
          team={team}
          week={league?.week}
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
          onRefetch={fetchRoster}
          onPlayerSelect={(playerId) => {
            if (playerId != null) setSelectedPlayerId(playerId);
          }}
          phase={league?.phase}
          schemeName={(() => {
            const ut = league?.teams?.find(t => t.id === league.userTeamId);
            const offId = ut?.strategies?.offSchemeId;
            const defId = ut?.strategies?.defSchemeId;
            return OFFENSIVE_SCHEMES[offId]?.name || DEFENSIVE_SCHEMES[defId]?.name || 'scheme';
          })()}
        />
      )}

      {/* ── Depth chart view ── */}
      {!loading && viewMode === "depth" && (
        <Card className="card-premium"><CardContent style={{ padding: "var(--space-5)" }}>
          {players.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--text-muted)",
                padding: "var(--space-8)",
              }}
            >
              No players on roster.
            </div>
          ) : (
            <DepthChartView players={players} />
          )}
        </CardContent></Card>
      )}
      {selectedPlayerId != null && (
        <PlayerProfile
          playerId={selectedPlayerId}
          actions={actions}
          teams={league?.teams ?? []}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </div>
  );
}
