import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScreenHeader, SectionCard, EmptyState } from './ScreenSystem.jsx';
import FranchiseInvestmentsPanel from './FranchiseInvestmentsPanel.jsx';

const ROLE_ORDER = ['headCoach', 'offCoordinator', 'defCoordinator', 'scoutDirector', 'headTrainer'];
const ROLE_LABELS = {
  headCoach: 'Head Coach',
  offCoordinator: 'Offensive Coordinator',
  defCoordinator: 'Defensive Coordinator',
  scoutDirector: 'Scout Director',
  headTrainer: 'Head Trainer',
};

function fmtMoney(value) {
  return `$${Number(value || 0).toFixed(1)}M`;
}

function effectSummary(roleKey, member) {
  const s = member?.specialtyRatings ?? {};
  if (roleKey === 'headCoach') return `Leadership ${s.leadership ?? 0} · Development ${s.playerDevelopment ?? 0}`;
  if (roleKey === 'offCoordinator') return `QB dev ${s.qbDevelopment ?? 0} · Skill dev ${s.skillPlayerDevelopment ?? 0}`;
  if (roleKey === 'defCoordinator') return `Front seven ${s.frontSeven ?? 0} · Coverage ${s.coverage ?? 0}`;
  if (roleKey === 'scoutDirector') return `College ${s.collegeScouting ?? 0} · Pro ${s.proScouting ?? 0} · Potential ${s.potentialEvaluation ?? 0}`;
  return `Injury prevention ${s.injuryPrevention ?? 0} · Recovery ${s.recovery ?? 0}`;
}

function valueScore(candidate) {
  const specialty = Object.values(candidate?.specialtyRatings ?? {}).reduce((sum, n) => sum + Number(n || 0), 0);
  return Math.round((specialty / Math.max(1, Object.keys(candidate?.specialtyRatings ?? {}).length)) - (Number(candidate?.annualSalary || 0) * 2));
}

export default function StaffManagement({ league, actions }) {
  const teamId = league?.userTeamId ?? 0;
  const [staffState, setStaffState] = useState(null);
  const [selectedRole, setSelectedRole] = useState('all');
  const [sortBy, setSortBy] = useState('overall');

  const refresh = useCallback(async () => {
    const res = await actions?.getStaffState?.();
    if (res?.payload) setStaffState(res.payload);
  }, [actions]);

  React.useEffect(() => { refresh(); }, [refresh]);

  const userTeam = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(teamId)) ?? null, [league?.teams, teamId]);
  const staff = staffState?.staff ?? {};
  const market = Array.isArray(staffState?.market) ? staffState.market : [];
  const bonuses = staffState?.bonuses ?? {};

  const currentStaffRows = ROLE_ORDER.map((roleKey) => ({ roleKey, member: staff?.[roleKey] ?? null }));
  const staffSalaryTotal = currentStaffRows.reduce((sum, row) => sum + Number(row.member?.annualSalary ?? 0), 0);

  const filteredMarket = useMemo(() => {
    const base = market.filter((candidate) => selectedRole === 'all' || candidate?.roleKey === selectedRole);
    return [...base].sort((a, b) => {
      if (sortBy === 'salary') return Number(a?.annualSalary ?? 0) - Number(b?.annualSalary ?? 0);
      if (sortBy === 'development') {
        const aDev = Number(a?.specialtyRatings?.playerDevelopment ?? a?.specialtyRatings?.qbDevelopment ?? a?.specialtyRatings?.defensiveDevelopment ?? 0);
        const bDev = Number(b?.specialtyRatings?.playerDevelopment ?? b?.specialtyRatings?.qbDevelopment ?? b?.specialtyRatings?.defensiveDevelopment ?? 0);
        return bDev - aDev;
      }
      if (sortBy === 'scouting') {
        const aScout = Number(a?.specialtyRatings?.collegeScouting ?? 0) + Number(a?.specialtyRatings?.proScouting ?? 0);
        const bScout = Number(b?.specialtyRatings?.collegeScouting ?? 0) + Number(b?.specialtyRatings?.proScouting ?? 0);
        return bScout - aScout;
      }
      return Number(b?.overall ?? 0) - Number(a?.overall ?? 0);
    });
  }, [market, selectedRole, sortBy]);

  const hire = async (candidate) => {
    await actions?.hireStaffMember?.({ teamId, roleKey: candidate?.roleKey, candidate });
    await refresh();
  };

  const fire = async (roleKey) => {
    await actions?.fireStaffMember?.({ teamId, roleKey });
    await refresh();
  };

  return (
    <div className="app-screen-stack" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <ScreenHeader
        eyebrow="Operations"
        title="Staff & Development"
        subtitle="Hire coaches and department heads, manage contracts, and see exactly what each role improves."
        metadata={[
          { label: 'Staff payroll', value: fmtMoney(staffSalaryTotal) },
          { label: 'Dev impact', value: `${((bonuses.developmentDelta ?? 0) * 100).toFixed(1)}%` },
          { label: 'Scouting confidence', value: bonuses.summary?.[2] ?? 'Balanced' },
        ]}
      />

      <SectionCard title="Current staff" subtitle="One core role per franchise layer. Replace or fire from here.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
          {currentStaffRows.map(({ roleKey, member }) => (
            <div key={roleKey} className="card" style={{ padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{ROLE_LABELS[roleKey]}</strong>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>OVR {member?.overall ?? '--'}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{member?.name ?? 'Vacant'} · {member?.age ?? '--'} · {member?.reputationTier ?? 'Unproven'}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{effectSummary(roleKey, member)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Contract: {member?.contractYears ?? 0} yrs · {fmtMoney(member?.annualSalary)}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Button size="sm" variant="outline" onClick={() => setSelectedRole(roleKey)}>Replace</Button>
                <Button size="sm" variant="ghost" onClick={() => fire(roleKey)}>Fire</Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Team impact summary" subtitle="How your current staff affects development, scouting, and injury areas.">
        <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          {(bonuses.summary ?? []).map((line) => <div key={line}>• {line}</div>)}
        </div>
      </SectionCard>

      <SectionCard title="Candidate market" subtitle="Filter and sort by role, overall, development, scouting, and salary demand.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}><option value="all">All roles</option>{ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="overall">Sort: Overall</option>
            <option value="development">Sort: Development</option>
            <option value="scouting">Sort: Scouting</option>
            <option value="salary">Sort: Salary demand</option>
          </select>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {filteredMarket.slice(0, 24).map((candidate) => (
            <div key={candidate.id} className="card" style={{ padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <strong>{candidate.name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ROLE_LABELS[candidate.roleKey] ?? candidate.role}</div>
                </div>
                <div style={{ fontSize: 12, textAlign: 'right' }}>OVR {candidate.overall} · {candidate.reputationTier}<br />Demand {fmtMoney(candidate.annualSalary)} / {candidate.contractYears}y</div>
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{effectSummary(candidate.roleKey, candidate)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Value score: {valueScore(candidate)} · Tags: {(candidate.styleTags ?? []).join(', ') || 'none'}</div>
              <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => hire(candidate)}>Hire / Replace</Button></div>
            </div>
          ))}
        </div>
      </SectionCard>

      <FranchiseInvestmentsPanel team={userTeam} actions={actions} />
      {!staffState && <EmptyState title="No staff state yet" body="Load a save with staff data to unlock hiring and firing actions." />}
    </div>
  );
}
