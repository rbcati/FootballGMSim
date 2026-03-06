/**
 * PlayerPreview.jsx
 *
 * Mini-card overlay that appears on long-press (mobile) or hover (desktop)
 * on any player name. Shows OVR, Potential, and key stats without navigating.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

function ovrColor(ovr) {
  if (ovr >= 85) return 'var(--success)';
  if (ovr >= 75) return 'var(--accent)';
  if (ovr >= 65) return 'var(--warning)';
  return 'var(--danger)';
}

/**
 * Key stats to show per position.
 * Maps position → array of { key, label } stat fields.
 */
const KEY_STATS = {
  QB:  [{ key: 'throwPower', label: 'THP' }, { key: 'throwAccuracy', label: 'THA' }, { key: 'speed', label: 'SPD' }],
  RB:  [{ key: 'speed', label: 'SPD' }, { key: 'acceleration', label: 'ACC' }, { key: 'elusiveness', label: 'ELU' }],
  WR:  [{ key: 'speed', label: 'SPD' }, { key: 'catching', label: 'CTH' }, { key: 'routeRunning', label: 'RTE' }],
  TE:  [{ key: 'catching', label: 'CTH' }, { key: 'blocking', label: 'BLK' }, { key: 'speed', label: 'SPD' }],
  OL:  [{ key: 'blocking', label: 'BLK' }, { key: 'strength', label: 'STR' }, { key: 'awareness', label: 'AWR' }],
  DL:  [{ key: 'strength', label: 'STR' }, { key: 'speed', label: 'SPD' }, { key: 'tackling', label: 'TAK' }],
  LB:  [{ key: 'tackling', label: 'TAK' }, { key: 'speed', label: 'SPD' }, { key: 'coverage', label: 'COV' }],
  CB:  [{ key: 'coverage', label: 'COV' }, { key: 'speed', label: 'SPD' }, { key: 'acceleration', label: 'ACC' }],
  S:   [{ key: 'coverage', label: 'COV' }, { key: 'tackling', label: 'TAK' }, { key: 'speed', label: 'SPD' }],
  K:   [{ key: 'kickPower', label: 'PWR' }, { key: 'kickAccuracy', label: 'ACC' }, { key: 'awareness', label: 'AWR' }],
  P:   [{ key: 'kickPower', label: 'PWR' }, { key: 'kickAccuracy', label: 'ACC' }, { key: 'awareness', label: 'AWR' }],
};

function MiniCard({ player, style }) {
  if (!player) return null;

  const col = ovrColor(player.ovr);
  const stats = KEY_STATS[player.pos] || KEY_STATS.QB;

  return (
    <div
      className="player-preview-card"
      style={{
        position: 'absolute',
        zIndex: 9999,
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-3)',
        boxShadow: 'var(--shadow-xl)',
        minWidth: 180,
        maxWidth: 220,
        pointerEvents: 'none',
        ...style,
      }}
    >
      {/* Header: name + pos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span style={{
          padding: '1px 5px', borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-strong)', fontSize: 10, fontWeight: 700,
          color: 'var(--text-muted)', fontFamily: 'monospace',
        }}>
          {player.pos}
        </span>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.name}
        </span>
      </div>

      {/* OVR + POT row */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>OVR</div>
          <div style={{
            fontSize: 'var(--text-lg)', fontWeight: 800, color: col,
            lineHeight: 1.1,
          }}>
            {player.ovr}
          </div>
        </div>
        {player.potential != null && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>POT</div>
            <div style={{
              fontSize: 'var(--text-lg)', fontWeight: 800, color: ovrColor(player.potential),
              lineHeight: 1.1,
            }}>
              {player.potential}
            </div>
          </div>
        )}
        {player.age != null && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>AGE</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>
              {player.age}
            </div>
          </div>
        )}
      </div>

      {/* Key stats */}
      <div style={{
        display: 'flex', gap: 'var(--space-2)',
        borderTop: '1px solid var(--hairline)',
        paddingTop: 'var(--space-2)',
      }}>
        {stats.map(({ key, label }) => {
          const val = player[key] ?? player.attributes?.[key] ?? '—';
          return (
            <div key={key} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text)' }}>{val}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Wrapper component that provides long-press (mobile) and hover (desktop)
 * behavior around any child element (typically a player name span).
 *
 * Usage:
 *   <PlayerPreview player={playerObj}>
 *     <span>{player.name}</span>
 *   </PlayerPreview>
 */
export default function PlayerPreview({ player, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const longPressTimer = useRef(null);
  const containerRef = useRef(null);

  const showCard = useCallback((e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // Position above the element
    setPos({
      top: -10,
      left: rect.width / 2 - 100,
    });
    setVisible(true);
  }, []);

  const hideCard = useCallback(() => {
    setVisible(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Long-press handlers for mobile
  const handleTouchStart = useCallback((e) => {
    longPressTimer.current = setTimeout(() => {
      showCard(e);
    }, 500);
  }, [showCard]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    // Hide after a delay on mobile so user can read it
    setTimeout(hideCard, 1500);
  }, [hideCard]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  return (
    <span
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={showCard}
      onMouseLeave={hideCard}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={hideCard}
    >
      {children}
      {visible && player && (
        <MiniCard
          player={player}
          style={{ bottom: '100%', left: pos.left, marginBottom: 4 }}
        />
      )}
    </span>
  );
}

export { MiniCard };
