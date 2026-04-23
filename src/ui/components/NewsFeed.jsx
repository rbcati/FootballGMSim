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

function StoryActions({ item, onTeamSelect, onOpenBoxScore, onPlayerSelect, compact = false }) {
  return (
    <CtaRow
      actions={[
        item?.gameId ? { label: 'Open game', compact, onClick: () => onOpenBoxScore?.(item.gameId) } : null,
        item?.teamId != null ? { label: 'Open team', compact, onClick: () => onTeamSelect?.(item.teamId) } : null,
        item?.playerId != null ? { label: 'Open player', compact, onClick: () => onPlayerSelect?.(item.playerId) } : null,
      ].filter(Boolean)}
    />
  );
}

function LeadStory({ item, onTeamSelect, onOpenBoxScore, onPlayerSelect }) {
  if (!item) return null;
  return (
    <SectionCard
      title={item?.headline}
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
      <StoryActions item={item} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
    </SectionCard>
  );
}

function StoryRow({ item, onTeamSelect, onOpenBoxScore, onPlayerSelect }) {
  if (!item) return null;
  return (
    <CompactListRow
      title={item?.headline}
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
      <StoryActions item={item} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} compact />
    </CompactListRow>
  );
}

function NewsSection({ title, subtitle, stories, ...handlers }) {
  if (!stories?.length) return null;
  return (
    <SectionCard title={title} subtitle={subtitle} variant="compact">
      <div className="app-screen-stack">
        {stories.map((item, idx) => <StoryRow key={item?.id ?? `${title}-${idx}`} item={item} {...handlers} />)}
      </div>
    </SectionCard>
  );
}

export default function NewsFeed({ league, mode = 'full', segment = 'all', onTeamSelect, onOpenBoxScore, onPlayerSelect, onNavigate }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState(segment);
  const desk = useMemo(() => buildNewsDeskModel(league, { segment: filter }), [league, filter]);
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
          <LeadStory item={desk.featured} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
        </section>
      ) : <EmptyState title="No news yet." body="Stories will appear as league updates and narratives are generated." />}

      <NewsSection
        title={`News Feed (${desk.filtered.length})`}
        subtitle="Live story wire for this desk segment."
        stories={desk.filtered.slice(1, 13)}
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
          <NewsSection title="Team Desk" subtitle="Your-team relevant stories" stories={desk.teamStories.slice(0, 3)} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
          <NewsSection title="League Pulse" subtitle="Race and result context" stories={desk.recap.slice(0, 3)} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
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
