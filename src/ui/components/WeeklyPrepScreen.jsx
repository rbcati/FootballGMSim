import React, { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, SectionCard } from './common/UiPrimitives.jsx';
import { markWeeklyPrepStep } from '../utils/weeklyPrep.js';
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

export default function WeeklyPrepScreen({ league, onNavigate }) {
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

  useEffect(() => {
    markWeeklyPrepStep(league, 'opponentScouted', true);
  }, [league?.seasonId, league?.week, league?.userTeamId]);

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
        actions={<TonePill tone={model.readinessTone} label={model.readinessStatus} />}
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

      <SectionCard title="Readiness Command" subtitle="Confirm prep quality before returning to HQ.">
        <div className="weekly-prep-command-row">
          <TonePill tone={model.readinessTone} label={`${model.readinessScore}% ready`} />
          <TonePill tone={prep.remaining === 0 ? 'success' : 'warning'} label={`${4 - prep.remaining}/4 complete`} />
          <TonePill tone={model.readyToAdvance ? 'success' : 'warning'} label={model.readyToAdvance ? 'Ready to Advance' : 'Needs Attention'} />
        </div>
        <p className="weekly-prep-caption">{model.keyRiskLabel}</p>
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

      <SectionCard title="Matchup Intel" subtitle="Strengths, weaknesses, and pressure points.">
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
      </SectionCard>

      <SectionCard title="Active Effects" subtitle="Strategy synergy and readiness impacts for this week.">
        <div className="weekly-prep-command-row">
          <TonePill tone={prep.prepSummary?.severity === 'major_risk' ? 'danger' : prep.prepSummary?.severity === 'minor_risk' ? 'warning' : 'success'} label={`Prep state: ${prep.prepSummary?.status ?? 'Ready'}`} />
          <TonePill tone={prep.prepSummary?.netImpact >= 0 ? 'success' : 'warning'} label={`Net impact ${prep.prepSummary?.netImpact >= 0 ? '+' : ''}${Number(prep.prepSummary?.netImpact ?? 0).toFixed(3)}`} />
        </div>
        <div className="weekly-prep-effects-grid">
          {(prep.prepSummary?.reasons?.length ? prep.prepSummary.reasons : ['No active matchup synergy or readiness penalties.']).map((reason) => (
            <div key={reason} className="weekly-prep-effect-row">{reason}</div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Prep Checklist" subtitle="Status-driven checks aligned with HQ loop.">
        <div className="weekly-prep-command-row">
          <TonePill tone={prep.completion.lineupChecked ? 'success' : 'warning'} label={`Lineup ${prep.completion.lineupChecked ? 'checked' : 'pending'}`} />
          <TonePill tone={prep.completion.injuriesReviewed ? 'success' : 'warning'} label={`Injuries ${prep.completion.injuriesReviewed ? 'reviewed' : 'pending'}`} />
          <TonePill tone={prep.completion.opponentScouted ? 'success' : 'warning'} label={`Opponent ${prep.completion.opponentScouted ? 'scouted' : 'pending'}`} />
          <TonePill tone={prep.completion.planReviewed ? 'success' : 'warning'} label={`Plan ${prep.completion.planReviewed ? 'reviewed' : 'pending'}`} />
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
                  onClick={() => onNavigate?.(action.destination)}
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
