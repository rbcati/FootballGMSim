import React, { useMemo, useState } from 'react';
import Roster from './Roster.jsx';
import ContractCenter from './ContractCenter.jsx';
import StaffManagement from './StaffManagement.jsx';
import SectionHeader from './SectionHeader.jsx';
import SectionSubnav from './SectionSubnav.jsx';
import { derivePlayerContractFinancials } from '../utils/contractFormatting.js';
import { deriveTeamCapSnapshot, formatMoneyM } from '../utils/numberFormatting.js';

const TEAM_SUBNAV = ['Overview', 'Roster', 'Depth Chart', 'Contracts', 'Staff'];
const ROSTER_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'ST'];

function getGameId(game) {
  return game?.id ?? game?.gameId ?? game?.gid ?? null;
}

function makeMatchupLabel(game, team) {
  if (!game || !team) return '—';
  const homeId = Number(game.homeId ?? game.home);
  const awayId = Number(game.awayId ?? game.away);
  const isHome = homeId === Number(team.id);
  const oppAbbr = isHome ? (game.awayAbbr ?? `Team ${awayId}`) : (game.homeAbbr ?? `Team ${homeId}`);
  return `${isHome ? 'vs' : '@'} ${oppAbbr} · Week ${game.week ?? '—'}`;
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
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {ROSTER_POSITIONS.map((pos) => (
            <button
              key={pos}
              className={`standings-tab${posFilter === pos ? ' active' : ''}`}
              onClick={() => setPosFilter(pos)}
              style={{ padding: '5px 10px', fontSize: 11, flexShrink: 0 }}
            >
              {pos}
            </button>
          ))}
        </div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={{ fontSize: 12 }}>
          <option value="ovr">Sort: OVR</option>
          <option value="age">Sort: Age</option>
          <option value="salary">Sort: Salary</option>
          <option value="years">Sort: Years Left</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {rows.map((player) => {
          const contract = derivePlayerContractFinancials(player);
          const injuryWeeks = Number(player?.injury?.gamesRemaining ?? player?.injuryWeeksRemaining ?? 0);
          return (
            <button
              key={player.id}
              onClick={() => onPlayerSelect?.(player.id)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--hairline)',
                padding: '9px 10px',
                display: 'grid',
                gap: 2,
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{player.name} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{player.pos}</span></div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>OVR {player.ovr ?? '—'} / POT {player.pot ?? '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
                <span>Age {player.age ?? '—'}</span>
                <span>{formatMoneyM(contract.annualSalary)}</span>
                <span>{contract.yearsRemaining ?? 0}y left</span>
                {injuryWeeks > 0 ? <span style={{ color: 'var(--danger)' }}>Injured ({injuryWeeks}w)</span> : null}
                {player.schemeFit != null ? <span>Fit {Math.round(player.schemeFit)}</span> : null}
              </div>
            </button>
          );
        })}
        {rows.length === 0 ? <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>No players match this filter.</div> : null}
      </div>
    </div>
  );
}

export default function TeamHub({ league, actions, onOpenGameDetail, onPlayerSelect }) {
  const [subtab, setSubtab] = useState('Overview');
  const team = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)) ?? null, [league]);
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const capSnapshot = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });

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
    if (capSnapshot.capRoom < 10) items.push(`Cap room low (${formatMoneyM(capSnapshot.capRoom)})`);
    if (expiringPlayers.length > 8) items.push(`${expiringPlayers.length} contracts expiring soon`);
    if (injuredPlayers.length > 0) items.push(`${injuredPlayers.length} active injuries`);
    if (roster.length > 53 && league?.phase === 'preseason') items.push(`Roster cutdown required (${roster.length}/53)`);
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

  return (
    <div>
      <SectionHeader title="Team" subtitle="Front-office workspace" />
      <SectionSubnav items={TEAM_SUBNAV} activeItem={subtab} onChange={setSubtab} sticky />

      {subtab === 'Overview' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TEAM SNAPSHOT</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 8 }}>
              <div><strong>{team?.wins ?? 0}-{team?.losses ?? 0}{team?.ties ? `-${team.ties}` : ''}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Record</div></div>
              <div><strong>{team?.ovr ?? '—'} OVR</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>OFF {team?.off ?? '—'} · DEF {team?.def ?? '—'}</div></div>
              <div><strong>{formatMoneyM(capSnapshot.capRoom)}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cap room</div></div>
              <div><strong>{roster.length}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Roster count</div></div>
              <div><strong>{injuredPlayers.length}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Injuries</div></div>
              <div><strong>{expiringPlayers.length}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expiring deals</div></div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <button className="card" style={{ padding: 'var(--space-3)', textAlign: 'left' }} onClick={() => {
              const gameId = getGameId(latestGame);
              if (gameId != null) onOpenGameDetail?.(gameId, 'Team');
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>LAST GAME</div>
              <div style={{ fontWeight: 700 }}>{latestGame ? makeMatchupLabel(latestGame, team) : 'No completed game yet'}</div>
            </button>
            <button className="card" style={{ padding: 'var(--space-3)', textAlign: 'left' }} onClick={() => {
              const gameId = getGameId(upcomingGame);
              if (gameId != null) onOpenGameDetail?.(gameId, 'Team');
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>NEXT GAME</div>
              <div style={{ fontWeight: 700 }}>{upcomingGame ? makeMatchupLabel(upcomingGame, team) : 'No upcoming matchup found'}</div>
            </button>
          </div>

          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Needs attention</div>
            {needsAttention.length > 0 ? needsAttention.map((item) => <div key={item} style={{ fontSize: 12, marginBottom: 3 }}>• {item}</div>) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No urgent flags right now.</div>}
          </div>

          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Recent team news / decisions</div>
            {recentSignals.map((line) => <div key={line} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>• {line}</div>)}
            {recentSignals.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No recent team updates.</div> : null}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TEAM_SUBNAV.filter((tab) => tab !== 'Overview').map((tab) => (
              <button key={tab} className="btn" onClick={() => setSubtab(tab)}>{tab}</button>
            ))}
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
      {subtab === 'Contracts' && <ContractCenter league={league} actions={actions} />}
      {subtab === 'Staff' && <StaffManagement league={league} actions={actions} />}
    </div>
  );
}
