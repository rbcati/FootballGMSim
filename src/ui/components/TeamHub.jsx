import React, { useMemo, useState } from 'react';
import Roster from './Roster.jsx';
import ContractCenter from './ContractCenter.jsx';
import StaffManagement from './StaffManagement.jsx';
import SectionSubnav from './SectionSubnav.jsx';
import SocialFeed from './SocialFeed.jsx';
import { CardActionFooter, CtaRow, ScreenHeader, StatusChip } from './ScreenSystem.jsx';
import { derivePlayerContractFinancials } from '../utils/contractFormatting.js';
import { deriveTeamCapSnapshot, formatMoneyM } from '../utils/numberFormatting.js';

const TEAM_SUBNAV = ['Overview', 'Roster', 'Depth Chart', 'Contracts', 'Staff'];
const ROSTER_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'ST'];

function getGameId(game) {
  return game?.id ?? game?.gameId ?? game?.gid ?? null;
}

function getWinPct(team) {
  const wins = Number(team?.wins ?? 0);
  const losses = Number(team?.losses ?? 0);
  const ties = Number(team?.ties ?? 0);
  const games = wins + losses + ties;
  if (!games) return 0;
  return (wins + (0.5 * ties)) / games;
}

function getConferenceRank(league, team) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  if (!team || !teams.length) return null;
  const confTeams = teams
    .filter((t) => Number(t?.conf) === Number(team?.conf))
    .sort((a, b) => getWinPct(b) - getWinPct(a));
  const confIndex = confTeams.findIndex((t) => Number(t?.id) === Number(team?.id));
  const cutoff = confTeams[6];
  return {
    rank: confIndex >= 0 ? confIndex + 1 : null,
    playoffLine: cutoff ? `${cutoff.wins ?? 0}-${cutoff.losses ?? 0}${cutoff.ties ? `-${cutoff.ties}` : ''}` : '—',
  };
}

function makeMatchupLabel(game, team) {
  if (!game || !team) return '—';
  const homeId = Number(game.homeId ?? game.home);
  const awayId = Number(game.awayId ?? game.away);
  const isHome = homeId === Number(team.id);
  const oppAbbr = isHome ? (game.awayAbbr ?? `Team ${awayId}`) : (game.homeAbbr ?? `Team ${homeId}`);
  return `${isHome ? 'vs' : '@'} ${oppAbbr} · Week ${game.week ?? '—'}`;
}

function CompactMetric({ label, value, subtext }) {
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: '8px 9px', minHeight: 62 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.35 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, lineHeight: 1.2 }}>{value}</div>
      {subtext ? <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{subtext}</div> : null}
    </div>
  );
}

function CompactRosterWorkspace({ team, onPlayerSelect }) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState('ovr');

  const rows = useMemo(() => {
    const filtered = roster.filter((p) => {
      if (posFilter === 'ALL') return true;
      if (posFilter === 'ST') return ['K', 'P', 'LS'].includes(p?.pos);
      if (posFilter === 'OL') return ['LT', 'LG', 'C', 'RG', 'RT', 'OL'].includes(p?.pos);
      if (posFilter === 'DL') return ['DE', 'DT', 'NT', 'DL'].includes(p?.pos);
      if (posFilter === 'LB') return ['LB', 'OLB', 'ILB', 'MLB'].includes(p?.pos);
      if (posFilter === 'CB') return ['CB', 'DB'].includes(p?.pos);
      if (posFilter === 'S') return ['S', 'SS', 'FS'].includes(p?.pos);
      return p?.pos === posFilter;
    });

    const getSortValue = (player) => {
      if (sortKey === 'age') return Number(player?.age ?? 0);
      if (sortKey === 'salary') return Number(derivePlayerContractFinancials(player).annualSalary ?? 0);
      if (sortKey === 'years') return Number(derivePlayerContractFinancials(player).yearsRemaining ?? 0);
      return Number(player?.ovr ?? 0);
    };

    return [...filtered].sort((a, b) => {
      if (sortKey === 'age') return getSortValue(a) - getSortValue(b);
      return getSortValue(b) - getSortValue(a);
    });
  }, [roster, posFilter, sortKey]);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {ROSTER_POSITIONS.map((pos) => (
            <button
              key={pos}
              className={`standings-tab${posFilter === pos ? ' active' : ''}`}
              onClick={() => setPosFilter(pos)}
              style={{ padding: '4px 9px', fontSize: 11, flexShrink: 0 }}
            >
              {pos}
            </button>
          ))}
        </div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={{ fontSize: 12, marginLeft: 'auto' }}>
          <option value="ovr">Sort: OVR</option>
          <option value="age">Sort: Age</option>
          <option value="salary">Sort: Salary</option>
          <option value="years">Sort: Years Left</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.4fr) 34px 30px 72px minmax(62px,0.9fr) 58px',
          gap: 6,
          padding: '6px 10px',
          fontSize: 10,
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--hairline)',
          textTransform: 'uppercase',
          letterSpacing: 0.25,
        }}>
          <div>Player</div>
          <div>Pos</div>
          <div>Age</div>
          <div>OVR/POT</div>
          <div>Injury</div>
          <div>Deal</div>
        </div>
        {rows.map((player) => {
          const contract = derivePlayerContractFinancials(player);
          const injuryWeeks = Number(player?.injury?.gamesRemaining ?? player?.injuryWeeksRemaining ?? 0);
          const injuryLabel = injuryWeeks > 0 ? `${injuryWeeks}w` : 'Healthy';
          return (
            <button
              key={player.id}
              onClick={() => onPlayerSelect?.(player.id)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--hairline)',
                padding: '7px 10px',
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1.4fr) 34px 30px 72px minmax(62px,0.9fr) 58px',
                gap: 6,
                textAlign: 'left',
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatMoneyM(contract.annualSalary)}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{player.pos ?? '—'}</div>
              <div style={{ fontSize: 11 }}>{player.age ?? '—'}</div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{player.ovr ?? '—'}/{player.pot ?? '—'}</div>
              <div style={{ fontSize: 10, color: injuryWeeks > 0 ? 'var(--danger)' : 'var(--text-subtle)' }}>{injuryLabel}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{contract.yearsRemaining ?? 0}y</div>
            </button>
          );
        })}
        {rows.length === 0 ? <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>No players match this filter.</div> : null}
      </div>
    </div>
  );
}

export default function TeamHub({ league, actions, onOpenGameDetail, onPlayerSelect, onNavigate = null }) {
  const [subtab, setSubtab] = useState('Overview');
  const team = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)) ?? null, [league]);
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const capSnapshot = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const standing = useMemo(() => getConferenceRank(league, team), [league, team]);

  const expiringPlayers = useMemo(
    () => roster.filter((p) => Number(derivePlayerContractFinancials(p).yearsRemaining ?? 0) <= 1),
    [roster],
  );
  const injuredPlayers = useMemo(
    () => roster.filter((p) => Number(p?.injury?.gamesRemaining ?? p?.injuryWeeksRemaining ?? 0) > 0),
    [roster],
  );

  const latestGame = useMemo(() => {
    const games = Array.isArray(league?.schedule) ? league.schedule : [];
    return [...games].reverse().find((g) => (Number(g.homeId ?? g.home) === Number(team?.id) || Number(g.awayId ?? g.away) === Number(team?.id)) && Number(g.homeScore ?? -1) >= 0 && Number(g.awayScore ?? -1) >= 0);
  }, [league?.schedule, team?.id]);

  const upcomingGame = useMemo(() => {
    const games = Array.isArray(league?.schedule) ? league.schedule : [];
    return games.find((g) => (Number(g.homeId ?? g.home) === Number(team?.id) || Number(g.awayId ?? g.away) === Number(team?.id)) && (g.homeScore == null || g.awayScore == null));
  }, [league?.schedule, team?.id]);

  const needsAttention = useMemo(() => {
    const items = [];
    if (capSnapshot.capRoom < 10) items.push({ tone: 'danger', label: `Cap room low (${formatMoneyM(capSnapshot.capRoom)})`, tab: 'Contracts' });
    if (expiringPlayers.length > 8) items.push({ tone: 'warning', label: `${expiringPlayers.length} contracts expiring soon`, tab: 'Contracts' });
    if (injuredPlayers.length > 0) items.push({ tone: 'warning', label: `${injuredPlayers.length} active injuries`, tab: 'Roster' });
    if (roster.length > 53 && league?.phase === 'preseason') items.push({ tone: 'danger', label: `Roster cutdown required (${roster.length}/53)`, tab: 'Roster' });
    return items;
  }, [capSnapshot.capRoom, expiringPlayers.length, injuredPlayers.length, roster.length, league?.phase]);

  const recentSignals = useMemo(() => {
    return [
      latestGame ? `Last game: ${latestGame.awayAbbr ?? 'AWY'} ${latestGame.awayScore} - ${latestGame.homeScore} ${latestGame.homeAbbr ?? 'HME'}` : null,
      expiringPlayers[0] ? `${expiringPlayers[0].name} is in a contract year` : null,
      injuredPlayers[0] ? `${injuredPlayers[0].name} out ${injuredPlayers[0]?.injury?.gamesRemaining ?? injuredPlayers[0]?.injuryWeeksRemaining ?? 0} weeks` : null,
      team?.scheme ? `Current scheme: ${team.scheme}` : null,
    ].filter(Boolean).slice(0, 4);
  }, [latestGame, expiringPlayers, injuredPlayers, team?.scheme]);

  const quickActions = [
    { label: 'Open roster', tab: 'Roster' },
    { label: 'Set depth chart', tab: 'Depth Chart' },
    { label: 'Manage contracts', tab: 'Contracts' },
    { label: 'Staff console', tab: 'Staff' },
    { label: 'Analytics dashboard', tab: 'Analytics' },
  ];

  return (
    <div className="app-screen-stack">
      <ScreenHeader
        title="Team Hub"
        subtitle="Roster, depth chart, contracts, and staff in one operations workspace."
        eyebrow={team?.name ?? 'Team'}
        metadata={[
          { label: 'Record', value: `${team?.wins ?? 0}-${team?.losses ?? 0}${team?.ties ? `-${team.ties}` : ''}` },
          { label: 'Cap Room', value: formatMoneyM(capSnapshot.capRoom) },
          { label: 'Roster', value: `${roster.length}/53` },
        ]}
      />
      <SectionSubnav items={TEAM_SUBNAV} activeItem={subtab} onChange={setSubtab} sticky />

      {subtab === 'Overview' && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <SocialFeed league={league} defaultFilter="team" maxItems={6} onPlayerSelect={onPlayerSelect} />
          <div className="card" style={{ padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TEAM SNAPSHOT</div>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Week {league?.week ?? '—'} · {league?.phase ?? 'regular'}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 7, marginTop: 8 }}>
              <CompactMetric label="Record" value={`${team?.wins ?? 0}-${team?.losses ?? 0}${team?.ties ? `-${team.ties}` : ''}`} subtext={standing?.rank ? `Conf #${standing.rank} · line ${standing.playoffLine}` : 'Conference context unavailable'} />
              <CompactMetric label="Ratings" value={`${team?.ovr ?? '—'} OVR`} subtext={`OFF ${team?.off ?? '—'} · DEF ${team?.def ?? '—'}`} />
              <CompactMetric label="Cap room" value={formatMoneyM(capSnapshot.capRoom)} subtext={`${formatMoneyM(capSnapshot.capUsed)} used`} />
              <CompactMetric label="Roster" value={`${roster.length}/53`} subtext={`${injuredPlayers.length} injured · ${expiringPlayers.length} expiring`} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 7 }}>
            <button className="card" style={{ padding: '10px', textAlign: 'left' }} onClick={() => {
              const gameId = getGameId(latestGame);
              if (gameId != null) onOpenGameDetail?.(gameId, 'Team');
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>LAST GAME</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{latestGame ? makeMatchupLabel(latestGame, team) : 'No completed game yet'}</div>
              {latestGame ? <div style={{ marginTop: 4, fontWeight: 800, fontSize: 14, color: 'var(--accent)' }}>{latestGame.awayAbbr ?? 'AWY'} {latestGame.awayScore} - {latestGame.homeScore} {latestGame.homeAbbr ?? 'HME'} · View box score →</div> : null}
            </button>
            <button className="card" style={{ padding: '10px', textAlign: 'left' }} onClick={() => {
              const gameId = getGameId(upcomingGame);
              if (gameId != null) onOpenGameDetail?.(gameId, 'Team');
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>NEXT GAME</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{upcomingGame ? makeMatchupLabel(upcomingGame, team) : 'No upcoming matchup found'}</div>
              {upcomingGame ? <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>Tap to open game details →</div> : null}
            </button>
          </div>

          <div className="card" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Needs attention</div>
            {needsAttention.length > 0 ? needsAttention.map((item) => (
              <button
                key={item.label}
                onClick={() => setSubtab(item.tab)}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--hairline)',
                  fontSize: 12,
                  color: item.tone === 'danger' ? 'var(--danger)' : 'var(--warning)',
                }}
              >
                {item.label}
              </button>
            )) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No urgent flags right now.</div>}
          </div>

          <div className="card" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Team alerts & news</div>
            {recentSignals.map((line) => <div key={line} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>• {line}</div>)}
            {recentSignals.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No recent team updates.</div> : null}
          </div>

          <div className="card" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Quick actions</div>
            <CtaRow actions={quickActions.map((item) => ({
              label: item.label,
              compact: true,
              onClick: () => (item.tab === 'Analytics' ? onNavigate?.('Analytics') : setSubtab(item.tab)),
            }))} />
            <CardActionFooter>
              <StatusChip label="Team workspace" tone="team" />
            </CardActionFooter>
          </div>
        </div>
      )}

      {subtab === 'Roster' && <CompactRosterWorkspace team={team} onPlayerSelect={onPlayerSelect} />}
      {subtab === 'Depth Chart' && (
        <Roster
          league={league}
          actions={actions}
          onPlayerSelect={onPlayerSelect}
          initialState={{ viewMode: 'depth', initialFilter: 'ALL' }}
          initialViewMode="depth"
        />
      )}
      {subtab === 'Contracts' && <ContractCenter league={league} actions={actions} compact />}
      {subtab === 'Staff' && <StaffManagement league={league} actions={actions} compact />}
    </div>
  );
}
