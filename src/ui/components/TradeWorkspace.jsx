import React, { useMemo, useState } from 'react';
import TradeFinder from './TradeFinder.jsx';
import TradeCenter from './TradeCenter.jsx';
import TradeBlockPanel from './TradeBlockPanel.jsx';
import { computeTeamNeedsSummary } from '../utils/marketSignals.js';
import { mergeTradeWorkspaceState } from '../utils/tradeWorkspaceState.js';
import { buildTeamIntelligence } from '../utils/teamIntelligence.js';

const VIEWS = ['Finder', 'Builder', 'Block', 'Summary'];

export default function TradeWorkspace({ league, actions, onPlayerSelect, initialView = 'Finder' }) {
  const [view, setView] = useState(initialView);
  const [workspace, setWorkspace] = useState({
    partnerTeamId: null,
    outgoingPlayerIds: [],
    outgoingPickIds: [],
    incomingPlayerIds: [],
    helperReason: '',
  });

  const myTeam = useMemo(
    () => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)),
    [league?.teams, league?.userTeamId],
  );
  const partnerTeam = useMemo(
    () => (league?.teams ?? []).find((t) => Number(t.id) === Number(workspace.partnerTeamId)),
    [league?.teams, workspace.partnerTeamId],
  );
  const partnerNeeds = useMemo(() => partnerTeam ? computeTeamNeedsSummary(partnerTeam) : null, [partnerTeam]);
  const partnerIntel = useMemo(() => partnerTeam ? buildTeamIntelligence(partnerTeam, { week: league?.week ?? 1 }) : null, [partnerTeam, league?.week]);

  return (
    <div className="trade-workspace" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="card trade-workspace-nav" style={{ padding: 'var(--space-3)', position: 'sticky', top: 'calc(env(safe-area-inset-top) + 56px)', zIndex: 5 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Trade Center Workspace</div>
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
          workspace={workspace}
          onWorkspaceChange={(patch) => setWorkspace((prev) => mergeTradeWorkspaceState(prev, patch))}
          onOpenTradeCenter={() => setView('Builder')}
        />
      )}

      {view === 'Builder' && (
        <TradeCenter
          league={league}
          actions={actions}
          initialTradeContext={workspace}
          onTradeContextChange={(patch) => setWorkspace((prev) => mergeTradeWorkspaceState(prev, patch))}
        />
      )}

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
            Live trade context from Finder + Builder.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            <div className="stat-box"><div className="stat-label">Record</div><div className="stat-value-large">{myTeam?.wins ?? 0}-{myTeam?.losses ?? 0}</div></div>
            <div className="stat-box"><div className="stat-label">Cap Room</div><div className="stat-value-large">${Number(myTeam?.capRoom ?? 0).toFixed(1)}M</div></div>
            <div className="stat-box"><div className="stat-label">Working Partner</div><div className="stat-value-large">{partnerTeam?.abbr ?? '—'}</div></div>
          </div>
          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Live Package</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Sending {workspace.outgoingPlayerIds.length} player(s) + {workspace.outgoingPickIds.length} pick(s), targeting {workspace.incomingPlayerIds.length} player(s).
            </div>
            {workspace.helperReason ? <div style={{ marginTop: 6, fontSize: 'var(--text-xs)' }}>{workspace.helperReason}</div> : null}
          </div>
          {partnerTeam && (
            <div className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 700 }}>{partnerTeam.name} context</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {partnerTeam.wins ?? 0}-{partnerTeam.losses ?? 0}{partnerTeam.ties ? `-${partnerTeam.ties}` : ''} · {partnerIntel?.direction ?? 'balanced'} · cap ${Number(partnerTeam.capRoom ?? 0).toFixed(1)}M
              </div>
              <div style={{ fontSize: 'var(--text-xs)' }}>Needs now: {(partnerNeeds?.needNow?.slice(0, 3) ?? []).map((n) => n.pos).join(', ') || 'No urgent needs flagged'}.</div>
              <div style={{ fontSize: 'var(--text-xs)' }}>Future needs: {(partnerNeeds?.needSoon?.slice(0, 3) ?? []).map((n) => n.pos).join(', ') || 'No future needs flagged'}.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
