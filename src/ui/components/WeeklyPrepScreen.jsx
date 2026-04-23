import React, { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, SectionCard } from './common/UiPrimitives.jsx';
import { markWeeklyPrepStep, deriveWeeklyPrepState } from '../utils/weeklyPrep.js';
import { HQIcon, TeamIdentityBadge } from './HQVisuals.jsx';

function TonePill({ tone = 'info', label }) {
  const palette = {
    success: { border: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--surface))' },
    warning: { border: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--surface))' },
    danger: { border: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 12%, var(--surface))' },
    info: { border: 'var(--hairline)', bg: 'var(--surface)' },
  };
  const active = palette[tone] ?? palette.info;
  return (
    <span style={{ fontSize: 'var(--text-xs)', border: `1px solid ${active.border}`, background: active.bg, borderRadius: 999, padding: '2px 8px' }}>
      {label}
    </span>
  );
}

export default function WeeklyPrepScreen({ league, onNavigate }) {
  const prep = useMemo(() => deriveWeeklyPrepState(league), [league]);

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
    <div className="app-screen-stack weekly-prep-screen" style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <SectionCard
        title={`Scout & Prep · Week ${prep.nextGame.week}`}
        subtitle={`Opponent ${prep.opponentSnapshot.record} · ${prep.opponentSnapshot.homeAway} game`}
        actions={<TonePill tone={prep.prepSummary?.severity === 'major_risk' ? 'danger' : prep.remaining === 0 ? 'success' : 'warning'} label={prep.prepSummary?.status ?? prep.readinessLabel} />}
      >
        <div className="weekly-prep-opponent-head">
          <div className="weekly-prep-team">
            <TeamIdentityBadge team={prep.team} size={36} emphasize />
            <strong>{prep.team?.abbr ?? 'YOU'}</strong>
          </div>
          <span>{prep.nextGame.isHome ? 'vs' : '@'}</span>
          <div className="weekly-prep-team">
            <TeamIdentityBadge team={prep.opponent} size={36} />
            <strong>{prep.opponent?.abbr ?? prep.opponent?.name ?? 'OPP'}</strong>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <div style={{ fontSize: 'var(--text-xs)' }}><strong>You:</strong> OVR {prep.teamSnapshot.overall} · OFF {prep.teamSnapshot.offense} · DEF {prep.teamSnapshot.defense}</div>
          <div style={{ fontSize: 'var(--text-xs)' }}><strong>Opp:</strong> OVR {prep.opponentSnapshot.overall} · OFF {prep.opponentSnapshot.offense} · DEF {prep.opponentSnapshot.defense}</div>
          <div style={{ fontSize: 'var(--text-xs)' }}><strong>Form:</strong> You {prep.teamSnapshot.recentForm.summary} · Opp {prep.opponentSnapshot.recentForm.summary}</div>
        </div>
      </SectionCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 'var(--space-2)' }}>
        <SectionCard title="Opponent scout" subtitle="Football-specific matchup context.">
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}><HQIcon name="shield" size={12} /> Strengths</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                {(prep.opponentStrengths.length ? prep.opponentStrengths : ['No clear dominant opponent edge identified yet.']).map((item) => <li key={item} style={{ fontSize: 'var(--text-sm)' }}>{item}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}><HQIcon name="target" size={12} /> Exploitable weaknesses</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                {(prep.opponentWeaknesses.length ? prep.opponentWeaknesses : ['No obvious weakness — game script and execution will decide this one.']).map((item) => <li key={item} style={{ fontSize: 'var(--text-sm)' }}>{item}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}><HQIcon name="alert" size={12} /> Pressure points</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                {(prep.pressurePoints.length ? prep.pressurePoints : ['No major pressure point flagged.']).map((item) => <li key={item} style={{ fontSize: 'var(--text-sm)' }}>{item}</li>)}
              </ul>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Lineup readiness" subtitle="Depth/injury blockers before kickoff.">
          <div style={{ display: 'grid', gap: 8 }}>
            {prep.lineupIssues.length === 0 ? (
              <div style={{ fontSize: 'var(--text-sm)' }}>No lineup blockers detected. Depth chart and injury coverage look stable.</div>
            ) : prep.lineupIssues.map((issue) => (
              <div key={issue.id} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 'var(--text-sm)' }}>{issue.label}</strong>
                  <TonePill tone={issue.level === 'urgent' ? 'danger' : 'warning'} label={issue.level} />
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{issue.detail}</div>
                <Button size="sm" variant="outline" style={{ marginTop: 6 }} onClick={() => openAction(issue.actionTab, issue.actionTab === 'Injuries' ? 'injuriesReviewed' : 'lineupChecked')}>
                  {issue.actionLabel}
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Game plan recommendations" subtitle="Data-driven weekly suggestions.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {prep.recommendations.map((card) => (
            <div key={card.title} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{card.title}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>{card.reason}</div>
              <Button size="sm" variant="outline" style={{ marginTop: 8 }} onClick={() => openAction(card.actionTab, 'planReviewed')}>
                {card.actionLabel}
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Active effects" subtitle="Strategy synergy and readiness impacts for this week.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <TonePill tone={prep.prepSummary?.severity === 'major_risk' ? 'danger' : prep.prepSummary?.severity === 'minor_risk' ? 'warning' : 'success'} label={`Prep state: ${prep.prepSummary?.status ?? 'Ready'}`} />
          <TonePill tone={prep.prepSummary?.netImpact >= 0 ? 'success' : 'warning'} label={`Net impact ${prep.prepSummary?.netImpact >= 0 ? '+' : ''}${Number(prep.prepSummary?.netImpact ?? 0).toFixed(3)}`} />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {(prep.prepSummary?.reasons?.length ? prep.prepSummary.reasons : ['No active matchup synergy or readiness penalties.']).map((reason) => (
            <div key={reason} style={{ fontSize: 'var(--text-sm)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: 8 }}>
              {reason}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Prep completion" subtitle="Lightweight weekly readiness checklist.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <TonePill tone={prep.completion.lineupChecked ? 'success' : 'warning'} label={`Lineup ${prep.completion.lineupChecked ? 'checked' : 'pending'}`} />
          <TonePill tone={prep.completion.injuriesReviewed ? 'success' : 'warning'} label={`Injuries ${prep.completion.injuriesReviewed ? 'reviewed' : 'pending'}`} />
          <TonePill tone={prep.completion.opponentScouted ? 'success' : 'warning'} label={`Opponent ${prep.completion.opponentScouted ? 'scouted' : 'pending'}`} />
          <TonePill tone={prep.completion.planReviewed ? 'success' : 'warning'} label={`Plan ${prep.completion.planReviewed ? 'reviewed' : 'pending'}`} />
        </div>
      </SectionCard>
    </div>
  );
}
