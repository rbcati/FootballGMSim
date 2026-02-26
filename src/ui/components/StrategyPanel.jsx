import React, { useState, useEffect } from 'react';
import { OFFENSIVE_PLANS, DEFENSIVE_PLANS, RISK_PROFILES } from '../../core/strategy.js';

function StrategyCard({ title, options, selectedId, onChange, description }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h3 style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--space-3)' }}>
        {title}
      </h3>
      <select
        value={selectedId || 'BALANCED'}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--text)',
          fontSize: 'var(--text-base)', marginBottom: 'var(--space-2)'
        }}
      >
        {Object.values(options).map(opt => (
          <option key={opt.id} value={opt.id}>{opt.name}</option>
        ))}
      </select>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', lineHeight: 1.4 }}>
        {options[selectedId]?.description || description}
      </div>
      {options[selectedId] && (
        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
          <span style={{ color: 'var(--success)' }}>{options[selectedId].bonus}</span>
          {options[selectedId].bonus !== 'None' && <br/>}
          <span style={{ color: 'var(--danger)' }}>{options[selectedId].penalty}</span>
        </div>
      )}
    </div>
  );
}

function StarSelector({ roster, selectedId, onChange }) {
  // Filter for offensive skill positions
  const candidates = roster.filter(p => ['QB', 'RB', 'WR', 'TE'].includes(p.pos))
                           .sort((a, b) => b.ovr - a.ovr);

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h3 style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--space-3)' }}>
        Offensive Focal Point
      </h3>
      <select
        value={selectedId || ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--text)',
          fontSize: 'var(--text-base)', marginBottom: 'var(--space-2)'
        }}
      >
        <option value="">No specific focus</option>
        {candidates.map(p => (
          <option key={p.id} value={p.id}>
            {p.pos} {p.name} ({p.ovr})
          </option>
        ))}
      </select>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
        Selected player receives +25% target share priority.
      </div>
    </div>
  );
}

export default function StrategyPanel({ league, actions }) {
  const userTeam = league.teams.find(t => t.id === league.userTeamId);
  const strategies = userTeam?.strategies || {};
  const [offPlan, setOffPlan] = useState(strategies.offPlanId || 'BALANCED');
  const [defPlan, setDefPlan] = useState(strategies.defPlanId || 'BALANCED');
  const [risk, setRisk] = useState(strategies.riskId || 'BALANCED');
  const [star, setStar] = useState(strategies.starTargetId || null);
  const [roster, setRoster] = useState([]);

  // Fetch roster for star selector
  useEffect(() => {
    if (userTeam) {
        actions.getRoster(userTeam.id).then(resp => {
            if (resp.payload?.players) setRoster(resp.payload.players);
        });
    }
  }, [userTeam?.id, actions]);

  // Sync local state if remote changes (e.g. initial load)
  useEffect(() => {
      if (strategies.offPlanId) setOffPlan(strategies.offPlanId);
      if (strategies.defPlanId) setDefPlan(strategies.defPlanId);
      if (strategies.riskId) setRisk(strategies.riskId);
      if (strategies.starTargetId !== undefined) setStar(strategies.starTargetId);
  }, [strategies]);

  const handleSave = () => {
      actions.send('UPDATE_STRATEGY', {
          offPlanId: offPlan,
          defPlanId: defPlan,
          riskId: risk,
          starTargetId: star
      });
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Weekly Game Plan</h2>
        <button className="btn btn-primary" onClick={handleSave}>
            Apply Changes
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
        <StrategyCard
            title="Offensive Scheme"
            options={OFFENSIVE_PLANS}
            selectedId={offPlan}
            onChange={setOffPlan}
        />
        <StrategyCard
            title="Defensive Scheme"
            options={DEFENSIVE_PLANS}
            selectedId={defPlan}
            onChange={setDefPlan}
        />
        <StrategyCard
            title="Risk Profile"
            options={RISK_PROFILES}
            selectedId={risk}
            onChange={setRisk}
        />
        <StarSelector
            roster={roster}
            selectedId={star}
            onChange={setStar}
        />
      </div>
    </div>
  );
}
