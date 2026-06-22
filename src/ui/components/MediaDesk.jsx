/**
 * MediaDesk — League Media section for Franchise HQ.
 *
 * Renders up to 8 deterministic media story cards derived from existing
 * league state. Display-only: no gameplay consequences, no mutations.
 */

import React from 'react';
import { getMediaStoryTypeLabel } from '../../core/news/mediaNarrativeEngine.js';

// ── Visual config per story type ──────────────────────────────────────────────

const TYPE_STYLE = {
  OWNER_PRESSURE: {
    accent: '#FF453A',
    bg:     'rgba(255,69,58,0.07)',
    border: 'rgba(255,69,58,0.35)',
  },
  BLOCKBUSTER_TRADE: {
    accent: '#0A84FF',
    bg:     'rgba(10,132,255,0.07)',
    border: 'rgba(10,132,255,0.3)',
  },
  MANDATE_SLIP: {
    accent: '#FF9F0A',
    bg:     'rgba(255,159,10,0.07)',
    border: 'rgba(255,159,10,0.3)',
  },
  MANDATE_SURGE: {
    accent: '#30D158',
    bg:     'rgba(48,209,88,0.07)',
    border: 'rgba(48,209,88,0.3)',
  },
  PRESTIGE_HONOR: {
    accent: '#FFD60A',
    bg:     'rgba(255,214,10,0.07)',
    border: 'rgba(255,214,10,0.3)',
  },
  WAIVER_MOVE: {
    accent: '#64D2FF',
    bg:     'rgba(100,210,255,0.07)',
    border: 'rgba(100,210,255,0.3)',
  },
  PLAYOFF_PUSH: {
    accent: '#BF5AF2',
    bg:     'rgba(191,90,242,0.07)',
    border: 'rgba(191,90,242,0.3)',
  },
  LEGACY_MILESTONE: {
    accent: '#FF375F',
    bg:     'rgba(255,55,95,0.07)',
    border: 'rgba(255,55,95,0.3)',
  },
};

const FALLBACK_STYLE = {
  accent: '#8E8E93',
  bg:     'rgba(142,142,147,0.07)',
  border: 'rgba(142,142,147,0.3)',
};

const TONE_ACCENT = {
  urgent:   '#FF453A',
  warning:  '#FF9F0A',
  positive: '#30D158',
  neutral:  '#8E8E93',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const style = TYPE_STYLE[type] ?? FALLBACK_STYLE;
  const label = getMediaStoryTypeLabel(type);
  return (
    <span
      style={{
        display:        'inline-block',
        fontSize:       '0.65rem',
        fontWeight:     700,
        letterSpacing:  '0.3px',
        textTransform:  'uppercase',
        background:     style.bg,
        color:          style.accent,
        border:         `1px solid ${style.border}`,
        borderRadius:   4,
        padding:        '1px 6px',
        whiteSpace:     'nowrap',
        flexShrink:     0,
      }}
    >
      {label}
    </span>
  );
}

function MediaStoryCard({ story, isTop }) {
  const style  = TYPE_STYLE[story.type] ?? FALLBACK_STYLE;
  const tone   = story.tone ?? 'neutral';
  const left   = story.priority >= 80 ? style.accent : (TONE_ACCENT[tone] ?? style.accent);

  return (
    <div
      data-testid="media-story-card"
      data-story-type={story.type}
      data-story-id={story.id}
      style={{
        borderLeft:   `3px solid ${left}`,
        background:   isTop ? style.bg : 'transparent',
        borderRadius: isTop ? '0 8px 8px 0' : 0,
        padding:      isTop ? '10px 12px 10px 10px' : '8px 4px 8px 10px',
        marginBottom: isTop ? 8 : 0,
      }}
    >
      {/* Meta row */}
      <div
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        6,
          marginBottom: 3,
          flexWrap:   'wrap',
        }}
      >
        <TypeBadge type={story.type} />
        {story.week ? (
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', opacity: 0.65 }}>
            Wk {story.week}
          </span>
        ) : null}
      </div>

      {/* Headline */}
      <div
        style={{
          fontWeight: isTop ? 700 : 600,
          fontSize:   isTop ? 'var(--text-sm, 0.85rem)' : 'var(--text-xs, 0.78rem)',
          lineHeight: 1.35,
          color:      'var(--text)',
        }}
      >
        {story.headline}
      </div>

      {/* Dek (top story only) */}
      {isTop && story.dek ? (
        <div
          style={{
            fontSize:   'var(--text-xs, 0.75rem)',
            color:      'var(--text-muted)',
            marginTop:  4,
            lineHeight: 1.4,
          }}
        >
          {story.dek}
        </div>
      ) : null}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {Array}    props.stories      — media story cards from league.mediaStories
 * @param {number}   [props.maxVisible] — max cards to render (default 6)
 */
export default function MediaDesk({ stories, maxVisible = 6 }) {
  const safeStories = Array.isArray(stories) ? stories : [];
  const visible     = safeStories.slice(0, maxVisible);

  return (
    <section
      data-testid="media-desk"
      aria-label="League Media Desk"
      className="card"
      style={{ padding: 'var(--space-2)', marginBottom: 12 }}
    >
      {/* Header */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   10,
        }}
      >
        <div>
          <h2
            style={{
              fontSize:        'var(--text-sm, 0.85rem)',
              fontWeight:      800,
              letterSpacing:   '0.5px',
              textTransform:   'uppercase',
              margin:          0,
            }}
          >
            League Media
          </h2>
          <p
            style={{
              fontSize: 'var(--text-xs, 0.72rem)',
              color:    'var(--text-muted)',
              margin:   '2px 0 0',
            }}
          >
            What the league is talking about
          </p>
        </div>
      </div>

      {/* Empty state */}
      {visible.length === 0 ? (
        <p
          data-testid="media-desk-empty"
          style={{
            fontSize:  'var(--text-xs, 0.78rem)',
            color:     'var(--text-muted)',
            fontStyle: 'italic',
            margin:    0,
          }}
        >
          No league media stories this week.
        </p>
      ) : (
        <>
          {/* Top story */}
          <MediaStoryCard story={visible[0]} isTop />

          {/* Secondary stories */}
          {visible.length > 1 ? (
            <div
              style={{
                borderTop:      '1px solid var(--hairline)',
                paddingTop:     8,
                display:        'flex',
                flexDirection:  'column',
                gap:            6,
              }}
            >
              {visible.slice(1).map((story) => (
                <MediaStoryCard key={story.id} story={story} isTop={false} />
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
