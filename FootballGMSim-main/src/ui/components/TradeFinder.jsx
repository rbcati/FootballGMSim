import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { computeTeamNeedsSummary } from '../utils/marketSignals.js';
import { buildTeamIntelligence } from '../utils/teamIntelligence.js';
import { rankTradePartners, playerAssetValue, pickAssetValue, buildCounterAdjustment } from '../utils/tradeFinder.js';
import { normalizeManagement, CONTRACT_PLAN_LABELS, TRADE_STATUS_LABELS } from '../utils/playerManagement.js';
import { buildAskOfferOutcome } from '../utils/tradeFinderOffers.js';

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

function classifyContractType(player) {
  const years = Number(player?.contract?.yearsRemaining ?? player?.contract?.years ?? 0);
  const annual = Number(player?.contract?.baseAnnual ?? 0);
  if (years <= 1) return 'expiring';
  if (annual >= 16) return 'premium';
  if (annual <= 4) return 'cheap';
  return 'mid';
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
  const [helperContext, setHelperContext] = useState(workspace?.helperContext ?? null);
  const [targetPosFilter, setTargetPosFilter] = useState('ALL');
  const [targetTeamFilter, setTargetTeamFilter] = useState('ALL');
  const [targetContractFilter, setTargetContractFilter] = useState('ALL');
  const [targetAvailabilityFilter, setTargetAvailabilityFilter] = useState('ALL');
  const [targetAgeMin, setTargetAgeMin] = useState(21);
  const [targetAgeMax, setTargetAgeMax] = useState(35);

  useEffect(() => {
    if (workspace?.partnerTeamId !== undefined && Number(workspace?.partnerTeamId) !== Number(selectedPartnerId)) {
      setSelectedPartnerId(workspace?.partnerTeamId ?? null);
    }
    if (Array.isArray(workspace?.outgoingPlayerIds) && JSON.stringify(workspace.outgoingPlayerIds) !== JSON.stringify(outgoingPlayers)) {
      setOutgoingPlayers(workspace.outgoingPlayerIds);
    }
    if (Array.isArray(workspace?.outgoingPickIds) && JSON.stringify(workspace.outgoingPickIds) !== JSON.stringify(outgoingPicks)) {
      setOutgoingPicks(workspace.outgoingPickIds);
    }
    if (Array.isArray(workspace?.incomingPlayerIds) && JSON.stringify(workspace.incomingPlayerIds) !== JSON.stringify(incomingPlayers)) {
      setIncomingPlayers(workspace.incomingPlayerIds);
    }
    if ((workspace?.helperReason ?? '') !== helperReason) {
      setHelperReason(workspace?.helperReason ?? '');
    }
    if ((workspace?.helperContext ?? null) !== helperContext) {
      setHelperContext(workspace?.helperContext ?? null);
    }
  }, [workspace]);

  useEffect(() => {
    onWorkspaceChange?.({
      partnerTeamId: selectedPartnerId,
      outgoingPlayerIds: outgoingPlayers,
      outgoingPickIds: outgoingPicks,
      incomingPlayerIds: incomingPlayers,
      helperReason,
      helperContext,
    });
  }, [selectedPartnerId, outgoingPlayers, outgoingPicks, incomingPlayers, helperReason, helperContext, onWorkspaceChange]);

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
  const marketSignals = useMemo(() => {
    const needs = {};
    const buyers = [];
    const sellers = [];
    for (const team of teamsWithIntel) {
      const intel = team?.teamIntel ?? {};
      const topNeed = intel?.needsNow?.[0]?.pos;
      if (topNeed) needs[topNeed] = (needs[topNeed] ?? 0) + 1;
      if (intel?.direction === 'contender' && Number(team?.capRoom ?? 0) >= 6) buyers.push(team);
      if (intel?.direction === 'rebuilding' || Number(team?.capRoom ?? 0) < 0) sellers.push(team);
    }
    const hotNeeds = Object.entries(needs).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { hotNeeds, buyers: buyers.slice(0, 8), sellers: sellers.slice(0, 8) };
  }, [teamsWithIntel]);

  const tradeTargets = useMemo(() => {
    const rows = [];
    for (const team of teamsWithIntel) {
      if (Number(team.id) === Number(league?.userTeamId)) continue;
      const intel = team?.teamIntel ?? {};
      const needText = (intel?.needsNow ?? []).slice(0, 2).map((n) => n.pos).join(', ') || 'No urgent needs';
      for (const player of (team?.roster ?? [])) {
        const management = normalizeManagement(player);
        const availability = management.tradeStatus === 'actively_shopping'
          ? 'block'
          : management.tradeStatus === 'available'
            ? 'available'
            : (management.contractPlan ?? []).includes('trade_candidate')
              ? 'expendable'
              : 'normal';
        rows.push({
          id: `${team.id}-${player.id}`,
          teamId: team.id,
          teamAbbr: team.abbr,
          teamName: team.name,
          name: player.name,
          pos: player.pos,
          age: player.age ?? 0,
          ovr: player.ovr ?? 0,
          pot: player.potential ?? player.ovr ?? 0,
          annual: Number(player?.contract?.baseAnnual ?? 0),
          years: Number(player?.contract?.yearsRemaining ?? player?.contract?.years ?? 0),
          contractType: classifyContractType(player),
          availability,
          fitHint: `${intel.direction ?? 'balanced'} · Need: ${needText}`,
          playerId: player.id,
        });
      }
    }
    return rows.sort((a, b) => (b.ovr - a.ovr) || (a.age - b.age));
  }, [teamsWithIntel, league?.userTeamId]);

  const filteredTargets = useMemo(() => tradeTargets
    .filter((row) => targetPosFilter === 'ALL' ? true : row.pos === targetPosFilter)
    .filter((row) => targetTeamFilter === 'ALL' ? true : String(row.teamId) === targetTeamFilter)
    .filter((row) => targetContractFilter === 'ALL' ? true : row.contractType === targetContractFilter)
    .filter((row) => targetAvailabilityFilter === 'ALL' ? true : row.availability === targetAvailabilityFilter)
    .filter((row) => row.age >= targetAgeMin && row.age <= targetAgeMax), [tradeTargets, targetPosFilter, targetTeamFilter, targetContractFilter, targetAvailabilityFilter, targetAgeMin, targetAgeMax]);

  const askWhatTheyOffer = useCallback((partnerId = selectedPartnerId) => {
    const partner = teams.find((t) => Number(t.id) === Number(partnerId));
    if (!partner) {
      setHelperReason('Select a partner team before requesting an offer.');
      setHelperContext({ status: 'error', reasons: ['No trade partner selected.'] });
      return;
    }
    const partnerIntel = teamsWithIntel.find((t) => Number(t.id) === Number(partner.id))?.teamIntel ?? {};
    const outcome = buildAskOfferOutcome({ partnerTeam: partner, partnerIntel, outgoingValue });
    setSelectedPartnerId(partner.id);
    setIncomingPlayers(outcome.incomingPlayerIds ?? []);
    setHelperReason(outcome.helperReason);
    setHelperContext({
      status: outcome.status,
      partnerId: partner.id,
      offerPlayerId: outcome?.context?.candidateId ?? null,
      reasons: outcome.reasons ?? [],
    });
  }, [selectedPartnerId, teams, teamsWithIntel, outgoingValue]);

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
                <Button className="btn" onClick={() => askWhatTheyOffer(row.teamId)}>Ask what they would offer</Button>
                <Button className="btn" onClick={() => { setSelectedPartnerId(row.teamId); makeDealWork(); }}>Make this deal work</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="card-premium">
        <CardHeader><CardTitle>Market Signals</CardTitle></CardHeader>
        <CardContent style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {marketSignals.hotNeeds.map(([pos, count]) => <Badge key={pos} variant="outline">{pos} need: {count} teams</Badge>)}
            {!marketSignals.hotNeeds.length ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No strong need cluster yet.</span> : null}
          </div>
          <div style={{ fontSize: 12 }}>
            <strong>Buyers:</strong> {marketSignals.buyers.map((t) => t.abbr).join(', ') || 'none flagged'} · <strong>Sellers:</strong> {marketSignals.sellers.map((t) => t.abbr).join(', ') || 'none flagged'}
          </div>
        </CardContent>
      </Card>

      <Card className="card-premium">
        <CardHeader><CardTitle>Trade Targets Browser</CardTitle></CardHeader>
        <CardContent style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 6 }}>
            <select value={targetPosFilter} onChange={(e) => setTargetPosFilter(e.target.value)}>
              <option value="ALL">All positions</option>
              {Array.from(new Set(tradeTargets.map((r) => r.pos))).sort().map((pos) => <option key={pos} value={pos}>{pos}</option>)}
            </select>
            <select value={targetTeamFilter} onChange={(e) => setTargetTeamFilter(e.target.value)}>
              <option value="ALL">All teams</option>
              {Array.from(new Set(tradeTargets.map((r) => `${r.teamId}|${r.teamAbbr}`))).map((key) => {
                const [teamId, abbr] = key.split('|');
                return <option key={key} value={teamId}>{abbr}</option>;
              })}
            </select>
            <select value={targetContractFilter} onChange={(e) => setTargetContractFilter(e.target.value)}>
              <option value="ALL">All contracts</option>
              <option value="expiring">Expiring</option>
              <option value="cheap">Cheap</option>
              <option value="mid">Mid</option>
              <option value="premium">Premium</option>
            </select>
            <select value={targetAvailabilityFilter} onChange={(e) => setTargetAvailabilityFilter(e.target.value)}>
              <option value="ALL">All availability</option>
              <option value="block">Trade block</option>
              <option value="available">Available</option>
              <option value="expendable">Expendable</option>
              <option value="normal">Normal</option>
            </select>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Age min
              <input type="number" min={20} max={38} value={targetAgeMin} onChange={(e) => setTargetAgeMin(Number(e.target.value || 20))} style={{ width: '100%' }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Age max
              <input type="number" min={20} max={40} value={targetAgeMax} onChange={(e) => setTargetAgeMax(Number(e.target.value || 40))} style={{ width: '100%' }} />
            </label>
          </div>
          <div style={{ maxHeight: 320, overflow: 'auto', display: 'grid', gap: 6 }}>
            {filteredTargets.slice(0, 80).map((row) => (
              <div key={row.id} style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: '7px 8px', display: 'grid', gap: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>{row.pos} {row.name}</strong>
                  <Badge variant="outline">{row.teamAbbr}</Badge>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Age {row.age} · OVR {row.ovr} / POT {row.pot} · ${row.annual.toFixed(1)}M · {row.years}y · {row.availability}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.fitHint}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button className="btn" onClick={() => {
                    setSelectedPartnerId(row.teamId);
                    setIncomingPlayers((prev) => prev.includes(row.playerId) ? prev : [...prev, row.playerId]);
                    onOpenTradeCenter?.();
                  }}>Prefill in Builder</Button>
                  <Button className="btn" onClick={() => onPlayerSelect?.(row.playerId)}>Player</Button>
                </div>
              </div>
            ))}
            {!filteredTargets.length ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No targets match these filters.</div> : null}
          </div>
        </CardContent>
      </Card>

      {helperContext && (
        <Card className="card-premium">
          <CardHeader><CardTitle>Offer response</CardTitle></CardHeader>
          <CardContent style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, color: helperContext.status === 'ok' ? 'var(--text)' : 'var(--warning)' }}>{helperReason}</div>
            <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 4, color: 'var(--text-muted)', fontSize: 12 }}>
              {(helperContext.reasons ?? []).map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button className="btn btn-primary" onClick={() => onOpenTradeCenter?.()}>Open in Builder</Button>
              <Button className="btn" onClick={() => askWhatTheyOffer(helperContext.partnerId)}>Refresh offer</Button>
            </div>
          </CardContent>
        </Card>
      )}

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
