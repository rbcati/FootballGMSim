import React from 'react';
import { OFFENSIVE_PLANS, DEFENSIVE_PLANS, RISK_PROFILES } from '../../core/strategy.js';

export default function StrategyPanel({ league, actions }) {
  if (!league) return null;

  const { offPlanId, defPlanId, riskId } = league.weeklyGamePlan || {
    offPlanId: 'BALANCED',
    defPlanId: 'BALANCED',
    riskId: 'BALANCED'
  };

  const handleUpdate = (key, value) => {
    const newPlan = {
      offPlanId: key === 'off' ? value : offPlanId,
      defPlanId: key === 'def' ? value : defPlanId,
      riskId:    key === 'risk' ? value : riskId,
    };
    actions.updateStrategy(newPlan.offPlanId, newPlan.defPlanId, newPlan.riskId);
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="card padding-md" style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ marginTop: 0 }}>Weekly Game Plan</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
          Adjust your strategy for the upcoming game. These settings persist week-to-week.
        </p>

        <div style={{ display: 'grid', gap: 'var(--space-6)', marginTop: 'var(--space-4)' }}>
          {/* Offense */}
          <div>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Offensive Strategy
            </label>
            <select
              id="managerOffPlan"
              className="form-control"
              value={offPlanId}
              onChange={(e) => handleUpdate('off', e.target.value)}
              style={{ width: '100%', padding: 'var(--space-2)', fontSize: 'var(--text-base)' }}
            >
              {Object.values(OFFENSIVE_PLANS).map(plan => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
            <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {OFFENSIVE_PLANS[offPlanId]?.description}
            </div>
            <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--success)' }}>
              <strong>Bonus:</strong> {OFFENSIVE_PLANS[offPlanId]?.bonus}
            </div>
             <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>
              <strong>Penalty:</strong> {OFFENSIVE_PLANS[offPlanId]?.penalty}
            </div>
          </div>

          {/* Defense */}
          <div>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Defensive Strategy
            </label>
            <select
              id="managerDefPlan"
              className="form-control"
              value={defPlanId}
              onChange={(e) => handleUpdate('def', e.target.value)}
              style={{ width: '100%', padding: 'var(--space-2)', fontSize: 'var(--text-base)' }}
            >
              {Object.values(DEFENSIVE_PLANS).map(plan => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
             <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {DEFENSIVE_PLANS[defPlanId]?.description}
            </div>
             <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--success)' }}>
              <strong>Bonus:</strong> {DEFENSIVE_PLANS[defPlanId]?.bonus}
            </div>
             <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>
              <strong>Penalty:</strong> {DEFENSIVE_PLANS[defPlanId]?.penalty}
            </div>
          </div>

          {/* Risk */}
          <div>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Risk Profile
            </label>
            <select
              id="managerRiskProfile"
              className="form-control"
              value={riskId}
              onChange={(e) => handleUpdate('risk', e.target.value)}
              style={{ width: '100%', padding: 'var(--space-2)', fontSize: 'var(--text-base)' }}
            >
              {Object.values(RISK_PROFILES).map(profile => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
            <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {RISK_PROFILES[riskId]?.description}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
