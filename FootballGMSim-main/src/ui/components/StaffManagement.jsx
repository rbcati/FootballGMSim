import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScreenHeader, SectionCard, EmptyState } from './ScreenSystem.jsx';
import FranchiseInvestmentsPanel from './FranchiseInvestmentsPanel.jsx';
import FaceAvatar from './FaceAvatar.jsx';

const ROLE_ORDER = ['headCoach', 'offCoordinator', 'defCoordinator', 'specialTeamsCoach', 'scoutDirector', 'headTrainer', 'mentor', 'analyticsDirector'];
const ROLE_LABELS = {
  headCoach: 'Head Coach',
  offCoordinator: 'Offensive Coordinator',
  defCoordinator: 'Defensive Coordinator',
  specialTeamsCoach: 'Special Teams Coach',
  scoutDirector: 'Scout',
  headTrainer: 'Physio',
  mentor: 'Mentor',
  analyticsDirector: 'Analytics Director',
};

const ATTRIBUTE_TOOLTIP = {
  tacticalSkill: 'Affects in-game decisions, situational calls, and tactical edge.',
  playerDevelopment: 'Improves growth curves and ceiling outcomes during progression.',
  injuryPrevention: 'Lowers injury frequency and speeds weekly recovery.',
  scoutingAccuracy: 'Improves certainty in draft and talent evaluations.',
  motivation: 'Stabilizes morale, readiness, and culture outcomes.',
};

function fmtMoney(value) {
  return `$${Number(value || 0).toFixed(1)}M`;
}

function effectSummary(member) {
  const a = member?.attributes ?? {};
  return `Tac ${a.tacticalSkill ?? 0} · Dev ${a.playerDevelopment ?? 0} · Health ${a.injuryPrevention ?? 0} · Scout ${a.scoutingAccuracy ?? 0} · Mot ${a.motivation ?? 0}`;
}

function valueScore(candidate) {
  const attrs = Object.values(candidate?.attributes ?? {});
  const avg = attrs.length ? attrs.reduce((sum, n) => sum + Number(n || 0), 0) / attrs.length : 0;
  return Math.round(avg - (Number(candidate?.annualSalary || candidate?.contract?.annualSalary || 0) * 2));
}

export default function StaffManagement({ league, actions, compact = false }) {
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
  const staffSalaryTotal = currentStaffRows.reduce((sum, row) => sum + Number(row.member?.contract?.annualSalary ?? row.member?.annualSalary ?? 0), 0);

  const filteredMarket = useMemo(() => {
    const base = market.filter((candidate) => selectedRole === 'all' || candidate?.roleKey === selectedRole);
    return [...base].sort((a, b) => {
      if (sortBy === 'salary') return Number(a?.contract?.annualSalary ?? a?.annualSalary ?? 0) - Number(b?.contract?.annualSalary ?? b?.annualSalary ?? 0);
      if (sortBy === 'development') return Number(b?.attributes?.playerDevelopment ?? 0) - Number(a?.attributes?.playerDevelopment ?? 0);
      if (sortBy === 'scouting') return Number(b?.attributes?.scoutingAccuracy ?? 0) - Number(a?.attributes?.scoutingAccuracy ?? 0);
      return Number(b?.overall ?? 0) - Number(a?.overall ?? 0);
    });
  }, [market, selectedRole, sortBy]);

  const hire = async (candidate) => {
    await actions?.hireStaffMember?.({ teamId, roleKey: candidate?.roleKey, candidate });
    await refresh();
  };

  const negotiate = async (roleKey, member) => {
    const baseSalary = Number(member?.contract?.annualSalary ?? member?.annualSalary ?? 1);
    const askSalary = Number(window.prompt(`Negotiate ${member.name} salary ($M/year)`, String(baseSalary.toFixed(1))));
    if (!Number.isFinite(askSalary) || askSalary <= 0) return;
    const baseYears = Number(member?.contract?.years ?? member?.contractYears ?? 2);
    const askYears = Number(window.prompt('Contract years', String(baseYears)));
    await actions?.negotiateStaffContract?.({ teamId, roleKey, ask: { annualSalary: askSalary, years: askYears } });
    await refresh();
  };

  const fire = async (roleKey) => {
    await actions?.fireStaffMember?.({ teamId, roleKey });
    await refresh();
  };

  return (
    <div className="app-screen-stack" style={{ maxWidth: 1000, margin: '0 auto', gap: compact ? 'var(--space-2)' : undefined }}>
      <ScreenHeader
        eyebrow="Operations"
        title="Staff & Development"
        subtitle={compact ? 'Front office console for coaching, scouting, and player support staff.' : 'Hire, fire, and negotiate contracts for your football operations staff.'}
        metadata={[
          { label: 'Staff payroll', value: fmtMoney(staffSalaryTotal) },
          { label: 'Cap room', value: fmtMoney(staffState?.cap?.teamCapRoom ?? userTeam?.capRoom ?? 0) },
          { label: 'Dev impact', value: `${((bonuses.developmentDelta ?? 0) * 100).toFixed(1)}%` },
          { label: 'Scouting confidence', value: bonuses.summary?.[2] ?? 'Balanced' },
        ]}
      />
      <SectionCard title="Current staff" subtitle="Each role now contributes directly to development, injuries, scouting, and playcalling.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>
          {currentStaffRows.map(({ roleKey, member }) => (
            <div key={roleKey} className="card" style={{ padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FaceAvatar face={member?.face} seed={member?.id ?? member?.name} size={30} /><strong>{ROLE_LABELS[roleKey]}</strong></div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>OVR {member?.overall ?? '--'}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{member?.name ?? 'Vacant'} · {member?.age ?? '--'} · {member?.schemePreference ?? 'Multiple'}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{effectSummary(member)}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                {Object.entries(ATTRIBUTE_TOOLTIP).map(([key, copy]) => <span key={key} title={copy}>{key}</span>)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Contract: {member?.contract?.years ?? member?.contractYears ?? 0} yrs · {fmtMoney(member?.contract?.annualSalary ?? member?.annualSalary)}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Button size="sm" variant="outline" onClick={() => setSelectedRole(roleKey)}>Replace</Button>
                {member ? <Button size="sm" variant="outline" onClick={() => negotiate(roleKey, member)}>Negotiate</Button> : null}
                <Button size="sm" variant="ghost" onClick={() => fire(roleKey)}>Fire</Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Team impact summary" subtitle="How current staff affects development, scouting, and injuries.">
        <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          {(bonuses.summary ?? []).map((line) => <div key={line}>• {line}</div>)}
        </div>
      </SectionCard>

      <SectionCard title="Candidate market" subtitle="Filter/sort candidates and hire directly into a role.">
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FaceAvatar face={candidate?.face} seed={candidate?.id ?? candidate?.name} size={32} />
                  <div><strong>{candidate.name}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ROLE_LABELS[candidate.roleKey] ?? candidate.role} · {candidate.schemePreference}</div></div>
                </div>
                <div style={{ fontSize: 12, textAlign: 'right' }}>OVR {candidate.overall}<br />Demand {fmtMoney(candidate?.contract?.annualSalary ?? candidate?.annualSalary)} / {candidate?.contract?.years ?? candidate?.contractYears}y</div>
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{effectSummary(candidate)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Value score: {valueScore(candidate)} · Tags: {(candidate.styleTags ?? []).join(', ') || 'none'}</div>
              <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => hire(candidate)}>Hire / Replace</Button></div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Facilities, schemes, and investment" subtitle="Use this panel to allocate franchise resources and long-term infrastructure spend.">
        <FranchiseInvestmentsPanel team={userTeam} actions={actions} />
      </SectionCard>
      {!staffState && <EmptyState title="No staff state yet" body="Load a save with staff data to unlock hiring and firing actions." />}
    </div>
  );
}
