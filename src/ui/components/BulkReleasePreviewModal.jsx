import React, { useMemo, useState } from "react";
import {
  calculateReleaseDeadCap,
  getActiveCapHit,
  getAnnualBaseSalary,
  getAnnualBonusProration,
} from "../../core/contracts/contractObligations.js";
import { formatMoneyM } from "../utils/numberFormatting.js";

function metricLabelStyle() {
  return { fontSize: "var(--text-xs)", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.06em" };
}

export default function BulkReleasePreviewModal({ open, players = [], rosterCount = 0, onCancel, onConfirm }) {
  const [submitting, setSubmitting] = useState(false);
  const dedupedPlayers = useMemo(() => {
    const seen = new Set();
    return players.filter((p) => {
      const id = Number(p?.id);
      if (!Number.isFinite(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [players]);

  const totals = useMemo(() => dedupedPlayers.reduce((acc, player) => {
    const activeCapHit = getActiveCapHit(player);
    const deadCap = calculateReleaseDeadCap(player)?.total ?? 0;
    acc.active += activeCapHit;
    acc.dead += deadCap;
    return acc;
  }, { active: 0, dead: 0 }), [dedupedPlayers]);

  if (!open) return null;

  const projectedRosterCount = Math.max(0, rosterCount - dedupedPlayers.length);
  const warnings = dedupedPlayers.flatMap((player) => {
    const tags = [];
    const deadCap = calculateReleaseDeadCap(player)?.total ?? 0;
    if (Number(player?.ovr ?? 0) >= 82) tags.push("High OVR cut");
    if (Number(player?.depthOrder ?? 99) <= 1) tags.push("Projected starter");
    if (deadCap >= 7) tags.push("Large dead cap");
    if (Number(player?.age ?? 99) <= 24 && Number(player?.contract?.yearsTotal ?? player?.contract?.years ?? 0) >= 3) tags.push("Young/rookie-scale window");
    return tags.length ? [{ id: player.id, name: player.name, tags }] : [];
  });

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm?.(dedupedPlayers);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Bulk release preview" style={{ position: "fixed", inset: 0, background: "rgba(5,10,20,0.72)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-3)" }}>
      <div style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "var(--surface-2)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
        <h2 style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-lg)", fontWeight: 800 }}>Bulk Release Preview (Estimate)</h2>
        <div className="bulk-release-preview-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <div><div style={metricLabelStyle()}>Selected players</div><div>{dedupedPlayers.length}</div></div>
          <div><div style={metricLabelStyle()}>Current roster</div><div>{rosterCount}</div></div>
          <div><div style={metricLabelStyle()}>Projected roster</div><div>{projectedRosterCount}</div></div>
          <div><div style={metricLabelStyle()}>Active cap removed</div><div>{formatMoneyM(totals.active)}</div></div>
          <div><div style={metricLabelStyle()}>Estimated dead cap</div><div>{formatMoneyM(totals.dead)}</div></div>
          <div><div style={metricLabelStyle()}>Est. cap savings</div><div>{formatMoneyM(Math.max(0, totals.active - totals.dead))}</div></div>
        </div>

        {warnings.length > 0 && (
          <div style={{ marginBottom: "var(--space-3)", border: "1px solid var(--warning)", borderRadius: 8, padding: "var(--space-2)" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Risk warnings</div>
            {warnings.map((row) => <div key={row.id} style={{ fontSize: "var(--text-sm)" }}>{row.name}: {row.tags.join(", ")}</div>)}
          </div>
        )}

        <div style={{ display: "grid", gap: "var(--space-1)", marginBottom: "var(--space-3)" }}>
          {dedupedPlayers.map((player) => (
            <div key={player.id} style={{ display: "grid", gridTemplateColumns: "1.3fr repeat(4, minmax(80px, 1fr))", gap: 8, fontSize: "var(--text-sm)", borderBottom: "1px solid var(--hairline)", padding: "6px 0" }}>
              <div>{player.name} ({player.pos ?? "—"})</div>
              <div>{formatMoneyM(getAnnualBaseSalary(player))}</div>
              <div>{formatMoneyM(getAnnualBonusProration(player))}</div>
              <div>{formatMoneyM(getActiveCapHit(player))}</div>
              <div>{formatMoneyM(calculateReleaseDeadCap(player)?.total ?? 0)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button className="btn" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={submitting}>{submitting ? "Releasing..." : "Confirm Bulk Release"}</button>
        </div>
      </div>
    </div>
  );
}
