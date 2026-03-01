import React, { useState, useEffect } from 'react';
import { News, configureActiveLeague } from '../../db/index.js'; // Direct DB access for read-only view

function NewsItem({ item }) {
    const date = new Date(item.timestamp).toLocaleDateString();
    let icon = '📰';
    let color = 'var(--text-muted)';

    if (item.type === 'INJURY') { icon = '🚑'; color = 'var(--danger)'; }
    else if (item.type === 'TRANSACTION') { icon = '✍️'; color = 'var(--success)'; }
    else if (item.type === 'GAME') { icon = '🏈'; color = 'var(--accent)'; }
    else if (item.type === 'AWARD') { icon = '🏆'; color = 'var(--warning)'; }

    return (
        <div style={{
            display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-2) 0',
            borderBottom: '1px solid var(--hairline)', fontSize: 'var(--text-sm)'
        }}>
            <span style={{ fontSize: '1.2em' }}>{icon}</span>
            <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text)' }}>{item.text}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
                    Week {item.week}, {item.year}
                </div>
            </div>
        </div>
    );
}

export default function NewsFeed({ league }) {
    const [news, setNews] = useState([]);

    useEffect(() => {
        // Direct DB read for simplicity since news is high-volume/low-criticality
        // In a stricter arch, we'd ask the worker via GET_RECENT_NEWS
        if (league?.id) {
            configureActiveLeague(league.id);
            News.getRecent(10).then(setNews).catch(console.error);
        }
    }, []);

    return (
        <div className="card" style={{ padding: 'var(--space-4)', maxHeight: 300, overflowY: 'auto' }}>
            <h3 style={{
                fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 'var(--space-3)',
                position: 'sticky', top: 0, background: 'var(--surface)', paddingBottom: 8
            }}>
                League News
            </h3>
            {news.length === 0 ? (
                <div style={{ color: 'var(--text-subtle)', fontStyle: 'italic', textAlign: 'center' }}>
                    No recent news.
                </div>
            ) : (
                news.map((item, i) => <NewsItem key={i} item={item} />)
            )}
        </div>
    );
}
