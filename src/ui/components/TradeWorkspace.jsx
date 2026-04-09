import React, { useEffect, useMemo, useState } from 'react';
import TradeFinder from './TradeFinder.jsx';
import TradeCenter from './TradeCenter.jsx';
import TradeBlockPanel from './TradeBlockPanel.jsx';
import { computeTeamNeedsSummary } from '../utils/marketSignals.js';
import { mergeTradeWorkspaceState } from '../utils/tradeWorkspaceState.js';
import { buildTeamIntelligence } from '../utils/teamIntelligence.js';
import { ScreenHeader, SectionCard, StickySubnav } from './ScreenSystem.jsx';
import { getStickyTopOffset } from '../utils/screenSystem.js';
import { Badge } from '@/components/ui/badge';
import { buildIncomingOfferPresentation } from '../utils/tradeOfferPresentation.js';

const VIEWS = ['Block', 'Finder', 'Builder', 'Offers', 'Summary'];

export default function TradeWorkspace({ league, actions, onPlayerSelect, initialView = 'Finder' }) {
  const normalizedInitialView = typeof initialView === 'string' && initialView.includes(':')
    ? (initialView.split(':')[1] || 'Finder')
    : initialView;
  const safeInitialView = VIEWS.includes(normalizedInitialView) ? normalizedInitialView : 'Finder';
  const [view, setView] = useState(safeInitialView);
  const [workspace, setWorkspace] = useState({
    partnerTeamId: null,
    outgoingPlayerIds: [],
    outgoingPickIds: [],
    incomingPlayerIds: [],
    helperReason: '',
    helperContext: null,
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
  const incomingOffers = Array.isArray(league?.incomingTradeOffers) ? league.incomingTradeOffers : [];
  const offerSummaries = useMemo(
    () => incomingOffers.map((offer) => ({ offer, summary: buildIncomingOfferPresentation({ offer, league, userTeamId: league?.userTeamId }) })),
    [incomingOffers, league],
  );

  useEffect(() => {
    if (!safeInitialView) return;
    setView(safeInitialView);
  }, [safeInitialView]);

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
      <SectionCard title="Main trade path" subtitle="Fast workflow for every negotiation.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 'var(--text-xs)' }}>
          <Badge variant={view === 'Finder' ? 'default' : 'outline'}>1) Identify partner</Badge>
          <Badge variant={view === 'Builder' ? 'default' : 'outline'}>2) Compare assets</Badge>
          <Badge variant={view === 'Builder' ? 'default' : 'outline'}>3) Propose package</Badge>
          <Badge variant={view === 'Offers' ? 'default' : 'outline'}>4) Review response</Badge>
        </div>
      </SectionCard>

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

      {view === 'Offers' && (
        <SectionCard title="Incoming Offers" subtitle="Review active trade calls and jump into Builder fast.">
          {!incomingOffers.length ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', display: 'grid', gap: 6 }}>
              <div>No offers right now. Open Finder to target a partner team, then request a counter package.</div>
              <div style={{ fontSize: 'var(--text-xs)' }}>
                Next step: start in <strong>Finder</strong>, shortlist 2-3 partners, then move to <strong>Builder</strong> when one responds.
              </div>
              <button className="btn" style={{ width: 'fit-content' }} onClick={() => setView('Finder')}>Go to Finder</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {offerSummaries.slice(0, 8).map(({ offer, summary }, idx) => (
                <div key={offer?.id ?? idx} className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 700 }}>Offer from {offer?.offeringTeamAbbr ?? offer?.offeringTeamName ?? `Team ${offer?.offeringTeamId ?? '—'}`}</div>
                    <Badge variant={offer?.urgency === 'high' ? 'destructive' : 'outline'}>{offer?.urgency ?? 'standard'}</Badge>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Week {offer?.week ?? league?.week ?? 1} · Expires after week {offer?.expiresAfterWeek ?? '—'}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)' }}>
                    <strong>You receive:</strong> {[...summary.receive.players, ...summary.receive.picks].slice(0, 3).map((item) => item.label).join(', ') || 'No assets listed'}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)' }}>
                    <strong>You send:</strong> {[...summary.give.players, ...summary.give.picks].slice(0, 3).map((item) => item.label).join(', ') || 'No assets listed'}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {offer?.reason || summary?.recommendation || 'No scouting reason provided.'}
                  </div>
                  <button className="btn" style={{ marginTop: 2 }} onClick={() => setView('Builder')}>Open Builder</button>
                </div>
              ))}
            </div>
          )}
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
