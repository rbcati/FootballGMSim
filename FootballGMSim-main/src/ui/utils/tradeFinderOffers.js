import { playerAssetValue } from './tradeFinder.js';
import { normalizeManagement } from './playerManagement.js';

export function buildAskOfferOutcome({ partnerTeam, partnerIntel = {}, outgoingValue = 0 }) {
  if (!partnerTeam) {
    return {
      status: 'error',
      incomingPlayerIds: [],
      helperReason: 'Select a partner team before requesting an offer.',
      reasons: ['No trade partner selected.'],
    };
  }

  const needNow = (partnerIntel?.needsNow ?? [])[0]?.pos ?? null;
  const direction = partnerIntel?.direction ?? 'balanced';
  const candidates = [...(partnerTeam.roster ?? [])]
    .filter((p) => (p.ovr ?? 0) >= 64)
    .filter((p) => {
      const m = normalizeManagement(p);
      return m.tradeStatus !== 'untouchable' && m.tradeStatus !== 'not_available';
    })
    .sort((a, b) => {
      const aNeed = needNow && String(a?.pos).toUpperCase() === String(needNow).toUpperCase() ? -40 : 0;
      const bNeed = needNow && String(b?.pos).toUpperCase() === String(needNow).toUpperCase() ? -40 : 0;
      return Math.abs(playerAssetValue(a, { direction: 'balanced' }) - outgoingValue) + aNeed
        - (Math.abs(playerAssetValue(b, { direction: 'balanced' }) - outgoingValue) + bNeed);
    });

  const candidate = candidates[0];
  if (!candidate) {
    return {
      status: 'empty',
      incomingPlayerIds: [],
      helperReason: `${partnerTeam.abbr} cannot build an offer from current constraints.`,
      reasons: [
        'No tradable players matched your outgoing package value.',
        'Try adding/removing outgoing players or picks, then ask again.',
      ],
      context: { needNow, direction },
    };
  }

  const delta = Math.round(Math.abs(playerAssetValue(candidate, { direction: 'balanced' }) - outgoingValue));
  return {
    status: 'ok',
    incomingPlayerIds: [candidate.id],
    helperReason: `${partnerTeam.abbr} offers ${candidate.name}. Fit: ${direction} direction, value parity target ${Math.round(outgoingValue)}, need focus ${needNow ?? 'best-value role'}, cap lane ${Number(partnerTeam.capRoom ?? 0).toFixed(1)}M.`,
    reasons: [
      `Need: ${needNow ?? 'best-value role'}`,
      `Direction: ${direction}`,
      `Cap room: $${Number(partnerTeam.capRoom ?? 0).toFixed(1)}M`,
      `Timeline: ${(partnerIntel?.timeline?.window ?? 'current cycle').replaceAll('_', ' ')}`,
      `Package match delta: ${delta}`,
    ],
    context: { needNow, direction, candidateId: candidate.id },
  };
}
