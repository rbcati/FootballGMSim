/**
 * DraftControls.jsx
 *
 * The Draft screen's top controls: round/pick display, navigation, and the
 * shared loading spinner + error banner. Buttons are disabled while the draft
 * is loading or the worker is busy.
 */

import React from "react";
import { Button } from "@/components/ui/button";

/** Centered spinner shown while draft state is loading. */
export function DraftSpinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-10)" }}>
      <span
        className="animate-spin"
        role="status"
        aria-label="Loading draft data"
        style={{
          width: 36,
          height: 36,
          border: "4px solid var(--hairline)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
          display: "inline-block",
        }}
      />
    </div>
  );
}

export default function DraftControls({
  league,
  draftState,
  isLoading = false,
  busy = false,
  draftError = null,
  onNavigate = null,
  onRetry,
  onDismissError,
}) {
  const disabled = isLoading || busy;
  return (
    <>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-6)",
        }}
      >
        <div>
          <h1
            data-testid="draft-room-heading"
            style={{
              fontWeight: 800,
              fontSize: "var(--text-xl)",
              color: "var(--text)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            NFL Draft
          </h1>
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            {league?.year ?? ""} Season · Offseason · Evaluate <abbr title="Overall rating">OVR</abbr>/<abbr title="Potential rating">POT</abbr> with scouting context
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => onNavigate?.("League")} aria-label="Back to league hub">Back to League</button>
        {draftState &&
          !draftState.notStarted &&
          !draftState.isDraftComplete && (
            <div
              style={{
                padding: "4px 12px",
                background: "var(--surface-strong)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-pill)",
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
              }}
            >
              {draftState.currentPickIndex ?? 0} / {draftState.totalPicks ?? 0}{" "}
              picks made
            </div>
          )}
      </div>

      {/* Global error notice — red background, white text */}
      {draftError && (
        <div
          role="alert"
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "#dc2626",
            border: "1px solid #b91c1c",
            borderRadius: "var(--radius-md)",
            color: "#ffffff",
            marginBottom: "var(--space-5)",
            fontSize: "var(--text-sm)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{draftError}</span>
          <Button
            className="btn"
            style={{ padding: "2px 10px", fontSize: "var(--text-xs)" }}
            disabled={disabled}
            onClick={onRetry}
          >
            Retry
          </Button>
          <Button
            className="btn"
            style={{ padding: "2px 10px", fontSize: "var(--text-xs)" }}
            onClick={onDismissError}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Loading spinner */}
      {isLoading && <DraftSpinner />}
    </>
  );
}
