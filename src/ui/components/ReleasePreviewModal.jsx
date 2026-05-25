import React from "react";
import {
  calculateReleaseDeadCap,
  getActiveCapHit,
  getAnnualBaseSalary,
  getAnnualBonusProration,
  getContractYearsRemaining,
} from "../../core/contracts/contractObligations.js";
import { formatMoneyM } from "../utils/numberFormatting.js";

function metricLabelStyle() {
  return { fontSize: "var(--text-xs)", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.06em" };
}

export default function ReleasePreviewModal({
  open,
  player,
  capRoomNow = 0,
  onCancel,
  onConfirm,
}) {
  if (!open || !player) return null;

  const yearsRemaining = getContractYearsRemaining(player);
  const baseSalary = getAnnualBaseSalary(player);
  const annualBonus = getAnnualBonusProration(player);
  const activeCapHit = getActiveCapHit(player);
  const deadCap = calculateReleaseDeadCap(player)?.total ?? 0;
  const projectedCapRoom = capRoomNow + Math.max(0, activeCapHit - deadCap);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Release preview for ${player.name}`} style={{
      position: "fixed",
      inset: 0,
      background: "rgba(5,10,20,0.72)",
      zIndex: 9000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "var(--space-3)",
    }}>
      <div style={{
        width: "min(520px, 100%)",
        maxHeight: "90vh",
        overflowY: "auto",
        background: "var(--surface-2)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-4)",
      }}>
        <h2 style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-lg)", fontWeight: 800 }}>Release Preview (Estimate)</h2>
        <p style={{ marginBottom: "var(--space-3)", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
          Exact processing follows league release rules. This is an estimated cap-impact preview.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <div><div style={metricLabelStyle()}>Player</div><div style={{ fontWeight: 700 }}>{player.name ?? "Unknown"}</div></div>
          <div><div style={metricLabelStyle()}>Position</div><div style={{ fontWeight: 700 }}>{player.pos ?? "—"}</div></div>
          <div><div style={metricLabelStyle()}>OVR</div><div style={{ fontWeight: 700 }}>{Number(player.ovr ?? 0)}</div></div>
          <div><div style={metricLabelStyle()}>Years Left</div><div style={{ fontWeight: 700 }}>{Math.max(0, yearsRemaining)}</div></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <div><div style={metricLabelStyle()}>Current Base Salary</div><div>{formatMoneyM(baseSalary)}</div></div>
          <div><div style={metricLabelStyle()}>Annual Signing Bonus Proration</div><div>{formatMoneyM(annualBonus)}</div></div>
          <div><div style={metricLabelStyle()}>Active Cap Hit</div><div>{formatMoneyM(activeCapHit)}</div></div>
          <div><div style={metricLabelStyle()}>Estimated Dead Cap</div><div>{formatMoneyM(deadCap)}</div></div>
          <div><div style={metricLabelStyle()}>Active Cap Room</div><div>{formatMoneyM(capRoomNow)}</div></div>
          <div><div style={metricLabelStyle()}>Projected Cap Room Preview</div><div>{formatMoneyM(projectedCapRoom)}</div></div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Confirm Release</button>
        </div>
      </div>
    </div>
  );
}
