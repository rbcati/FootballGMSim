import React from "react";
import { getProspectRegionTag, getScoutingConfidenceProfile } from "../utils/franchiseInvestments.js";
import { buildProspectScoutingReport } from "../../core/scoutingModel.js";
import { getScoutReport } from "./draftShared.js";

export function ProspectScoutingChips({ prospect, team }) {
  const report = buildProspectScoutingReport(prospect, { team });
  const chip = (k, v) => (
    <span
      key={k}
      className="status-chip muted"
      style={{ fontSize: "10px", padding: "1px 6px", lineHeight: 1.2 }}
      title={report.summary}
    >
      {k}: {v}
    </span>
  );
  return (
    <div
      data-testid="draft-scouting-chips"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        marginTop: 4,
        maxWidth: 220,
      }}
    >
      {chip("conf", report.confidence)}
      {chip("risk", String(report.riskLevel).replace(/_/g, " "))}
      {chip("fit", `${Math.round(Number(prospect?.schemeFit ?? 65))}`)}
      {chip("role", String(report.projectedRole).slice(0, 28))}
    </div>
  );
}

export function ScoutBadge({ player, team }) {
  const profile = getScoutingConfidenceProfile(team, player);
  const accuracy = profile.accuracy;
  const { grade, gradeColor, range } = getScoutReport(player?.ovr, player?.id, accuracy);
  const region = profile.regionTag ?? getProspectRegionTag(player);
  return (
    <span
      title={`Scout range: ${range} OVR · ${profile.confidence} (${Math.round(accuracy * 100)}%) · ${profile.fogBand} · Region ${region} · ${profile.reasons.join(' · ')}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 7px",
        borderRadius: "var(--radius-pill)",
        background: `${gradeColor}22`,
        color: gradeColor,
        fontWeight: 700,
        fontSize: "var(--text-xs)",
        border: `1px solid ${gradeColor}55`,
        cursor: "default",
        letterSpacing: "0.5px",
      }}
    >
      {grade}
    </span>
  );
}
export default ScoutBadge;
