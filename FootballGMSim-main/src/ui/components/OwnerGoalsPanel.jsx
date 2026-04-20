import React, { useMemo } from 'react';
import { fanApprovalMessage } from '../../core/dynasty-story.js';

const approvalColor = (value) => {
  if (value <= 39) return '#ef4444';
  if (value <= 60) return '#94a3b8';
  if (value <= 80) return '#f59e0b';
  return '#22c55e';
};

export default function OwnerGoalsPanel({ league }) {
  const goals = useMemo(() => (Array.isArray(league?.ownerGoals) ? league.ownerGoals : []), [league?.ownerGoals]);
  const fanApproval = league?.fanApproval ?? 50;
  const season = league?.season ?? 1;

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Owner Goals — Season {season}</div>
      {goals.map((goal) => {
        const pct = Math.min(100, Math.round(((goal?.current ?? 0) / Math.max(1, goal?.target ?? 1)) * 100));
        const ended = league?.phase === 'offseason_resign' || league?.phase === 'offseason';
        const failed = ended && !goal?.complete;
        return (
          <div key={goal?.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13 }}>{goal?.description}</div>
            <div style={{ height: 8, background: '#1e293b', borderRadius: 8, marginTop: 4 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: goal?.complete ? '#22c55e' : failed ? '#ef4444' : '#f59e0b', borderRadius: 8 }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{goal?.current ?? 0} / {goal?.target ?? 0} {goal?.complete ? '✅' : failed ? '❌' : ''}</div>
          </div>
        );
      })}
      <div style={{ marginTop: 12, fontWeight: 700, color: approvalColor(fanApproval) }}>Fan Approval: {fanApproval}/100</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fanApprovalMessage(fanApproval)}</div>
    </div>
  );
}
