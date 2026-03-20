/**
 * PlayerComparison.jsx
 *
 * Side-by-side player comparison modal.
 * Shows OVR, attributes, contract, age, career stats in a dual-panel layout
 * with attribute bars that visually show the difference between two players.
 *
 * Usage: open with two player objects and call onClose to dismiss.
 */

import React, { useMemo } from "react";

// ── Helpers ────────────────────────────────────────────────────────────────────

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF","#34C759","#FF9F0A","#FF453A","#5E5CE6",
    "#64D2FF","#FFD60A","#30D158","#FF6961","#AEC6CF",
    "#FF6B35","#B4A0E5",
  ];
  let hash = 0;
  for (let i = 0; i < abbr.length; i++)
    hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function ovrClass(ovr) {
  if (ovr >= 95) return "rating-color-goat";
  if (ovr >= 88) return "rating-color-elite";
  if (ovr >= 78) return "rating-color-star";
  if (ovr >= 68) return "rating-color-good";
  if (ovr >= 58) return "rating-color-avg";
  return "rating-color-bad";
}

// Position-specific attribute groups to compare
const POS_ATTRS = {
  QB:  ["throwPower","throwAccuracy","speed","agility","awareness","intelligence"],
  RB:  ["speed","acceleration","trucking","juking","catching","awareness"],
  WR:  ["speed","catching","catchInTraffic","agility","awareness","runBlock"],
  TE:  ["catching","runBlock","passBlock","speed","awareness","agility"],
  OL:  ["passBlock","runBlock","strength","awareness","agility","intelligence"],
  DL:  ["passRushSpeed","passRushPower","runStop","strength","speed","awareness"],
  LB:  ["coverage","runStop","passRushSpeed","speed","awareness","intelligence"],
  CB:  ["coverage","speed","agility","awareness","runStop","intelligence"],
  S:   ["coverage","runStop","speed","awareness","agility","intelligence"],
  K:   ["kickPower","kickAccuracy","awareness","intelligence","speed","agility"],
  P:   ["kickPower","kickAccuracy","awareness","intelligence","speed","agility"],
};

const ATTR_LABELS = {
  throwPower: "Throw Power",
  throwAccuracy: "Accuracy",
  speed: "Speed",
  acceleration: "Acceleration",
  agility: "Agility",
  awareness: "Awareness",
  intelligence: "Intelligence",
  trucking: "Trucking",
  juking: "Juke",
  catching: "Catching",
  catchInTraffic: "Catch (Traffic)",
  passBlock: "Pass Block",
  runBlock: "Run Block",
  strength: "Strength",
  passRushSpeed: "Pass Rush Spd",
  passRushPower: "Pass Rush Pwr",
  runStop: "Run Stop",
  coverage: "Coverage",
  kickPower: "Kick Power",
  kickAccuracy: "Kick Accuracy",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlayerHeader({ player, color }) {
  const isA = color === "var(--accent)";
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "var(--space-2)",
      padding: "var(--space-4)",
      background: `${color}0a`,
      borderBottom: "1px solid var(--hairline)",
    }}>
      {/* Avatar circle */}
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: `${color}22`,
        border: `3px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 900, fontSize: "1.1rem", color,
      }}>
        {(player.firstName?.[0] ?? "") + (player.lastName?.[0] ?? player.pos?.[0] ?? "?")}
      </div>

      {/* Name + Position */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: "var(--text-base)", color: "var(--text)", lineHeight: 1.2 }}>
          {player.firstName} {player.lastName}
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
          {player.pos} · Age {player.age}
        </div>
      </div>

      {/* OVR badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--space-2)",
      }}>
        <span className={`ovr-pill ${ovrClass(player.ovr)}`} style={{ minWidth: 42, fontSize: "var(--text-sm)", padding: "3px 8px" }}>
          {player.ovr}
        </span>
        {player.devTrait && player.devTrait !== "normal" && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 6px",
            borderRadius: "var(--radius-pill)",
            background: player.devTrait === "xfactor" ? "rgba(255,215,0,0.2)" : player.devTrait === "superstar" ? "rgba(191,90,242,0.2)" : "rgba(10,132,255,0.2)",
            color: player.devTrait === "xfactor" ? "#FFD700" : player.devTrait === "superstar" ? "#BF5AF2" : "var(--accent)",
          }}>
            {player.devTrait === "xfactor" ? "X-Factor" : player.devTrait === "superstar" ? "Superstar" : "Star"}
          </span>
        )}
      </div>

      {/* Contract */}
      {player.contract && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", textAlign: "center" }}>
          ${(player.contract.salary ?? 0).toFixed(1)}M · {player.contract.years ?? 0}yr
        </div>
      )}
    </div>
  );
}

function AttributeBar({ label, valueA, valueB }) {
  const max = 99;
  const pctA = (valueA ?? 0) / max * 100;
  const pctB = (valueB ?? 0) / max * 100;
  const aWins = (valueA ?? 0) > (valueB ?? 0);
  const bWins = (valueB ?? 0) > (valueA ?? 0);

  return (
    <div style={{ marginBottom: "var(--space-2)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{
          fontSize: "var(--text-xs)", fontWeight: aWins ? 700 : 400,
          color: aWins ? "var(--accent)" : "var(--text-muted)",
          minWidth: 28, textAlign: "right",
        }}>
          {valueA ?? "—"}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-subtle)", flex: 1, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.3px" }}>
          {label}
        </span>
        <span style={{
          fontSize: "var(--text-xs)", fontWeight: bWins ? 700 : 400,
          color: bWins ? "#FF9F0A" : "var(--text-muted)",
          minWidth: 28,
        }}>
          {valueB ?? "—"}
        </span>
      </div>
      {/* Dual bar: left = player A (blue), right = player B (orange), meet in center */}
      <div style={{ display: "flex", height: 6, gap: 2 }}>
        {/* Player A bar (right-aligned) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <div style={{
            width: `${pctA}%`, height: "100%",
            background: aWins ? "var(--accent)" : "rgba(10,132,255,0.4)",
            borderRadius: "var(--radius-pill)",
            transition: "width 0.5s var(--ease)",
          }} />
        </div>
        {/* Center divider */}
        <div style={{ width: 2, background: "var(--hairline-strong)", borderRadius: 1, flexShrink: 0 }} />
        {/* Player B bar (left-aligned) */}
        <div style={{ flex: 1 }}>
          <div style={{
            width: `${pctB}%`, height: "100%",
            background: bWins ? "#FF9F0A" : "rgba(255,159,10,0.4)",
            borderRadius: "var(--radius-pill)",
            transition: "width 0.5s var(--ease)",
          }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────────

export default function PlayerComparison({ playerA, playerB, onClose }) {
  // Determine which attribute group to show based on position
  const pos = playerA?.pos ?? playerB?.pos ?? "QB";
  const normalizedPos = Object.keys(POS_ATTRS).find(p => pos.startsWith(p)) ?? "QB";
  const attrs = POS_ATTRS[normalizedPos] ?? POS_ATTRS.QB;

  const sharedAttrs = useMemo(() => {
    // Show attrs that at least one player has a value for
    return attrs.filter(attr =>
      (playerA?.ratings?.[attr] != null) || (playerB?.ratings?.[attr] != null)
    );
  }, [attrs, playerA, playerB]);

  // Summary comparison
  const wins = useMemo(() => {
    let a = 0, b = 0;
    sharedAttrs.forEach(attr => {
      const va = playerA?.ratings?.[attr] ?? 0;
      const vb = playerB?.ratings?.[attr] ?? 0;
      if (va > vb) a++;
      else if (vb > va) b++;
    });
    return { a, b };
  }, [sharedAttrs, playerA, playerB]);

  if (!playerA || !playerB) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "var(--space-4)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--hairline-strong)",
        borderRadius: "var(--radius-xl)",
        overflow: "hidden",
        width: "100%", maxWidth: 680,
        maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        boxShadow: "var(--shadow-xl)",
      }}>
        {/* Modal header */}
        <div style={{
          padding: "var(--space-3) var(--space-5)",
          borderBottom: "1px solid var(--hairline)",
          background: "var(--surface-strong)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span style={{ fontSize: "1rem" }}>⚖️</span>
            <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text)" }}>
              Player Comparison
            </span>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
              · {normalizedPos}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 22, color: "var(--text-muted)", lineHeight: 1,
              padding: "0 var(--space-1)",
            }}
            aria-label="Close comparison"
          >
            ×
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* Player headers side-by-side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            <PlayerHeader player={playerA} color="var(--accent)" />
            <div style={{ borderLeft: "1px solid var(--hairline)" }}>
              <PlayerHeader player={playerB} color="#FF9F0A" />
            </div>
          </div>

          {/* Win count summary */}
          <div style={{
            padding: "var(--space-3) var(--space-5)",
            background: "var(--surface)",
            borderBottom: "1px solid var(--hairline)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: "var(--text-xs)", color: wins.a > wins.b ? "var(--accent)" : "var(--text-subtle)", fontWeight: wins.a > wins.b ? 700 : 400 }}>
              {playerA.firstName} wins {wins.a} / {sharedAttrs.length} attrs
            </span>
            <span style={{ fontSize: 10, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Head-to-Head
            </span>
            <span style={{ fontSize: "var(--text-xs)", color: wins.b > wins.a ? "#FF9F0A" : "var(--text-subtle)", fontWeight: wins.b > wins.a ? 700 : 400 }}>
              {playerB.firstName} wins {wins.b} / {sharedAttrs.length} attrs
            </span>
          </div>

          {/* Attribute bars */}
          <div style={{ padding: "var(--space-4) var(--space-5)" }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--text-subtle)", marginBottom: "var(--space-3)" }}>
              Attributes
            </div>
            {sharedAttrs.map(attr => (
              <AttributeBar
                key={attr}
                label={ATTR_LABELS[attr] ?? attr}
                valueA={playerA.ratings?.[attr]}
                valueB={playerB.ratings?.[attr]}
              />
            ))}
          </div>

          {/* OVR comparison big display */}
          <div style={{
            padding: "var(--space-4) var(--space-5)",
            borderTop: "1px solid var(--hairline)",
            display: "grid", gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center", gap: "var(--space-4)",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: playerA.ovr >= playerB.ovr ? "var(--accent)" : "var(--text-muted)" }}>
                {playerA.ovr}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>Overall</div>
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", fontWeight: 700 }}>OVR</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: playerB.ovr >= playerA.ovr ? "#FF9F0A" : "var(--text-muted)" }}>
                {playerB.ovr}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>Overall</div>
            </div>
          </div>

          {/* Age & contract comparison */}
          <div style={{
            padding: "var(--space-3) var(--space-5)",
            borderTop: "1px solid var(--hairline)",
            display: "grid", gridTemplateColumns: "1fr auto 1fr",
            gap: "var(--space-2)",
            fontSize: "var(--text-xs)",
          }}>
            {[
              { label: "Age", a: playerA.age, b: playerB.age, lowerIsBetter: true },
              { label: "Salary", a: `$${(playerA.contract?.salary ?? 0).toFixed(1)}M`, b: `$${(playerB.contract?.salary ?? 0).toFixed(1)}M`, raw: { a: playerA.contract?.salary ?? 0, b: playerB.contract?.salary ?? 0 }, lowerIsBetter: true },
              { label: "Contract", a: `${playerA.contract?.years ?? 0}yr`, b: `${playerB.contract?.years ?? 0}yr`, raw: null },
            ].map(({ label, a, b, raw, lowerIsBetter }) => {
              const ra = raw?.a ?? (typeof a === "number" ? a : null);
              const rb = raw?.b ?? (typeof b === "number" ? b : null);
              const aWins = ra != null && rb != null ? (lowerIsBetter ? ra < rb : ra > rb) : false;
              const bWins = ra != null && rb != null ? (lowerIsBetter ? rb < ra : rb > ra) : false;
              return (
                <React.Fragment key={label}>
                  <div style={{ textAlign: "right", fontWeight: aWins ? 700 : 400, color: aWins ? "var(--accent)" : "var(--text-muted)" }}>{a}</div>
                  <div style={{ textAlign: "center", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
                  <div style={{ fontWeight: bWins ? 700 : 400, color: bWins ? "#FF9F0A" : "var(--text-muted)" }}>{b}</div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
