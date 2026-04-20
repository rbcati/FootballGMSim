/**
 * ContractNegotiation.jsx
 * Premium bottom-sheet contract offer builder for Free Agency
 * Uses existing glassmorphism tokens + PlayerCard compact header
 */

import React, { useState, useMemo } from "react";
import PlayerCard from "./PlayerCard.jsx";

const CAP_TOTAL = 301.2; // hard cap in $M

function CapImpactBar({ capRoom, capHitThisYear }) {
  const capUsed = Math.max(0, CAP_TOTAL - (capRoom ?? 0));
  const newCapUsed = capUsed + capHitThisYear;
  const pctUsed = Math.min(100, (capUsed / CAP_TOTAL) * 100);
  const pctNew = Math.min(100, (newCapUsed / CAP_TOTAL) * 100);
  const pctAdded = Math.max(0, pctNew - pctUsed);
  const isOverCap = newCapUsed > CAP_TOTAL;
  const barColor = isOverCap ? "#FF453A" : pctNew > 90 ? "#FF9F0A" : "#0A84FF";
  const addColor = isOverCap ? "#FF453A" : "#FF9F0A";

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 4,
      }}>
        <span>Cap Impact</span>
        <span style={{ fontWeight: 700, color: isOverCap ? "#FF453A" : "var(--text-muted)" }}>
          ${newCapUsed.toFixed(1)}M / ${CAP_TOTAL}M
        </span>
      </div>
      {/* Bar */}
      <div style={{
        height: 8, borderRadius: 4, background: "var(--hairline)",
        overflow: "hidden", position: "relative",
      }}>
        {/* Current usage */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${pctUsed}%`, background: barColor,
          borderRadius: "4px 0 0 4px", transition: "width 0.2s",
        }} />
        {/* New contract addition */}
        <div style={{
          position: "absolute", left: `${pctUsed}%`, top: 0, bottom: 0,
          width: `${pctAdded}%`, background: addColor,
          opacity: 0.85,
          borderRadius: pctAdded > 0 ? "0 4px 4px 0" : 0,
          transition: "width 0.2s, left 0.2s",
        }} />
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: "0.6rem", color: "var(--text-subtle)", marginTop: 3,
      }}>
        <span>Used: ${capUsed.toFixed(1)}M</span>
        <span style={{ color: addColor }}>+${capHitThisYear.toFixed(1)}M</span>
        <span>Room after: ${(CAP_TOTAL - newCapUsed).toFixed(1)}M</span>
      </div>
      {isOverCap && (
        <div style={{
          marginTop: 4, fontSize: "0.65rem", fontWeight: 700, color: "#FF453A",
          background: "#FF453A18", border: "1px solid #FF453A44",
          borderRadius: 4, padding: "2px 8px", textAlign: "center",
        }}>
          ⚠ Over Cap — reduce salary or release another player first
        </div>
      )}
    </div>
  );
}

export default function ContractNegotiation({
  player,
  capRoom,
  onOffer,
  onSignImmediately,
  onClose,
}) {
  const [years, setYears] = useState(3);
  const [annual, setAnnual] = useState(Math.max(0.8, Math.round((player.baseAnnual || 4) * 10) / 10));
  const [guaranteePct, setGuaranteePct] = useState(50);
  const [bonus, setBonus] = useState(0);
  const [hasNoTradeClause, setHasNoTradeClause] = useState(false);
  const [optionYear, setOptionYear] = useState(0);
  const [tagType, setTagType] = useState("none");
  const [incentives, setIncentives] = useState({ mvp: false, allPro: false, yards: false });

  const totalValue = useMemo(() => annual * years, [annual, years]);
  const capHitThisYear = useMemo(() => {
    const proratedBonus = bonus / years;
    return Math.round((annual + proratedBonus) * 10) / 10;
  }, [annual, years, bonus]);

  const deadMoney = useMemo(() => {
    const guaranteed = totalValue * (guaranteePct / 100);
    return Math.round(guaranteed * 10) / 10;
  }, [totalValue, guaranteePct]);

  const capRoomAfter = useMemo(() => {
    return Math.round(((capRoom ?? 0) - capHitThisYear) * 10) / 10;
  }, [capRoom, capHitThisYear]);

  const schemeFit = useMemo(() => {
    return player.ovr > 80 ? "Excellent" : "Good";
  }, [player]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "92vh",
          background: "var(--surface-elevated)",
          borderRadius: "20px 20px 0 0",
          padding: "var(--space-4) var(--space-5) var(--space-6)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
          overflowY: "auto",
        }}
      >
        {/* Header drag handle */}
        <div style={{ width: 40, height: 4, background: "var(--hairline-strong)", borderRadius: 2, margin: "0 auto 16px" }} />

        {/* Player header */}
        <PlayerCard player={player} variant="compact" />

        {/* Negotiation title */}
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 800, marginTop: "var(--space-4)", marginBottom: "var(--space-3)" }}>
          Contract Offer
        </div>

        {/* Sliders */}
        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          {/* Years */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)" }}>Years</span>
              <span style={{ fontSize: "var(--text-base)", fontWeight: 900 }}>{years}</span>
            </div>
            <input
              type="range"
              min="1"
              max="6"
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          {/* Annual */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)" }}>Annual ($M)</span>
              <span style={{ fontSize: "var(--text-base)", fontWeight: 900 }}>{annual.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="30"
              step="0.1"
              value={annual}
              onChange={(e) => setAnnual(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          {/* Guarantee */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)" }}>Guaranteed %</span>
              <span style={{ fontSize: "var(--text-base)", fontWeight: 900 }}>{guaranteePct}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={guaranteePct}
              onChange={(e) => setGuaranteePct(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          {/* Bonus */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)" }}>Signing Bonus ($M)</span>
              <span style={{ fontSize: "var(--text-base)", fontWeight: 900 }}>{bonus.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max={Math.round(totalValue * 0.4)}
              step="0.1"
              value={bonus}
              onChange={(e) => setBonus(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        </div>


          {/* Clauses */}
          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700 }}>Clauses & Options</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <input type="checkbox" checked={hasNoTradeClause} onChange={(e) => setHasNoTradeClause(e.target.checked)} />
              <span style={{ fontSize: 'var(--text-xs)' }}>No-trade clause</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <input type="checkbox" checked={optionYear > 0} onChange={(e) => setOptionYear(e.target.checked ? years : 0)} />
              <span style={{ fontSize: 'var(--text-xs)' }}>Option year ({optionYear > 0 ? `Year ${optionYear}` : 'Off'})</span>
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Tag</span>
              <select value={tagType} onChange={(e) => setTagType(e.target.value)} style={{ fontSize: 'var(--text-xs)' }}>
                <option value="none">None</option>
                <option value="franchise">Franchise</option>
                <option value="transition">Transition</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <label style={{ fontSize: 'var(--text-xs)' }}><input type="checkbox" checked={incentives.mvp} onChange={(e) => setIncentives((v) => ({ ...v, mvp: e.target.checked }))} /> MVP bonus</label>
              <label style={{ fontSize: 'var(--text-xs)' }}><input type="checkbox" checked={incentives.allPro} onChange={(e) => setIncentives((v) => ({ ...v, allPro: e.target.checked }))} /> All-Pro bonus</label>
              <label style={{ fontSize: 'var(--text-xs)' }}><input type="checkbox" checked={incentives.yards} onChange={(e) => setIncentives((v) => ({ ...v, yards: e.target.checked }))} /> Yardage bonus</label>
            </div>
          </div>

        {/* Live preview */}
        <div style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", marginTop: "var(--space-5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", marginBottom: 6 }}>
            <span>Total Value</span>
            <span style={{ fontWeight: 900 }}>${totalValue.toFixed(1)}M</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", marginBottom: 6 }}>
            <span>Year 1 Cap Hit</span>
            <span style={{ fontWeight: 900 }}>${capHitThisYear}M</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", marginBottom: 6 }}>
            <span>Dead Money</span>
            <span style={{ fontWeight: 900 }}>${deadMoney}M</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", color: capRoomAfter < 0 ? "var(--danger)" : "var(--success)" }}>
            <span>Cap Room After</span>
            <span style={{ fontWeight: 900 }}>${capRoomAfter}M</span>
          </div>
          <div style={{ fontSize: "var(--text-xs)", marginTop: 8, color: schemeFit === "Excellent" ? "var(--success)" : "var(--warning)" }}>
            Scheme Fit: <strong>{schemeFit}</strong>
          </div>
          <CapImpactBar capRoom={capRoom} capHitThisYear={capHitThisYear} />
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
          <button
            className="btn-premium"
            onClick={onClose}
            style={{ flex: 1, background: "var(--surface-strong)" }}
          >
            Cancel
          </button>
          <button
            className="btn-premium btn-primary-premium"
            onClick={() => onOffer({ years, annual, guaranteePct, bonus, hasNoTradeClause, optionYear, tagType, incentives })}
            style={{ flex: 2 }}
          >
            Submit Offer
          </button>
        </div>

        {player.ovr >= 85 && (
          <button
            className="btn-premium"
            onClick={onSignImmediately}
            style={{ width: "100%", marginTop: "var(--space-3)", background: "var(--success)" }}
          >
            Sign Immediately (Star FA)
          </button>
        )}
      </div>
    </div>
  );
}
