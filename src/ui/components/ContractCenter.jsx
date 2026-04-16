import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import ExtensionNegotiationModal from './ExtensionNegotiationModal.jsx';
import FaceAvatar from './FaceAvatar.jsx';
import { TeamWorkspaceHeader, TeamCapSummaryStrip, ContractStatusChip } from './TeamWorkspacePrimitives.jsx';
import {
  buildRetentionBoard,
  summarizeRetentionRecommendation,
} from '../../core/retention/reSigning.js';
import { summarizeNegotiationStance } from '../../core/contracts/negotiation.js';
import { derivePlayerContractFinancials } from '../utils/contractFormatting.js';
import { deriveTeamCapSnapshot } from '../utils/numberFormatting.js';
import { evaluateResignRecommendation } from '../utils/contractInsights.js';

const PREMIUM_POSITIONS = new Set(['QB', 'LT', 'EDGE', 'CB']);
const SORT_PRESETS = [
  { id: 'priority', label: 'Highest priority' },
  { id: 'young_core', label: 'Youngest core piece' },
  { id: 'cheap_keep', label: 'Cheapest to keep' },
  { id: 'expensive', label: 'Most expensive' },
  { id: 'replaceability', label: 'Hardest to replace' },
  { id: 'premium_pos', label: 'Premium position first' },
];

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toFixed(1)}M`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toneForRecommendation(key) {
  if (['cornerstone_priority', 'strong_keep', 'extension_candidate'].includes(key)) return 'ok';
  if (['keep_if_price_is_right', 'franchise_tag_candidate'].includes(key)) return 'warning';
  return 'danger';
}

function prettify(v = '') {
  return String(v).replace(/_/g, ' ');
}

function groupRows(board = []) {
  return {
    'Expiring now': board.filter((r) => r.priority.expiring),
    'High cap hits': board
      .filter((r) => Number(derivePlayerContractFinancials(r.player).annualSalary ?? 0) >= 18)
      .sort((a, b) => Number(derivePlayerContractFinancials(b.player).annualSalary ?? 0) - Number(derivePlayerContractFinancials(a.player).annualSalary ?? 0)),
    'Extension candidates': board.filter((r) => ['extension_candidate', 'strong_keep', 'cornerstone_priority'].includes(r.section) || ['cornerstone_priority', 'strong_keep'].includes(r.priority.recommendation)),
    'Move on / restructure': board.filter((r) => ['let_walk_candidate', 'depth_low_urgency'].includes(r.section) || ['let_walk', 'move_on'].includes(r.priority.recommendation)),
  };
}

function estimateDemand(player) {
  const baseAnnual = toNumber(
    player?.extensionAsk?.baseAnnual,
    Math.max(
      toNumber(player?.contract?.baseAnnual, 2) * 1.15,
      (toNumber(player?.ovr, 68) - 58) * 0.38 + (PREMIUM_POSITIONS.has(String(player?.pos ?? '').toUpperCase()) ? 3 : 0),
    ),
  );
  const yearsTotal = toNumber(player?.extensionAsk?.yearsTotal ?? player?.extensionAsk?.years, player?.age <= 27 ? 4 : 3);
  const signingBonus = toNumber(player?.extensionAsk?.signingBonus, Math.max(1, baseAnnual * 0.35));
  return {
    baseAnnual: Math.max(1, Math.round(baseAnnual * 10) / 10),
    yearsTotal: Math.max(1, Math.round(yearsTotal)),
    signingBonus: Math.round(signingBonus * 10) / 10,
    guaranteedPct: Math.min(0.95, Math.max(0.45, toNumber(player?.extensionAsk?.guaranteedPct, 0.55))),
  };
}

function decisionLabel(decision) {
  if (decision === 'extended') return 'Extended';
  if (decision === 'let_walk') return 'Let Walk';
  if (decision === 'deferred') return 'Decide Later';
  if (decision === 'tagged') return 'Tagged';
  return 'Pending';
}

function isKeyPlayer(player) {
  const pos = String(player?.pos ?? '').toUpperCase();
  return PREMIUM_POSITIONS.has(pos) || toNumber(player?.ovr, 0) >= 82;
}

function replacementHint(player, roster) {
  const pos = String(player?.pos ?? '').toUpperCase();
  const samePos = (roster ?? []).filter((p) => String(p?.pos ?? '').toUpperCase() === pos).length;
  if (isKeyPlayer(player) && samePos <= 2) return 'Hard to replace';
  if (samePos <= 3) return 'Thin depth';
  return 'Replaceable';
}

function starterHint(player) {
  if (player?.depthOrder === 1) return 'Starter';
  if (player?.depthOrder === 2) return 'Rotation';
  return 'Depth';
}

function PlayerRow({ row, onOpenTalks, onTag }) {
  const { player, priority, plan, negotiation } = row;
  const contract = derivePlayerContractFinancials(player);
  const yearsLeft = Number(contract.yearsRemaining ?? 0);
  const salary = Number(contract.annualSalary ?? 0);

  return (
    <div style={{ borderBottom: '1px solid var(--hairline)', padding: '10px 0', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaceAvatar face={player?.face} seed={player?.id ?? player?.name} size={28} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{player.name} · {player.pos}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Age {player.age} · OVR {player.ovr} · {money(contract.annualSalary)} · {yearsLeft}y left</div>
          </div>
        </div>
        <ContractStatusChip label={prettify(priority.recommendation)} tone={toneForRecommendation(priority.recommendation)} />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {priority.expiring ? <ContractStatusChip label="Expiring soon" tone="warning" /> : null}
        {salary >= 18 ? <ContractStatusChip label="Expensive" tone="danger" /> : <ContractStatusChip label="Affordable" tone="ok" />}
        {['cornerstone_priority', 'strong_keep', 'extension_candidate'].includes(priority.recommendation) ? <ContractStatusChip label="Extension candidate" tone="ok" /> : null}
        {['let_walk', 'move_on'].includes(priority.recommendation) ? <ContractStatusChip label="Cut candidate" tone="danger" /> : null}
        {Number(plan?.risk?.deadCapImpact ?? 0) > 0 ? <ContractStatusChip label={`Dead cap risk ${money(plan.risk.deadCapImpact)}`} tone="warning" /> : null}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--text-subtle)' }}>
        <span>{summarizeRetentionRecommendation(priority.recommendation)}</span>
        <span>·</span>
        <span>{summarizeNegotiationStance({ negotiationStance: negotiation.negotiationStance })}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline" onClick={() => onOpenTalks(player)}>Open extension talks</Button>
        {priority.expiring ? <Button size="sm" variant="outline" onClick={() => onTag(player)}>Use franchise tag</Button> : null}
        {plan?.risk?.summary ? <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{plan.risk.summary}</span> : null}
      </div>
    </div>
  );
}

function ReSigningCenter({ league, team, actions, onNavigate, setStatusMessage }) {
  const [sortPreset, setSortPreset] = useState('priority');
  const [previewPlayerId, setPreviewPlayerId] = useState(null);
  const [busyPlayerId, setBusyPlayerId] = useState(null);

  const capSnapshot = useMemo(() => deriveTeamCapSnapshot(team ?? {}, { fallbackCapTotal: 255 }), [team]);
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const expiringPlayers = useMemo(() => roster.filter((p) => toNumber(p?.contract?.years, 0) <= 1), [roster]);

  const rows = useMemo(() => {
    return expiringPlayers.map((player) => {
      const demand = estimateDemand(player);
      const currentCapHit = toNumber(player?.contract?.baseAnnual, 0) + (toNumber(player?.contract?.signingBonus, 0) / Math.max(1, toNumber(player?.contract?.yearsTotal, toNumber(player?.contract?.years, 1))));
      const projectedCapHit = demand.baseAnnual + (demand.signingBonus / Math.max(1, demand.yearsTotal));
      const rec = evaluateResignRecommendation(player, { team, roster });
      const decision = String(player?.extensionDecision ?? 'pending');
      const premium = PREMIUM_POSITIONS.has(String(player?.pos ?? '').toUpperCase());
      const unresolved = !['extended', 'let_walk', 'tagged'].includes(decision);
      return {
        player,
        demand,
        decision,
        decisionLabel: decisionLabel(decision),
        currentCapHit,
        projectedCapHit,
        rec,
        premium,
        unresolved,
        starter: starterHint(player),
        replaceability: replacementHint(player, roster),
        sortPriorityScore: (isKeyPlayer(player) ? 150 : 0) + (rec.tier === 'priority_resign' ? 80 : rec.tier === 'resign_if_price' ? 40 : 0) + (unresolved ? 20 : -15) + toNumber(player?.ovr, 60),
      };
    });
  }, [expiringPlayers, roster, team]);

  const sortedRows = useMemo(() => {
    const clone = [...rows];
    const byReplaceability = (row) => row.replaceability === 'Hard to replace' ? 3 : row.replaceability === 'Thin depth' ? 2 : 1;
    clone.sort((a, b) => {
      if (sortPreset === 'young_core') return (a.player.age - b.player.age) || (b.player.ovr - a.player.ovr);
      if (sortPreset === 'cheap_keep') return (a.demand.baseAnnual - b.demand.baseAnnual) || (b.player.ovr - a.player.ovr);
      if (sortPreset === 'expensive') return (b.demand.baseAnnual - a.demand.baseAnnual) || (b.player.ovr - a.player.ovr);
      if (sortPreset === 'replaceability') return (byReplaceability(b) - byReplaceability(a)) || (b.player.ovr - a.player.ovr);
      if (sortPreset === 'premium_pos') return (Number(b.premium) - Number(a.premium)) || (b.player.ovr - a.player.ovr);
      return (b.sortPriorityScore - a.sortPriorityScore);
    });
    return clone;
  }, [rows, sortPreset]);

  const unresolvedKey = rows.filter((row) => row.unresolved && isKeyPlayer(row.player)).length;
  const premiumAtRisk = rows.filter((row) => row.premium && row.decision !== 'extended' && row.decision !== 'tagged').length;
  const projectedCapRoom = capSnapshot.capRoom - rows
    .filter((row) => row.decision === 'deferred')
    .reduce((sum, row) => sum + Math.max(0, row.projectedCapHit - row.currentCapHit), 0);
  const recommendedNextMove = sortedRows.find((row) => row.unresolved)
    ? `Decide ${sortedRows.find((row) => row.unresolved)?.player?.name} (${sortedRows.find((row) => row.unresolved)?.player?.pos})`
    : 'All expiring decisions are resolved.';

  const previewRow = sortedRows.find((row) => Number(row.player.id) === Number(previewPlayerId)) ?? null;

  const applyDecision = async (row, decision) => {
    if (!actions?.updatePlayerManagement || !team?.id) return;
    setBusyPlayerId(row.player.id);
    try {
      await actions.updatePlayerManagement(row.player.id, team.id, { extensionDecision: decision });
      setStatusMessage(`${row.player.name}: ${decisionLabel(decision)}.`);
    } catch (err) {
      setStatusMessage(err?.message ?? 'Unable to update contract decision.');
    } finally {
      setBusyPlayerId(null);
    }
  };

  const confirmExtension = async () => {
    if (!previewRow || !actions?.extendContract || !team?.id) return;
    setBusyPlayerId(previewRow.player.id);
    try {
      const response = await actions.extendContract(previewRow.player.id, team.id, {
        years: previewRow.demand.yearsTotal,
        yearsTotal: previewRow.demand.yearsTotal,
        baseAnnual: previewRow.demand.baseAnnual,
        signingBonus: previewRow.demand.signingBonus,
        guaranteedPct: previewRow.demand.guaranteedPct,
      });
      const status = response?.payload?.status;
      if (status === 'accepted') {
        await actions.updatePlayerManagement(previewRow.player.id, team.id, { extensionDecision: 'extended' });
        setStatusMessage(`${previewRow.player.name} extension accepted.`);
      } else if (status === 'counter') {
        setStatusMessage(`${previewRow.player.name} countered. Ask increased to ${money(response?.payload?.counter?.baseAnnual)}.`);
      } else {
        setStatusMessage(response?.payload?.reason || `${previewRow.player.name} declined extension.`);
      }
    } catch (err) {
      setStatusMessage(err?.message ?? 'Extension attempt failed.');
    } finally {
      setBusyPlayerId(null);
    }
  };

  return (
    <div className="app-screen-stack" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <TeamWorkspaceHeader
        title="Re-signing Center"
        subtitle="Lock in core players with clear cap and roster impact before free agency opens."
        eyebrow={team?.name ?? 'Contract Center'}
        metadata={[
          { label: 'Total expirings', value: rows.length },
          { label: 'Key unresolved', value: unresolvedKey },
          { label: 'Cap room', value: money(capSnapshot.capRoom) },
        ]}
        actions={[
          { label: 'Financials', onClick: () => onNavigate?.('Financials') },
          { label: 'Roster', onClick: () => onNavigate?.('Roster:EXPIRING') },
          { label: 'Free Agency', onClick: () => onNavigate?.('Free Agency') },
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total expirings</div><div style={{ fontWeight: 800 }}>{rows.length}</div></div>
        <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Unresolved key expirings</div><div style={{ fontWeight: 800, color: unresolvedKey ? 'var(--warning)' : 'var(--success)' }}>{unresolvedKey}</div></div>
        <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Projected cap room (pending)</div><div style={{ fontWeight: 800, color: projectedCapRoom < 8 ? 'var(--warning)' : 'var(--text)' }}>{money(projectedCapRoom)}</div></div>
        <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Premium positions at risk</div><div style={{ fontWeight: 800, color: premiumAtRisk ? 'var(--warning)' : 'var(--success)' }}>{premiumAtRisk}</div></div>
      </div>

      <section className="card" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12 }}><strong>Recommended next move:</strong> {recommendedNextMove}</div>
        <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Sort:
          <select value={sortPreset} onChange={(e) => setSortPreset(e.target.value)} style={{ padding: '4px 6px' }}>
            {SORT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
        </label>
      </section>

      {previewRow ? (
        <section className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 800 }}>Extension preview · {previewRow.player.name}</div>
            <div style={{ fontSize: 12, color: projectedCapRoom < 5 ? 'var(--danger)' : 'var(--text-muted)' }}>
              Cap room after signing: {money(capSnapshot.capRoom - Math.max(0, previewRow.projectedCapHit - previewRow.currentCapHit))}
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            {money(previewRow.demand.baseAnnual)} AAV · {previewRow.demand.yearsTotal} years · Total {money(previewRow.demand.baseAnnual * previewRow.demand.yearsTotal)}.
          </div>
          {capSnapshot.capRoom - Math.max(0, previewRow.projectedCapHit - previewRow.currentCapHit) < 5 ? (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--warning)' }}>Warning: this creates cap stress heading into free agency.</div>
          ) : null}
          {isKeyPlayer(previewRow.player) ? null : (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--warning)' }}>Warning: letting this player walk could create a depth hole at {previewRow.player.pos}.</div>
          )}
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <Button size="sm" disabled={busyPlayerId === previewRow.player.id} onClick={confirmExtension}>Confirm extension</Button>
            <Button size="sm" variant="outline" onClick={() => setPreviewPlayerId(null)}>Close preview</Button>
          </div>
        </section>
      ) : null}

      <section className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface)', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Player</th><th style={{ padding: 8 }}>Age</th><th style={{ padding: 8 }}>OVR</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Ask</th><th style={{ padding: 8 }}>Current hit</th><th style={{ padding: 8 }}>Projected hit</th><th style={{ padding: 8 }}>Scheme</th><th style={{ padding: 8 }}>Role</th><th style={{ padding: 8 }}>Replaceability</th><th style={{ padding: 8 }}>Decision</th><th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.player.id} style={{ borderTop: '1px solid var(--hairline)' }}>
                <td style={{ padding: 8, fontWeight: 700 }}>
                  {row.player.name} <span style={{ color: 'var(--text-muted)' }}>({row.player.pos})</span>
                  {row.premium ? <span style={{ marginLeft: 6, fontSize: 10, border: '1px solid var(--warning)', borderRadius: 10, padding: '1px 6px', color: 'var(--warning)' }}>Key</span> : null}
                </td>
                <td style={{ padding: 8 }}>{row.player.age ?? '—'}</td>
                <td style={{ padding: 8 }}>{row.player.ovr ?? '—'}</td>
                <td style={{ padding: 8 }}>{toNumber(row.player?.contract?.years, 0)}y remaining</td>
                <td style={{ padding: 8 }}>{money(row.demand.baseAnnual)}</td>
                <td style={{ padding: 8 }}>{money(row.currentCapHit)}</td>
                <td style={{ padding: 8 }}>{money(row.projectedCapHit)}</td>
                <td style={{ padding: 8 }}>{row.player.schemeFit == null ? '—' : `${Math.round(toNumber(row.player.schemeFit, 0))}%`}</td>
                <td style={{ padding: 8 }}>{row.starter}</td>
                <td style={{ padding: 8 }}>{row.replaceability}</td>
                <td style={{ padding: 8 }}>{row.decisionLabel}</td>
                <td style={{ padding: 8 }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Button size="sm" variant="outline" disabled={busyPlayerId === row.player.id} onClick={() => setPreviewPlayerId(row.player.id)}>Extend</Button>
                    <Button size="sm" variant="outline" disabled={busyPlayerId === row.player.id} onClick={() => applyDecision(row, 'let_walk')}>Let Walk</Button>
                    <Button size="sm" variant="outline" disabled={busyPlayerId === row.player.id} onClick={() => applyDecision(row, 'deferred')}>Defer</Button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 ? (
              <tr><td style={{ padding: 10, color: 'var(--text-muted)' }} colSpan={12}>No expiring players found.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default function ContractCenter({ league, actions, compact = false, onNavigate = null }) {
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
      await actions.updatePlayerManagement?.(player.id, team.id, { extensionDecision: 'tagged' });
      setStatusMessage(`Tagged ${player.name}.`);
    } catch (err) {
      setStatusMessage(err?.message || 'Special retention tool not yet available.');
    }
  };

  if (league?.phase === 'offseason_resign') {
    return <ReSigningCenter league={league} team={team} actions={actions} onNavigate={onNavigate} setStatusMessage={setStatusMessage} />;
  }

  return (
    <div className="app-screen-stack" style={{ display: 'grid', gap: compact ? 'var(--space-2)' : 'var(--space-3)' }}>
      <TeamWorkspaceHeader
        title="Contract Operations"
        subtitle="Prioritize extensions, identify inefficient deals, and protect future cap flexibility."
        eyebrow={team?.name ?? 'Contract Center'}
        metadata={[
          { label: 'Expiring', value: grouped['Expiring now']?.length ?? 0 },
          { label: 'Cap room', value: money(capSnapshot.capRoom) },
          { label: 'Next year', value: money(capOutlook.projectedCapRoomNextYear) },
        ]}
        actions={[
          { label: 'Back to Team Hub', onClick: () => onNavigate?.('Team') },
          { label: 'Roster', onClick: () => onNavigate?.('Roster') },
          { label: 'Financials', onClick: () => onNavigate?.('Financials') },
          { label: 'Free Agency', onClick: () => onNavigate?.('Free Agency') },
          { label: 'Transactions', onClick: () => onNavigate?.('Transactions') },
        ]}
        quickContext={[
          { label: `${capOutlook.likelyRetentionCount} likely keeps`, tone: 'league' },
          { label: capSnapshot.capRoom < 10 ? 'Cap pressure high' : 'Cap room workable', tone: capSnapshot.capRoom < 10 ? 'warning' : 'ok' },
        ]}
      />

      <TeamCapSummaryStrip capSnapshot={capSnapshot} rosterCount={team?.roster?.length ?? 0} expiringCount={grouped['Expiring now']?.length ?? 0} />

      <section className="card" style={{ padding: compact ? '10px' : 'var(--space-3)' }}>
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
