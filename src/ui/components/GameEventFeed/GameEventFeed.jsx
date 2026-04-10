import React from 'react';
import { getEventTags } from '../../utils/liveGamePresentation.js';

export default function GameEventFeed({ events = [], activeIndex = 0 }) {
  const visible = events.slice(Math.max(0, activeIndex - 20), activeIndex + 1);
  return (
    <div className="live-feed">
      {visible.map((event, idx) => {
        const tags = getEventTags(event);
        return (
          <article key={event.id || idx} className={`feed-row ${idx === visible.length - 1 ? 'latest' : ''}`}>
            <div className="feed-time">Q{event.quarter} {event.clock}</div>
            <div className="feed-body">
              <div className="feed-headline">{event.headline}</div>
              <div className="feed-meta">
                <span>{event.score ? `${event.score.away}-${event.score.home}` : ''}</span>
                {tags.map((tag) => <span key={tag} className="feed-tag">{tag}</span>)}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
