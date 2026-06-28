/**
 * PostGameSummary.jsx — Post-game summary overlay
 *
 * Shown after a simulated week completes (skip/sim-to-end modes).
 * Displays final score, W/L result, momentum change and optional injuries.
 * Accessible: focus trap, Escape to close.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { buildPostgameEmotionalFrame } from '../utils/postgameEmotionalFrame.js';
import GameResultSummaryCard from './GameResultSummaryCard.jsx';

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
  recentResults,
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

  const emotionalFrame = useMemo(
    () => buildPostgameEmotionalFrame(gameResult, leaders, injuries, momentumChange, recentResults),
    [gameResult, leaders, injuries, momentumChange, recentResults],
  );

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

        {/* Canonical final-score card (shared with Franchise HQ) */}
        <GameResultSummaryCard
          variant="full"
          testId="post-game-summary-result-card"
          awayAbbr={awayAbbr}
          awayName={awayTeam?.name ?? awayAbbr}
          awayScore={awayScore}
          homeAbbr={homeAbbr}
          homeName={homeTeam?.name ?? homeAbbr}
          homeScore={homeScore}
        />

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

        {/* Emotional frame — biggest positive, concern, momentum */}
        {emotionalFrame && (emotionalFrame.biggestPositive || emotionalFrame.biggestConcern || emotionalFrame.momentumDirection) && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
              Week Takeaways
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {emotionalFrame.biggestPositive ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1.4, flexShrink: 0 }}>✅</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34C759' }}>{emotionalFrame.biggestPositive.label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{emotionalFrame.biggestPositive.detail}</div>
                  </div>
                </div>
              ) : null}
              {emotionalFrame.biggestConcern ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1.4, flexShrink: 0 }}>
                    {emotionalFrame.biggestConcern.tone === 'danger' ? '⚠️' : '📌'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: emotionalFrame.biggestConcern.tone === 'danger' ? '#FF453A' : emotionalFrame.biggestConcern.tone === 'warning' ? '#FF9F0A' : 'var(--text-muted)' }}>
                      {emotionalFrame.biggestConcern.label}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{emotionalFrame.biggestConcern.detail}</div>
                  </div>
                </div>
              ) : null}
              {emotionalFrame.momentumDirection ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1.4, flexShrink: 0 }}>
                    {emotionalFrame.momentumDirection.icon === '↑' ? '📈' : emotionalFrame.momentumDirection.icon === '↓' ? '📉' : '➡️'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: emotionalFrame.momentumDirection.tone === 'ok' ? '#34C759' : emotionalFrame.momentumDirection.tone === 'danger' ? '#FF453A' : 'var(--text-muted)' }}>
                      Momentum: {emotionalFrame.momentumDirection.label}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{emotionalFrame.momentumDirection.detail}</div>
                  </div>
                </div>
              ) : null}
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
