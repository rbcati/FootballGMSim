import React, { useEffect, useMemo, useState } from 'react';
import Roster from './Roster.jsx';
import ContractCenter from './ContractCenter.jsx';
import SectionSubnav from './SectionSubnav.jsx';
import InjuryReport from './InjuryReport.jsx';
import { SectionCard, CtaRow, StatusChip, CompactListRow } from './ScreenSystem.jsx';
import { TeamWorkspaceHeader, TeamCapSummaryStrip } from './TeamWorkspacePrimitives.jsx';
import { derivePlayerContractFinancials } from '../utils/contractFormatting.js';
import { deriveTeamCapSnapshot, formatMoneyM } from '../utils/numberFormatting.js';
import { summarizeRosterDevelopment } from '../utils/playerDevelopmentSignals.js';

const TEAM_SECTIONS = ['Overview', 'Roster / Depth', 'Contracts', 'Development', 'Injuries'];
const CRITICAL_POSITION_MIN = { QB: 2, RB: 3, WR: 5, TE: 3, OL: 8, DL: 8, LB: 6, CB: 5, S: 4, K: 1, P: 1 };

function normalizeSection(section) {
  if (typeof section !== 'string') return 'Overview';
  return TEAM_SECTIONS.find((entry) => entry.toLowerCase() === section.toLowerCase()) ?? 'Overview';
}

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

function getPositionGroupPressure(roster = []) {
  const byPos = new Map();
  for (const player of roster) {
    const pos = String(player?.pos ?? player?.position ?? 'UNK').toUpperCase();
    if (!byPos.has(pos)) byPos.set(pos, { pos, total: 0, injured: 0, starterHealthy: false });
    const row = byPos.get(pos);
    row.total += 1;
    const injured = Number(player?.injury?.gamesRemaining ?? player?.injuryWeeksRemaining ?? 0) > 0;
    if (injured) row.injured += 1;
    const depthOrder = Number(player?.depthChart?.order ?? player?.depthOrder ?? 99);
    if (depthOrder === 1 && !injured) row.starterHealthy = true;
  }
  return [...byPos.values()]
    .map((row) => {
      const min = CRITICAL_POSITION_MIN[row.pos] ?? 2;
      const healthy = row.total - row.injured;
      const thin = healthy < min;
      const starterGap = !row.starterHealthy && row.total > 0;
      const severity = thin && starterGap ? 3 : thin ? 2 : starterGap ? 1 : 0;
      return { ...row, healthy, thin, starterGap, severity };
    })
    .filter((row) => row.severity > 0)
    .sort((a, b) => b.severity - a.severity || a.healthy - b.healthy)
    .slice(0, 4);
}

function makeMatchupLabel(game, team) {
  if (!game || !team) return '—';
  const homeId = Number(game.homeId ?? game.home);
  const awayId = Number(game.awayId ?? game.away);
  const isHome = homeId === Number(team.id);
  const oppAbbr = isHome ? (game.awayAbbr ?? `Team ${awayId}`) : (game.homeAbbr ?? `Team ${homeId}`);
  return `${isHome ? 'vs' : '@'} ${oppAbbr} · Week ${game.week ?? '—'}`;
}

export default function TeamHub({ league, actions, onOpenGameDetail, onPlayerSelect, onNavigate = null, initialSection = 'Overview' }) {
  const [subtab, setSubtab] = useState(() => normalizeSection(initialSection));
  const [rosterMode, setRosterMode] = useState('roster');
  const team = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)) ?? null, [league]);
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const capSnapshot = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const avgSchemeFit = useMemo(() => {
    if (!roster.length) return 50;
    return Math.round(roster.reduce((sum, player) => sum + Number(player?.schemeFit ?? 50), 0) / roster.length);
  }, [roster]);

  const expiringPlayers = useMemo(() => roster.filter((p) => Number(derivePlayerContractFinancials(p).yearsRemaining ?? 0) <= 1), [roster]);
  const injuredPlayers = useMemo(() => roster.filter((p) => Number(p?.injury?.gamesRemaining ?? p?.injuryWeeksRemaining ?? 0) > 0), [roster]);
  const developmentSummary = useMemo(() => summarizeRosterDevelopment(roster, new Map()), [roster]);
  const pressureGroups = useMemo(() => getPositionGroupPressure(roster), [roster]);

  useEffect(() => {
    setSubtab(normalizeSection(initialSection));
  }, [initialSection]);

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
    if (injuredPlayers.length > 0) flags.push({ tone: 'warning', label: `${injuredPlayers.length} injured players impact depth`, target: 'Injuries' });
    if (pressureGroups.length > 0) flags.push({ tone: 'warning', label: `${pressureGroups.length} position groups under pressure`, target: 'Roster / Depth' });
    if (roster.length > 53 && league?.phase === 'preseason') flags.push({ tone: 'danger', label: `Roster cutdown required (${roster.length}/53)`, target: 'Roster / Depth' });
    return flags;
  }, [capSnapshot.capRoom, expiringPlayers.length, injuredPlayers.length, pressureGroups.length, roster.length, league?.phase]);

  return (
    <div className="app-screen-stack">
      <TeamWorkspaceHeader
        title="Team Command Center"
        subtitle="State of your roster, depth, contracts, development, and availability."
        eyebrow={team?.name ?? 'Team'}
        metadata={[
          { label: 'Record', value: `${team?.wins ?? 0}-${team?.losses ?? 0}${team?.ties ? `-${team.ties}` : ''}` },
          { label: 'Week', value: league?.week ?? '—' },
          { label: 'Phase', value: league?.phase ?? 'regular' },
        ]}
        actions={[
          { label: 'Overview', primary: true, onClick: () => setSubtab('Overview') },
          { label: 'Roster / Depth', onClick: () => setSubtab('Roster / Depth') },
          { label: 'Contracts', onClick: () => setSubtab('Contracts') },
          { label: 'Development', onClick: () => setSubtab('Development') },
          { label: 'Injuries', onClick: () => setSubtab('Injuries') },
        ]}
        quickContext={[
          { label: `Cap ${formatMoneyM(capSnapshot.capRoom)} room`, tone: capSnapshot.capRoom <= 10 ? 'warning' : 'ok' },
          { label: `${expiringPlayers.length} expiring deals`, tone: expiringPlayers.length >= 8 ? 'warning' : 'league' },
          { label: `${injuredPlayers.length} injuries`, tone: injuredPlayers.length > 0 ? 'warning' : 'ok' },
        ]}
      />

      <SectionSubnav items={TEAM_SECTIONS} activeItem={subtab} onChange={setSubtab} sticky />

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

          <SectionCard title="Position group pressure" subtitle="Where the current depth chart is stressed.">
            <div style={{ display: 'grid', gap: 6 }}>
              {pressureGroups.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No major weak spots detected from current healthy depth.</div> : pressureGroups.map((group) => (
                <CompactListRow
                  key={group.pos}
                  title={group.pos}
                  subtitle={`${group.healthy}/${group.total} healthy · ${group.starterGap ? 'starter unavailable' : 'starter active'}`}
                  meta={<StatusChip label={group.thin ? 'Thin' : 'Watch'} tone={group.thin ? 'warning' : 'info'} />}
                >
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setSubtab('Roster / Depth')}>Open depth</button>
                </CompactListRow>
              ))}
            </div>
          </SectionCard>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Availability</div><div style={{ fontWeight: 800 }}>{injuredPlayers.length} out</div></div>
            <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expiring deals</div><div style={{ fontWeight: 800 }}>{expiringPlayers.length}</div></div>
            <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Development</div><div style={{ fontWeight: 800 }}>+{developmentSummary.rising.length} / -{developmentSummary.slipping.length}</div></div>
            <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg scheme fit</div><div style={{ fontWeight: 800 }}>{avgSchemeFit}</div></div>
          </section>

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
              { label: 'Open roster/depth', compact: true, onClick: () => setSubtab('Roster / Depth') },
              { label: 'Review contracts', compact: true, onClick: () => setSubtab('Contracts') },
              { label: 'Development watchlist', compact: true, onClick: () => setSubtab('Development') },
              { label: 'Injury impact', compact: true, onClick: () => setSubtab('Injuries') },
              { label: 'Explore free agents', compact: true, onClick: () => onNavigate?.('Free Agency') },
            ]} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <StatusChip label="Connected team workspace" tone="team" />
              <StatusChip label="Transactions linked" tone="league" />
            </div>
          </SectionCard>
        </div>
      )}

      {subtab === 'Roster / Depth' && (
        <div className="app-screen-stack" style={{ gap: 'var(--space-2)' }}>
          <SectionCard title="Roster and depth ownership" subtitle="Set roles, identify thin spots, and keep the lineup game-ready.">
            <CtaRow actions={[
              { label: 'Roster table', compact: true, onClick: () => setRosterMode('roster') },
              { label: 'Depth chart', compact: true, onClick: () => setRosterMode('depth') },
              { label: 'Injured filter', compact: true, onClick: () => {
                setSubtab('Injuries');
              } },
            ]} />
          </SectionCard>
          <Roster
            league={league}
            actions={actions}
            onPlayerSelect={onPlayerSelect}
            onNavigate={onNavigate}
            initialState={{ viewMode: rosterMode === 'depth' ? 'depth' : 'table', initialFilter: 'ALL' }}
            initialViewMode={rosterMode === 'depth' ? 'depth' : 'table'}
          />
        </div>
      )}
      {subtab === 'Contracts' && <ContractCenter league={league} actions={actions} compact onNavigate={onNavigate} />}
      {subtab === 'Development' && (
        <div className="app-screen-stack" style={{ gap: 'var(--space-2)' }}>
          <SectionCard title="Development board" subtitle="Track risers, fallers, and prospects blocked by current depth roles.">
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rising</div><div style={{ fontWeight: 800 }}>{developmentSummary.rising.length}</div></div>
              <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Slipping</div><div style={{ fontWeight: 800 }}>{developmentSummary.slipping.length}</div></div>
              <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Blocked</div><div style={{ fontWeight: 800 }}>{developmentSummary.blocked.length}</div></div>
              <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Contract pressure</div><div style={{ fontWeight: 800 }}>{developmentSummary.contractPressure.length}</div></div>
            </section>
            <div style={{ display: 'grid', gap: 6 }}>
              {developmentSummary.rising[0] ? <div style={{ fontSize: 12 }}>Top riser: <strong>{developmentSummary.rising[0].name}</strong>.</div> : null}
              {developmentSummary.slipping[0] ? <div style={{ fontSize: 12 }}>Top faller: <strong>{developmentSummary.slipping[0].name}</strong>.</div> : null}
              {developmentSummary.blocked[0] ? <div style={{ fontSize: 12 }}>Blocked depth concern: <strong>{developmentSummary.blocked[0].name}</strong>.</div> : null}
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
