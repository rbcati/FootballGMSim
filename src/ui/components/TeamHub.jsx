import React, { useEffect, useMemo, useState } from 'react';
import SectionSubnav from './SectionSubnav.jsx';
import Roster from './Roster.jsx';
import InjuryReport from './InjuryReport.jsx';
import { ScreenHeader, SectionCard, StatStrip, StatPill } from './ScreenSystem.jsx';

const TEAM_SECTIONS = ['Overview', 'Roster', 'Development', 'Injuries'];

function normalizeSubtab(tab) {
  if (typeof tab !== 'string') return 'Overview';
  return TEAM_SECTIONS.find((entry) => entry.toLowerCase() === tab.toLowerCase()) ?? 'Overview';
}

export default function TeamHub({
  league,
  actions,
  initialSubtab = 'Overview',
  onPlayerSelect,
  onNavigate,
}) {
  const [subtab, setSubtab] = useState(() => normalizeSubtab(initialSubtab));

  useEffect(() => {
    setSubtab(normalizeSubtab(initialSubtab));
  }, [initialSubtab]);

  const team = useMemo(() => league?.teams?.find((t) => t.id === league?.userTeamId), [league]);

  const developmentSummary = useMemo(() => {
    const players = team?.roster ?? [];
    return {
      rising: players.filter((p) => (p.pot ?? 0) > (p.ovr ?? 0) + 5).slice(0, 5),
      slipping: players.filter((p) => p.age > 30 && p.ovr > 80).slice(0, 5),
      blocked: players.filter((p) => p.ovr > 75 && p.depthChartOrder > 2).slice(0, 5),
      contractPressure: players.filter((p) => (p.contractWeeksRemaining ?? 0) < 20).slice(0, 5),
    };
  }, [team]);

  return (
    <div className="app-screen-stack team-hub">
      <ScreenHeader
        title={`${team?.city} ${team?.name} Operations`}
        subtitle="Manage roster depth, player development, and medical reports."
        eyebrow={`${team?.abbr ?? 'TEAM'} · ${team?.wins ?? 0}-${team?.losses ?? 0} `}
      />
      <SectionSubnav items={TEAM_SECTIONS} activeItem={subtab} onChange={setSubtab} />

      {subtab === 'Overview' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <SectionCard title="Roster Summary" variant="compact">
            <StatStrip>
              <StatPill label="Active" value={`${(team?.roster ?? []).length}`} />
              <StatPill label="Avg Age" value={`${(team?.roster?.reduce((acc, p) => acc + (p.age || 0), 0) / (team?.roster?.length || 1)).toFixed(1)}`} />
              <StatPill label="Injured" value={`${(team?.roster ?? []).filter(p => p.injuryWeeksRemaining > 0).length}`} tone={(team?.roster ?? []).filter(p => p.injuryWeeksRemaining > 0).length > 2 ? "warning" : "neutral"} />
            </StatStrip>
          </SectionCard>

          <Roster
            league={league}
            actions={actions}
            onPlayerSelect={onPlayerSelect}
            onNavigate={onNavigate}
            initialState={{ viewMode: 'table' }}
            initialViewMode="table"
          />
        </div>
      )}

      {subtab === 'Roster' && (
        <Roster
          league={league}
          actions={actions}
          onPlayerSelect={onPlayerSelect}
          onNavigate={onNavigate}
        />
      )}

      {subtab === 'Development' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <SectionCard title="Development Board" subtitle="Track prospects and roster pressure." variant="compact">
            <StatStrip>
              <StatPill label="Rising" value={developmentSummary.rising.length} />
              <StatPill label="Slipping" value={developmentSummary.slipping.length} />
              <StatPill label="Blocked" value={developmentSummary.blocked.length} tone={developmentSummary.blocked.length > 2 ? "warning" : "neutral"} />
              <StatPill label="Pressure" value={developmentSummary.contractPressure.length} tone={developmentSummary.contractPressure.length > 3 ? "danger" : "neutral"} />
            </StatStrip>

            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {developmentSummary.rising[0] && (
                <div style={{ fontSize: 'var(--text-xs)', padding: '8px 12px', background: 'var(--surface-strong)', borderRadius: 'var(--radius-md)' }}>
                  Top riser: <strong>{developmentSummary.rising[0].name}</strong>
                </div>
              )}
              {developmentSummary.blocked[0] && (
                <div style={{ fontSize: 'var(--text-xs)', padding: '8px 12px', background: 'var(--surface-strong)', borderRadius: 'var(--radius-md)' }}>
                  Blocked concern: <strong>{developmentSummary.blocked[0].name}</strong>
                </div>
              )}
            </div>
          </SectionCard>

          <Roster
            league={league}
            actions={actions}
            onPlayerSelect={onPlayerSelect}
            onNavigate={onNavigate}
            initialState={{ viewMode: 'table', initialFilter: 'DEVELOPMENT' }}
            initialViewMode="table"
          />
        </div>
      )}

      {subtab === 'Injuries' && <InjuryReport league={league} onPlayerSelect={onPlayerSelect} />}
    </div>
  );
}
