/**
 * PostGameSummary.jsx — Post-game summary overlay
 *
 * Shown after a simulated week completes (skip/sim-to-end modes).
 * Displays final score, W/L result, momentum change and optional injuries.
 * Accessible: focus trap, Escape to close.
 */

import React, { useEffect, useRef } from 'react';

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

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

function MomentumBadge({ change }) {
  if (change == null) return null;
  const positive = change > 0;
  const neutral = change === 0;
  const color = positive ? '#34C759' : neutral ? '#FFD60A' : '#FF453A';
  const icon = positive ? '↑' : neutral ? '→' : '↓';
  const label = positive
    ? `+${change} momentum`
    : neutral
      ? 'Neutral'
      : `${change} momentum`;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      background: `${color}20`, border: `1px solid ${color}50`,
      fontSize: '0.72rem', fontWeight: 700, color,
    }}>
      {icon} {label}
    </span>
  );
}

function InjuryItem({ player }) {
  const name = player?.name ?? `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim() ?? 'Unknown';
  const weeks = safeNum(player?.injuryWeeksRemaining ?? player?.injuredWeeks ?? player?.injury?.gamesRemaining, 0);
  const severity = weeks >= 8 ? 'IR' : weeks >= 2 ? 'OUT' : 'DTD';
  const color = severity === 'IR' ? '#FF453A' : severity === 'OUT' ? '#FF9F0A' : '#FFD60A';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
      <span style={{
        padding: '2px 7px', borderRadius: 6,
        background: `${color}20`, color, fontWeight: 800, fontSize: '0.65rem',
      }}>
        {severity}
      </span>
      <span>{name}</span>
      {weeks > 0 && <span style={{ opacity: 0.7 }}>({weeks}w)</span>}
    </div>
  );
}

export default function PostGameSummary({
  gameResult,
  leaders,
  injuries,
  momentumChange,
  onClose,
  onViewGameBook,
}) {
  const overlayRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Focus the close button on mount
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape key closes the summary
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Basic focus trap: keep Tab/Shift+Tab inside the overlay
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(el.querySelectorAll(focusable)).filter((n) => !n.disabled);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener('keydown', trap);
    return () => el.removeEventListener('keydown', trap);
  }, []);

  if (!gameResult) return null;

  const { homeScore = 0, awayScore = 0, homeTeam, awayTeam, userTeamId, week, phase } = gameResult;
  const homeId = safeNum(homeTeam?.id ?? gameResult.homeId);
  const awayId = safeNum(awayTeam?.id ?? gameResult.awayId);
  const userIsHome = homeId === safeNum(userTeamId);
  const userIsAway = awayId === safeNum(userTeamId);
  const userScore = userIsHome ? homeScore : awayScore;
  const oppScore = userIsHome ? awayScore : homeScore;
  const homeWon = homeScore > awayScore;
  const tied = homeScore === awayScore;
  const userWon = (userIsHome && homeWon) || (userIsAway && !homeWon && !tied);
  const userLost = (userIsHome && !homeWon && !tied) || (userIsAway && homeWon);

  const resultColor = userWon ? '#34C759' : userLost ? '#FF453A' : '#FFD60A';
  const resultEmoji = userWon ? '🏆' : userLost ? '😔' : '🤝';
  const resultLabel = userWon ? 'VICTORY!' : userLost ? 'DEFEAT' : 'TIE';

  const homeAbbr = homeTeam?.abbr ?? gameResult.homeAbbr ?? 'HOME';
  const awayAbbr = awayTeam?.abbr ?? gameResult.awayAbbr ?? 'AWAY';
  const hColor = teamColor(homeAbbr);
  const aColor = teamColor(awayAbbr);

  const injuryList = Array.isArray(injuries) ? injuries.filter(Boolean) : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Post-game summary"
      data-testid="post-game-summary"
      ref={overlayRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9600,
        background: 'rgba(0,0,0,0.86)',
        backdropFilter: 'blur(14px)',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px 80px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Result banner */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: 8 }}>{resultEmoji}</div>
          <div style={{
            fontSize: '1.9rem', fontWeight: 900, letterSpacing: '2px',
            color: resultColor, marginBottom: 6,
          }}>
            {resultLabel}
          </div>
          {week != null && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontWeight: 600, marginBottom: 8 }}>
              Week {week} · {phase === 'playoffs' ? 'Playoffs' : 'Regular Season'}
            </div>
          )}
          <MomentumBadge change={momentumChange} />
        </div>

        {/* Score card */}
        <div style={{
          background: 'var(--surface)',
          border: '1.5px solid var(--hairline)',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Away */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', margin: '0 auto 8px',
                background: `${aColor}20`, border: `2.5px solid ${aColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 13, color: aColor,
              }}>
                {awayAbbr.slice(0, 3)}
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3 }}>
                {awayTeam?.name ?? awayAbbr}
              </div>
              <div style={{
                fontSize: '2.6rem', fontWeight: 900,
                color: !homeWon && !tied ? aColor : 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {awayScore}
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
                {homeAbbr.slice(0, 3)}
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3 }}>
                {homeTeam?.name ?? homeAbbr}
              </div>
              <div style={{
                fontSize: '2.6rem', fontWeight: 900,
                color: homeWon ? hColor : 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {homeScore}
              </div>
            </div>
          </div>
        </div>

        {/* Game leaders */}
        {Array.isArray(leaders) && leaders.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
              Game Leaders
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leaders.map((leader, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: `${resultColor}18`, border: `1.5px solid ${resultColor}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.62rem', fontWeight: 900, color: resultColor,
                  }}>
                    {leader.pos ?? '?'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {leader.name ?? 'Unknown'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: resultColor, fontWeight: 700 }}>
                      {leader.statLine ?? ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notable injuries */}
        {injuryList.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#FF9F0A', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
              Notable Injuries
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {injuryList.slice(0, 4).map((player, i) => (
                <InjuryItem key={player?.id ?? i} player={player} />
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {onViewGameBook && (
            <button
              type="button"
              data-testid="post-game-summary-view-game-book"
              onClick={onViewGameBook}
              style={{
                width: '100%', padding: '12px',
                background: 'var(--surface)',
                color: 'var(--text)',
                border: '1.5px solid var(--hairline)',
                borderRadius: 12, fontWeight: 700, fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              View Game Book
            </button>
          )}
          <button
            type="button"
            ref={closeButtonRef}
            data-testid="post-game-summary-close"
            onClick={onClose}
            style={{
              width: '100%', padding: '14px',
              background: resultColor,
              color: resultColor === '#FFD60A' ? '#000' : '#fff',
              border: 'none', borderRadius: 12,
              fontWeight: 900, fontSize: '1rem', cursor: 'pointer',
              letterSpacing: '0.5px',
              boxShadow: `0 4px 18px ${resultColor}40`,
            }}
          >
            Return to Franchise HQ
          </button>
        </div>
      </div>
    </div>
  );
}
