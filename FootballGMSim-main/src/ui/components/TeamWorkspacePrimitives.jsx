import React from 'react';
import { ScreenHeader, StatusChip } from './ScreenSystem.jsx';
import { formatMoneyM } from '../utils/numberFormatting.js';

function toneForCapRoom(capRoom) {
  if (Number(capRoom) <= 5) return 'danger';
  if (Number(capRoom) <= 15) return 'warning';
  return 'ok';
}

export function TeamWorkspaceHeader({
  title,
  subtitle,
  eyebrow,
  metadata = [],
  actions = [],
  quickContext = [],
}) {
  return (
    <div className="app-screen-stack" style={{ gap: 'var(--space-2)' }}>
      <ScreenHeader title={title} subtitle={subtitle} eyebrow={eyebrow} metadata={metadata} />
      {(actions.length > 0 || quickContext.length > 0) ? (
        <div className="card" style={{ padding: 'var(--space-2)', display: 'grid', gap: 8 }}>
          {actions.length > 0 ? (
            <div className="app-cta-row">
              {actions.map((action) => (
                <button
                  key={action.label}
                  className={`btn btn-sm ${action.primary ? 'btn-primary' : ''}`}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  title={action.title || action.label}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
          {quickContext.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {quickContext.map((item) => (
                <StatusChip key={`${item.label}-${item.tone ?? 'neutral'}`} label={item.label} tone={item.tone ?? 'neutral'} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TeamCapSummaryStrip({ capSnapshot, rosterCount, starterHealth = null, expiringCount = null }) {
  const capRoom = Number(capSnapshot?.capRoom ?? 0);
  const capUsed = Number(capSnapshot?.capUsed ?? 0);
  const capTotal = Number(capSnapshot?.capTotal ?? 0);
  const pressureTone = toneForCapRoom(capRoom);

  return (
    <section className="card team-cap-summary-strip">
      <div className="team-cap-summary-strip__item">
        <span>Cap room</span>
        <strong className={`tone-${pressureTone}`}>{formatMoneyM(capRoom)}</strong>
      </div>
      <div className="team-cap-summary-strip__item">
        <span>Cap used</span>
        <strong>{formatMoneyM(capUsed)} / {formatMoneyM(capTotal)}</strong>
      </div>
      <div className="team-cap-summary-strip__item">
        <span>Roster</span>
        <strong>{Number(rosterCount ?? 0)}/53</strong>
      </div>
      {starterHealth != null ? (
        <div className="team-cap-summary-strip__item">
          <span>Starting lineup health</span>
          <strong>{starterHealth}</strong>
        </div>
      ) : null}
      {expiringCount != null ? (
        <div className="team-cap-summary-strip__item">
          <span>Expiring deals</span>
          <strong>{expiringCount}</strong>
        </div>
      ) : null}
    </section>
  );
}

export function ContractStatusChip({ label, tone = 'neutral' }) {
  return <span className={`app-status-chip tone-${tone}`}>{label}</span>;
}
