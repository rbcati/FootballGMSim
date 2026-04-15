import React, { useMemo, useState } from 'react';
import Roster from './Roster.jsx';
import ContractCenter from './ContractCenter.jsx';
import StaffManagement from './StaffManagement.jsx';
import SectionSubnav from './SectionSubnav.jsx';
import SocialFeed from './SocialFeed.jsx';
import FinancialsView from './FinancialsView.jsx';
import { SectionCard, CtaRow, StatusChip } from './ScreenSystem.jsx';
import { TeamWorkspaceHeader, TeamCapSummaryStrip } from './TeamWorkspacePrimitives.jsx';
import { derivePlayerContractFinancials } from '../utils/contractFormatting.js';
import { deriveTeamCapSnapshot, formatMoneyM } from '../utils/numberFormatting.js';

const TEAM_SUBNAV = ['Overview', 'Roster', 'Depth Chart', 'Contracts', 'Financials', 'Staff'];

function getGameId(game) {
  return game?.id ?? game?.gameId ?? game?.gid ?? null;
}

function getStarterHealth(team) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const starters = roster.filter((p) => Number(p?.depthChart?.order ?? p?.depthOrder ?? 999) === 1);
  if (!starters.length) return 'Unset';
  const healthy = starters.filter((p) => Number(p?.injury?.gamesRemaining ?? p?.injuryWeeksRemaining ?? 0) <= 0).length;
  return `${healthy}/${starters.length} healthy`;
}

function makeMatchupLabel(game, team) {
  if (!game || !team) return '—';
  const homeId = Number(game.homeId ?? game.home);
  const awayId = Number(game.awayId ?? game.away);
  const isHome = homeId === Number(team.id);
  const oppAbbr = isHome ? (game.awayAbbr ?? `Team ${awayId}`) : (game.homeAbbr ?? `Team ${homeId}`);
  return `${isHome ? 'vs' : '@'} ${oppAbbr} · Week ${game.week ?? '—'}`;
}

export default function TeamHub({ league, actions, onOpenGameDetail, onPlayerSelect, onNavigate = null }) {
  const [subtab, setSubtab] = useState('Overview');
  const team = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)) ?? null, [league]);
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const capSnapshot = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });

  const expiringPlayers = useMemo(() => roster.filter((p) => Number(derivePlayerContractFinancials(p).yearsRemaining ?? 0) <= 1), [roster]);
  const injuredPlayers = useMemo(() => roster.filter((p) => Number(p?.injury?.gamesRemaining ?? p?.injuryWeeksRemaining ?? 0) > 0), [roster]);

  const latestGame = useMemo(() => {
    const games = Array.isArray(league?.schedule) ? league.schedule : [];
    return [...games].reverse().find((g) => (Number(g.homeId ?? g.home) === Number(team?.id) || Number(g.awayId ?? g.away) === Number(team?.id)) && Number(g.homeScore ?? -1) >= 0 && Number(g.awayScore ?? -1) >= 0);
  }, [league?.schedule, team?.id]);

  const upcomingGame = useMemo(() => {
    const games = Array.isArray(league?.schedule) ? league.schedule : [];
    return games.find((g) => (Number(g.homeId ?? g.home) === Number(team?.id) || Number(g.awayId ?? g.away) === Number(team?.id)) && (g.homeScore == null || g.awayScore == null));
  }, [league?.schedule, team?.id]);

  const urgentActions = useMemo(() => {
    const flags = [];
    if (capSnapshot.capRoom < 10) flags.push({ tone: 'danger', label: `Cap room low (${formatMoneyM(capSnapshot.capRoom)})`, target: 'Financials' });
    if (expiringPlayers.length > 8) flags.push({ tone: 'warning', label: `${expiringPlayers.length} contracts need attention`, target: 'Contracts' });
    if (injuredPlayers.length > 0) flags.push({ tone: 'warning', label: `${injuredPlayers.length} injured players impact depth`, target: 'Depth Chart' });
    if (roster.length > 53 && league?.phase === 'preseason') flags.push({ tone: 'danger', label: `Roster cutdown required (${roster.length}/53)`, target: 'Roster' });
    return flags;
  }, [capSnapshot.capRoom, expiringPlayers.length, injuredPlayers.length, roster.length, league?.phase]);

  return (
    <div className="app-screen-stack">
      <TeamWorkspaceHeader
        title="Team Operations"
        subtitle="Command center for roster, contracts, cap pressure, and transactions."
        eyebrow={team?.name ?? 'Team'}
        metadata={[
          { label: 'Record', value: `${team?.wins ?? 0}-${team?.losses ?? 0}${team?.ties ? `-${team.ties}` : ''}` },
          { label: 'Week', value: league?.week ?? '—' },
          { label: 'Phase', value: league?.phase ?? 'regular' },
        ]}
        actions={[
          { label: 'Roster', primary: true, onClick: () => setSubtab('Roster') },
          { label: 'Depth Chart', onClick: () => setSubtab('Depth Chart') },
          { label: 'Contracts', onClick: () => setSubtab('Contracts') },
          { label: 'Financials', onClick: () => setSubtab('Financials') },
          { label: 'Free Agency', onClick: () => onNavigate?.('Free Agency') },
          { label: 'Transactions', onClick: () => onNavigate?.('Transactions') },
        ]}
        quickContext={[
          { label: `Cap ${formatMoneyM(capSnapshot.capRoom)} room`, tone: capSnapshot.capRoom <= 10 ? 'warning' : 'ok' },
          { label: `${expiringPlayers.length} expiring deals`, tone: expiringPlayers.length >= 8 ? 'warning' : 'league' },
          { label: `${injuredPlayers.length} injuries`, tone: injuredPlayers.length > 0 ? 'warning' : 'ok' },
        ]}
      />

      <SectionSubnav items={TEAM_SUBNAV} activeItem={subtab} onChange={setSubtab} sticky />

      {subtab === 'Overview' && (
        <div className="app-screen-stack" style={{ gap: 'var(--space-2)' }}>
          <TeamCapSummaryStrip
            capSnapshot={capSnapshot}
            rosterCount={roster.length}
            starterHealth={getStarterHealth(team)}
            expiringCount={expiringPlayers.length}
          />

          <SectionCard title="Priority queue" subtitle="Most important front-office actions this week.">
            {urgentActions.length > 0 ? urgentActions.map((item) => (
              <button
                key={item.label}
                onClick={() => setSubtab(item.target)}
                style={{
                  width: '100%',
                  border: '1px solid var(--hairline)',
                  borderRadius: 8,
                  background: 'transparent',
                  textAlign: 'left',
                  padding: '8px 10px',
                  fontSize: 12,
                  color: item.tone === 'danger' ? 'var(--danger)' : 'var(--warning)',
                }}
              >
                {item.label} →
              </button>
            )) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No urgent team issues right now.</div>}
          </SectionCard>

          <SectionCard title="Game context" subtitle="Quick links back to game flow without leaving team ops.">
            <div style={{ display: 'grid', gap: 8 }}>
              <button className="card" style={{ padding: '10px', textAlign: 'left' }} onClick={() => {
                const gameId = getGameId(latestGame);
                if (gameId != null) onOpenGameDetail?.(gameId, 'Team');
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>LAST RESULT</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{latestGame ? makeMatchupLabel(latestGame, team) : 'No completed game yet'}</div>
              </button>
              <button className="card" style={{ padding: '10px', textAlign: 'left' }} onClick={() => {
                const gameId = getGameId(upcomingGame);
                if (gameId != null) onOpenGameDetail?.(gameId, 'Team');
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>NEXT MATCHUP</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{upcomingGame ? makeMatchupLabel(upcomingGame, team) : 'No upcoming matchup found'}</div>
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Team workflow" subtitle="Move through the full roster management loop.">
            <CtaRow actions={[
              { label: 'Review roster', compact: true, onClick: () => setSubtab('Roster') },
              { label: 'Set depth', compact: true, onClick: () => setSubtab('Depth Chart') },
              { label: 'Handle contracts', compact: true, onClick: () => setSubtab('Contracts') },
              { label: 'Cap outlook', compact: true, onClick: () => setSubtab('Financials') },
              { label: 'Enter free agency', compact: true, onClick: () => onNavigate?.('Free Agency') },
              { label: 'Open trade desk', compact: true, onClick: () => onNavigate?.('Transactions') },
            ]} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <StatusChip label="Connected team workspace" tone="team" />
              <StatusChip label="Transactions linked" tone="league" />
            </div>
          </SectionCard>

          <SocialFeed league={league} defaultFilter="team" maxItems={5} onPlayerSelect={onPlayerSelect} />
        </div>
      )}

      {subtab === 'Roster' && <Roster league={league} actions={actions} onPlayerSelect={onPlayerSelect} onNavigate={onNavigate} />}
      {subtab === 'Depth Chart' && (
        <Roster
          league={league}
          actions={actions}
          onPlayerSelect={onPlayerSelect}
          onNavigate={onNavigate}
          initialState={{ viewMode: 'depth', initialFilter: 'ALL' }}
          initialViewMode="depth"
        />
      )}
      {subtab === 'Contracts' && <ContractCenter league={league} actions={actions} compact onNavigate={onNavigate} />}
      {subtab === 'Financials' && <FinancialsView league={league} actions={actions} />}
      {subtab === 'Staff' && <StaffManagement league={league} actions={actions} compact />}
    </div>
  );
}
