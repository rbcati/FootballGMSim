import React from "react";

export default function InfoTip({ term, explanation, compact = false }) {
  const title = `${term}: ${explanation}`;
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: compact ? 16 : 18,
        height: compact ? 16 : 18,
        borderRadius: "50%",
        border: "1px solid var(--hairline)",
        color: "var(--text-muted)",
        fontSize: compact ? 10 : 11,
        fontWeight: 800,
        cursor: "help",
      }}
    >
      i
    </span>
  );
}
