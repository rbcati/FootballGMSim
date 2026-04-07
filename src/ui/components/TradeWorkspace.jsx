import React, { useMemo, useState } from 'react';
import TradeFinder from './TradeFinder.jsx';
import TradeCenter from './TradeCenter.jsx';
import TradeBlockPanel from './TradeBlockPanel.jsx';

const VIEWS = ['Finder', 'Builder', 'Block', 'Summary'];

export default function TradeWorkspace({ league, actions, onPlayerSelect }) {
  const [view, setView] = useState('Finder');

  const onOpenBuilder = () => setView('Builder');

  const myTeam = useMemo(
    () => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)),
    [league?.teams, league?.userTeamId],
  );

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="card" style={{ padding: 'var(--space-3)', position: 'sticky', top: 'calc(env(safe-area-inset-top) + 56px)', zIndex: 5 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Trade Center</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {VIEWS.map((v) => (
            <button key={v} className={`standings-tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
      </div>

      {view === 'Finder' && (
        <TradeFinder
          league={league}
          actions={actions}
          onPlayerSelect={onPlayerSelect}
          onOpenTradeCenter={onOpenBuilder}
        />
      )}

      {view === 'Builder' && <TradeCenter league={league} actions={actions} onPlayerSelect={onPlayerSelect} />}

      {view === 'Block' && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h3 style={{ marginTop: 0 }}>Trading Block</h3>
          <TradeBlockPanel roster={myTeam?.roster ?? []} onRemove={(playerId) => actions?.toggleTradeBlock?.(playerId, myTeam?.id)} />
        </div>
      )}

      {view === 'Summary' && (
        <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Front Office Summary</h3>
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            {myTeam?.abbr ?? 'Your team'} trade context at a glance.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            <div className="stat-box"><div className="stat-label">Record</div><div className="stat-value-large">{myTeam?.wins ?? 0}-{myTeam?.losses ?? 0}</div></div>
            <div className="stat-box"><div className="stat-label">Cap Room</div><div className="stat-value-large">${Number(myTeam?.capRoom ?? 0).toFixed(1)}M</div></div>
            <div className="stat-box"><div className="stat-label">Trade Block</div><div className="stat-value-large">{Array.isArray(myTeam?.tradeBlock) ? myTeam.tradeBlock.length : 0}</div></div>
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            Use Finder to discover partners, Builder to assemble packages, and Trading Block to market specific players.
          </p>
        </div>
      )}
    </div>
  );
}
