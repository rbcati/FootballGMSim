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

function finiteScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function GameEventFeed({ events = [], activeIndex = 0 }) {
  const visible = events.slice(Math.max(0, activeIndex - 20), activeIndex + 1);
  let previousQuarter = null;
  let previousPossession = null;
  return (
    <div className="live-feed" role="log" aria-label="Play-by-play, newest play last">
      {visible.map((event, idx) => {
        const tags = getEventTags(event);
        const isLatest = idx === visible.length - 1;
        // Score chips only render when the event carries a trustworthy score
        // (today: the game_end marker stamped with the canonical final).
        // Per-play narration scores are untrusted and arrive as null — see
        // buildLiveGameEvent for the authority note.
        const scoreHome = finiteScore(event.score?.home);
        const scoreAway = finiteScore(event.score?.away);
        const scoreText = scoreHome != null && scoreAway != null ? `${scoreAway}–${scoreHome}` : '';
        const isMajor = ['touchdown', 'field_goal', 'turnover', 'sack', 'explosive_play', 'game_end', 'turning_point', 'overtime_start'].includes(event.eventType);
        // Canonical events carry `periodLabel` ("Drive 8" / "OT") and a null
        // quarter; legacy narration events carry a numeric quarter. Prefer the
        // honest period label, falling back to Q{n} only for legacy events.
        const periodText = event.periodLabel
          ?? (event.quarter != null ? `Q${event.quarter}` : null);
        const showQuarterMarker = event.quarter != null
          && previousQuarter !== null && previousQuarter !== event.quarter;
        const showPossessionDivider = !showQuarterMarker
          && previousPossession !== null
          && event.possessionTeamId != null
          && previousPossession !== event.possessionTeamId
          && !['halftime', 'quarter_end', 'game_end', 'overtime_start'].includes(event.eventType);
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
              {/* Period + event-sequence indicator. No per-play clock exists, and
                  the sim owns no chronological quarter, so this shows the honest
                  period label ("Drive 8" / "OT") or a legacy Q{n}. */}
              <div className="feed-time">
                {periodText || `#${event.sequence ?? ''}`}
                {periodText && event.sequence != null ? <span className="feed-clock">#{event.sequence}</span> : null}
              </div>
              <div className="feed-body">
                <div className="feed-headline">{event.headline}</div>
                {(scoreText || tags.length > 0) ? (
                  <div className="feed-meta">
                    {scoreText ? <span className="feed-score">FINAL {scoreText}</span> : null}
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
