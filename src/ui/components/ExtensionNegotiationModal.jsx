import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoneyM, safeRound, toFiniteNumber } from "../utils/numberFormatting.js";
import { buildRouteRequestKey } from "../utils/requestLoopGuard.js";
import useStableRouteRequest from "../hooks/useStableRouteRequest.js";

export default function ExtensionNegotiationModal({
  player,
  actions,
  teamId,
  cacheScopeKey = "global",
  onClose,
  onComplete,
  statusNode = null,
}) {
  const [ask, setAsk] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [offer, setOffer] = useState(null);
  const [response, setResponse] = useState(null);
  const requestKey = useMemo(() => buildRouteRequestKey("extension-ask", player?.id), [player?.id]);
  const fetchExtensionAsk = React.useCallback(async () => {
    const resp = await actions?.getExtensionAsk?.(player?.id);
    return resp?.payload?.ask ?? null;
  }, [actions, player?.id]);
  const { data: askData, loading } = useStableRouteRequest({
    requestKey,
    cacheScopeKey,
    enabled: player?.id != null,
    fetcher: fetchExtensionAsk,
    warnLabel: "ExtensionNegotiationModal",
    clearDataOnLoad: true,
  });

  useEffect(() => {
    setAsk(askData ?? null);
    setOffer(askData ?? null);
  }, [askData]);

  const askYears = toFiniteNumber(ask?.years, null);
  const askBaseAnnual = toFiniteNumber(ask?.baseAnnual, null);
  const askSigningBonus = toFiniteNumber(ask?.signingBonus, null);
  const isAskValid = useMemo(
    () =>
      askYears != null &&
      askBaseAnnual != null &&
      askSigningBonus != null &&
      askYears > 0 &&
      askBaseAnnual >= 0 &&
      askSigningBonus >= 0,
    [askYears, askBaseAnnual, askSigningBonus],
  );

  const handleAccept = async () => {
    if (!isAskValid || submitting || !offer) return;
    setSubmitting(true);
    setResponse(null);
    try {
      const resp = await actions.extendContract(player.id, teamId, offer);
      const payload = resp?.payload || {};
      setResponse(payload);
      if (payload.status === 'accepted') onComplete();
      if (payload.status === 'counter' && payload.counter) setOffer(payload.counter);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.62)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 10000,
        backdropFilter: "blur(4px)",
      }}
    >
      <Card
        className="card-premium"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100vw)",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "var(--space-5)",
          boxShadow: "var(--shadow-xl)",
          background: "var(--surface-elevated)",
          border: "1px solid var(--hairline-strong)",
        }}
      >
        <CardContent>
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 999,
              background: "var(--hairline-strong)",
              margin: "0 auto var(--space-4)",
            }}
          />
          <h3 style={{ marginTop: 0, marginBottom: "var(--space-2)" }}>
            Extend {player.name}
          </h3>
          {statusNode}

          {loading ? (
            <div
              style={{
                padding: "var(--space-4)",
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              Negotiating…
            </div>
          ) : isAskValid ? (
            <div>
              <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginBottom: 8 }}>
                Agent demand
              </p>
              <div
                style={{
                  fontSize: "1.4em",
                  fontWeight: 800,
                  margin: "var(--space-3) 0",
                  color: "var(--accent)",
                  textAlign: "center",
                  background: "var(--surface-strong)",
                  padding: "var(--space-4)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                {safeRound(toFiniteNumber(offer?.yearsTotal ?? offer?.years, askYears), 0)} Years
                <br />
                <span style={{ fontSize: "0.62em", color: "var(--text)" }}>
                  {formatMoneyM(toFiniteNumber(offer?.baseAnnual, askBaseAnnual))} / yr
                </span>
              </div>
              <div
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--text-subtle)",
                  textAlign: "center",
                  marginBottom: "var(--space-5)",
                }}
              >
                Includes {formatMoneyM(toFiniteNumber(offer?.signingBonus, askSigningBonus))} signing bonus
              </div>
              {response?.reason && (
                <div style={{ marginBottom: 10, fontSize: 12, color: response.status === 'accepted' ? 'var(--success)' : 'var(--warning)' }}>
                  {response.reason}
                  {Array.isArray(response.reasons) && response.reasons.length > 0 ? ` · ${response.reasons.join(', ')}` : ''}
                </div>
              )}
              <div style={{ display: "flex", gap: "var(--space-3)" }}>

                <Button className="btn" onClick={onClose} style={{ flex: 1 }}>
                  Reject
                </Button>
                <Button
                  className="btn btn-primary"
                  onClick={handleAccept}
                  style={{
                    flex: 1,
                    background: "var(--success)",
                    borderColor: "var(--success)",
                    color: "#fff",
                  }}
                >
                  {submitting ? "Negotiating..." : "Submit Offer"}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-4)" }}>
              <div
                style={{
                  border: "1px solid rgba(255,159,10,0.45)",
                  background: "rgba(255,159,10,0.10)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-3) var(--space-4)",
                }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>Negotiation unavailable</p>
                <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                  Contract terms could not be loaded right now.
                </p>
              </div>
              <Button className="btn" onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
