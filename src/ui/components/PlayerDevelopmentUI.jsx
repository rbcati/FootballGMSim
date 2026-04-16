import React from "react";

const TONE_CONFIG = {
  good: { color: "var(--success)", bg: "rgba(52,199,89,0.14)", border: "rgba(52,199,89,0.35)" },
  warn: { color: "var(--warning)", bg: "rgba(255,159,10,0.14)", border: "rgba(255,159,10,0.35)" },
  bad: { color: "var(--danger)", bg: "rgba(255,69,58,0.14)", border: "rgba(255,69,58,0.35)" },
  neutral: { color: "var(--text-subtle)", bg: "var(--surface-strong)", border: "var(--hairline)" },
};

export function ToneChip({ label, tone = "neutral", title = "" }) {
  const cfg = TONE_CONFIG[tone] ?? TONE_CONFIG.neutral;
  return (
    <span
      title={title}
      style={{
        fontSize: 9,
        fontWeight: 800,
        borderRadius: "var(--radius-pill)",
        padding: "1px 6px",
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        letterSpacing: ".03em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

export function DevelopmentStatCard({ label, value, detail, tone = "neutral" }) {
  const cfg = TONE_CONFIG[tone] ?? TONE_CONFIG.neutral;
  return (
    <div style={{ border: `1px solid ${cfg.border}`, borderRadius: "var(--radius-md)", padding: "10px", background: cfg.bg }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2, color: cfg.color }}>{value}</div>
      {detail ? <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginTop: 2 }}>{detail}</div> : null}
    </div>
  );
}

export function DevelopmentSignalRow({ items = [] }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((item) => (
        <ToneChip
          key={`${item.label}-${item.title ?? ""}`}
          label={item.label}
          tone={item.tone}
          title={item.title}
        />
      ))}
    </div>
  );
}
