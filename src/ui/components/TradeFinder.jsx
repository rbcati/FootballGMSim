import React, { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { computeTeamNeedsSummary } from '../utils/marketSignals.js';
import { buildTeamIntelligence } from '../utils/teamIntelligence.js';
import { rankTradePartners, playerAssetValue, pickAssetValue, buildCounterAdjustment } from '../utils/tradeFinder.js';
import { normalizeManagement, CONTRACT_PLAN_LABELS, TRADE_STATUS_LABELS } from '../utils/playerManagement.js';

function money(v) { return `$${Number(v ?? 0).toFixed(1)}M`; }

const prefLabel = {
  starter_now: 'Prefers starter-now package',
  pick_or_youth: 'Prefers pick/youth value',
  future_control: 'Prefers future-control assets',
  balanced_package: 'Prefers balanced package',
};

function PlayerAssetRow({ p, selected, onToggle }) {
  const mgmt = normalizeManagement(p);
  return (
    <button onClick={onToggle} style={{ textAlign: 'left', border: '1px solid var(--hairline)', background: selected ? 'var(--accent-muted)' : 'var(--surface)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontWeight: 700 }}>{p.pos} {p.name}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Age {p.age ?? '—'} · OVR {p.ovr ?? '—'} · POT {p.potential ?? p.ovr ?? '—'} · {money(p?.contract?.baseAnnual)} · {p?.contract?.yearsRemaining ?? p?.contract?.years ?? '—'}y · Cap {money(p?.contract?.capHit ?? p?.contract?.baseAnnual)}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Morale {p?.morale ?? '—'}{p?.injury ? ` · ${p.injury}` : ''} · {TRADE_STATUS_LABELS[mgmt.tradeStatus]}{mgmt.contractPlan[0] ? ` · ${CONTRACT_PLAN_LABELS[mgmt.contractPlan[0]]}` : ''}
      </div>
    </button>
  );
}

export default function TradeFinder({ league, actions, onPlayerSelect, onOpenTradeCenter, workspace, onWorkspaceChange }) {
  const teams = league?.teams ?? [];
  const userTeam = teams.find((t) => Number(t.id) === Number(league?.userTeamId));
  const week = Number(league?.week ?? 1);

  const [selectedPartnerId, setSelectedPartnerId] = useState(workspace?.partnerTeamId ?? null);
  const [outgoingPlayers, setOutgoingPlayers] = useState(workspace?.outgoingPlayerIds ?? []);
  const [outgoingPicks, setOutgoingPicks] = useState(workspace?.outgoingPickIds ?? []);
  const [incomingPlayers, setIncomingPlayers] = useState(workspace?.incomingPlayerIds ?? []);
  const [helperReason, setHelperReason] = useState(workspace?.helperReason ?? '');

  useEffect(() => {
    onWorkspaceChange?.({
      partnerTeamId: selectedPartnerId,
      outgoingPlayerIds: outgoingPlayers,
      outgoingPickIds: outgoingPicks,
      incomingPlayerIds: incomingPlayers,
      helperReason,
    });
  }, [selectedPartnerId, outgoingPlayers, outgoingPicks, incomingPlayers, helperReason, onWorkspaceChange]);

  const userRoster = useMemo(() => [...(userTeam?.roster ?? [])].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0),), [userTeam]);
  const userPicks = useMemo(() => [...(userTeam?.picks ?? [])].sort((a, b) => Number(a.round ?? 7) - Number(b.round ?? 7)).slice(0, 8), [userTeam]);

  const teamsWithIntel = useMemo(() => teams.map((t) => ({
    ...t,
    teamIntel: buildTeamIntelligence(t, { week }),
    needsSummary: computeTeamNeedsSummary(t),
  })), [teams, week]);

  const selectedPartner = useMemo(() => teams.find((t) => Number(t.id) === Number(selectedPartnerId)), [teams, selectedPartnerId]);

  const selectedOutgoingPlayers = useMemo(() => outgoingPlayers.map((id) => userRoster.find((p) => Number(p.id) === Number(id))).filter(Boolean), [outgoingPlayers, userRoster]);
  const selectedOutgoingPicks = useMemo(() => outgoingPicks.map((id) => userPicks.find((p) => String(p.id) === String(id))).filter(Boolean), [outgoingPicks, userPicks]);

  const partnerRanks = useMemo(() => rankTradePartners({
    teams: teamsWithIntel,
    userTeamId: league?.userTeamId,
    outgoingPlayers: selectedOutgoingPlayers,
    outgoingPicks: selectedOutgoingPicks,
    week,
  }), [teamsWithIntel, league?.userTeamId, selectedOutgoingPlayers, selectedOutgoingPicks, week]);

  const outgoingValue = selectedOutgoingPlayers.reduce((sum, p) => sum + playerAssetValue(p, { direction: 'balanced' }), 0)
    + selectedOutgoingPicks.reduce((sum, p) => sum + pickAssetValue(p, { week, direction: 'balanced' }), 0);

  const askWhatTheyOffer = () => {
    if (!selectedPartner) return;
    const partnerIntel = teamsWithIntel.find((t) => Number(t.id) === Number(selectedPartner.id))?.teamIntel ?? {};
    const needNow = (partnerIntel?.needsNow ?? [])[0]?.pos ?? null;
    const direction = partnerIntel?.direction ?? 'balanced';
    const candidates = [...(selectedPartner.roster ?? [])]
      .filter((p) => (p.ovr ?? 0) >= 64)
      .filter((p) => {
        const m = normalizeManagement(p);
        return m.tradeStatus !== 'untouchable' && m.tradeStatus !== 'not_available';
      })
      .sort((a, b) => {
        const aNeed = needNow && String(a?.pos).toUpperCase() === String(needNow).toUpperCase() ? -40 : 0;
        const bNeed = needNow && String(b?.pos).toUpperCase() === String(needNow).toUpperCase() ? -40 : 0;
        return Math.abs(playerAssetValue(a, { direction: 'balanced' }) - outgoingValue) + aNeed - (Math.abs(playerAssetValue(b, { direction: 'balanced' }) - outgoingValue) + bNeed);
      });
    const candidate = candidates[0];
    if (candidate) {
      setIncomingPlayers([candidate.id]);
      setHelperReason(`${selectedPartner.abbr} counters with ${candidate.name}: aligns with ${direction} direction and current need at ${needNow ?? 'best-value position'}.`);
    }
  };

  const makeDealWork = () => {
    if (!selectedPartner) return;
    const theirRoster = [...(selectedPartner.roster ?? [])].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
    const incoming = incomingPlayers.map((id) => theirRoster.find((p) => Number(p.id) === Number(id))).filter(Boolean);
    const adjustment = buildCounterAdjustment({
      partnerTeam: teamsWithIntel.find((t) => Number(t.id) === Number(selectedPartner.id)) ?? selectedPartner,
      outgoingPlayers: selectedOutgoingPlayers,
      outgoingPicks: selectedOutgoingPicks,
      incomingPlayers: incoming,
      week,
    });

    if (adjustment.type === 'add_pick' && userPicks[0]) {
      setOutgoingPicks((prev) => prev.includes(userPicks[0].id) ? prev : [...prev, userPicks[0].id]);
    } else if (adjustment.playerId) {
      setIncomingPlayers((prev) => prev.includes(adjustment.playerId) ? prev : [...prev, adjustment.playerId]);
    }
    setHelperReason(adjustment.explain);
  };

  return (
    <div className="fade-in" style={{ display: 'grid', gap: 12 }}>
      <Card className="card-premium">
        <CardHeader><CardTitle>Trade Finder</CardTitle></CardHeader>
        <CardContent style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select outgoing assets, rank partners, then open Builder with this exact context.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Outgoing Players</div>
              <div style={{ maxHeight: 250, overflow: 'auto', display: 'grid', gap: 6 }}>
                {userRoster.slice(0, 32).map((p) => (
                  <PlayerAssetRow key={p.id} p={p} selected={outgoingPlayers.includes(p.id)} onToggle={() => setOutgoingPlayers((prev) => prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id])} />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Outgoing Picks</div>
              <div style={{ maxHeight: 250, overflow: 'auto', display: 'grid', gap: 4 }}>
                {userPicks.map((pk) => (
                  <button key={pk.id} onClick={() => setOutgoingPicks((prev) => prev.includes(pk.id) ? prev.filter((id) => id !== pk.id) : [...prev, pk.id])} style={{ textAlign: 'left', border: '1px solid var(--hairline)', background: outgoingPicks.includes(pk.id) ? 'var(--accent-muted)' : 'var(--surface)', borderRadius: 8, padding: '8px 10px' }}>
                    {pk.season} R{pk.round} pick
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="card-premium">
        <CardHeader><CardTitle>Likely Trade Partners</CardTitle></CardHeader>
        <CardContent style={{ display: 'grid', gap: 8 }}>
          {partnerRanks.slice(0, 8).map((row) => (
            <div key={row.teamId} style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: 8, background: Number(selectedPartnerId) === Number(row.teamId) ? 'var(--accent-muted)' : 'var(--surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{row.teamName}</strong><Badge variant="outline">Fit {row.fitScore}</Badge></div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.direction} · Record {(teams.find((t) => Number(t.id) === Number(row.teamId))?.wins ?? 0)}-{(teams.find((t) => Number(t.id) === Number(row.teamId))?.losses ?? 0)} · Need: {row.positionNeed} · Cap: {row.capAbility}</div>
              <div style={{ fontSize: 12 }}>{prefLabel[row.preference]}. {row.reasons[0] ?? 'Contextual fit available after selecting package.'}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Button className="btn" onClick={() => { setSelectedPartnerId(row.teamId); onOpenTradeCenter?.(); }}>Open in Builder</Button>
                <Button className="btn" onClick={() => { setSelectedPartnerId(row.teamId); askWhatTheyOffer(); }}>Ask what they would offer</Button>
                <Button className="btn" onClick={() => { setSelectedPartnerId(row.teamId); makeDealWork(); }}>Make this deal work</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {selectedPartner && (
        <Card className="card-premium">
          <CardHeader><CardTitle>Active Package vs {selectedPartner.abbr}</CardTitle></CardHeader>
          <CardContent style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Incoming players</div>
            <div style={{ display: 'grid', gap: 4, maxHeight: 180, overflow: 'auto' }}>
              {(selectedPartner.roster ?? []).slice(0, 28).map((p) => (
                <button key={p.id} onClick={() => setIncomingPlayers((prev) => prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id])} style={{ textAlign: 'left', border: '1px solid var(--hairline)', background: incomingPlayers.includes(p.id) ? 'var(--accent-muted)' : 'var(--surface)', borderRadius: 8, padding: '8px 10px' }}>
                  <span onClick={(e) => { e.stopPropagation(); onPlayerSelect?.(p.id); }}>{p.pos} {p.name}</span> · OVR {p.ovr} · Age {p.age}
                </button>
              ))}
            </div>
            {helperReason ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Package note: {helperReason}</div> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
