import React from "react";
import TraitBadge from "../components/TraitBadge";
import PlayerPreview from "../components/PlayerPreview";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { POS_COLORS } from "../constants/positionColors.js";
import { ScoutBadge, ProspectScoutingChips } from "./ScoutBadge.jsx";
import { OvrBadge } from "./DraftBadges.jsx";
import { DRAFT_ROOM_PHASES } from "./draftShared.js";

export function ProspectRow({
  prospect: p,
  rank,
  boardRank,
  isUserPick,
  isDraftComplete,
  draftPhase,
  onDraftPlayer,
  onPlayerClick,
  compareIds,
  onToggleCompare,
  onMoveUp,
  onMoveDown,
  disabled,
  userTeam,
  isRecommended,
  isTopByPos,
}) {
  const rowStyle = isRecommended
    ? { background: "rgba(52,199,89,0.1)" }
    : isTopByPos
    ? { background: "rgba(10,132,255,0.08)" }
    : undefined;

  const canDraft = draftPhase === DRAFT_ROOM_PHASES.ON_THE_CLOCK && isUserPick;

  return (
    <TableRow style={rowStyle}>
      <TableCell style={{ textAlign: "center", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
        {boardRank}
      </TableCell>
      <TableCell style={{ textAlign: "center", color: "var(--text-subtle)", paddingLeft: "var(--space-3)", fontSize: "var(--text-xs)", fontWeight: 700 }}>
        {rank}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          style={{ display: "inline-block", padding: "1px 6px", borderRadius: "var(--radius-pill)", background: `${POS_COLORS[p.pos] ?? "#666"}22`, fontSize: "var(--text-xs)", fontWeight: 700, color: POS_COLORS[p.pos] ?? "var(--text-muted)", border: `1px solid ${POS_COLORS[p.pos] ?? "#666"}55`, fontFamily: "var(--font-mono)" }}
        >
          {p.pos}
        </Badge>
      </TableCell>
      <TableCell
        style={{ fontWeight: 600, color: onPlayerClick ? "var(--accent)" : "var(--text)", cursor: onPlayerClick ? "pointer" : "default" }}
        onClick={() => onPlayerClick && onPlayerClick(p.id)}
        title={onPlayerClick ? `View ${p.name}'s profile` : undefined}
      >
        <PlayerPreview player={p}>
          <span style={{ textDecoration: onPlayerClick ? "underline" : "none", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>
            {p.name}
          </span>
        </PlayerPreview>
      </TableCell>
      <TableCell style={{ textAlign: "center", whiteSpace: "nowrap" }}>
        {(p.traits || []).map((t) => <TraitBadge key={t} traitId={t} />)}
      </TableCell>
      <TableCell style={{ color: "var(--text-muted)" }}>{p.age}</TableCell>
      <TableCell style={{ textAlign: "center" }}>
        <Button
          title={compareIds.includes(p.id) ? "Remove from compare" : "Add to compare"}
          onClick={() => onToggleCompare(p)}
          style={{ width: 22, height: 22, borderRadius: "var(--radius-sm)", border: `1.5px solid ${compareIds.includes(p.id) ? "var(--accent)" : "var(--hairline)"}`, background: compareIds.includes(p.id) ? "var(--accent-muted)" : "transparent", fontSize: 12, color: compareIds.includes(p.id) ? "var(--accent)" : "var(--text-subtle)" }}
        >
          {compareIds.includes(p.id) ? "✓" : "⊕"}
        </Button>
      </TableCell>
      <TableCell>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          {isDraftComplete ? (
            <OvrBadge ovr={p.ovr} />
          ) : (
            <>
              <ScoutBadge player={p} team={userTeam} />
              <ProspectScoutingChips prospect={p} team={userTeam} />
            </>
          )}
        </div>
      </TableCell>
      <TableCell style={{ color: "var(--text-subtle)", fontSize: "var(--text-xs)" }}>
        {isDraftComplete ? (p.potential ?? "—") : "??"}
      </TableCell>
      <TableCell style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }} title="40-yard dash (seconds). Lower is better.">
        {p?.combineResults?.fortyTime ?? "—"}
      </TableCell>
      <TableCell style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }} title="Bench press reps at 225 lbs. Higher is better.">
        {p?.combineResults?.benchPress ?? "—"}
      </TableCell>
      <TableCell style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.college ?? p.origin ?? "—"}
      </TableCell>
      {isUserPick && !isDraftComplete && (
        <TableCell style={{ textAlign: "right", paddingRight: "var(--space-3)" }}>
          <Button
            className="btn btn-primary"
            disabled={!canDraft || disabled}
            style={{ padding: "3px 12px", fontSize: "var(--text-xs)" }}
            onClick={() => onDraftPlayer(p.id)}
          >
            {disabled ? "Drafting…" : "Draft"}
          </Button>
          <div style={{ display: "inline-flex", marginLeft: 8, gap: 4 }}>
            <Button className="btn" title="Move up board" onClick={onMoveUp} style={{ padding: "2px 6px", fontSize: 10 }}>↑</Button>
            <Button className="btn" title="Move down board" onClick={onMoveDown} style={{ padding: "2px 6px", fontSize: 10 }}>↓</Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

export default ProspectRow;
