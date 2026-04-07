import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { franchiseInvestmentSummary, getRegionOptions, normalizeFranchiseInvestments } from '../utils/franchiseInvestments.js';

const CARD_STYLE = { border: '1px solid var(--hairline)', borderRadius: 10, padding: 10, background: 'var(--surface)' };

export default function FranchiseInvestmentsPanel({ team, actions, compact = false, onNavigate }) {
  const summary = useMemo(() => franchiseInvestmentSummary(team), [team]);
  const inv = summary.profile;
  const regions = getRegionOptions();
  const capacityLeft = summary.capacityLeft;

  const applyUpdate = (updates) => {
    if (!actions?.updateFranchiseInvestments || team?.id == null) return;
    const next = normalizeFranchiseInvestments({ ...inv, ...updates });
    actions.updateFranchiseInvestments(team.id, next);
  };

  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>Franchise Investments</strong>
        <Badge variant={capacityLeft <= 1 ? 'destructive' : 'outline'}>Owner capacity left: {capacityLeft}</Badge>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Long-term organizational choices with deterministic tradeoffs across fan mood, owner pressure, free-agent appeal, and scouting confidence.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        <div style={CARD_STYLE}>
          <div style={{ fontWeight: 700 }}>Stadium / fan experience · {inv.stadiumLevel}/5</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Improves fan experience and long-term franchise prestige. Expensive up front, but popular with fans.</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <Button size="sm" variant="outline" disabled={inv.stadiumLevel <= 1} onClick={() => applyUpdate({ stadiumLevel: inv.stadiumLevel - 1 })}>Downgrade</Button>
            <Button size="sm" disabled={inv.stadiumLevel >= 5 || capacityLeft <= 0} onClick={() => applyUpdate({ stadiumLevel: inv.stadiumLevel + 1 })}>Upgrade</Button>
          </div>
        </div>

        <div style={CARD_STYLE}>
          <div style={{ fontWeight: 700 }}>Concessions / pricing</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Choose fan-friendly, balanced, or premium pricing. Clear fan-vs-business narrative tradeoff.</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              ['fan_friendly', 'Fan-friendly'],
              ['balanced', 'Balanced'],
              ['premium', 'Premium'],
            ].map(([key, label]) => (
              <Button key={key} size="sm" variant={inv.concessionsStrategy === key ? 'default' : 'outline'} onClick={() => applyUpdate({ concessionsStrategy: key })}>{label}</Button>
            ))}
          </div>
        </div>

        <div style={CARD_STYLE}>
          <div style={{ fontWeight: 700 }}>Training facilities · {inv.trainingLevel}/5</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Better facilities improve player confidence and free-agent appeal. Supports long-term development and recovery.</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <Button size="sm" variant="outline" disabled={inv.trainingLevel <= 1} onClick={() => applyUpdate({ trainingLevel: inv.trainingLevel - 1 })}>Downgrade</Button>
            <Button size="sm" disabled={inv.trainingLevel >= 5 || capacityLeft <= 0} onClick={() => applyUpdate({ trainingLevel: inv.trainingLevel + 1 })}>Upgrade</Button>
          </div>
        </div>

        <div style={CARD_STYLE}>
          <div style={{ fontWeight: 700 }}>Scouting department · {inv.scoutingLevel}/5</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Higher quality tightens prospect confidence and improves sleeper visibility without perfect information.</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <Button size="sm" variant="outline" disabled={inv.scoutingLevel <= 1} onClick={() => applyUpdate({ scoutingLevel: inv.scoutingLevel - 1 })}>Downgrade</Button>
            <Button size="sm" disabled={inv.scoutingLevel >= 5 || capacityLeft <= 0} onClick={() => applyUpdate({ scoutingLevel: inv.scoutingLevel + 1 })}>Upgrade</Button>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-subtle)' }}>Regional emphasis:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {regions.map((region) => (
              <button key={region.key} className="btn" style={{ fontSize: 11, opacity: inv.scoutingRegion === region.key ? 1 : 0.6 }} onClick={() => applyUpdate({ scoutingRegion: region.key })}>{region.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'grid', gap: 3 }}>
        <div>Effects now: Fans {summary.fanSentimentDelta >= 0 ? '+' : ''}{summary.fanSentimentDelta}, Owner business {summary.ownerBusinessDelta >= 0 ? '+' : ''}{summary.ownerBusinessDelta}, FA appeal {summary.freeAgentAppealDelta >= 0 ? '+' : ''}{summary.freeAgentAppealDelta}.</div>
        <div>Scouting confidence {summary.scoutingConfidenceDelta >= 0 ? '+' : ''}{summary.scoutingConfidenceDelta} with <strong>{summary.scoutingRegionLabel}</strong> emphasis and readable uncertainty.</div>
      </div>

      {onNavigate && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" variant="outline" onClick={() => onNavigate('Financials')}>Open Financials</Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate('Staff')}>Open Staff</Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate('Draft Room')}>Open Draft Room</Button>
        </div>
      )}
    </div>
  );
}
