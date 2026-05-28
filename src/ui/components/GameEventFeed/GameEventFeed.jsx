import React from 'react';
import { getEventTags } from '../../utils/liveGamePresentation.js';

const TAG_CLASS = {
  TD:         'feed-tag-td',
  INT:        'feed-tag-turnover',
  FUM:        'feed-tag-turnover',
  SACK:       'feed-tag-sack',
  'BIG PLAY': 'feed-tag-bigplay',
  'RED ZONE': 'feed-tag-redzone',
  CLUTCH:     'feed-tag-clutch',
};

export default function GameEventFeed({ events = [], activeIndex = 0 }) {
  const visible = events.slice(Math.max(0, activeIndex - 20), activeIndex + 1);
  let previousQuarter = null;
  let previousPossession = null;
  return (
    <div className="live-feed">
      {visible.map((event, idx) => {
        const tags = getEventTags(event);
        const isLatest = idx === visible.length - 1;
        const scoreText = event.score ? `${event.score.away}–${event.score.home}` : '';
        const isMajor = ['touchdown', 'field_goal', 'turnover', 'sack', 'explosive_play', 'game_end', 'turning_point'].includes(event.eventType);
        const showQuarterMarker = previousQuarter !== null && previousQuarter !== event.quarter;
        const showPossessionDivider = !showQuarterMarker
          && previousPossession !== null
          && event.possessionTeamId != null
          && previousPossession !== event.possessionTeamId
          && !['halftime', 'quarter_end', 'game_end'].includes(event.eventType);
        previousQuarter = event.quarter;
        previousPossession = event.possessionTeamId ?? previousPossession;
        return (
          <React.Fragment key={event.id || idx}>
            {showQuarterMarker ? (
              <div className="feed-quarter-marker" aria-hidden="true">
                {event.eventType === 'halftime' ? 'Halftime' : `Q${event.quarter}`}
              </div>
            ) : showPossessionDivider ? (
              <div className="feed-possession-divider" aria-hidden="true" />
            ) : null}
            <article className={`feed-row${isLatest ? ' latest' : ''}${isMajor ? ' major' : ' routine'}`}>
              <div className="feed-time">Q{event.quarter} <span className="feed-clock">{event.clock}</span></div>
              <div className="feed-body">
                <div className="feed-headline">{event.headline}</div>
                {(scoreText || tags.length > 0) ? (
                  <div className="feed-meta">
                    {scoreText ? <span className="feed-score">{scoreText}</span> : null}
                    {tags.map((tag) => (
                      <span key={tag} className={`feed-tag ${TAG_CLASS[tag] || 'feed-tag-default'}`}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          </React.Fragment>
        );
      })}
    </div>
  );
}
