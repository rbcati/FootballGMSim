import React, { useMemo, useState } from 'react';
import TradeFinder from './TradeFinder.jsx';
import TradeCenter from './TradeCenter.jsx';
import TradeBlockPanel from './TradeBlockPanel.jsx';
import { computeTeamNeedsSummary } from '../utils/marketSignals.js';
import { mergeTradeWorkspaceState } from '../utils/tradeWorkspaceState.js';
import { buildTeamIntelligence } from '../utils/teamIntelligence.js';
import { ScreenHeader, SectionCard, StickySubnav } from './ScreenSystem.jsx';
import { getStickyTopOffset } from '../utils/screenSystem.js';

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
    <div className="trade-workspace app-screen-stack" style={{ '--screen-sticky-top': getStickyTopOffset('default') }}>
      <ScreenHeader
        title="Trade Workspace"
        subtitle="Finder, Builder, block, and summary with one shared trade context."
        metadata={[
          { label: 'Record', value: `${myTeam?.wins ?? 0}-${myTeam?.losses ?? 0}` },
          { label: 'Cap', value: `$${Number(myTeam?.capRoom ?? 0).toFixed(1)}M` },
          { label: 'Partner', value: partnerTeam?.abbr ?? 'None' },
        ]}
      />
      <StickySubnav title="Trade views">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {VIEWS.map((v) => (
            <button key={v} className={`standings-tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
      </StickySubnav>

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
        <SectionCard title="Trading Block" subtitle="Mark who you are willing to move before entering builder negotiations.">
          <TradeBlockPanel roster={myTeam?.roster ?? []} onRemove={(playerId) => actions?.toggleTradeBlock?.(playerId, myTeam?.id)} />
        </SectionCard>
      )}

      {view === 'Summary' && (
        <SectionCard title="Front Office Summary" subtitle="Live trade context from Finder + Builder.">
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Decision support for your current package and partner.
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
        </SectionCard>
      )}
    </div>
  );
}
