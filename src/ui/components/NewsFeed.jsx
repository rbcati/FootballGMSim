import React, { useMemo, useState, useEffect } from 'react';
import { buildNarrativeNewsItems } from '../utils/leagueNarratives.js';
import { deriveFranchisePressure } from '../utils/pressureModel.js';
import { buildTeamIntelligence } from '../utils/teamIntelligence.js';

const priorityColor = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#334155',
};

const tickerColor = {
  high: '#f59e0b',
  medium: '#ffffff',
  low: '#94a3b8',
};

const CATEGORY_MAP = {
  standings: 'Standings / Playoff race',
  playoff_race: 'Standings / Playoff race',
  awards_race: 'Awards race',
  injury: 'Major injuries',
  injury_fallout: 'Major injuries',
  trade_completed: 'Trades',
  trade_fallout: 'Trades',
  cpu_trade: 'Trades',
  free_agent_signed: 'Free agency',
  record_broken: 'Records',
  story_standings: 'Standings / Playoff race',
  story_playoff_race: 'Standings / Playoff race',
  story_awards_race: 'Awards race',
  story_injury_fallout: 'Major injuries',
  story_trade_fallout: 'Trades',
  story_rivalry: 'Rivalries',
  major_result: 'Major game result',
  story_major_result: 'Major game result',
  pregame: 'Game-day framing',
  story_pregame: 'Game-day framing',
  coaching_carousel: 'Coaching carousel',
  coaching_transition: 'Coaching transition',
  coaching_continuity: 'Staff continuity',
  story_coaching_carousel: 'Coaching carousel',
  story_coaching_transition: 'Coaching transition',
  story_coaching_continuity: 'Staff continuity',
  culture: 'Locker-room chemistry',
};

function categoryFor(item) {
  const key = String(item?.category ?? item?.type ?? '').toLowerCase();
  return CATEGORY_MAP[key] ?? 'League pulse';
}

function sortWeight(item, idx) {
  const priorityBase = item?.priority === 'high' ? 300 : item?.priority === 'medium' ? 180 : 80;
  const sourceBoost = item?.source === 'storyline' ? 120 : 0;
  const recency = Math.max(0, 60 - idx);
  return (item?.sortWeight ?? 0) + priorityBase + sourceBoost + recency;
}

export default function NewsFeed({ league, mode = 'full' }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState('all');

  const allNews = useMemo(() => (Array.isArray(league?.newsItems) ? league.newsItems : []), [league?.newsItems]);
  const userTeamId = league?.userTeamId;

  const mergedNews = useMemo(() => {
    const storylineNews = buildNarrativeNewsItems(league);
    const merged = [...storylineNews, ...allNews]
      .map((item, idx) => ({ ...item, _categoryLabel: categoryFor(item), _sortWeight: sortWeight(item, idx) }))
      .sort((a, b) => b._sortWeight - a._sortWeight)
      .slice(0, 70);
    return merged;
  }, [allNews, league]);
  const userTeam = league?.teams?.find((t) => t.id === userTeamId) ?? null;
  const teamIntel = useMemo(() => buildTeamIntelligence(userTeam, { week: league?.week ?? 1 }), [userTeam, league?.week]);
  const chemistry = teamIntel?.chemistry;
  const investments = teamIntel?.investments;
  const pressure = useMemo(() => deriveFranchisePressure(league, { intel: teamIntel }), [league, teamIntel]);

  const latestFive = useMemo(() => mergedNews.slice(0, 5), [mergedNews]);

  useEffect(() => {
    if (mode !== 'ticker' || latestFive.length <= 1) return undefined;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % latestFive.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [mode, latestFive.length]);

  if (mode === 'ticker') {
    if (!Array.isArray(latestFive) || latestFive.length === 0) return null;
    return (
      <div className="news-ticker" style={{ background: '#0f172a', borderBottom: '1px solid #334155', padding: '8px 16px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {latestFive.map((item, index) => (
          <span
            className="ticker-item"
            key={item?.id ?? `${item?.headline ?? 'news'}_${index}`}
            style={{
              display: 'inline-block',
              marginRight: 48,
              fontSize: 13,
              color: tickerColor[item?.priority] ?? '#ffffff',
              opacity: activeIndex === index ? 1 : 0.55,
              transition: 'opacity 0.35s ease',
            }}
          >
            {item?.headline}
          </span>
        ))}
      </div>
    );
  }

  const filtered = mergedNews.filter((item) => {
    if (filter === 'team') return item?.teamId === userTeamId;
    if (filter === 'league') return item?.teamId == null;
    if (filter === 'high') return item?.priority === 'high';
    if (filter === 'race') return /playoff|award|standing|rival/i.test(item?._categoryLabel ?? '');
    if (filter === 'moves') return /trade|agency|draft/i.test(item?._categoryLabel ?? '');
    return true;
  }).slice(0, 50);

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      {pressure && (
        <div style={{ marginBottom: 10, border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 10px', background: 'var(--surface-strong)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', marginBottom: 3 }}>LOCAL PRESSURE BRIEFING</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Fans: <strong style={{ color: 'var(--text)' }}>{pressure.fans.state}</strong> · {pressure.narrativeNotes.fan}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Media: <strong style={{ color: 'var(--text)' }}>{pressure.media.state}</strong> · {pressure.narrativeNotes.media}
          </div>
          {chemistry?.state ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Locker room: <strong style={{ color: 'var(--text)' }}>{chemistry.state}</strong> · {chemistry.reasons?.[0] ?? 'Chemistry signals are steady.'}
            </div>
          ) : null}
          {investments ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Org investment: <strong style={{ color: 'var(--text)' }}>{investments.stadiumLabel}</strong> · {investments.concessionsLabel} · Scouting {investments.scoutingRegionLabel}
            </div>
          ) : null}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          ['all', 'ALL'],
          ['high', 'MAJOR'],
          ['race', 'RACES'],
          ['moves', 'MOVES'],
          ['team', 'YOUR TEAM'],
          ['league', 'LEAGUE'],
        ].map(([value, label]) => (
          <button key={value} className="btn" onClick={() => setFilter(value)} style={{ opacity: filter === value ? 1 : 0.7 }}>
            {label}
          </button>
        ))}
      </div>
      {!Array.isArray(filtered) || filtered.length === 0 ? (
        <div style={{ color: 'var(--text-subtle)' }}>No news yet.</div>
      ) : (
        filtered.map((item, index) => (
          <div key={item?.id ?? `${item?.headline ?? 'item'}_${index}`} style={{ borderLeft: `4px solid ${priorityColor[item?.priority] ?? '#334155'}`, padding: '10px 12px', marginBottom: 10, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700 }}>{item?.headline}</div>
              <span style={{ fontSize: 11, color: 'var(--text-subtle)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 6px' }}>{item?._categoryLabel}</span>
            </div>
            <div style={{ color: 'var(--text-muted)' }}>{item?.body}</div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 4 }}>Week {item?.week ?? '-'} · Season {item?.season ?? '-'}{item?.source === 'storyline' ? ' · League storyline' : ''}</div>
          </div>
        ))
      )}
    </div>
  );
}
