import React from "react";
import { Button } from "@/components/ui/button";

function TradeUpOfferBody({ proposal }) {
  const prospect  = proposal.targetProspect ?? {};
  const futureLbl = proposal.futurePkLabel
    ? ` ${proposal.futurePkLabel}`
    : proposal.sweetenerRound > 0
      ? ` + a future Round ${proposal.sweetenerRound} pick`
      : '';
  const gradeStr  = prospect.combineGrade != null ? ` (combine grade ${Number(prospect.combineGrade).toFixed(1)})` : '';

  return (
    <>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-3)", lineHeight: 1.5 }}>
        The{" "}
        <strong style={{ color: "var(--text)" }}>{proposal.aiTeamName}</strong>{" "}
        is offering Pick #{proposal.aiPickOverall}{futureLbl} in exchange for your current Pick #{proposal.userPickOverall}.
        They are targeting{" "}
        <strong style={{ color: "var(--text)" }}>
          {prospect.pos} {prospect.name}{gradeStr}
        </strong>.
      </div>
    </>
  );
}

function LegacyOfferBody({ proposal }) {
  return (
    <>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-3)", lineHeight: 1.5 }}>
        The{" "}
        <strong style={{ color: "var(--text)" }}>{proposal.aiTeamName}</strong>{" "}
        are offering to trade up for your pick #{proposal.userPickOverall}.
        They want to draft{" "}
        <strong style={{ color: "var(--text)" }}>
          {proposal.targetProspect?.name} ({proposal.targetProspect?.pos},{" "}
          {proposal.targetProspect?.ovr} OVR)
        </strong>.
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text)", marginBottom: "var(--space-3)", fontWeight: 600 }}>
        You receive: their pick #{proposal.aiPickOverall} (Round{" "}
        {proposal.aiPickRound}) + a later pick swap in this draft.
      </div>
    </>
  );
}

export function DraftTradeDownPanel({
  pendingTradeProposal,
  processing,
  onAccept,
  onDecline,
  onClose,
}) {
  const isDraftTradeUp = pendingTradeProposal?.origin === 'draft_trade_up';
  const title          = isDraftTradeUp ? 'Trade-Up Offer' : `Trade Offer from ${pendingTradeProposal.aiTeamAbbr}`;
  const acceptLabel    = isDraftTradeUp ? 'Accept and Trade Down' : 'Accept Trade';
  const declineLabel   = isDraftTradeUp ? 'Decline and Keep Pick' : 'Decline';

  return (
    <div
      style={{
        padding: "var(--space-4)",
        background: "var(--surface-strong)",
        border: `1px solid ${isDraftTradeUp ? 'rgba(251,191,36,0.5)' : 'var(--warning, #FF9F0A)'}`,
        borderRadius: "var(--radius-md)",
        marginBottom: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <div style={{ fontWeight: 800, color: "var(--text)" }}>
          {title}
        </div>
        <Button
          className="btn"
          onClick={onClose}
          style={{ background: "none", border: "none", fontSize: 16, color: "var(--text-muted)", cursor: "pointer", lineHeight: 1 }}
        >
          ×
        </Button>
      </div>

      {isDraftTradeUp
        ? <TradeUpOfferBody proposal={pendingTradeProposal} />
        : <LegacyOfferBody  proposal={pendingTradeProposal} />
      }

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <Button
          className="btn btn-primary"
          disabled={processing}
          onClick={onAccept}
          style={{ fontWeight: 600, fontSize: "var(--text-sm)", padding: "var(--space-2) var(--space-4)" }}
        >
          {processing ? "Processing…" : acceptLabel}
        </Button>
        <Button
          className="btn"
          onClick={onDecline}
          style={{ fontWeight: 600, fontSize: "var(--text-sm)", padding: "var(--space-2) var(--space-4)" }}
        >
          {declineLabel}
        </Button>
      </div>
    </div>
  );
}

export default DraftTradeDownPanel;
