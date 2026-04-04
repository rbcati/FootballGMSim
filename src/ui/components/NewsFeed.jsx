import React, { useMemo, useState, useEffect } from 'react';

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

export default function NewsFeed({ league, mode = 'full' }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState('all');

  const allNews = useMemo(() => (Array.isArray(league?.newsItems) ? league.newsItems : []), [league?.newsItems]);
  const userTeamId = league?.userTeamId;

  const latestFive = useMemo(() => allNews.slice(0, 5), [allNews]);

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

  const filtered = allNews.filter((item) => {
    if (filter === 'team') return item?.teamId === userTeamId;
    if (filter === 'league') return item?.teamId == null;
    if (filter === 'high') return item?.priority === 'high';
    return true;
  }).slice(0, 50);

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          ['all', 'ALL'],
          ['team', 'YOUR TEAM'],
          ['league', 'LEAGUE'],
          ['high', 'HIGH PRIORITY'],
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
            <div style={{ fontWeight: 700 }}>{item?.headline}</div>
            <div style={{ color: 'var(--text-muted)' }}>{item?.body}</div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 4 }}>Week {item?.week ?? '-'} · Season {item?.season ?? '-'}</div>
          </div>
        ))
      )}
    </div>
  );
}
