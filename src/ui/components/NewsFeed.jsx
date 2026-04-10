import React, { useMemo, useState, useEffect } from 'react';
import { deriveFranchisePressure } from '../utils/pressureModel.js';
import { buildTeamIntelligence } from '../utils/teamIntelligence.js';
import { buildNewsDeskModel } from '../utils/newsDesk.js';

const tickerColor = {
  high: '#f59e0b',
  medium: '#ffffff',
  low: '#94a3b8',
};

const priorityColor = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#334155',
};

function StoryCard({ item, onTeamSelect, onOpenBoxScore, onPlayerSelect }) {
  if (!item) return null;
  return (
    <div style={{ borderLeft: `4px solid ${priorityColor[item?.priority] ?? '#334155'}`, padding: '10px 12px', background: 'var(--surface)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700 }}>{item?.headline}</div>
        <span style={{ fontSize: 11, color: 'var(--text-subtle)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 6px' }}>{item?._categoryLabel}</span>
      </div>
      <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{item?.body}</div>
      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4 }}>
        Week {item?.week ?? '-'} · {item?.phase ?? 'season'}{item?._teamRelevant ? ' · Your team' : ''}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {item?.gameId ? <button className="btn" onClick={() => onOpenBoxScore?.(item.gameId)}>Box Score</button> : null}
        {item?.teamId != null ? <button className="btn" onClick={() => onTeamSelect?.(item.teamId)}>Team Profile</button> : null}
        {item?.playerId != null ? <button className="btn" onClick={() => onPlayerSelect?.(item.playerId)}>Player</button> : null}
      </div>
    </div>
  );
}

function SectionBlock({ title, stories, ...handlers }) {
  if (!stories?.length) return null;
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-subtle)' }}>{title}</h3>
      {stories.map((item, idx) => <StoryCard key={item?.id ?? `${title}-${idx}`} item={item} {...handlers} />)}
    </section>
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
    <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 12 }}>
      {pressure ? (
        <div style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 10px', background: 'var(--surface-strong)', fontSize: 12 }}>
          <strong>Local Pressure Briefing:</strong> Fans {pressure.fans.state} · Media {pressure.media.state}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          ['all', 'ALL'],
          ['team', 'TEAM'],
          ['league', 'LEAGUE'],
          ['transactions', 'TRANSACTIONS'],
        ].map(([value, label]) => (
          <button key={value} className="btn" onClick={() => setFilter(value)} style={{ opacity: filter === value ? 1 : 0.7 }}>
            {label}
          </button>
        ))}
      </div>

      {desk.featured ? (
        <section style={{ display: 'grid', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Featured Lead Story</h2>
          <StoryCard item={desk.featured} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
        </section>
      ) : <div style={{ color: 'var(--text-subtle)' }}>No news yet.</div>}

      <SectionBlock title="Top Stories" stories={desk.topStories} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
      <SectionBlock title="Your Team Desk" stories={desk.teamStories} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
      <SectionBlock title="League Wide" stories={desk.leagueStories} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
      <SectionBlock title="Transactions Wire" stories={desk.transactions} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />
      <SectionBlock title="This Week in the League" stories={desk.recap} onTeamSelect={onTeamSelect} onOpenBoxScore={onOpenBoxScore} onPlayerSelect={onPlayerSelect} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => onNavigate?.('Team')}>Team</button>
        <button className="btn" onClick={() => onNavigate?.('League')}>League</button>
        <button className="btn" onClick={() => onNavigate?.('Schedule')}>Schedule</button>
        <button className="btn" onClick={() => onNavigate?.('Contract Center')}>Contracts</button>
        <button className="btn" onClick={() => onNavigate?.('💰 Cap')}>Cap</button>
      </div>
    </div>
  );
}
