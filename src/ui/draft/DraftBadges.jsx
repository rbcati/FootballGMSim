import React from "react";
import { Badge } from "@/components/ui/badge";
import { ovrColor } from "./draftShared.js";

export function OvrBadge({ ovr }) {
  return (
    <Badge
      variant="outline"
      style={{
        display: "inline-block",
        minWidth: 32,
        padding: "2px 4px",
        borderRadius: "var(--radius-pill)",
        background: `${ovrColor(ovr)}22`,
        color: ovrColor(ovr),
        fontWeight: 700,
        fontSize: "var(--text-xs)",
        textAlign: "center",
        border: `1px solid ${ovrColor(ovr)}55`,
      }}
    >
      {ovr}
    </Badge>
  );
}

export function SortIcon({ active, dir }) {
  if (!active)
    return (
      <span style={{ color: "var(--text-subtle)", marginLeft: 3 }}>⇅</span>
    );
  return (
    <span style={{ color: "var(--accent)", marginLeft: 3 }}>
      {dir > 0 ? "↑" : "↓"}
    </span>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
