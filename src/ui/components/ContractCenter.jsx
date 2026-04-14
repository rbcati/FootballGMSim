import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import ExtensionNegotiationModal from './ExtensionNegotiationModal.jsx';
import {
  buildRetentionBoard,
  summarizeRetentionRecommendation,
} from '../../core/retention/reSigning.js';
import { summarizeNegotiationStance } from '../../core/contracts/negotiation.js';
import { derivePlayerContractFinancials } from '../utils/contractFormatting.js';
import { deriveTeamCapSnapshot } from '../utils/numberFormatting.js';

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
    'Expiring soon': board.filter((r) => r.priority.expiring),
    'Expensive contracts': board
      .filter((r) => Number(derivePlayerContractFinancials(r.player).annualSalary ?? 0) >= 18)
      .sort((a, b) => Number(derivePlayerContractFinancials(b.player).annualSalary ?? 0) - Number(derivePlayerContractFinancials(a.player).annualSalary ?? 0)),
    'Extension candidates': board.filter((r) => ['extension_candidate', 'strong_keep', 'cornerstone_priority'].includes(r.section) || ['cornerstone_priority', 'strong_keep'].includes(r.priority.recommendation)),
    'Cut / restructure candidates': board.filter((r) => ['let_walk_candidate', 'depth_low_urgency'].includes(r.section) || ['let_walk', 'move_on'].includes(r.priority.recommendation)),
  };
}

function PlayerRow({ row, onOpenTalks, onTag }) {
  const { player, priority, plan, negotiation } = row;
  const contract = derivePlayerContractFinancials(player);
  return (
    <div style={{ borderBottom: '1px solid var(--hairline)', padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{player.name} · {player.pos}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Age {player.age} · OVR {player.ovr} · {money(contract.annualSalary)} · {contract.yearsRemaining ?? 0}y left</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Recommendation</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: toneForRecommendation(priority.recommendation) }}>{prettify(priority.recommendation)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--text-subtle)' }}>
        <span>{summarizeRetentionRecommendation(priority.recommendation)}</span>
        <span>·</span>
        <span>{summarizeNegotiationStance({ negotiationStance: negotiation.negotiationStance })}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline" onClick={() => onOpenTalks(player)}>Open talks</Button>
        {priority.expiring ? <Button size="sm" variant="outline" onClick={() => onTag(player)}>Franchise tag</Button> : null}
        {plan?.risk?.summary ? <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{plan.risk.summary}</span> : null}
      </div>
    </div>
  );
}

export default function ContractCenter({ league, actions, compact = false }) {
  const [extensionPlayer, setExtensionPlayer] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  const team = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)) ?? null, [league]);
  const { board, capOutlook } = useMemo(() => buildRetentionBoard(team ?? {}, league ?? {}), [team, league]);
  const capSnapshot = useMemo(() => deriveTeamCapSnapshot(team ?? {}, { fallbackCapTotal: 255 }), [team]);
  const grouped = useMemo(() => groupRows(board), [board]);

  const recentActivity = useMemo(() => {
    return board
      .filter((r) => ['counter', 'reject'].includes(r.negotiation.tendency) || r.priority.expiring)
      .slice(0, 4)
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
    <div className="app-screen-stack" style={{ display: 'grid', gap: compact ? 'var(--space-2)' : 'var(--space-3)' }}>
      <section className="card" style={{ padding: compact ? '10px' : 'var(--space-3)' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Contract Center</h2>
        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, fontSize: 12 }}>
          <div><strong>Cap total:</strong> {money(capSnapshot.capTotal)}</div>
          <div><strong>Cap used:</strong> {money(capSnapshot.capUsed)}</div>
          <div><strong>Cap room:</strong> {money(capSnapshot.capRoom)}</div>
          <div><strong>Dead money:</strong> {money(capSnapshot.deadCap)}</div>
          <div><strong>Next year:</strong> {money(capOutlook.projectedCapRoomNextYear)}</div>
          <div><strong>Likely keeps:</strong> {capOutlook.likelyRetentionCount}</div>
        </div>
        <div style={{ marginTop: 6, color: 'var(--text-subtle)', fontSize: 12 }}>{capOutlook.summary}</div>
        {statusMessage ? <div style={{ marginTop: 4, fontSize: 11, color: 'var(--accent)' }}>{statusMessage}</div> : null}
      </section>

      {Object.entries(grouped).map(([title, rows]) => (
        <section key={title} className="card" style={{ padding: compact ? '10px' : 'var(--space-3)' }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>{title} ({rows.length})</h3>
          <div style={{ marginTop: 6 }}>
            {rows.slice(0, 10).map((row) => (
              <PlayerRow
                key={row.player.id}
                row={row}
                onOpenTalks={(player) => setExtensionPlayer(player)}
                onTag={handleTag}
              />
            ))}
            {rows.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>No players in this bucket.</div> : null}
          </div>
        </section>
      ))}

      <section className="card" style={{ padding: compact ? '10px' : 'var(--space-3)' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Recent negotiation activity</h3>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text-subtle)', fontSize: 12 }}>
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
