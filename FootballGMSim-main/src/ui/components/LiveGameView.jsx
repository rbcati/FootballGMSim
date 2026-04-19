import React, { useMemo, useState } from 'react';
import LiveGameViewer from './LiveGameViewer.jsx';
import AnimatedField from './AnimatedField.jsx';
import { mapArchiveEventsToLiveFeed } from '../../core/liveGame/liveGameEvents.js';

function FieldPositionBar({ fieldPosition = 50, homeAbbr = 'HOME', awayAbbr = 'AWAY' }) {
  const clamped = Math.max(1, Math.min(99, Number(fieldPosition) || 50));
  return (
    <div style={{ marginBottom: 10 }} title="Shows current field position based on last play.">
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{awayAbbr} Endzone</span>
        <span>Ball: {Math.round(clamped)}</span>
        <span>{homeAbbr} Endzone</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-strong)', overflow: 'hidden' }}>
        <div style={{ width: `${clamped}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.35s ease' }} />
      </div>
    </div>
  );
}

export default function LiveGameView(props) {
  const { logs = [], homeTeam, awayTeam } = props;
  const events = useMemo(() => mapArchiveEventsToLiveFeed(logs, {
    gameId: `${homeTeam?.id || 'h'}-${awayTeam?.id || 'a'}`,
    homeTeamId: homeTeam?.id,
    awayTeamId: awayTeam?.id,
  }), [logs, homeTeam?.id, awayTeam?.id]);

  const [animationEnabled, setAnimationEnabled] = useState(true);
  const latest = events[events.length - 1] || null;
  const possession = latest?.possessionTeamId === homeTeam?.id ? 'home' : 'away';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>Live Game View</strong>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }} title="Disable if you prefer fastest simulation.">
          <input type="checkbox" checked={animationEnabled} onChange={(e) => setAnimationEnabled(e.target.checked)} />
          2D Animation
        </label>
      </div>

      <FieldPositionBar fieldPosition={latest?.fieldPosition} homeAbbr={homeTeam?.abbr} awayAbbr={awayTeam?.abbr} />

      {animationEnabled && latest ? (
        <div style={{ marginBottom: 10 }}>
          <AnimatedField
            play={{
              ballOn: latest?.fieldPosition ?? 50,
              distance: latest?.distance ?? 10,
              type: latest?.type,
              yards: latest?.yards ?? 0,
              description: latest?.headline || latest?.playText || latest?.text || '',
              isTouchdown: latest?.isTouchdown,
              isTurnover: latest?.isTurnover,
            }}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            possession={possession}
            momentum={0}
            speed={1}
          />
        </div>
      ) : null}

      <LiveGameViewer {...props} />
    </div>
  );
}
