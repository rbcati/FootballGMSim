import React, { useEffect, useState } from 'react';

// Reusing the TeamLogo logic from other components for consistency
function TeamLogo({ abbr, size = 64 }) {
  const palette = [
    '#0A84FF', '#34C759', '#FF9F0A', '#FF453A',
    '#5E5CE6', '#64D2FF', '#FFD60A', '#30D158',
    '#FF6961', '#AEC6CF', '#FF6B35', '#B4A0E5',
  ];
  let hash = 0;
  for (let i = 0; i < (abbr || '').length; i++) hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  const color = palette[Math.abs(hash) % palette.length];

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `${color}22`,
      border: `4px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, fontSize: size * 0.35,
      color: color,
      flexShrink: 0, letterSpacing: '-1px',
      boxShadow: `0 0 20px ${color}44`
    }}>
      {abbr?.slice(0, 3) ?? '?'}
    </div>
  );
}

export default function GameResultOverlay({ game, onClose, userTeamId }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setVisible(true));
  }, []);

  if (!game) return null;

  const { homeId, awayId, homeScore, awayScore, homeAbbr, awayAbbr, homeName, awayName } = game;

  const isHome = homeId === userTeamId;
  const userScore = isHome ? homeScore : awayScore;
  const oppScore = isHome ? awayScore : homeScore;
  const userWon = userScore > oppScore;
  const isTie = userScore === oppScore;

  const title = isTie ? 'DRAW' : (userWon ? 'VICTORY' : 'DEFEAT');
  const titleColor = isTie ? 'var(--text-muted)' : (userWon ? '#FFD700' : '#FF453A');

  return (
    <div className="game-result-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease'
    }}>
      <div className="overlay-content" style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--hairline-strong)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-8)',
        textAlign: 'center',
        maxWidth: 500, width: '90%',
        transform: visible ? 'scale(1)' : 'scale(0.9)',
        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        boxShadow: `0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px var(--hairline)`,
        position: 'relative', overflow: 'hidden'
      }}>

        {/* Glow effect based on result */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 6,
          background: isTie ? 'var(--text-muted)' : (userWon ? 'linear-gradient(90deg, #FFD700, #FFA500)' : 'var(--danger)'),
          boxShadow: `0 0 20px ${isTie ? 'rgba(255,255,255,0.2)' : (userWon ? 'rgba(255,215,0,0.6)' : 'rgba(255,69,58,0.6)')}`
        }} />

        <h1 style={{
          fontSize: '3.5rem', fontWeight: 900, margin: '0 0 var(--space-6)',
          color: titleColor, letterSpacing: '4px',
          textShadow: `0 0 30px ${isTie ? 'rgba(255,255,255,0.1)' : (userWon ? 'rgba(255,215,0,0.4)' : 'rgba(255,69,58,0.4)')}`,
          fontFamily: 'var(--font-heading, sans-serif)'
        }}>
          {title}
        </h1>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-6)',
          marginBottom: 'var(--space-8)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
            <TeamLogo abbr={awayAbbr} size={80} />
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{awayScore}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{awayName}</span>
          </div>

          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 300, color: 'var(--text-subtle)' }}>-</div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
            <TeamLogo abbr={homeAbbr} size={80} />
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{homeScore}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{homeName}</span>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={onClose}
          style={{
            fontSize: 'var(--text-lg)', padding: 'var(--space-3) var(--space-8)',
            minWidth: 200, fontWeight: 700
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
