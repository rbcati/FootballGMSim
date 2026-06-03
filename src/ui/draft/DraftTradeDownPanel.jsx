import React from "react";
import { Button } from "@/components/ui/button";

export function DraftTradeDownPanel({
  pendingTradeProposal,
  processing,
  onAccept,
  onDecline,
  onClose,
}) {
  return (
    <div
      style={{
        padding: "var(--space-4)",
        background: "var(--surface-strong)",
        border: "1px solid var(--warning, #FF9F0A)",
        borderRadius: "var(--radius-md)",
        marginBottom: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <div style={{ fontWeight: 800, color: "var(--text)" }}>
          Trade Offer from {pendingTradeProposal.aiTeamAbbr}
        </div>
        <Button
          className="btn"
          onClick={onClose}
          style={{ background: "none", border: "none", fontSize: 16, color: "var(--text-muted)", cursor: "pointer", lineHeight: 1 }}
        >
          ×
        </Button>
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-3)", lineHeight: 1.5 }}>
        The{" "}
        <strong style={{ color: "var(--text)" }}>{pendingTradeProposal.aiTeamName}</strong>{" "}
        are offering to trade up for your pick #{pendingTradeProposal.userPickOverall}.
        They want to draft{" "}
        <strong style={{ color: "var(--text)" }}>
          {pendingTradeProposal.targetProspect?.name} ({pendingTradeProposal.targetProspect?.pos},{" "}
          {pendingTradeProposal.targetProspect?.ovr} OVR)
        </strong>.
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text)", marginBottom: "var(--space-3)", fontWeight: 600 }}>
        You receive: their pick #{pendingTradeProposal.aiPickOverall} (Round{" "}
        {pendingTradeProposal.aiPickRound}) + a later pick swap in this draft.
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <Button
          className="btn btn-primary"
          disabled={processing}
          onClick={onAccept}
          style={{ fontWeight: 600, fontSize: "var(--text-sm)", padding: "var(--space-2) var(--space-4)" }}
        >
          {processing ? "Processing…" : "Accept Trade"}
        </Button>
        <Button
          className="btn"
          onClick={onDecline}
          style={{ fontWeight: 600, fontSize: "var(--text-sm)", padding: "var(--space-2) var(--space-4)" }}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}

export default DraftTradeDownPanel;
