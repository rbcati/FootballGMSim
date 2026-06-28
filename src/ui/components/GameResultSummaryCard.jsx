/**
 * GameResultSummaryCard.jsx — Canonical final-result summary card
 *
 * Single shared presentation of a completed game's final score, used in exactly
 * two surfaces of the weekly mobile loop:
 *   - variant="full"    → the postgame result overlay (PostGameSummary)
 *   - variant="compact" → the Franchise HQ "last result" entry point
 *
 * Purely presentational. It renders an already-resolved score and never
 * recomputes a game outcome, standings, or any save data. Callers pass the raw
 * home/away scores + which side is the user; the card only derives display
 * framing (who won, which score to dim, the W/L/T badge).
 *
 * The review call-to-action is standardized to a single label — "View Game
 * Book" — so postgame and HQ surfaces stay consistent.
 */
import React from 'react';

export const VIEW_GAME_BOOK_LABEL = 'View Game Book';

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Deterministic team accent used for the full-variant crests/scores. Mirrors the
// palette the postgame overlay used before extraction so the look is unchanged.
function teamColor(abbr = '') {
  const palette = [
    '#0A84FF', '#34C759', '#FF9F0A', '#FF453A', '#5E5CE6',
    '#64D2FF', '#FFD60A', '#30D158', '#FF6961', '#AEC6CF',
    '#FF6B35', '#B4A0E5',
  ];
  let h = 0;
  for (let i = 0; i < abbr.length; i++) h = abbr.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

/**
 * Derive the display framing for a final result from raw scores. Pure: returns
 * only presentation hints, never mutates inputs or touches game/save state.
 */
export function resolveResultFraming({ homeScore, awayScore, userIsHome }) {
  const home = safeNum(homeScore);
  const away = safeNum(awayScore);
  const tied = home === away;
  const homeWon = home > away;
  const userWon = !tied && (userIsHome ? homeWon : !homeWon);
  const userLost = !tied && !userWon;
  return {
    tied,
    homeWon,
    userWon,
    userLost,
    userScore: userIsHome ? home : away,
    oppScore: userIsHome ? away : home,
    badge: tied ? 'T' : userWon ? 'W' : 'L',
    tone: tied ? 'info' : userWon ? 'ok' : 'danger',
  };
}

function FullVariant({ homeAbbr, awayAbbr, homeName, awayName, homeScore, awayScore, testId }) {
  const home = safeNum(homeScore);
  const away = safeNum(awayScore);
  const homeWon = home > away;
  const tied = home === away;
  const hColor = teamColor(homeAbbr);
  const aColor = teamColor(awayAbbr);

  return (
    <div
      data-testid={testId}
      data-variant="full"
      style={{
        background: 'var(--surface)',
        border: '1.5px solid var(--hairline)',
        borderRadius: 16,
        padding: '20px 24px',
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Away */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', margin: '0 auto 8px',
            background: `${aColor}20`, border: `2.5px solid ${aColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 13, color: aColor,
          }}>
            {String(awayAbbr ?? 'AWY').slice(0, 3)}
          </div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3 }}>
            {awayName ?? awayAbbr}
          </div>
          <div style={{
            fontSize: '2.6rem', fontWeight: 900,
            color: !homeWon && !tied ? aColor : 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          }}>
            {away}
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '0 10px' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-subtle)', letterSpacing: '1px', textTransform: 'uppercase' }}>
            FINAL
          </div>
        </div>

        {/* Home */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', margin: '0 auto 8px',
            background: `${hColor}20`, border: `2.5px solid ${hColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 13, color: hColor,
          }}>
            {String(homeAbbr ?? 'HOM').slice(0, 3)}
          </div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3 }}>
            {homeName ?? homeAbbr}
          </div>
          <div style={{
            fontSize: '2.6rem', fontWeight: 900,
            color: homeWon ? hColor : 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          }}>
            {home}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactVariant({
  homeAbbr, awayAbbr, homeScore, awayScore, userIsHome, week,
  onViewGameBook, gameBookLabel, testId, ctaTestId,
}) {
  const framing = resolveResultFraming({ homeScore, awayScore, userIsHome });
  const oppAbbr = userIsHome ? (awayAbbr ?? 'OPP') : (homeAbbr ?? 'OPP');
  const weekNum = safeNum(week, 0);
  const text = `${framing.userScore}–${framing.oppScore} vs ${oppAbbr}${weekNum ? ` · Wk${weekNum}` : ''}`;
  const interactive = typeof onViewGameBook === 'function';
  const label = gameBookLabel ?? VIEW_GAME_BOOK_LABEL;

  return (
    <button
      type="button"
      className="hq-status-row hq-status-row--result"
      data-testid={testId}
      data-tone={framing.tone}
      data-variant="compact"
      disabled={!interactive}
      aria-label={`Last result: ${text}. ${label}.`}
      onClick={interactive ? onViewGameBook : undefined}
    >
      <span className={`hq-wl-badge hq-wl-badge--${framing.tone}`}>{framing.badge}</span>
      <span className="hq-status-row__text">{text}</span>
      <span className="hq-status-row__cta" data-testid={ctaTestId}>{label} ›</span>
    </button>
  );
}

export default function GameResultSummaryCard({
  variant = 'compact',
  gameBookLabel = VIEW_GAME_BOOK_LABEL,
  ...props
}) {
  if (variant === 'full') {
    return <FullVariant {...props} />;
  }
  return <CompactVariant gameBookLabel={gameBookLabel} {...props} />;
}
