/**
 * PlayerCard.jsx — Madden-style premium player card component
 *
 * Variants:
 *  compact  — slim list row (48px height), for rosters / trade panels
 *  standard — medium card (~140px), default for most uses
 *  hero     — full-detail card with radar + all attributes
 *
 * Features:
 *  - Tier-based OVR badge with gradient glow (GOAT / Elite / Star / Good / Avg)
 *  - Position badge with position-group colour
 *  - Development arrow (potential vs ovr vs age)
 *  - Personality traits as coloured pills
 *  - Contract summary (yrs + $/yr)
 *  - Injury indicator
 *  - Animated card-pop on first render + OVR glow pulse for 90+
 *  - Fully accessible: role="button", keyboard-navigable when onClick provided
 */

import React, { useState, useEffect, useRef, useMemo } from "react";

// ── OVR tier system ────────────────────────────────────────────────────────────

export const OVR_TIERS = [
  { min: 95, label: "GOAT",  color: "#FFD60A", glow: "#FFD60A44", gradient: "linear-gradient(135deg,#FFD60A,#FF9F0A)" },
  { min: 88, label: "ELITE", color: "#BF5AF2", glow: "#BF5AF244", gradient: "linear-gradient(135deg,#BF5AF2,#5E5CE6)" },
  { min: 78, label: "STAR",  color: "#0A84FF", glow: "#0A84FF44", gradient: "linear-gradient(135deg,#0A84FF,#64D2FF)" },
  { min: 68, label: "GOOD",  color: "#34C759", glow: "#34C75944", gradient: "linear-gradient(135deg,#34C759,#30D158)" },
  { min: 58, label: "AVG",   color: "#FF9F0A", glow: "#FF9F0A33", gradient: "linear-gradient(135deg,#FF9F0A,#FFD60A)" },
  { min: 0,  label: "BKP",   color: "#636366", glow: "#63636622", gradient: "linear-gradient(135deg,#636366,#48484a)" },
];

export function ovrTier(ovr) {
  return OVR_TIERS.find(t => ovr >= t.min) || OVR_TIERS[OVR_TIERS.length - 1];
}

// ── Position colours ──────────────────────────────────────────────────────────

const POS_COLORS = {
  QB:  "#FF9F0A", RB: "#34C759", WR: "#0A84FF",
  TE:  "#5E5CE6", OL: "#64D2FF", DL: "#FF453A",
  LB:  "#FF6B35", CB: "#FFD60A", S:  "#30D158",
  K:   "#AEC6CF", P: "#AEC6CF",
};

export function posColor(pos) {
  return POS_COLORS[pos] || "#9FB0C2";
}

// ── Trait badge colours ───────────────────────────────────────────────────────

const TRAIT_COLORS = {
  Leader:         { bg: "#FFD60A22", border: "#FFD60A", text: "#FFD60A" },
  Clutch:         { bg: "#34C75922", border: "#34C759", text: "#34C759" },
  "Iron Man":     { bg: "#0A84FF22", border: "#0A84FF", text: "#0A84FF" },
  "Injury Prone": { bg: "#FF453A22", border: "#FF453A", text: "#FF453A" },
  "Film Rat":     { bg: "#BF5AF222", border: "#BF5AF2", text: "#BF5AF2" },
  Flashy:         { bg: "#FF9F0A22", border: "#FF9F0A", text: "#FF9F0A" },
  Cerebral:       { bg: "#64D2FF22", border: "#64D2FF", text: "#64D2FF" },
  "Gym Rat":      { bg: "#30D15822", border: "#30D158", text: "#30D158" },
  Diva:           { bg: "#FF453A22", border: "#FF453A", text: "#FF453A" },
  Veteran:        { bg: "#9FB0C222", border: "#9FB0C2", text: "#9FB0C2" },
};

function traitStyle(trait) {
  return TRAIT_COLORS[trait] || { bg: "#ffffff11", border: "#ffffff33", text: "#9FB0C2" };
}

// ── Position-specific key attributes ─────────────────────────────────────────

const POS_ATTRS = {
  QB:  ["arm",  "acc",  "mob", "awa"],
  RB:  ["spd",  "pow",  "elu", "ctch"],
  WR:  ["spd",  "ctch", "rou", "rac"],
  TE:  ["ctch", "blk",  "spd", "str"],
  OL:  ["str",  "blk",  "agi", "awa"],
  DL:  ["str",  "pas",  "run", "agi"],
  LB:  ["tck",  "cov",  "str", "spd"],
  CB:  ["cov",  "spd",  "tck", "awa"],
  S:   ["cov",  "tck",  "spd", "str"],
  K:   ["kpw",  "kac",  null,  null],
  P:   ["ppw",  "pac",  null,  null],
};

const ATTR_LABELS = {
  arm: "ARM", acc: "ACC", mob: "MOB", awa: "AWA",
  spd: "SPD", pow: "POW", elu: "ELU", ctch: "CTH",
  rou: "RTE", rac: "RAC", blk: "BLK", str: "STR",
  pas: "PRS", run: "RDF", agi: "AGI", tck: "TKL",
  cov: "COV", kpw: "KPW", kac: "KAC", ppw: "PPW", pac: "PAC",
};

/** Derive attribute values from a player object.
 *  The game stores ratings inside player.ratings or player.attrs.
 *  We fall back to synthesising from ovr + random-but-deterministic seed. */
function getAttrs(player, attrKeys) {
  const src = player.ratings || player.attrs || {};
  const ovr = player.ovr ?? 70;
  const seed = (player.id ?? "").split("").reduce((h, c) => h * 31 + c.charCodeAt(0), 0) & 0xffff;
  let rng = seed;
  const rand = () => { rng = (rng * 1664525 + 1013904223) & 0xffff; return rng / 0xffff; };

  return attrKeys.map(key => {
    if (key == null) return null;
    if (src[key] != null) return Math.round(src[key]);
    // Synthesise: ovr ± spread, clamped 40–99
    const spread = 12;
    return Math.round(Math.min(99, Math.max(40, ovr + (rand() - 0.5) * spread * 2)));
  });
}

// ── Development arrow ─────────────────────────────────────────────────────────

function DevArrow({ player }) {
  const ovr  = player.ovr ?? 70;
  const pot  = player.potential ?? player.pot ?? ovr;
  const age  = player.age ?? 26;
  const peak = { QB:32, RB:28, WR:30, TE:30, OL:32, DL:30, LB:30, CB:29, S:30, K:38, P:38 }[player.pos] || 30;

  let dir, color, title;
  if (age < peak - 2 && pot > ovr + 3)        { dir = "▲"; color = "#34C759"; title = "Rising"; }
  else if (age < peak && pot > ovr)            { dir = "△"; color = "#30D158"; title = "Developing"; }
  else if (age > peak + 2 && ovr > 70)         { dir = "▽"; color = "#FF9F0A"; title = "Declining"; }
  else if (age > peak + 4)                     { dir = "▼"; color = "#FF453A"; title = "Fading"; }
  else                                         { dir = "—"; color = "#636366"; title = "Stable"; }

  return (
    <span title={title} style={{ color, fontWeight: 900, fontSize: "0.8rem", lineHeight: 1 }}>
      {dir}
    </span>
  );
}

// ── Contract summary ──────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null) return "—";
  if (n >= 1) return `$${Number(n).toFixed(1)}M`;
  return `$${Math.round(n * 1000)}K`;
}

// ── OVR Badge ─────────────────────────────────────────────────────────────────

function OvrBadge({ ovr, size = 52 }) {
  const tier = ovrTier(ovr);
  const isPulse = ovr >= 90;
  return (
    <div
      className={isPulse ? "ovr-badge-pulse" : undefined}
      style={{
        width: size, height: size,
        borderRadius: "50%",
        background: tier.gradient,
        boxShadow: `0 0 ${isPulse ? 16 : 8}px ${tier.glow}, 0 2px 8px rgba(0,0,0,0.4)`,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <span style={{ fontSize: size * 0.34, fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "-1px" }}>
        {ovr}
      </span>
      {tier.label !== "GOOD" && tier.label !== "AVG" && tier.label !== "BKP" && (
        <span style={{ fontSize: size * 0.17, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.5px", lineHeight: 1 }}>
          {tier.label}
        </span>
      )}
    </div>
  );
}

// ── Position Badge ────────────────────────────────────────────────────────────

function PosBadge({ pos, size = "sm" }) {
  const color = posColor(pos);
  const fs = size === "lg" ? "0.85rem" : "0.7rem";
  return (
    <span style={{
      background: `${color}22`, border: `1px solid ${color}66`,
      color, fontWeight: 800, fontSize: fs,
      padding: "2px 6px", borderRadius: 4, letterSpacing: "0.5px",
    }}>
      {pos}
    </span>
  );
}

// ── Attribute bar ─────────────────────────────────────────────────────────────

function AttrBar({ label, value }) {
  if (value == null) return null;
  const pct = ((value - 40) / 59) * 100;
  const color = value >= 90 ? "#FFD60A" : value >= 80 ? "#34C759" : value >= 70 ? "#0A84FF" : value >= 60 ? "#FF9F0A" : "#636366";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", width: 26, flexShrink: 0, letterSpacing: "0.3px" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.6s cubic-bezier(0.2,0.8,0.2,1)" }} />
      </div>
      <span style={{ fontSize: "0.65rem", fontWeight: 800, color, width: 22, textAlign: "right", flexShrink: 0 }}>
        {value}
      </span>
    </div>
  );
}

// ── Award badges ──────────────────────────────────────────────────────────────
// player.awards = [{ label: "2025 NFL MVP", year: 2025, type: "mvp" }, ...]

const AWARD_STYLES = {
  mvp:       { color: "#FFD60A", bg: "#FFD60A18", icon: "🏆" },
  opoy:      { color: "#FF9F0A", bg: "#FF9F0A18", icon: "⚔️"  },
  dpoy:      { color: "#FF453A", bg: "#FF453A18", icon: "🛡️"  },
  roty:      { color: "#34C759", bg: "#34C75918", icon: "⭐"  },
  sb_mvp:    { color: "#FFD60A", bg: "#FFD60A18", icon: "🏈"  },
  allpro:    { color: "#BF5AF2", bg: "#BF5AF218", icon: "✦"   },
  probowl:   { color: "#0A84FF", bg: "#0A84FF18", icon: "🌟"  },
  hof:       { color: "#FFD60A", bg: "#FFD60A18", icon: "🏛️"  },
};

function AwardBadges({ player, maxShow = 3 }) {
  const awards = player?.awards;
  if (!Array.isArray(awards) || awards.length === 0) return null;
  const shown = awards.slice(0, maxShow);
  const extra = awards.length - shown.length;

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
      {shown.map((award, i) => {
        const type = award.type || "allpro";
        const style = AWARD_STYLES[type] || AWARD_STYLES.allpro;
        return (
          <span
            key={i}
            title={award.label || type}
            style={{
              fontSize: "0.58rem", fontWeight: 800, color: style.color,
              background: style.bg,
              border: `1px solid ${style.color}44`,
              borderRadius: 5, padding: "1px 5px",
              display: "flex", alignItems: "center", gap: 3,
              letterSpacing: "0.2px",
            }}
          >
            <span style={{ fontSize: "0.7rem" }}>{style.icon}</span>
            {award.label || award.year || type.toUpperCase()}
          </span>
        );
      })}
      {extra > 0 && (
        <span style={{
          fontSize: "0.58rem", fontWeight: 700, color: "var(--text-subtle)",
          background: "rgba(255,255,255,0.06)", borderRadius: 5, padding: "1px 5px",
        }}>
          +{extra} more
        </span>
      )}
    </div>
  );
}

// ── Injury indicator ──────────────────────────────────────────────────────────

function InjuryBadge({ player }) {
  const inj = player.injury || player.injuredWeeks;
  if (!inj) return null;
  const weeks = typeof inj === "object" ? inj.weeksLeft ?? inj.weeks : inj;
  return (
    <span style={{
      background: "#FF453A22", border: "1px solid #FF453A66",
      color: "#FF453A", fontWeight: 700, fontSize: "0.62rem",
      padding: "1px 5px", borderRadius: 4,
    }}>
      INJ{weeks > 0 ? ` ${weeks}w` : ""}
    </span>
  );
}

// ── Compact variant ───────────────────────────────────────────────────────────

function CompactCard({ player, onClick, isSelected }) {
  const tier = ovrTier(player.ovr ?? 70);
  const contract = player.contract || {};
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(e); } : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px",
        background: isSelected ? "rgba(10,132,255,0.12)" : "var(--surface)",
        border: `1px solid ${isSelected ? "var(--accent)" : "var(--hairline)"}`,
        borderRadius: "var(--radius-md)",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.15s, border-color 0.15s",
        minHeight: 52,
      }}
    >
      {/* OVR */}
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        background: tier.gradient,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        boxShadow: `0 0 8px ${tier.glow}`,
      }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 900, color: "#fff" }}>{player.ovr ?? "?"}</span>
      </div>

      {/* Name + Position */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {player.name ?? "Unknown"}
          </span>
          <InjuryBadge player={player} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PosBadge pos={player.pos} />
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Age {player.age ?? "?"}</span>
          {contract.salary && <span style={{ fontSize: "0.7rem", color: "var(--text-subtle)" }}>{fmt$(contract.salary)}/yr</span>}
        </div>
      </div>

      {/* Dev arrow */}
      <DevArrow player={player} />
    </div>
  );
}

// ── Standard card ─────────────────────────────────────────────────────────────

function StandardCard({ player, onClick, isSelected }) {
  const tier    = ovrTier(player.ovr ?? 70);
  const attrKeys = (POS_ATTRS[player.pos] || POS_ATTRS.QB).slice(0, 4);
  const attrs    = getAttrs(player, attrKeys);
  const contract = player.contract || {};
  const traits   = (player.traits || []).slice(0, 3);
  const pColor   = posColor(player.pos);

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(e); } : undefined}
      className="player-card-pop"
      style={{
        background: isSelected
          ? `linear-gradient(135deg, rgba(10,132,255,0.12), var(--surface))`
          : "var(--surface)",
        border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--hairline)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "14px 14px 12px",
        cursor: onClick ? "pointer" : "default",
        transition: "transform 0.15s var(--ease), box-shadow 0.15s",
        boxShadow: isSelected
          ? `0 0 20px rgba(10,132,255,0.2), var(--shadow-md)`
          : "var(--shadow-sm)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Coloured left accent strip */}
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0, width: 3,
        background: tier.gradient, borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)",
      }} />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <OvrBadge ovr={player.ovr ?? 70} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {player.name ?? "Unknown"}
            </span>
            <InjuryBadge player={player} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <PosBadge pos={player.pos} />
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Age {player.age ?? "?"}</span>
            <DevArrow player={player} />
          </div>
          {traits.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
              {traits.map(t => {
                const ts = traitStyle(t);
                return (
                  <span key={t} style={{
                    background: ts.bg, border: `1px solid ${ts.border}`,
                    color: ts.text, fontSize: "0.6rem", fontWeight: 700,
                    padding: "1px 5px", borderRadius: 4, letterSpacing: "0.3px",
                  }}>{t}</span>
                );
              })}
            </div>
          )}
          <AwardBadges player={player} maxShow={3} />
        </div>
      </div>

      {/* Attribute bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {attrKeys.map((key, i) => key && (
          <AttrBar key={key} label={ATTR_LABELS[key] ?? key.toUpperCase()} value={attrs[i]} />
        ))}
      </div>

      {/* Contract footer */}
      {(contract.salary || contract.years) && (
        <div style={{
          marginTop: 10, paddingTop: 8,
          borderTop: "1px solid var(--hairline)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {fmt$(contract.salary)}/yr
          </span>
          {contract.years != null && (
            <span style={{ fontSize: "0.7rem", color: "var(--text-subtle)" }}>
              {contract.years} yr{contract.years !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Hero card (full detail) ───────────────────────────────────────────────────

function HeroCard({ player, onClick, onClose }) {
  const tier     = ovrTier(player.ovr ?? 70);
  const attrKeys = POS_ATTRS[player.pos] || POS_ATTRS.QB;
  const attrs    = getAttrs(player, attrKeys);
  const contract = player.contract || {};
  const traits   = player.traits || [];
  const pColor   = posColor(player.pos);

  return (
    <div
      style={{
        background: "var(--surface-elevated)",
        border: `1.5px solid ${tier.color}44`,
        borderRadius: "var(--radius-xl)",
        overflow: "hidden",
        boxShadow: `0 0 40px ${tier.glow}, var(--shadow-xl)`,
        position: "relative",
        maxWidth: 380,
        width: "100%",
      }}
    >
      {/* Hero background gradient */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at top left, ${tier.glow} 0%, transparent 60%)`,
        pointerEvents: "none",
      }} />

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 12, right: 12,
            background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
            borderRadius: "50%", width: 32, height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "var(--text-muted)", fontSize: "1.1rem",
            zIndex: 2,
          }}
        >×</button>
      )}

      {/* Header */}
      <div style={{ padding: "20px 20px 16px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          {/* Large OVR badge */}
          <OvrBadge ovr={player.ovr ?? 70} size={72} />

          {/* Name block */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "var(--text)", letterSpacing: "-0.5px", lineHeight: 1.1, marginBottom: 6 }}>
              {player.name ?? "Unknown"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <PosBadge pos={player.pos} size="lg" />
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Age {player.age ?? "?"}</span>
              <DevArrow player={player} />
              <InjuryBadge player={player} />
            </div>
          </div>
        </div>

        {/* Traits */}
        {traits.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {traits.map(t => {
              const ts = traitStyle(t);
              return (
                <span key={t} style={{
                  background: ts.bg, border: `1px solid ${ts.border}`,
                  color: ts.text, fontSize: "0.7rem", fontWeight: 700,
                  padding: "3px 8px", borderRadius: 6,
                }}>{t}</span>
              );
            })}
          </div>
        )}

        {/* Award badges — hero size shows all */}
        <AwardBadges player={player} maxShow={8} />

        {/* Attribute grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
          {attrKeys.map((key, i) => key && (
            <AttrBar key={key} label={ATTR_LABELS[key] ?? key.toUpperCase()} value={attrs[i]} />
          ))}
        </div>
      </div>

      {/* Footer stats bar */}
      <div style={{
        background: "rgba(0,0,0,0.3)",
        borderTop: "1px solid var(--hairline)",
        padding: "10px 20px",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 8,
      }}>
        {[
          { label: "Contract", value: fmt$(contract.salary) + "/yr" },
          { label: "Years Left", value: contract.years != null ? `${contract.years} yr${contract.years !== 1 ? "s" : ""}` : "—" },
          { label: "Potential", value: player.potential != null ? `${player.potential} POT` : "—" },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.62rem", color: "var(--text-subtle)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--text)" }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * PlayerCard
 *
 * @param {object} props
 * @param {object} props.player        — player data object
 * @param {"compact"|"standard"|"hero"} [props.variant="standard"]
 * @param {function} [props.onClick]   — makes the card tappable
 * @param {function} [props.onClose]   — hero-only: renders a close button
 * @param {boolean}  [props.isSelected]
 */
export default function PlayerCard({
  player,
  variant = "standard",
  onClick,
  onClose,
  isSelected = false,
}) {
  if (!player) return null;

  if (variant === "compact")  return <CompactCard  player={player} onClick={onClick} isSelected={isSelected} />;
  if (variant === "hero")     return <HeroCard     player={player} onClick={onClick} onClose={onClose} isSelected={isSelected} />;
  return                             <StandardCard player={player} onClick={onClick} isSelected={isSelected} />;
}

// ── CSS keyframe injection (card-pop + badge-pulse) ───────────────────────────
// Injected once into the document head so we don't need a separate CSS file.

const CARD_CSS = `
@keyframes cardPop {
  0%   { transform: scale(0.94); opacity: 0; }
  60%  { transform: scale(1.02); }
  100% { transform: scale(1);    opacity: 1; }
}
@keyframes ovrPulse {
  0%,100% { box-shadow: 0 0 10px var(--pulse-glow,#FFD60A44), 0 2px 8px rgba(0,0,0,0.4); }
  50%      { box-shadow: 0 0 22px var(--pulse-glow,#FFD60A88), 0 2px 8px rgba(0,0,0,0.4); }
}
.player-card-pop {
  animation: cardPop 0.25s cubic-bezier(0.2,0.8,0.2,1) both;
}
.ovr-badge-pulse {
  animation: ovrPulse 2.5s ease-in-out infinite;
}
`;

if (typeof document !== "undefined") {
  const id = "__playercard_css";
  if (!document.getElementById(id)) {
    const s = document.createElement("style");
    s.id = id;
    s.textContent = CARD_CSS;
    document.head.appendChild(s);
  }
}
