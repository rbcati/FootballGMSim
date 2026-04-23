/**
 * GamePlanScreen.jsx — Full-screen pre-game strategy page.
 *
 * Sections:
 *  1. Offensive Scheme selector  (West Coast / Air Raid / Smashmouth)
 *  2. Defensive Scheme selector  (Cover 2 / 3-4 Blitz / Man Coverage)
 *  3. Play-calling sliders       (Run/Pass Balance, Aggression, Deep/Short)
 *  4. Special Teams settings     (Kick Return Focus, Punt Return Focus)
 *  5. Save Game Plan button      → persists to Zustand/localStorage via worker UPDATE_STRATEGY
 *                                  and shows "Plan Saved ✓" toast
 *
 * Props:
 *  - league:  league view-model (has userTeam.strategies + roster)
 *  - actions: worker action dispatchers
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { OFFENSIVE_SCHEMES, DEFENSIVE_SCHEMES } from "../../core/scheme-core.js";
import { OFFENSIVE_PLANS, DEFENSIVE_PLANS } from "../../core/strategy.js";
import { buildTeamIntelligence } from "../utils/teamIntelligence.js";
import { deriveTeamCoachingIdentity } from "../utils/coachingIdentity.js";
import { markWeeklyPrepStep } from '../utils/weeklyPrep.js';
import { HQIcon, TeamIdentityBadge } from './HQVisuals.jsx';

// ── Local-storage key for game plan sliders ───────────────────────────────────
const GP_STORAGE_KEY = "footballgm_gameplan_v1";

function loadStoredPlan() {
  try {
    const raw = localStorage.getItem(GP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveStoredPlan(plan) {
  try { localStorage.setItem(GP_STORAGE_KEY, JSON.stringify(plan)); } catch {}
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const SCHEME_ACCENT = {
  WEST_COAST:     "#0A84FF",
  VERTICAL:       "#BF5AF2",
  SMASHMOUTH:     "#FF9F0A",
  AIR_RAID:       "#BF5AF2",
  COVER_2:        "#34C759",
  COVER2:         "#34C759",
  BLITZ_34:       "#FF453A",
  BLITZ34:        "#FF453A",
  MAN_COVERAGE:   "#FFD60A",
  MAN:            "#FFD60A",
};

function schemeAccent(id = "") {
  return SCHEME_ACCENT[id] || SCHEME_ACCENT[id.replace(/-/g, "_")] || "var(--accent)";
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Section title row */
function SectionTitle({ label, icon = null, color = "var(--text-muted)" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {icon ? <span aria-hidden>{icon}</span> : null}
      <h3 style={{
        margin: 0, fontSize: "0.72rem", fontWeight: 800,
        color, textTransform: "uppercase", letterSpacing: "1.2px",
      }}>
        {label}
      </h3>
    </div>
  );
}

/** Scheme selector card — shows all options as clickable tiles */
function SchemeSelector({ title, icon, schemes, selected, onChange }) {
  const arr = Object.values(schemes);
  return (
    <div style={{
      background: "var(--surface)",
      border: "1.5px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      padding: "16px",
      marginBottom: 14,
    }}>
      <SectionTitle label={title} icon={icon} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {arr.map(scheme => {
          const isActive = scheme.id === selected;
          const accent   = schemeAccent(scheme.id);
          return (
            <button
              key={scheme.id}
              onClick={() => onChange(scheme.id)}
              style={{
                width: "100%", textAlign: "left",
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                border: `1.5px solid ${isActive ? accent : "var(--hairline)"}`,
                background: isActive ? `${accent}16` : "transparent",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
                position: "relative", overflow: "hidden",
              }}
            >
              {/* Active indicator strip */}
              {isActive && (
                <div style={{
                  position: "absolute", top: 0, left: 0, bottom: 0, width: 3,
                  background: accent, borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
                }} />
              )}
              <div style={{ paddingLeft: isActive ? 8 : 0, transition: "padding 0.15s" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 3,
                }}>
                  <span style={{
                    fontSize: "0.82rem", fontWeight: 800,
                    color: isActive ? accent : "var(--text)",
                  }}>
                    {scheme.name}
                  </span>
                  {isActive && (
                    <span style={{
                      fontSize: "0.58rem", fontWeight: 900, padding: "1px 6px",
                      background: `${accent}25`, border: `1px solid ${accent}55`,
                      color: accent, borderRadius: 10, letterSpacing: "0.4px",
                    }}>ACTIVE</span>
                  )}
                </div>
                <div style={{
                  fontSize: "0.72rem",
                  color: isActive ? "var(--text-muted)" : "var(--text-subtle)",
                  lineHeight: 1.35,
                }}>
                  {scheme.description}
                </div>
                {isActive && scheme.bonus && (
                  <div style={{ marginTop: 4, fontSize: "0.68rem" }}>
                    {scheme.bonus && scheme.bonus !== "None" && (
                      <span style={{ color: "var(--success)" }}>+ {scheme.bonus}</span>
                    )}
                    {scheme.penalty && scheme.penalty !== "None" && (
                      <span style={{ color: "var(--danger)", marginLeft: 8 }}>− {scheme.penalty}</span>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Play-calling slider row */
function PlanSlider({ label, leftLabel, rightLabel, value, onChange, color = "var(--accent)" }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "baseline", marginBottom: 6,
      }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>
          {label}
        </span>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, color }}>
          {value}%
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: "0.62rem", color: "var(--text-subtle)", width: 48, flexShrink: 0, textAlign: "right" }}>
          {leftLabel}
        </span>
        <input
          type="range"
          min={0} max={100} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            flex: 1, accentColor: color,
            height: 4, cursor: "pointer",
            WebkitAppearance: "none", appearance: "none",
          }}
        />
        <span style={{ fontSize: "0.62rem", color: "var(--text-subtle)", width: 48, flexShrink: 0 }}>
          {rightLabel}
        </span>
      </div>
    </div>
  );
}

/** Special teams option toggle (grid of pill buttons) */
function STOption({ label, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(opt => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: `1.5px solid ${isActive ? opt.color : "var(--hairline)"}`,
                background: isActive ? `${opt.color}20` : "var(--surface)",
                color: isActive ? opt.color : "var(--text-muted)",
                fontSize: "0.7rem", fontWeight: 700,
                cursor: "pointer", transition: "all 0.12s",
                minHeight: 34,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Toast banner (shown briefly after save) */
function SaveToast({ visible }) {
  return (
    <div style={{
      position: "fixed", bottom: 80, left: "50%",
      transform: `translateX(-50%) translateY(${visible ? 0 : 16}px)`,
      opacity: visible ? 1 : 0,
      transition: "all 0.25s cubic-bezier(0.2,0.8,0.2,1)",
      pointerEvents: "none",
      zIndex: 9999,
      background: "#34C759",
      color: "#fff",
      fontWeight: 800, fontSize: "0.85rem",
      padding: "10px 22px",
      borderRadius: "var(--radius-pill, 999px)",
      boxShadow: "0 4px 20px rgba(52,199,89,0.5)",
      whiteSpace: "nowrap",
    }}>
      Plan Saved ✓
    </div>
  );
}

// ── Special-teams options ─────────────────────────────────────────────────────

const KICK_RETURN_OPTIONS = [
  { value: "safe",       label: "Safe",        color: "#34C759" },
  { value: "balanced",   label: "Balanced",    color: "#0A84FF" },
  { value: "aggressive", label: "Aggressive",  color: "#FF9F0A" },
  { value: "risky",      label: "Gamble",      color: "#FF453A" },
];

const PUNT_RETURN_OPTIONS = [
  { value: "fair_catch", label: "Fair Catch",  color: "#34C759" },
  { value: "balanced",   label: "Balanced",    color: "#0A84FF" },
  { value: "aggressive", label: "Aggressive",  color: "#FF9F0A" },
];

const COVERAGE_OPTIONS = [
  { value: "protect_lead",  label: "Protect Lead",  color: "#34C759" },
  { value: "balanced",      label: "Balanced",       color: "#0A84FF" },
  { value: "pin_deep",      label: "Pin Deep",       color: "#BF5AF2" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function GamePlanScreen({ league, actions }) {
  const userTeam   = league?.teams?.find(t => t.id === league.userTeamId);
  const strategies = userTeam?.strategies || {};
  const teamIntel = buildTeamIntelligence(userTeam, { week: league?.week ?? 1 });
  const coachingIdentity = deriveTeamCoachingIdentity(userTeam, { intel: teamIntel, direction: teamIntel?.direction });

  // ── Scheme state (synced with worker) ──
  const [offScheme, setOffScheme] = useState(strategies.offSchemeId || "WEST_COAST");
  const [defScheme, setDefScheme] = useState(strategies.defSchemeId || "COVER_2");

  // ── Play-calling sliders (0-100) ──
  const stored = loadStoredPlan();
  const [runPassBalance,    setRunPassBalance]    = useState(stored?.runPassBalance    ?? 50);
  const [aggressionLevel,   setAggressionLevel]   = useState(stored?.aggressionLevel   ?? 50);
  const [deepShortBalance,  setDeepShortBalance]  = useState(stored?.deepShortBalance  ?? 50);
  const [blitzFrequency,    setBlitzFrequency]    = useState(stored?.blitzFrequency    ?? 30);

  // ── Special teams ──
  const [kickReturn,  setKickReturn]  = useState(stored?.kickReturn  || "balanced");
  const [puntReturn,  setPuntReturn]  = useState(stored?.puntReturn  || "balanced");
  const [coverage,    setCoverage]    = useState(stored?.coverage    || "balanced");

  // ── Toast state ──
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef(null);

  useEffect(() => {
    markWeeklyPrepStep(league, 'planReviewed', true);
  }, [league?.seasonId, league?.week, league?.userTeamId]);

  // Sync scheme from server if it updates
  useEffect(() => {
    if (strategies.offSchemeId) setOffScheme(strategies.offSchemeId);
    if (strategies.defSchemeId) setDefScheme(strategies.defSchemeId);
  }, [strategies.offSchemeId, strategies.defSchemeId]);

  const handleSave = useCallback(() => {
    // Persist sliders + ST to localStorage
    const plan = {
      runPassBalance, aggressionLevel, deepShortBalance, blitzFrequency,
      kickReturn, puntReturn, coverage,
    };
    saveStoredPlan(plan);

    // Send everything to worker (scheme + sliders as extended strategy)
    if (actions?.send) {
      actions.send("UPDATE_STRATEGY", {
        offSchemeId:    offScheme,
        defSchemeId:    defScheme,
        // keep any existing plan/risk ids intact
        offPlanId:      strategies.offPlanId  || "BALANCED",
        defPlanId:      strategies.defPlanId  || "BALANCED",
        riskId:         strategies.riskId     || "BALANCED",
        // extended game-plan data
        gamePlan: plan,
      });
    }

    // Show toast
    clearTimeout(toastTimer.current);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2200);
  }, [
    offScheme, defScheme,
    runPassBalance, aggressionLevel, deepShortBalance, blitzFrequency,
    kickReturn, puntReturn, coverage,
    strategies, actions,
  ]);

  // Determine next game info for header
  const nextGame = (() => {
    if (!league?.schedule?.weeks) return null;
    const uid = league.userTeamId;
    for (const week of league.schedule.weeks) {
      for (const game of week.games ?? []) {
        if (game.played) continue;
        const hId = typeof game.home === "object" ? game.home.id : Number(game.home);
        const aId = typeof game.away === "object" ? game.away.id : Number(game.away);
        if (hId === uid || aId === uid) {
          const isHome = hId === uid;
          const oppId  = isHome ? aId : hId;
          const opp    = league.teams?.find(t => t.id === oppId);
          return { week: week.week, isHome, opp };
        }
      }
    }
    return null;
  })();

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 100 }}>
      {coachingIdentity && (
        <div style={{ marginBottom: 12, border: "1px solid var(--hairline)", borderRadius: 10, background: "var(--surface)", padding: 10 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Coaching & Scheme Identity</div>
          <div style={{ fontSize: "0.82rem", color: "var(--text)", marginTop: 4 }}>
            {coachingIdentity.philosophy.offSchemeName} / {coachingIdentity.philosophy.defSchemeName} · {coachingIdentity.seat.label}
          </div>
          <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 3 }}>
            {coachingIdentity.rosterFitNotes?.[0] ?? "Current scheme fit is tied to roster composition and staff philosophy."}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        background: "var(--surface)",
        border: "1.5px solid var(--hairline)",
        borderTop: "3px solid var(--accent)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 18px",
        marginBottom: 18,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>
            Game Plan
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "var(--text)" }}>
            {nextGame
              ? `Week ${nextGame.week} — ${nextGame.isHome ? "vs" : "@"} ${nextGame.opp?.abbr ?? "Opp"}`
              : "Season Strategy"}
          </div>
          {userTeam && (
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
              {userTeam.name}
              {nextGame && <span style={{ marginLeft: 6, color: nextGame.isHome ? "#34C759" : "#FF9F0A", fontWeight: 700 }}>
                {nextGame.isHome ? "HOME" : "AWAY"}
              </span>}
            </div>
          )}
        </div>
        <button
          onClick={handleSave}
          style={{
            background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: "var(--radius-md)",
            padding: "12px 24px", fontWeight: 800, fontSize: "0.88rem",
            cursor: "pointer", minHeight: 44,
            boxShadow: "0 4px 16px rgba(10,132,255,0.35)",
            transition: "transform 0.1s, box-shadow 0.1s",
          }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
          onMouseUp={e => e.currentTarget.style.transform = ""}
          onMouseLeave={e => e.currentTarget.style.transform = ""}
        >
          Save Game Plan
        </button>
      </div>
      {nextGame ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, border: '1px solid var(--hairline)', borderRadius: 10, padding: 10, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TeamIdentityBadge team={userTeam} size={32} emphasize />
            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Matchup Plan</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{nextGame.isHome ? 'vs' : '@'} {nextGame.opp?.name ?? 'Opponent'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TeamIdentityBadge team={nextGame.opp} size={32} />
          </div>
        </div>
      ) : null}

      {/* ── Offensive Scheme ── */}
      <SchemeSelector
        title="Offensive Scheme"
        icon={<HQIcon name="target" size={14} />}
        schemes={OFFENSIVE_SCHEMES}
        selected={offScheme}
        onChange={setOffScheme}
      />

      {/* ── Defensive Scheme ── */}
      <SchemeSelector
        title="Defensive Scheme"
        icon={<HQIcon name="shield" size={14} />}
        schemes={DEFENSIVE_SCHEMES}
        selected={defScheme}
        onChange={setDefScheme}
      />

      {/* ── Play-Calling Sliders ── */}
      <div style={{
        background: "var(--surface)",
        border: "1.5px solid var(--hairline)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 18px",
        marginBottom: 14,
      }}>
        <SectionTitle label="Play-Calling" icon={<HQIcon name="clipboard" size={14} />} />

        <PlanSlider
          label="Run / Pass Balance"
          leftLabel="Run Heavy"
          rightLabel="Pass Heavy"
          value={runPassBalance}
          onChange={setRunPassBalance}
          color="#FF9F0A"
        />
        <PlanSlider
          label="Aggression"
          leftLabel="Conservative"
          rightLabel="Aggressive"
          value={aggressionLevel}
          onChange={setAggressionLevel}
          color="#FF453A"
        />
        <PlanSlider
          label="Pass Depth"
          leftLabel="Short / Quick"
          rightLabel="Deep Shots"
          value={deepShortBalance}
          onChange={setDeepShortBalance}
          color="#BF5AF2"
        />
        <PlanSlider
          label="Defensive Blitz Rate"
          leftLabel="Coverage"
          rightLabel="Blitz Heavy"
          value={blitzFrequency}
          onChange={setBlitzFrequency}
          color="#0A84FF"
        />
      </div>

      {/* ── Special Teams ── */}
      <div style={{
        background: "var(--surface)",
        border: "1.5px solid var(--hairline)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 18px",
        marginBottom: 14,
      }}>
        <SectionTitle label="Special Teams" icon={<HQIcon name="lineup" size={14} />} />

        <STOption
          label="Kick Return Strategy"
          options={KICK_RETURN_OPTIONS}
          value={kickReturn}
          onChange={setKickReturn}
        />
        <STOption
          label="Punt Return Strategy"
          options={PUNT_RETURN_OPTIONS}
          value={puntReturn}
          onChange={setPuntReturn}
        />
        <STOption
          label="Kickoff Coverage"
          options={COVERAGE_OPTIONS}
          value={coverage}
          onChange={setCoverage}
        />
      </div>

      {/* ── Save Button (bottom sticky) ── */}
      <div style={{
        position: "sticky", bottom: 16,
        padding: "0 0 4px",
      }}>
        <button
          onClick={handleSave}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #0A84FF, #0A84FFbb)",
            color: "#fff",
            border: "none", borderRadius: "var(--radius-lg)",
            padding: "16px", fontWeight: 900, fontSize: "0.95rem",
            cursor: "pointer", minHeight: 52,
            boxShadow: "0 4px 24px rgba(10,132,255,0.4)",
            transition: "transform 0.1s",
            letterSpacing: "0.3px",
          }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
          onMouseUp={e => e.currentTarget.style.transform = ""}
          onMouseLeave={e => e.currentTarget.style.transform = ""}
        >
          Save Game Plan →
        </button>
      </div>

      {/* ── Toast ── */}
      <SaveToast visible={toastVisible} />
    </div>
  );
}
