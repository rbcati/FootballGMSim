import React from 'react';
import { getEventTags } from '../../utils/liveGamePresentation.js';

export default function GameEventFeed({ events = [], activeIndex = 0 }) {
  const visible = events.slice(Math.max(0, activeIndex - 20), activeIndex + 1);
  let previousQuarter = null;
  return (
    <div className="live-feed">
      {visible.map((event, idx) => {
        const tags = getEventTags(event);
        const isLatest = idx === visible.length - 1;
        const scoreText = event.score ? `${event.score.away}-${event.score.home}` : '';
        const isMajor = ['touchdown', 'field_goal', 'turnover', 'sack', 'explosive_play', 'game_end', 'turning_point'].includes(event.eventType);
        const showQuarterMarker = previousQuarter !== null && previousQuarter !== event.quarter;
        previousQuarter = event.quarter;
        return (
          <React.Fragment key={event.id || idx}>
            {showQuarterMarker ? (
              <div className="feed-quarter-marker" aria-hidden="true">
                Start Q{event.quarter}
              </div>
            ) : null}
            <article className={`feed-row ${isLatest ? 'latest' : ''} ${isMajor ? 'major' : 'routine'}`}>
              <div className="feed-time">Q{event.quarter} {event.clock}</div>
              <div className="feed-body">
                <div className="feed-headline">{event.headline}</div>
                <div className="feed-meta">
                  {scoreText ? <span className="feed-score">{scoreText}</span> : null}
                  {tags.map((tag) => <span key={tag} className="feed-tag">{tag}</span>)}
                </div>
              </div>
            </article>
          </React.Fragment>
        );
      })}
    </div>
  );
}
