export function buildTradeAssetDisplay(asset, { type = 'player' } = {}) {
  if (!asset) return { title: 'Unknown asset', subtitle: 'Missing data', type };

  if (type === 'pick') {
    const season = asset?.season ?? asset?.year ?? 'Future';
    const round = asset?.round ?? '?';
    const origin = asset?.originalTeamAbbr ?? asset?.originalTeam ?? asset?.fromTeamAbbr;
    const comp = asset?.isCompensatory ? 'Compensatory' : null;
    return {
      type: 'pick',
      title: `${season} Round ${round}`,
      subtitle: [origin ? `via ${origin}` : null, comp].filter(Boolean).join(' · ') || 'Draft pick',
      badge: 'Pick',
    };
  }

  const ovr = Number(asset?.ovr ?? asset?.overall ?? 0);
  return {
    type: 'player',
    title: asset?.name ?? 'Unnamed player',
    subtitle: `${asset?.pos ?? 'POS'} · Age ${asset?.age ?? '--'} · OVR ${ovr || '--'}`,
    meta: asset?.contract?.baseAnnual != null ? `$${Number(asset.contract.baseAnnual).toFixed(1)}M/yr` : 'No contract data',
    badge: 'Player',
  };
}
