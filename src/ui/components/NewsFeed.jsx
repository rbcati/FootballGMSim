import React, { useMemo, useState, useEffect } from 'react';
import { deriveFranchisePressure } from '../utils/pressureModel.js';
import { buildTeamIntelligence } from '../utils/teamIntelligence.js';
import { buildNewsDeskModel } from '../utils/newsDesk.js';
import {
  CompactInsightCard,
  CompactListRow,
  CtaRow,
  EmptyState,
  HeroCard,
  SectionCard,
  SectionHeader,
  StatusChip,
} from './ScreenSystem.jsx';
import { HQIcon } from './HQVisuals.jsx';
import { getPlayerProfileId, hasValidPlayerProfileId, openPlayerProfile } from '../utils/playerProfileNavigation.js';

const tickerColor = {
  high: '#f59e0b',
  medium: '#ffffff',
  low: '#94a3b8',
};

const priorityTone = {
  high: 'danger',
  medium: 'warning',
  low: 'league',
};

// Every news type maps to a non-blank icon (with an accessible label).
export const NEWS_ICON = {
  injury:    { icon: '🏥', label: 'injury' },
  trade:     { icon: '🔄', label: 'trade' },
  signing:   { icon: '✍️', label: 'signing' },
  release:   { icon: '🚪', label: 'release' },
  award:     { icon: '🏆', label: 'award' },
  milestone: { icon: '⭐', label: 'milestone' },
  narrative: { icon: '📰', label: 'narrative' },
  default:   { icon: '📋', label: 'news' },
};

export function resolveNewsIcon(item) {
  const raw = String(item?.type ?? item?.category ?? '').toLowerCase();
  if (raw.includes('injury')) return NEWS_ICON.injury;
  if (raw.includes('trade')) return NEWS_ICON.trade;
  if (raw.includes('sign')) return NEWS_ICON.signing;
  if (raw.includes('release') || raw.includes('cut')) return NEWS_ICON.release;
  if (raw.includes('award') || raw.includes('mvp') || raw.includes('pro_bowl') || raw.includes('honor')) return NEWS_ICON.award;
  if (raw.includes('milestone') || raw.includes('record') || raw.includes('feat')) return NEWS_ICON.milestone;
  if (raw.includes('narrative') || raw.includes('story') || raw.includes('result') || raw.includes('recap')) return NEWS_ICON.narrative;
  return NEWS_ICON.default;
}

function NewsIcon({ item }) {
  const { icon, label } = resolveNewsIcon(item);
  return (
    <span className="app-news-icon" role="img" aria-label={label} style={{ marginRight: 6 }}>
      {icon}
    </span>
  );
}

function resolveNewsPlayer(playerOrId, league) {
  const playerId = getPlayerProfileId(playerOrId);
  if (!hasValidPlayerProfileId(playerId)) return { playerId: null, player: null, available: false };
  const id = String(playerId);
  const rosters = (league?.teams ?? []).flatMap((team) => Array.isArray(team?.roster) ? team.roster : []);
  const pools = [rosters, league?.freeAgents, league?.draftClass].filter(Array.isArray);
  const player = pools.flat().find((p) => String(p?.id ?? p?.playerId ?? p?.prospectId) === id) ?? null;
  return { playerId, player, available: Boolean(player) };
}

function resolveNewsTeam(teamOrId, league) {
  const teamId = typeof teamOrId === 'object' ? teamOrId?.id ?? teamOrId?.teamId : teamOrId;
  if (teamId == null) return { teamId: null, team: null, available: false };
  const s = String(teamId).trim();
  if (s === '' || s === 'NaN' || s === '__missing_team__' || s === 'undefined') return { teamId: null, team: null, available: false };
  const team = (league?.teams ?? []).find((t) => String(t?.id) === s) ?? null;
  return { teamId, team, available: Boolean(team) };
}

function StoryActions({ item, league, onTeamSelect, onOpenBoxScore, onPlayerSelect, compact = false }) {
  const playerRef = resolveNewsPlayer(item?.playerId ?? item?.player, league);
  const teamRef = resolveNewsTeam(item?.teamId ?? item?.team, league);
  const actions = [
    item?.gameId ? { label: 'Open game', compact, onClick: () => onOpenBoxScore?.(item.gameId) } : null,
    teamRef.teamId != null && teamRef.available ? { label: 'Open team', compact, onClick: () => onTeamSelect?.(teamRef.teamId) } : null,
    teamRef.teamId != null && !teamRef.available ? { label: 'Team unavailable', compact, disabled: true } : null,
    playerRef.playerId != null && playerRef.available ? {
      label: 'Open player',
      compact,
      onClick: () => openPlayerProfile(playerRef.playerId, onPlayerSelect, { source: 'news', item, player: playerRef.player }),
    } : null,
    playerRef.playerId != null && !playerRef.available ? { label: 'Player unavailable', compact, disabled: true } : null,
  ].filter(Boolean);
  return <CtaRow actions={actions} />;
}

function LeadStory({ item, league, onTeamSelect, onOpenBoxScore, onPlayerSelect }) {
  if (!item) return null;
  return (
    <SectionCard
      title={<><NewsIcon item={item} />{item?.headline}</>}
      subtitle={`Week ${item?.week ?? '-'} · ${item?.phase ?? 'season'}${item?._teamRelevant ? ' · Your team context' : ''}`}
      variant="info"
      actions={(
        <div className="app-news-row-chips">
          <StatusChip label={item?._teamRelevant ? 'Team' : 'League'} tone={item?._teamRelevant ? 'team' : 'league'} />
          <StatusChip label={item?._categoryLabel} tone={priorityTone[item?.priority] ?? 'league'} />
        </div>
      )}
    >
      <p className="app-news-story-body">{item?.body}</p>
      <StoryActions item={item} league={league} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
    </SectionCard>
  );
}

function StoryRow({ item, league, onTeamSelect, onOpenBoxScore, onPlayerSelect }) {
  if (!item) return null;
  return (
    <CompactListRow
      title={<><NewsIcon item={item} />{item?.headline}</>}
      subtitle={item?.body}
      meta={(
        <div className="app-news-row-meta">
          <span>W{item?.week ?? '-'} · {item?.phase ?? 'season'}{item?._teamRelevant ? ' · Team' : ''}</span>
          <div className="app-news-row-chips">
            <StatusChip label={item?._categoryLabel} tone="league" />
            <StatusChip label={item?.priority ?? 'low'} tone={priorityTone[item?.priority] ?? 'league'} />
          </div>
        </div>
      )}
    >
      <StoryActions item={item} league={league} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} compact />
    </CompactListRow>
  );
}

function NewsSection({ title, subtitle, stories, league, ...handlers }) {
  if (!stories?.length) return null;
  return (
    <SectionCard title={title} subtitle={subtitle} variant="compact">
      <div className="app-screen-stack">
        {stories.map((item, idx) => <StoryRow key={item?.id ?? `${title}-${idx}`} item={item} league={league} {...handlers} />)}
      </div>
    </SectionCard>
  );
}

export default function NewsFeed({ league, actions, mode = 'full', segment = 'all', onTeamSelect, onOpenBoxScore, onPlayerSelect, onNavigate }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState(segment);

  // News is read through the worker (the UI never touches IndexedDB directly).
  const leagueId = league?.id ?? league?.seasonId ?? league?.year ?? null;
  const [workerNews, setWorkerNews] = useState(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);

  useEffect(() => {
    if (typeof actions?.getNews !== 'function') return undefined;
    let cancelled = false;
    setNewsLoading(true);
    setNewsError(null);
    actions.getNews(10)
      .then((items) => {
        if (cancelled) return;
        setWorkerNews(Array.isArray(items) ? items : []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[NewsFeed] getNews failed:', err);
        setNewsError('Unable to load news');
      })
      .finally(() => {
        if (!cancelled) setNewsLoading(false);
      });
    return () => { cancelled = true; };
  }, [actions, leagueId, league?.week, league?.phase, league?.season, league?.newsItems?.length]);

  // Prefer worker-sourced news when available; otherwise fall back to the league
  // view-model slice already provided by the worker (keeps tests/ticker working).
  const deskLeague = useMemo(
    () => (workerNews ? { ...league, newsItems: workerNews } : league),
    [league, workerNews],
  );
  const desk = useMemo(() => buildNewsDeskModel(deskLeague, { segment: filter }), [deskLeague, filter]);
  const userTeam = league?.teams?.find((t) => t.id === league?.userTeamId) ?? null;
  const teamIntel = useMemo(() => buildTeamIntelligence(userTeam, { week: league?.week ?? 1 }), [userTeam, league?.week]);
  const pressure = useMemo(() => deriveFranchisePressure(league, { intel: teamIntel }), [league, teamIntel]);

  const latestFive = useMemo(() => desk.merged.slice(0, 5), [desk.merged]);
  const teamInjuryItems = useMemo(() => {
    const teamRoster = Array.isArray(userTeam?.roster) ? userTeam.roster : [];
    return teamRoster
      .filter((player) => Number(player?.injury?.gamesRemaining ?? player?.injuryWeeksRemaining ?? 0) > 0)
      .sort((a, b) => Number(b?.ovr ?? 0) - Number(a?.ovr ?? 0))
      .slice(0, 5);
  }, [userTeam?.roster]);

  useEffect(() => {
    if (mode !== 'ticker' || latestFive.length <= 1) return undefined;
    const timer = setInterval(() => setActiveIndex((prev) => (prev + 1) % latestFive.length), 4000);
    return () => clearInterval(timer);
  }, [mode, latestFive.length]);

  useEffect(() => {
    setFilter(segment);
  }, [segment]);

  if (mode === 'ticker') {
    if (!latestFive.length) return null;
    return (
      <div className="news-ticker" style={{ background: '#0f172a', borderBottom: '1px solid #334155', padding: '8px 16px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {latestFive.map((item, index) => (
          <span key={item?.id ?? index} style={{ display: 'inline-block', marginRight: 48, fontSize: 13, color: tickerColor[item?.priority] ?? '#fff', opacity: activeIndex === index ? 1 : 0.55 }}>
            {item?.headline}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="app-screen-stack">
      {newsError ? (
        <div
          role="alert"
          style={{ background: '#dc2626', color: '#ffffff', padding: '10px 14px', borderRadius: 8, fontWeight: 600 }}
        >
          {newsError}
        </div>
      ) : null}
      {newsLoading && !workerNews ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <span
            className="animate-spin"
            role="status"
            aria-label="Loading news"
            style={{ width: 28, height: 28, border: '3px solid #334155', borderTopColor: '#f59e0b', borderRadius: '50%', display: 'inline-block' }}
          />
        </div>
      ) : null}
      <HeroCard
        eyebrow="Weekly Intelligence"
        title="News & Injuries"
        subtitle="What matters this week before kickoff."
      >
        {pressure ? (
          <CompactInsightCard
            title="Team pressure briefing"
            subtitle={`Fans ${pressure.fans.state} · Media ${pressure.media.state}`}
            tone="warning"
          />
        ) : null}
        <div className="app-news-filter-row" role="tablist" aria-label="News segment filters">
          {[
            ['all', 'ALL'],
            ['team', 'TEAM'],
            ['league', 'LEAGUE'],
            ['pulse', 'PULSE'],
            ['transactions', 'TRANSACTIONS'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`btn btn-sm ${filter === value ? 'is-active' : ''}`}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {label}
            </button>
          ))}
        </div>
      </HeroCard>

      {desk.featured ? (
        <section className="app-screen-stack">
          <SectionHeader title="Featured Lead Story" subtitle="Highest leverage headline for this segment." />
          <LeadStory item={desk.featured} league={league} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
        </section>
      ) : <EmptyState title="No news yet." body="Stories will appear as league updates and narratives are generated." />}

      <NewsSection
        title={`News Feed (${desk.filtered.length})`}
        subtitle="Live story wire for this desk segment."
        stories={desk.filtered.slice(1, 13)}
        league={league}
        onTeamSelect={onTeamSelect}
        onOpenBoxScore={onOpenBoxScore}
        onPlayerSelect={onPlayerSelect}
      />

      <SectionCard title="Injury board" subtitle="Prioritized player availability risks for this week." variant="compact">
        <div className="app-screen-stack">
          {teamInjuryItems.length ? teamInjuryItems.map((player) => (
            <CompactListRow
              key={player.id}
              title={`${player.name} · ${player.pos}`}
              subtitle={`${player.injury?.name ?? 'Injury'} · ${player.injury?.gamesRemaining ?? player.injuryWeeksRemaining} week(s) remaining`}
              meta={<StatusChip label="Team impact" tone="warning" />}
            >
              <button type="button" className="btn btn-sm" onClick={() => onPlayerSelect?.(player.id)}>Open</button>
            </CompactListRow>
          )) : (
            <CompactInsightCard title="No active injuries" subtitle="Your current injury report is clear." tone="ok" />
          )}
        </div>
      </SectionCard>

      {filter === 'all' ? (
        <div className="app-news-aux-grid">
          <NewsSection title="Team Desk" subtitle="Your-team relevant stories" stories={desk.teamStories.slice(0, 3)} league={league} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
          <NewsSection title="League Pulse" subtitle="Race, result, and pressure context" stories={((desk.pulseStories && desk.pulseStories.length > 0) ? desk.pulseStories : (desk.recap || [])).slice(0, 3)} league={league} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
        </div>
      ) : null}

      <SectionCard variant="compact">
        <div className="app-news-cta-bar">
          <div className="app-news-cta-copy"><HQIcon name="news" size={14} /> Use filters to keep this desk focused by context.</div>
          <CtaRow
            actions={[
              { label: 'Team', compact: true, onClick: () => onNavigate?.('Team') },
              { label: 'League', compact: true, onClick: () => onNavigate?.('League') },
              { label: 'Schedule', compact: true, onClick: () => onNavigate?.('Schedule') },
            ]}
          />
        </div>
      </SectionCard>
    </div>
  );
}
