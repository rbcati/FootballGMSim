import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, SectionCard } from './common/UiPrimitives.jsx';
import {
  markWeeklyPrepStep,
  GAME_PLAN_PRESETS,
  normalizeGamePlan,
  saveStoredGamePlan,
  recommendGamePlanPreset,
} from '../utils/weeklyPrep.js';
import { deriveGamePlanMultipliers, getGamePlanSynergySummary } from '../../core/sim/gamePlanMultipliers.ts';
import { buildWeeklyPrepScreenModel } from '../utils/weeklyPrepScreenModel.js';
import { buildWeeklyIntelligence } from '../utils/weeklyIntelligence.js';
import { evaluateWeeklyContext } from '../utils/weeklyContext.js';
import { buildWeeklyPrepActions } from '../utils/weeklyPrepActions.js';
import { TeamIdentityBadge } from './HQVisuals.jsx';

function TonePill({ tone = 'info', label }) {
  const palette = {
    success: { border: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--surface))' },
    warning: { border: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--surface))' },
    danger: { border: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 12%, var(--surface))' },
    info: { border: 'var(--hairline)', bg: 'var(--surface)' },
  };
  const active = palette[tone] ?? palette.info;
  return (
    <span className="weekly-prep-pill" style={{ border: `1px solid ${active.border}`, background: active.bg }}>
      {label}
    </span>
  );
}

const TONE_LABEL = { danger: 'Urgent', warning: 'Attention', info: 'Info', ok: 'Ready', success: 'Done' };

function runPassLabel(v) {
  if (v <= 35) return 'Run heavy';
  if (v <= 45) return 'Run lean';
  if (v <= 55) return 'Balanced';
  if (v <= 65) return 'Pass lean';
  return 'Pass heavy';
}

function aggressionLabel(v) {
  if (v <= 30) return 'Very conservative';
  if (v <= 45) return 'Conservative';
  if (v <= 55) return 'Balanced';
  if (v <= 65) return 'Aggressive';
  return 'Very aggressive';
}

function depthLabel(v) {
  if (v <= 30) return 'Short / quick';
  if (v <= 45) return 'Short lean';
  if (v <= 55) return 'Balanced';
  if (v <= 65) return 'Deep lean';
  return 'Deep / explosive';
}

function matchupMismatchWarning(plan, insights) {
  const { runPassBalance, deepShortBalance, aggressionLevel } = plan;
  const passHeavy = runPassBalance >= 60;
  const runHeavy = runPassBalance <= 40;
  const quickGame = deepShortBalance <= 42;
  const conservativeTempo = aggressionLevel <= 45;
  const extremePlan = Math.abs(runPassBalance - 50) >= 30;

  if (insights.weakSecondary && runHeavy) {
    return 'Opponent secondary is weak — a run-heavy plan may leave points on the board.';
  }
  if (insights.weakRunDefense && passHeavy) {
    return 'Opponent run defense is soft — consider exploiting it with a run-heavy script.';
  }
  if (insights.elitePassRush && !quickGame) {
    return 'Elite pass rush detected — slower-developing routes risk sacks and turnovers.';
  }
  if (insights.explosiveOpponentOffense && !conservativeTempo) {
    return 'Opponent offense is explosive — an aggressive tempo may fuel a shootout.';
  }
  if (insights.balancedMatchup && extremePlan) {
    return 'No scouting edge supports an extreme plan in a balanced matchup.';
  }
  return null;
}

// GamePlanControlCenter receives plan and liveSummary from WeeklyPrepScreen (single source of truth).
// onPlanChange notifies parent of slider/preset updates; parent owns persistence and recomputation.
function GamePlanControlCenter({ prep, league, plan, liveSummary, onPlanChange, onPlanReviewed }) {
  const insights = prep?.insights ?? {};
  const recommendedKey = recommendGamePlanPreset({ prep });

  const warning = useMemo(() => matchupMismatchWarning(plan, insights), [plan, insights]);

  const applyPlan = useCallback((nextPlan) => {
    const normalized = normalizeGamePlan(nextPlan);
    onPlanChange(normalized);
    saveStoredGamePlan(normalized);
    markWeeklyPrepStep(league, 'planReviewed', true);
    onPlanReviewed?.();
  }, [league, onPlanChange, onPlanReviewed]);

  const handleSlider = useCallback((field, rawValue) => {
    applyPlan({ ...plan, [field]: Number(rawValue) });
  }, [plan, applyPlan]);

  const handlePreset = useCallback((presetKey) => {
    const preset = GAME_PLAN_PRESETS[presetKey];
    if (!preset) return;
    applyPlan({ runPassBalance: preset.runPassBalance, aggressionLevel: preset.aggressionLevel, deepShortBalance: preset.deepShortBalance });
  }, [applyPlan]);

  const summaryTone = liveSummary.severity === 'major_risk' ? 'danger' : liveSummary.severity === 'minor_risk' ? 'warning' : 'success';
  const matchupNote = prep?.keyMatchupNote;

  return (
    <SectionCard title="Game Plan Control Center">
      {matchupNote && (
        <p className="weekly-prep-caption" style={{ marginBottom: 'var(--space-3)' }}>
          Matchup key: {matchupNote}
        </p>
      )}

      <div className="weekly-prep-caption" style={{ marginBottom: 'var(--space-2)' }}>Presets</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {Object.entries(GAME_PLAN_PRESETS).map(([key, preset]) => (
          <Button
            key={key}
            size="sm"
            variant={key === recommendedKey ? 'default' : 'outline'}
            onClick={() => handlePreset(key)}
            data-testid={`preset-btn-${key}`}
          >
            {preset.label}{key === recommendedKey ? ' ★' : ''}
          </Button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
            <span className="weekly-prep-intel-head">Run ↔ Pass</span>
            <TonePill tone="info" label={runPassLabel(plan.runPassBalance)} />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={plan.runPassBalance}
            onChange={(e) => handleSlider('runPassBalance', e.target.value)}
            style={{ width: '100%' }}
            aria-label="Run Pass Balance"
            data-testid="slider-runPassBalance"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            <span>Run</span>
            <span>Pass</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
            <span className="weekly-prep-intel-head">Conservative ↔ Aggressive</span>
            <TonePill tone="info" label={aggressionLabel(plan.aggressionLevel)} />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={plan.aggressionLevel}
            onChange={(e) => handleSlider('aggressionLevel', e.target.value)}
            style={{ width: '100%' }}
            aria-label="Aggression Level"
            data-testid="slider-aggressionLevel"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            <span>Conservative</span>
            <span>Aggressive</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
            <span className="weekly-prep-intel-head">Quick/Short ↔ Deep/Explosive</span>
            <TonePill tone="info" label={depthLabel(plan.deepShortBalance)} />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={plan.deepShortBalance}
            onChange={(e) => handleSlider('deepShortBalance', e.target.value)}
            style={{ width: '100%' }}
            aria-label="Deep Short Balance"
            data-testid="slider-deepShortBalance"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            <span>Short</span>
            <span>Deep</span>
          </div>
        </div>
      </div>

      {warning && (
        <div
          className="weekly-prep-effect-row"
          style={{ borderColor: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 10%, var(--surface))', marginBottom: 'var(--space-2)' }}
          data-testid="plan-mismatch-warning"
        >
          <TonePill tone="warning" label="Plan vs. Matchup" />
          {' '}{warning}
        </div>
      )}

      <div className="weekly-prep-caption" style={{ marginBottom: 'var(--space-2)' }}>Projected prep impact</div>
      <div className="weekly-prep-command-row" style={{ marginBottom: 'var(--space-2)' }}>
        <TonePill tone={summaryTone} label={`Status: ${liveSummary.status}`} />
        <TonePill
          tone={liveSummary.netImpact >= 0 ? 'success' : 'warning'}
          label={`Net ${liveSummary.netImpact >= 0 ? '+' : ''}${liveSummary.netImpact.toFixed(3)}`}
        />
        {liveSummary.positive > 0 && <TonePill tone="success" label={`+${liveSummary.positive.toFixed(3)} bonuses`} />}
        {liveSummary.negative > 0 && <TonePill tone="danger" label={`-${liveSummary.negative.toFixed(3)} penalties`} />}
      </div>
      <div className="weekly-prep-effects-grid" data-testid="impact-reasons">
        {liveSummary.reasons.length > 0
          ? liveSummary.reasons.map((r) => <div key={r} className="weekly-prep-effect-row">{r}</div>)
          : <div className="weekly-prep-effect-row">No active synergy or penalties with current plan.</div>}
      </div>
    </SectionCard>
  );
}

// WeeklyPrepScreen owns the live plan state. GamePlanControlCenter, Active Effects, Readiness Command,
// and Prep Checklist all derive from the same liveMultipliers/liveSummary so they never conflict.
export default function WeeklyPrepScreen({ league, onNavigate, onOpenBoxScore }) {
  const model = useMemo(() => buildWeeklyPrepScreenModel({ league }), [league]);
  const prep = model.prep;

  const weeklyIntelligence = useMemo(
    () => buildWeeklyIntelligence({ league, team: prep?.userTeam, nextGame: prep?.nextGame, prep }),
    [league, prep],
  );
  const weeklyContext = useMemo(() => evaluateWeeklyContext(league), [league]);
  const prepActions = useMemo(
    () => buildWeeklyPrepActions({ league, weeklyIntelligence, weeklyContext, prep }),
    [league, weeklyIntelligence, weeklyContext, prep],
  );

  // Single source of truth: live plan state lives here, not inside GamePlanControlCenter.
  const [plan, setPlan] = useState(() => normalizeGamePlan(prep?.gamePlan ?? {}));
  const [localPlanReviewed, setLocalPlanReviewed] = useState(false);
  // Tracks the auto-mark from useEffect so checklist and readiness update on first render.
  const [localOpponentScouted, setLocalOpponentScouted] = useState(false);

  // Safe: this resets per-week prep state exactly when the matchup changes
  // (season/week/team). `league` and `prep` are read fresh inside; keying on
  // their full identity would re-fire this reset on unrelated league/prep
  // mutations and wipe the user's in-progress plan mid-week.
  useEffect(() => {
    markWeeklyPrepStep(league, 'opponentScouted', true);
    setLocalOpponentScouted(true);
    setLocalPlanReviewed(false);
    // Sync plan to stored state whenever the week/season changes.
    setPlan(normalizeGamePlan(prep?.gamePlan ?? {}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.seasonId, league?.week, league?.userTeamId]);

  const hasBlockingLineupIssue = useMemo(
    () => (prep?.lineupIssues ?? []).some((i) => i.level === 'urgent' && String(i.label).toLowerCase().includes('depth chart blocker')),
    [prep],
  );
  const majorInjuryStress = useMemo(
    () => (prep?.lineupIssues ?? []).some((i) => String(i.label).toLowerCase().includes('injury stack')),
    [prep],
  );

  const effectivePlanReviewed = localPlanReviewed || Boolean(prep?.completion?.planReviewed);
  const effectiveOpponentScouted = localOpponentScouted || Boolean(prep?.completion?.opponentScouted);

  // Effective completion merges localStorage-backed values with local UI state, so checklist
  // and readiness counts update immediately without a full state reload.
  const effectiveCompletion = useMemo(() => ({
    lineupChecked: Boolean(prep?.completion?.lineupChecked),
    injuriesReviewed: Boolean(prep?.completion?.injuriesReviewed),
    opponentScouted: effectiveOpponentScouted,
    planReviewed: effectivePlanReviewed,
  }), [prep?.completion, effectiveOpponentScouted, effectivePlanReviewed]);

  // Live multipliers always treat planReviewed as true so both "Projected prep impact" in
  // Game Plan Control Center and "Active Effects" show the same projected plan quality.
  const liveMultipliers = useMemo(() => deriveGamePlanMultipliers({
    weeklyPrepState: {
      insights: prep?.insights ?? {},
      completion: { ...effectiveCompletion, planReviewed: true },
      hasTracking: true,
    },
    gamePlan: plan,
    teamContext: { hasBlockingLineupIssue, majorInjuryStress },
  }), [plan, prep?.insights, effectiveCompletion, hasBlockingLineupIssue, majorInjuryStress]);

  const liveSummary = useMemo(() => getGamePlanSynergySummary(liveMultipliers), [liveMultipliers]);

  const effectiveRemaining = Object.values(effectiveCompletion).filter((done) => !done).length;
  const effectiveScore = Math.round(((4 - effectiveRemaining) / 4) * 100);
  const primaryAction = model.priorityActions?.[0];
  const scoutSummaryItems = [
    { label: 'Opponent', value: `${prep?.nextGame?.isHome ? 'vs' : '@'} ${prep?.opponent?.name ?? model.opponentAbbr}` },
    { label: 'Matchup context', value: model.matchupHeadline },
    { label: 'Primary action', value: primaryAction ? `${primaryAction.title}: ${primaryAction.reason}` : model.keyRiskLabel },
    { label: 'Game-plan key', value: prep?.keyMatchupNote ?? model.keyRiskLabel },
  ];

  // Readiness tone/status derive from liveSummary so they update on every plan change.
  const liveReadinessTone = liveSummary.severity === 'major_risk' ? 'danger' : liveSummary.severity === 'minor_risk' ? 'warning' : 'success';
  const liveReadinessStatus = liveSummary.severity === 'major_risk'
    ? 'Major Risk'
    : effectiveScore >= 100
      ? 'Ready to Advance'
      : effectiveScore >= 50
        ? 'Needs Attention'
        : 'Major Risk';

  const handlePlanChange = useCallback((nextPlan) => {
    setPlan(nextPlan);
  }, []);

  // Route Game Book destinations to onOpenBoxScore when available; silently no-op when not.
  // All other destinations pass through onNavigate unchanged.
  const handleNavigation = useCallback((destination) => {
    if (typeof destination === 'string' && destination.startsWith('Game Book:')) {
      const gameId = destination.slice('Game Book:'.length).trim();
      if (gameId && onOpenBoxScore) {
        onOpenBoxScore(gameId);
      }
      return;
    }
    onNavigate?.(destination);
  }, [onNavigate, onOpenBoxScore]);

  if (!prep?.nextGame || !prep?.opponent) {
    return <EmptyState title="Weekly prep unavailable" body="No upcoming opponent found. Open Schedule for next matchup details." />;
  }

  const openAction = (tab, completionStep = null) => {
    if (completionStep) markWeeklyPrepStep(league, completionStep, true);
    onNavigate?.(tab);
  };

  return (
    <div className="app-screen-stack weekly-prep-screen">
      <SectionCard
        title={`Weekly Prep War Room · Week ${model.week}`}
        subtitle={model.matchupHeadline}
        actions={<TonePill tone={liveReadinessTone} label={liveReadinessStatus} />}
      >
        <div className="weekly-prep-hero-row">
          <div className="weekly-prep-team">
            <TeamIdentityBadge team={prep.team} size={40} emphasize />
            <strong>{prep.team?.abbr ?? 'YOU'}</strong>
          </div>
          <span>{prep.nextGame.isHome ? 'vs' : '@'}</span>
          <div className="weekly-prep-team">
            <TeamIdentityBadge team={prep.opponent} size={40} />
            <strong>{model.opponentAbbr}</strong>
          </div>
        </div>
        <div className="weekly-prep-mini-grid">
          <div><strong>You:</strong> OVR {prep.teamSnapshot.overall} · OFF {prep.teamSnapshot.offense} · DEF {prep.teamSnapshot.defense}</div>
          <div><strong>Opp:</strong> OVR {prep.opponentSnapshot.overall} · OFF {prep.opponentSnapshot.offense} · DEF {prep.opponentSnapshot.defense}</div>
          <div><strong>Form:</strong> You {prep.teamSnapshot.recentForm.summary} · Opp {prep.opponentSnapshot.recentForm.summary}</div>
        </div>
      </SectionCard>

      <SectionCard title="Scout Report Summary" actions={<TonePill tone="info" label="Top read" />}>
        <div className="weekly-prep-scout-summary" data-testid="weekly-prep-scout-summary">
          {scoutSummaryItems.map((item) => (
            <div key={item.label} className="weekly-prep-compact-row">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Priority Actions" subtitle="Complete these before sim day.">
        <div className="weekly-prep-action-grid">
          {model.priorityActions.slice(0, 4).map((action) => (
            <article key={action.id} className="weekly-prep-action-card">
              <div className="weekly-prep-action-head">
                <strong>{action.title}</strong>
                <TonePill tone={action.statusTone} label={action.statusLabel} />
              </div>
              <p>{action.reason}</p>
              <Button size="sm" variant="outline" onClick={() => openAction(action.route, action.completionStep)}>{action.ctaLabel}</Button>
            </article>
          ))}
        </div>
        <div className="weekly-prep-nav-row">
          <Button size="sm" variant="secondary" onClick={() => onNavigate?.('HQ')}>Back to HQ</Button>
        </div>
      </SectionCard>

      <SectionCard title="Readiness Command" subtitle="Confirm prep quality before returning to HQ.">
        <div className="weekly-prep-command-row">
          <TonePill tone={liveReadinessTone} label={`${effectiveScore}% ready`} />
          <TonePill tone={effectiveRemaining === 0 ? 'success' : 'warning'} label={`${4 - effectiveRemaining}/4 complete`} />
          <TonePill tone={effectiveRemaining === 0 ? 'success' : 'warning'} label={effectiveRemaining === 0 ? 'Ready to Advance' : 'Needs Attention'} />
        </div>
        <p className="weekly-prep-caption">{model.keyRiskLabel}</p>
      </SectionCard>

      <GamePlanControlCenter
        key={`${league?.seasonId}:${league?.week}`}
        prep={prep}
        league={league}
        plan={plan}
        liveSummary={liveSummary}
        onPlanChange={handlePlanChange}
        onPlanReviewed={() => setLocalPlanReviewed(true)}
      />

      <SectionCard title="Matchup Intel Details" subtitle="Strengths, weaknesses, and pressure points.">
        <details className="weekly-prep-details" data-testid="weekly-prep-matchup-details">
          <summary>Open detailed scout report</summary>
          <div className="weekly-prep-intel-grid">
            <div>
              <div className="weekly-prep-intel-head">Strengths</div>
              <ul>
                {(prep.opponentStrengths.length ? prep.opponentStrengths : ['No clear dominant opponent edge identified yet.']).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <div className="weekly-prep-intel-head">Exploitable weaknesses</div>
              <ul>
                {(prep.opponentWeaknesses.length ? prep.opponentWeaknesses : ['No obvious weakness — execution will decide this one.']).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <div className="weekly-prep-intel-head">Pressure points</div>
              <ul>
                {(prep.pressurePoints.length ? prep.pressurePoints : ['No major pressure point flagged.']).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </details>
      </SectionCard>

      <SectionCard title="Active Effects" subtitle="Live plan impact for this week.">
        <div className="weekly-prep-command-row" data-testid="active-effects-summary">
          <TonePill
            tone={liveSummary.severity === 'major_risk' ? 'danger' : liveSummary.severity === 'minor_risk' ? 'warning' : 'success'}
            label={`Live plan: ${liveSummary.status}`}
          />
          <TonePill
            tone={liveSummary.netImpact >= 0 ? 'success' : 'warning'}
            label={`Net impact ${liveSummary.netImpact >= 0 ? '+' : ''}${Number(liveSummary.netImpact ?? 0).toFixed(3)}`}
          />
        </div>
        <div className="weekly-prep-effects-grid" data-testid="active-effects-reasons">
          {(liveSummary?.reasons?.length ? liveSummary.reasons : ['No active matchup synergy or readiness penalties.']).map((reason) => (
            <div key={reason} className="weekly-prep-effect-row">{reason}</div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Prep Checklist" subtitle="Status-driven checks aligned with HQ loop.">
        <div className="weekly-prep-command-row">
          <TonePill tone={effectiveCompletion.lineupChecked ? 'success' : 'warning'} label={`Lineup ${effectiveCompletion.lineupChecked ? 'checked' : 'pending'}`} />
          <TonePill tone={effectiveCompletion.injuriesReviewed ? 'success' : 'warning'} label={`Injuries ${effectiveCompletion.injuriesReviewed ? 'reviewed' : 'pending'}`} />
          <TonePill tone={effectiveCompletion.opponentScouted ? 'success' : 'warning'} label={`Opponent ${effectiveCompletion.opponentScouted ? 'scouted' : 'pending'}`} />
          <TonePill tone={effectiveCompletion.planReviewed ? 'success' : 'warning'} label={`Plan ${effectiveCompletion.planReviewed ? 'reviewed' : 'pending'}`} />
        </div>
      </SectionCard>

      <SectionCard
        title="Recommended Prep Actions"
        subtitle="Intelligence-driven actions for this week."
        data-testid="recommended-prep-actions"
      >
        {prepActions.length > 0 ? (
          <div className="weekly-prep-action-grid">
            {prepActions.slice(0, 5).map((action) => (
              <article key={action.id} className="weekly-prep-action-card" data-testid={`prep-action-card-${action.id}`}>
                <div className="weekly-prep-action-head">
                  <strong>{action.title}</strong>
                  <TonePill tone={action.tone} label={TONE_LABEL[action.tone] ?? 'Info'} />
                </div>
                <p>{action.detail}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleNavigation(action.destination)}
                  data-testid={`prep-action-cta-${action.id}`}
                >
                  {action.ctaLabel}
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <p className="weekly-prep-caption" data-testid="prep-actions-empty">
            No urgent prep actions. You can advance or review your roster.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
