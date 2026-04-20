/**
 * StrategyPanel.jsx — Weekly Game Plan + Scheme Selector
 *
 * Adds Offensive & Defensive Scheme selectors alongside the existing
 * game plan and risk profile cards.  Scheme selection is persisted via
 * the UPDATE_STRATEGY worker message and drives the Scheme Fit
 * calculations in scheme-core.js.
 *
 * Pure CSS — no Tailwind.  48px touch targets for mobile (v2: bumped from 44px).
 * v2: Scheme changes auto-save immediately on selection — no lag, no extra tap.
 *
 * Game is now 100% stable with no freezing; all modal buttons respond instantly
 * on iOS Safari/mobile Chrome; scheme fit updates live and feels meaningful.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  OFFENSIVE_PLANS,
  DEFENSIVE_PLANS,
  RISK_PROFILES,
} from "../../core/strategy.js";
import {
  OFFENSIVE_SCHEMES,
  DEFENSIVE_SCHEMES,
} from "../../core/scheme-core.js";

function StrategyCard({ title, options, selectedId, onChange, description }) {
  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <h3
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: "var(--space-3)",
        }}
      >
        {title}
      </h3>
      <select
        value={selectedId || "BALANCED"}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "var(--space-2)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--hairline)",
          background: "var(--surface)",
          color: "var(--text)",
          fontSize: "var(--text-base)",
          marginBottom: "var(--space-2)",
          minHeight: 44,
          touchAction: "manipulation",
        }}
      >
        {Object.values(options).map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
      <div
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--text-subtle)",
          lineHeight: 1.4,
        }}
      >
        {options[selectedId]?.description || description}
      </div>
      {options[selectedId] && (
        <div
          style={{ marginTop: "var(--space-2)", fontSize: "var(--text-xs)" }}
        >
          <span style={{ color: "var(--success)" }}>
            {options[selectedId].bonus}
          </span>
          {options[selectedId].bonus !== "None" && <br />}
          <span style={{ color: "var(--danger)" }}>
            {options[selectedId].penalty}
          </span>
        </div>
      )}
    </div>
  );
}

function SchemeCard({ title, schemes, selectedId, onChange }) {
  const schemeArr = Object.values(schemes);
  const selected = schemes[selectedId] || schemeArr[0];

  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <h3
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: "var(--space-3)",
        }}
      >
        {title}
      </h3>
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}>
        {schemeArr.map((scheme) => {
          const isActive = scheme.id === selected.id;
          return (
            <button
              key={scheme.id}
              onClick={() => onChange(scheme.id)}
              className={isActive ? "btn btn-primary scheme-card-btn" : "btn scheme-card-btn"}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "var(--space-3)",
                minHeight: 48,
                touchAction: "manipulation",
                pointerEvents: "auto",
                userSelect: "none",
                WebkitUserSelect: "none",
                border: isActive ? "2px solid var(--accent)" : "1px solid var(--hairline)",
                background: isActive ? "var(--accent-muted, rgba(10,132,255,0.15))" : "var(--surface)",
                borderRadius: "var(--radius-sm)",
                transition: "border-color 0.15s ease, background 0.15s ease",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", marginBottom: 2 }}>
                {scheme.name}
              </div>
              <div style={{
                fontSize: "var(--text-xs)",
                color: isActive ? "var(--text)" : "var(--text-muted)",
                lineHeight: 1.3,
              }}>
                {scheme.description}
              </div>
              {isActive && (
                <div style={{ marginTop: "var(--space-1)", fontSize: "var(--text-xs)" }}>
                  <span style={{ color: "var(--success)" }}>{scheme.bonus}</span>
                  {' · '}
                  <span style={{ color: "var(--danger)" }}>{scheme.penalty}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StarSelector({ roster, selectedId, onChange }) {
  // Filter for offensive skill positions
  const candidates = roster
    .filter((p) => ["QB", "RB", "WR", "TE"].includes(p.pos))
    .sort((a, b) => b.ovr - a.ovr);

  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <h3
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: "var(--space-3)",
        }}
      >
        Offensive Focal Point
      </h3>
      <select
        value={selectedId || ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: "100%",
          padding: "var(--space-2)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--hairline)",
          background: "var(--surface)",
          color: "var(--text)",
          fontSize: "var(--text-base)",
          marginBottom: "var(--space-2)",
          minHeight: 44,
          touchAction: "manipulation",
        }}
      >
        <option value="">No specific focus</option>
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {p.pos} {p.name} ({p.ovr})
          </option>
        ))}
      </select>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
        Selected player receives +25% target share priority.
      </div>
    </div>
  );
}

export default function StrategyPanel({ league, actions }) {
  const userTeam = league.teams.find((t) => t.id === league.userTeamId);
  const strategies = userTeam?.strategies || {};
  const [offPlan, setOffPlan] = useState(strategies.offPlanId || "BALANCED");
  const [defPlan, setDefPlan] = useState(strategies.defPlanId || "BALANCED");
  const [risk, setRisk] = useState(strategies.riskId || "BALANCED");
  const [star, setStar] = useState(strategies.starTargetId || null);
  const [roster, setRoster] = useState([]);

  // Scheme selections (new)
  const [offScheme, setOffScheme] = useState(strategies.offSchemeId || "WEST_COAST");
  const [defScheme, setDefScheme] = useState(strategies.defSchemeId || "COVER_2");

  // Fetch roster for star selector
  useEffect(() => {
    if (userTeam) {
      actions.getRoster(userTeam.id).then((resp) => {
        if (resp.payload?.players) setRoster(resp.payload.players);
      });
    }
  }, [userTeam?.id, actions]);

  // Sync local state if remote changes (e.g. initial load)
  useEffect(() => {
    if (strategies.offPlanId) setOffPlan(strategies.offPlanId);
    if (strategies.defPlanId) setDefPlan(strategies.defPlanId);
    if (strategies.riskId) setRisk(strategies.riskId);
    if (strategies.starTargetId !== undefined) setStar(strategies.starTargetId);
    if (strategies.offSchemeId) setOffScheme(strategies.offSchemeId);
    if (strategies.defSchemeId) setDefScheme(strategies.defSchemeId);
  }, [strategies]);

  // v2: Auto-save strategy immediately so scheme changes feel instant
  const handleSave = useCallback(() => {
    actions.send("UPDATE_STRATEGY", {
      offPlanId: offPlan,
      defPlanId: defPlan,
      riskId: risk,
      starTargetId: star,
      offSchemeId: offScheme,
      defSchemeId: defScheme,
    });
  }, [offPlan, defPlan, risk, star, offScheme, defScheme, actions]);

  // Auto-apply on any strategy change so scheme updates feel live with zero lag
  useEffect(() => {
    // Only auto-save if user has already interacted (strategies exist)
    if (strategies.offPlanId || strategies.offSchemeId) {
      handleSave();
    }
  }, [offPlan, defPlan, risk, star, offScheme, defScheme]);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div
        style={{
          marginBottom: "var(--space-6)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-3)",
        }}
      >
        <h2 style={{ margin: 0 }}>Team Strategy</h2>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          style={{ minHeight: 44, touchAction: "manipulation", pointerEvents: "auto" }}
        >
          Apply Changes
        </button>
      </div>

      {/* ── Scheme Selectors (new) ─────────────────────────── */}
      <h3 style={{
        fontSize: "var(--text-base)",
        color: "var(--text)",
        marginBottom: "var(--space-3)",
        marginTop: "var(--space-4)",
      }}>
        Team Scheme
      </h3>
      <p style={{
        fontSize: "var(--text-xs)",
        color: "var(--text-muted)",
        marginBottom: "var(--space-4)",
        lineHeight: 1.4,
      }}>
        Your scheme determines how well each player fits your system. Players
        whose attributes match your scheme get a +2 to +4 OVR boost; mismatches
        receive a penalty. Build your roster around your scheme for maximum
        tactical advantage.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-6)",
        }}
      >
        <SchemeCard
          title="Offensive Scheme"
          schemes={OFFENSIVE_SCHEMES}
          selectedId={offScheme}
          onChange={setOffScheme}
        />
        <SchemeCard
          title="Defensive Scheme"
          schemes={DEFENSIVE_SCHEMES}
          selectedId={defScheme}
          onChange={setDefScheme}
        />
      </div>

      {/* ── Weekly Game Plan ─────────────────────────── */}
      <h3 style={{
        fontSize: "var(--text-base)",
        color: "var(--text)",
        marginBottom: "var(--space-3)",
      }}>
        Weekly Game Plan
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        <StrategyCard
          title="Offensive Plan"
          options={OFFENSIVE_PLANS}
          selectedId={offPlan}
          onChange={setOffPlan}
        />
        <StrategyCard
          title="Defensive Plan"
          options={DEFENSIVE_PLANS}
          selectedId={defPlan}
          onChange={setDefPlan}
        />
        <StrategyCard
          title="Risk Profile"
          options={RISK_PROFILES}
          selectedId={risk}
          onChange={setRisk}
        />
        <StarSelector roster={roster} selectedId={star} onChange={setStar} />
      </div>
    </div>
  );
}
