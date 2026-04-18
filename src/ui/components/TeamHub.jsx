import React, { useEffect, useMemo, useState } from 'react';
import Roster from './Roster.jsx';
import ContractCenter from './ContractCenter.jsx';
import SectionSubnav from './SectionSubnav.jsx';
import InjuryReport from './InjuryReport.jsx';
import { SectionCard, CtaRow, StatusChip, CompactListRow, HeroCard, StatStrip, SectionHeader, CompactInsightCard } from './ScreenSystem.jsx';
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
    .slice(0, 3);
}

function makeMatchupLabel(game, team) {
  if (!game || !team) return '—';
  const homeId = Number(game.homeId ?? game.home);
  const isHome = homeId === Number(team.id);
  const oppAbbr = isHome ? (game.awayAbbr ?? `Team`) : (game.homeAbbr ?? `Team`);
  return `${isHome ? 'vs' : '@'} ${oppAbbr} · Week ${game.week ?? '—'}`;
}

export default function TeamHub({ league, actions, onOpenGameDetail, onPlayerSelect, onNavigate = null, initialSection = 'Overview' }) {
  const [subtab, setSubtab] = useState(() => normalizeSection(initialSection));
  const [rosterMode, setRosterMode] = useState('roster');
  const team = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)) ?? null, [league]);
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const capSnapshot = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });

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
    return flags.slice(0, 3);
  }, [capSnapshot.capRoom, expiringPlayers.length, injuredPlayers.length, pressureGroups.length, roster.length, league?.phase]);

  return (
    <div className="app-screen-stack">
      <HeroCard
        eyebrow={`${league?.year ?? 'Season'} · Week ${league?.week ?? '—'} · ${league?.phase ?? 'regular'}`}
        title="Team Command Center"
        subtitle={`${team?.name ?? 'Team'} · ${team?.wins ?? 0}-${team?.losses ?? 0}${team?.ties ? `-${team.ties}` : ''}`}
        rightMeta={<StatusChip label={`${injuredPlayers.length} injuries`} tone={injuredPlayers.length ? 'warning' : 'ok'} />}
      >
        <div className="app-hero-summary-grid">
          <div><span>Last game</span><strong>{latestGame ? makeMatchupLabel(latestGame, team) : 'No completed game yet'}</strong></div>
          <div><span>Next game</span><strong>{upcomingGame ? makeMatchupLabel(upcomingGame, team) : 'No upcoming matchup'}</strong></div>
        </div>
      </HeroCard>

      <SectionSubnav items={TEAM_SECTIONS} activeItem={subtab} onChange={setSubtab} sticky />

      {subtab === 'Overview' && (
        <div className="app-screen-stack">
          <SectionHeader eyebrow="Operations" title="Roster Status" subtitle="High-impact team signals." />
          <StatStrip items={[
            { label: 'Cap Room', value: formatMoneyM(capSnapshot.capRoom), tone: capSnapshot.capRoom < 10 ? 'warning' : 'ok' },
            { label: 'Roster', value: `${roster.length}/53`, tone: roster.length > 53 ? 'danger' : 'neutral' },
            { label: 'Expiring', value: `${expiringPlayers.length}`, tone: expiringPlayers.length > 8 ? 'warning' : 'neutral' },
            { label: 'Development', value: `+${developmentSummary.rising.length} / -${developmentSummary.slipping.length}`, tone: 'team' },
          ]} />

          <SectionCard title="Priority queue" subtitle="Top actions to keep operations healthy." variant="compact">
            {urgentActions.length > 0 ? urgentActions.map((item) => (
              <CompactInsightCard
                key={item.label}
                title={item.label}
                tone={item.tone}
                ctaLabel="Open"
                onCta={() => setSubtab(item.target)}
              />
            )) : <CompactInsightCard title="No urgent team issues" subtitle="Use this week to improve depth and scouting." tone="info" ctaLabel="Open Roster" onCta={() => setSubtab('Roster / Depth')} />}
          </SectionCard>

          <SectionCard title="Position pressure" subtitle="Where your depth chart is currently stressed." variant="compact">
            <div className="app-row-stack">
              {pressureGroups.length === 0 ? <CompactInsightCard title="No major weak spots" subtitle="Current healthy depth clears critical thresholds." tone="ok" /> : pressureGroups.map((group) => (
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

          <SectionCard title="Game context" variant="compact">
            <CtaRow actions={[
              { label: 'Open last result', compact: true, onClick: () => { const gameId = getGameId(latestGame); if (gameId != null) onOpenGameDetail?.(gameId, 'Team'); } },
              { label: 'Open next matchup', compact: true, onClick: () => { const gameId = getGameId(upcomingGame); if (gameId != null) onOpenGameDetail?.(gameId, 'Team'); } },
              { label: 'Free Agency', compact: true, onClick: () => onNavigate?.('Free Agency') },
            ]} />
          </SectionCard>
        </div>
      )}

      {subtab === 'Roster / Depth' && (
        <div className="app-screen-stack">
          <SectionCard title="Roster and depth" subtitle="Set roles and keep the lineup game-ready." variant="compact">
            <CtaRow actions={[
              { label: 'Roster table', compact: true, onClick: () => setRosterMode('roster') },
              { label: 'Depth chart', compact: true, onClick: () => setRosterMode('depth') },
              { label: 'Injured filter', compact: true, onClick: () => setSubtab('Injuries') },
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
        <div className="app-screen-stack">
          <SectionCard title="Development board" subtitle="Risers, fallers, and blocked prospects." variant="compact">
            <StatStrip items={[
              { label: 'Rising', value: `${developmentSummary.rising.length}`, tone: 'ok' },
              { label: 'Slipping', value: `${developmentSummary.slipping.length}`, tone: developmentSummary.slipping.length ? 'warning' : 'neutral' },
              { label: 'Blocked', value: `${developmentSummary.blocked.length}`, tone: developmentSummary.blocked.length ? 'warning' : 'neutral' },
              { label: 'Contract Pressure', value: `${developmentSummary.contractPressure.length}`, tone: 'info' },
            ]} />
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
