import React, { useMemo, useState } from 'react';
import { SectionCard, StatusChip } from './ScreenSystem.jsx';
import { evaluateTradeFairness } from '../utils/franchiseEvents.js';

export default function TradeNegotiation({ baseAskValue = 100, relationship = 0, deadlineWeek = false, onClose, onFinalize }) {
  const [offerValue, setOfferValue] = useState(baseAskValue);
  const [round, setRound] = useState(1);
  const verdict = useMemo(() => evaluateTradeFairness({ offerValue, askValue: baseAskValue, relationship, deadlineWeek }), [offerValue, baseAskValue, relationship, deadlineWeek]);

  return (
    <SectionCard title="Trade negotiation" subtitle={`Round ${round}/3`} variant="compact">
      <div className="app-row" style={{ justifyContent: 'space-between' }}>
        <StatusChip label={verdict.meter.toUpperCase()} tone={verdict.meter === 'green' ? 'ok' : verdict.meter === 'yellow' ? 'warning' : 'danger'} />
        <span style={{ fontSize: 12, opacity: 0.8 }}>{verdict.reasoning}</span>
      </div>
      <label style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        Offer value
        <input type="range" min={0} max={baseAskValue * 2} value={offerValue} onChange={(e) => setOfferValue(Number(e.target.value))} />
      </label>
      <div className="app-row" style={{ gap: 8, marginTop: 12 }}>
        <button type="button" className="btn" onClick={onClose}>Walk away</button>
        <button type="button" className="btn" disabled={round >= 3} onClick={() => setRound((value) => Math.min(3, value + 1))}>Counter</button>
        <button type="button" className="btn btn-primary" onClick={() => onFinalize?.(verdict)}>Finalize</button>
      </div>
    </SectionCard>
  );
}
