import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { OFFENSIVE_SCHEMES, DEFENSIVE_SCHEMES } from "../../core/scheme-core.js";
import { buildTeamIntelligence } from "../utils/teamIntelligence.js";
import { deriveTeamCoachingIdentity } from "../utils/coachingIdentity.js";
import { markWeeklyPrepStep, getWeeklyPrepProgress } from '../utils/weeklyPrep.js';
import { HQIcon, TeamIdentityBadge } from './HQVisuals.jsx';
import { buildGamePlanScreenModel } from '../utils/gamePlanScreenModel.js';

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

const SCHEME_ACCENT = {
  WEST_COAST: "#C9A54B", VERTICAL: "#BF5AF2", SMASHMOUTH: "#FF9F0A", AIR_RAID: "#BF5AF2",
  COVER_2: "#8B9BB0", COVER2: "#8B9BB0", BLITZ_34: "#C07A66", BLITZ34: "#C07A66", MAN_COVERAGE: "#FFD60A", MAN: "#FFD60A",
};

function schemeAccent(id = "") {
  return SCHEME_ACCENT[id] || SCHEME_ACCENT[id.replace(/-/g, "_")] || "var(--accent)";
}

function SectionTitle({ label, icon = null, color = "var(--text-muted)" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {icon ? <span aria-hidden>{icon}</span> : null}
      <h3 style={{ margin: 0, fontSize: "0.72rem", fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "1.2px" }}>{label}</h3>
    </div>
  );
}

function SchemeSelector({ title, icon, schemes, selected, onChange }) {
  const arr = Object.values(schemes);
  return (
    <div style={{ background: "var(--surface)", border: "1.5px solid var(--hairline)", borderRadius: "var(--radius-lg)", padding: "16px", marginBottom: 14 }}>
      <SectionTitle label={title} icon={icon} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {arr.map((scheme) => {
          const isActive = scheme.id === selected;
          const accent = schemeAccent(scheme.id);
          return (
            <button key={scheme.id} onClick={() => onChange(scheme.id)} style={{ width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: "var(--radius-md)", border: `1.5px solid ${isActive ? accent : "var(--hairline)"}`,
              background: isActive ? `${accent}16` : "transparent", cursor: "pointer", position: "relative", overflow: "hidden" }}>
              {isActive && <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: accent, borderRadius: "var(--radius-md) 0 0 var(--radius-md)" }} />}
              <div style={{ paddingLeft: isActive ? 8 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 800, color: isActive ? accent : "var(--text)" }}>{scheme.name}</span>
                </div>
                <div style={{ fontSize: "0.72rem", color: isActive ? "var(--text-muted)" : "var(--text-subtle)", lineHeight: 1.35 }}>{scheme.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlanSlider({ label, leftLabel, rightLabel, value, onChange, color = "var(--accent)" }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>{label}</span>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, color }}>{value}%</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: "0.62rem", color: "var(--text-subtle)", width: 48, flexShrink: 0, textAlign: "right" }}>{leftLabel}</span>
        <input type="range" min={0} max={100} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1, accentColor: color, height: 4, cursor: "pointer", WebkitAppearance: "none", appearance: "none" }} />
        <span style={{ fontSize: "0.62rem", color: "var(--text-subtle)", width: 48, flexShrink: 0 }}>{rightLabel}</span>
      </div>
    </div>
  );
}

function STOption({ label, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button key={opt.value} onClick={() => onChange(opt.value)} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${isActive ? opt.color : "var(--hairline)"}`,
              background: isActive ? `${opt.color}20` : "var(--surface)", color: isActive ? opt.color : "var(--text-muted)", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", minHeight: 34 }}>
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const KICK_RETURN_OPTIONS = [
  { value: "safe", label: "Safe", color: "#34C759" },
  { value: "balanced", label: "Balanced", color: "#0A84FF" },
  { value: "aggressive", label: "Aggressive", color: "#FF9F0A" },
  { value: "risky", label: "Gamble", color: "#FF453A" },
];
const PUNT_RETURN_OPTIONS = [
  { value: "fair_catch", label: "Fair Catch", color: "#34C759" },
  { value: "balanced", label: "Balanced", color: "#0A84FF" },
  { value: "aggressive", label: "Aggressive", color: "#FF9F0A" },
];
const COVERAGE_OPTIONS = [
  { value: "protect_lead", label: "Protect Lead", color: "#34C759" },
  { value: "balanced", label: "Balanced", color: "#0A84FF" },
  { value: "pin_deep", label: "Pin Deep", color: "#BF5AF2" },
];

export default function GamePlanScreen({ league, actions, onNavigate }) {
  const userTeam = league?.teams?.find((t) => t.id === league.userTeamId);
  const strategies = userTeam?.strategies || {};
  const teamIntel = buildTeamIntelligence(userTeam, { week: league?.week ?? 1 });
  const coachingIdentity = deriveTeamCoachingIdentity(userTeam, { intel: teamIntel, direction: teamIntel?.direction });
  const prepProgress = useMemo(() => getWeeklyPrepProgress(league), [league?.seasonId, league?.week, league?.userTeamId]);
  const model = useMemo(() => buildGamePlanScreenModel({ league, prepProgress }), [league, prepProgress]);

  const [offScheme, setOffScheme] = useState(strategies.offSchemeId || "WEST_COAST");
  const [defScheme, setDefScheme] = useState(strategies.defSchemeId || "COVER_2");

  const stored = loadStoredPlan();
  const [runPassBalance, setRunPassBalance] = useState(stored?.runPassBalance ?? model?.strategySummary?.runPassBalance ?? 50);
  const [aggressionLevel, setAggressionLevel] = useState(stored?.aggressionLevel ?? model?.strategySummary?.aggressionLevel ?? 50);
  const [deepShortBalance, setDeepShortBalance] = useState(stored?.deepShortBalance ?? model?.strategySummary?.deepShortBalance ?? 50);
  const [blitzFrequency, setBlitzFrequency] = useState(stored?.blitzFrequency ?? model?.strategySummary?.blitzFrequency ?? 30);

  const [kickReturn, setKickReturn] = useState(stored?.kickReturn || "balanced");
  const [puntReturn, setPuntReturn] = useState(stored?.puntReturn || "balanced");
  const [coverage, setCoverage] = useState(stored?.coverage || "balanced");

  const [saveMessage, setSaveMessage] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => {
    markWeeklyPrepStep(league, 'planReviewed', true);
  }, [league?.seasonId, league?.week, league?.userTeamId]);

  useEffect(() => {
    if (strategies.offSchemeId) setOffScheme(strategies.offSchemeId);
    if (strategies.defSchemeId) setDefScheme(strategies.defSchemeId);
  }, [strategies.offSchemeId, strategies.defSchemeId]);

  const handleSave = useCallback(() => {
    const plan = { runPassBalance, aggressionLevel, deepShortBalance, blitzFrequency, kickReturn, puntReturn, coverage };
    saveStoredPlan(plan);
    markWeeklyPrepStep(league, 'planReviewed', true);

    if (actions?.send) {
      actions.send("UPDATE_STRATEGY", {
        offSchemeId: offScheme,
        defSchemeId: defScheme,
        offPlanId: strategies.offPlanId || "BALANCED",
        defPlanId: strategies.defPlanId || "BALANCED",
        riskId: strategies.riskId || "BALANCED",
        gamePlan: plan,
      });
    }

    clearTimeout(toastTimer.current);
    setSaveMessage(`Plan saved for Week ${league?.week ?? model.week}.`);
    toastTimer.current = setTimeout(() => setSaveMessage(''), 2600);
  }, [offScheme, defScheme, runPassBalance, aggressionLevel, deepShortBalance, blitzFrequency, kickReturn, puntReturn, coverage, strategies, actions, league, model.week]);

  return (
    <div className="app-game-plan-screen" style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 110 }}>
      <section className="app-game-plan-hero card" aria-label="Game plan hero">
        <div className="app-game-plan-hero__meta">Week {model.week} • {model.homeAway}</div>
        <div className="app-game-plan-hero__row">
          <div className="app-game-plan-team-pill">
            <TeamIdentityBadge team={model.userTeam} size={56} emphasize />
            <div><strong>{model.userTeam?.abbr ?? 'YOU'}</strong><span>{model.userRecord}</span></div>
          </div>
          <h1>{model.hasOpponent ? `${model.isHome ? 'vs' : '@'} ${model.opponent?.abbr ?? 'TBD'}` : 'Game Plan'}</h1>
          <div className="app-game-plan-team-pill app-game-plan-team-pill--opp">
            <TeamIdentityBadge team={model.opponent} size={56} />
            <div><strong>{model.opponent?.abbr ?? 'TBD'}</strong><span>{model.opponentRecord}</span></div>
          </div>
        </div>
        <p>{model.matchupHeadline}</p>
      </section>

      <section className="card app-game-plan-card" aria-label="Tactical brief">
        <SectionTitle label="Tactical Brief" icon={<HQIcon name="clipboard" size={14} />} />
        <p className="app-game-plan-impact-summary">{model.impactSummary}</p>
        <div className="app-game-plan-brief-grid">
          {model.tacticalBrief.map((item) => (
            <article key={item.id} className="app-game-plan-brief-item">
              <strong>{item.title}</strong>
              <p>{item.explanation}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card app-game-plan-card" aria-label="Current plan summary">
        <SectionTitle label="Current Plan" icon={<HQIcon name="gamePlan" size={14} />} />
        <div className="app-hero-summary-grid">
          <div><span>Offensive Scheme</span><strong>{OFFENSIVE_SCHEMES[offScheme]?.name ?? offScheme}</strong></div>
          <div><span>Defensive Scheme</span><strong>{DEFENSIVE_SCHEMES[defScheme]?.name ?? defScheme}</strong></div>
          <div><span>Run / Pass</span><strong>{runPassBalance}% pass lean</strong></div>
          <div><span>Aggression</span><strong>{aggressionLevel}%</strong></div>
          <div><span>Pass Depth</span><strong>{deepShortBalance}% deep</strong></div>
          <div><span>Blitz Rate</span><strong>{blitzFrequency}%</strong></div>
        </div>
      </section>

      {coachingIdentity && (
        <div style={{ marginBottom: 12, border: "1px solid var(--hairline)", borderRadius: 10, background: "var(--surface)", padding: 10 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Coaching & Scheme Identity</div>
          <div style={{ fontSize: "0.82rem", color: "var(--text)", marginTop: 4 }}>{coachingIdentity.philosophy.offSchemeName} / {coachingIdentity.philosophy.defSchemeName} · {coachingIdentity.seat.label}</div>
          <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 3 }}>{coachingIdentity.rosterFitNotes?.[0] ?? "Current scheme fit is tied to roster composition and staff philosophy."}</div>
        </div>
      )}

      <SchemeSelector title="Offensive Scheme" icon={<HQIcon name="target" size={14} />} schemes={OFFENSIVE_SCHEMES} selected={offScheme} onChange={setOffScheme} />
      <SchemeSelector title="Defensive Scheme" icon={<HQIcon name="shield" size={14} />} schemes={DEFENSIVE_SCHEMES} selected={defScheme} onChange={setDefScheme} />

      <div style={{ background: "var(--surface)", border: "1.5px solid var(--hairline)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: 14 }}>
        <SectionTitle label="Play-Calling" icon={<HQIcon name="clipboard" size={14} />} />
        <PlanSlider label="Run / Pass Balance" leftLabel="Run Heavy" rightLabel="Pass Heavy" value={runPassBalance} onChange={setRunPassBalance} color="#FF9F0A" />
        <PlanSlider label="Aggression" leftLabel="Conservative" rightLabel="Aggressive" value={aggressionLevel} onChange={setAggressionLevel} color="#FF453A" />
        <PlanSlider label="Pass Depth" leftLabel="Short / Quick" rightLabel="Deep Shots" value={deepShortBalance} onChange={setDeepShortBalance} color="#BF5AF2" />
        <PlanSlider label="Defensive Blitz Rate" leftLabel="Coverage" rightLabel="Blitz Heavy" value={blitzFrequency} onChange={setBlitzFrequency} color="#0A84FF" />
      </div>

      <div style={{ background: "var(--surface)", border: "1.5px solid var(--hairline)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: 14 }}>
        <SectionTitle label="Special Teams" icon={<HQIcon name="lineup" size={14} />} />
        <STOption label="Kick Return Strategy" options={KICK_RETURN_OPTIONS} value={kickReturn} onChange={setKickReturn} />
        <STOption label="Punt Return Strategy" options={PUNT_RETURN_OPTIONS} value={puntReturn} onChange={setPuntReturn} />
        <STOption label="Kickoff Coverage" options={COVERAGE_OPTIONS} value={coverage} onChange={setCoverage} />
      </div>

      <div className="app-game-plan-sticky-save">
        <button onClick={handleSave} className="app-game-plan-save-btn">Save Game Plan</button>
        {onNavigate ? <button type="button" className="btn btn-secondary" onClick={() => onNavigate('HQ')}>Back to HQ</button> : null}
      </div>

      {saveMessage ? <p className="app-inline-toast" role="status" aria-live="polite">{saveMessage}</p> : null}
    </div>
  );
}
