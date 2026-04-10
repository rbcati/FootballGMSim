import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import ExtensionNegotiationModal from './ExtensionNegotiationModal.jsx';
import {
  buildRetentionBoard,
  summarizeRetentionRecommendation,
} from '../../core/retention/reSigning.js';
import { summarizeNegotiationStance } from '../../core/contracts/negotiation.js';

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toFixed(1)}M`;
}

function toneForRecommendation(key) {
  if (['cornerstone_priority', 'strong_keep', 'extension_candidate'].includes(key)) return 'var(--success)';
  if (['keep_if_price_is_right', 'franchise_tag_candidate'].includes(key)) return 'var(--warning)';
  return 'var(--danger)';
}

function prettify(v = '') {
  return String(v).replace(/_/g, ' ');
}

function groupRows(board = []) {
  return {
    PriorityReSignings: board.filter((r) => ['cornerstone_priority', 'strong_keep'].includes(r.priority.recommendation) && r.priority.expiring),
    ExtensionCandidates: board.filter((r) => r.section === 'extension_candidate'),
    ExpiringStarters: board.filter((r) => r.priority.expiring && (r.player?.ovr ?? 0) >= 75),
    LetWalkCandidates: board.filter((r) => r.section === 'let_walk_candidate'),
    DepthLowUrgencyDeals: board.filter((r) => r.section === 'depth_low_urgency'),
  };
}

function PlayerRow({ row, onOpenTalks, onTag }) {
  const { player, priority, plan, negotiation } = row;
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10, background: 'var(--surface-strong)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800 }}>{player.name} · {player.pos}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Age {player.age} · OVR {player.ovr} · {priority.expiring ? 'Expiring' : `${priority.yearsLeft}y left`}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recommendation</div>
          <div style={{ fontWeight: 700, color: toneForRecommendation(priority.recommendation) }}>{prettify(priority.recommendation)}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', fontSize: 12 }}>
        <div><strong>Motivation:</strong> {priority.profile.headline}</div>
        <div><strong>Stance:</strong> {prettify(negotiation.negotiationStance)}</div>
        <div><strong>Team fit:</strong> {Math.round(negotiation.scoreBreakdown.schemeFit)}/100</div>
        <div><strong>Market difficulty:</strong> {priority.expectedMarketDifficulty}</div>
        <div><strong>Extension readiness:</strong> {prettify(priority.extensionReadiness)}</div>
        <div><strong>Likely ask:</strong> {money(priority.demand.baseAnnual)} / yr</div>
      </div>
      <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-subtle)' }}>
        {summarizeRetentionRecommendation(priority.recommendation)}
      </div>
      <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-subtle)' }}>
        {summarizeNegotiationStance({ negotiationStance: negotiation.negotiationStance })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline" onClick={() => onOpenTalks(player)}>Open talks</Button>
        {priority.expiring ? <Button size="sm" variant="outline" onClick={() => onTag(player)}>Franchise tag</Button> : null}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Offer closeness: {negotiation.score}/100</span>
      </div>
      {plan?.risk?.summary ? <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-muted)' }}>{plan.risk.summary}</div> : null}
    </div>
  );
}

export default function ContractCenter({ league, actions }) {
  const [extensionPlayer, setExtensionPlayer] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  const team = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)) ?? null, [league]);
  const { board, capOutlook } = useMemo(() => buildRetentionBoard(team ?? {}, league ?? {}), [team, league]);
  const grouped = useMemo(() => groupRows(board), [board]);

  const recentActivity = useMemo(() => {
    return board
      .filter((r) => ['counter', 'reject'].includes(r.negotiation.tendency) || r.priority.expiring)
      .slice(0, 6)
      .map((r) => `${r.player.name}: ${summarizeNegotiationStance({ negotiationStance: r.negotiation.negotiationStance })}`);
  }, [board]);

  const handleTag = async (player) => {
    if (!actions?.applyFranchiseTag || !team?.id) {
      setStatusMessage('Special retention tool not yet available in this build.');
      return;
    }
    try {
      await actions.applyFranchiseTag(player.id, team.id);
      setStatusMessage(`Tagged ${player.name}.`);
    } catch (err) {
      setStatusMessage(err?.message || 'Special retention tool not yet available.');
    }
  };

  return (
    <div className="app-screen-stack" style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <section className="card" style={{ padding: 'var(--space-4)' }}>
        <h2 style={{ marginTop: 0 }}>Contract Center</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, fontSize: 13 }}>
          <div><strong>Cap room now:</strong> {money(capOutlook.capRoom)}</div>
          <div><strong>Projected next year:</strong> {money(capOutlook.projectedCapRoomNextYear)}</div>
          <div><strong>Top-priority cost:</strong> {money(capOutlook.projectedPriorityCost)}</div>
          <div><strong>Likely keeps:</strong> {capOutlook.likelyRetentionCount}</div>
        </div>
        <div style={{ marginTop: 8, color: 'var(--text-subtle)', fontSize: 13 }}>{capOutlook.summary}</div>
        {statusMessage ? <div style={{ marginTop: 6, fontSize: 12, color: 'var(--accent)' }}>{statusMessage}</div> : null}
      </section>

      {Object.entries(grouped).map(([title, rows]) => (
        <section key={title} className="card" style={{ padding: 'var(--space-4)' }}>
          <h3 style={{ marginTop: 0 }}>{title.replace(/([A-Z])/g, ' $1').trim()} ({rows.length})</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.slice(0, 8).map((row) => (
              <PlayerRow
                key={row.player.id}
                row={row}
                onOpenTalks={(player) => setExtensionPlayer(player)}
                onTag={handleTag}
              />
            ))}
            {rows.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No players in this bucket.</div> : null}
          </div>
        </section>
      ))}

      <section className="card" style={{ padding: 'var(--space-4)' }}>
        <h3 style={{ marginTop: 0 }}>Offseason Retention Board</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-subtle)' }}>
          {board.slice(0, 5).map((row) => <li key={row.player.id}>{row.player.name} · {prettify(row.priority.recommendation)} · {row.priority.expectedMarketDifficulty} market</li>)}
        </ul>
      </section>

      <section className="card" style={{ padding: 'var(--space-4)' }}>
        <h3 style={{ marginTop: 0 }}>Recent Negotiation Activity</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-subtle)' }}>
          {recentActivity.map((line, idx) => <li key={`${line}-${idx}`}>{line}</li>)}
          {recentActivity.length === 0 ? <li>No active internal negotiation signals this week.</li> : null}
        </ul>
      </section>

      {extensionPlayer ? (
        <ExtensionNegotiationModal
          player={extensionPlayer}
          teamId={team?.id}
          actions={actions}
          onClose={() => setExtensionPlayer(null)}
          onComplete={() => {
            setStatusMessage(`${extensionPlayer.name} extension signed.`);
            setExtensionPlayer(null);
          }}
          statusNode={<div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Front-office read: {board.find((r) => r.player.id === extensionPlayer.id)?.plan?.recommendationSummary}</div>}
        />
      ) : null}
    </div>
  );
}
