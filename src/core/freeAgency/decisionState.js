export function getFreeAgencyDecisionState(input = {}) {
  const stance = input?.negotiationStance ?? 'testing_market';
  const bidderCount = Number(input?.bidderCount ?? 0);
  const urgency = input?.urgency ?? 'low';
  const valueGap = Number(input?.valueGap ?? 0);

  if (stance === 'seeking_contender') return { state: 'prefers_contenders', summary: 'Prioritizing contenders', chips: ['Contender fit'] };
  if (stance === 'wants_larger_role') return { state: 'wants_starting_role', summary: 'Wants starting role clarity', chips: ['Role-driven'] };
  if (stance === 'chasing_top_dollar') return { state: 'waiting_for_better_money', summary: 'Waiting for stronger money', chips: ['Top dollar'] };
  if (stance === 'open_to_discount') return { state: 'loyalty_discount_possible', summary: 'Discount possible for strong fit', chips: ['Loyalty edge'] };
  if (stance === 'close_to_done' || (urgency === 'high' && valueGap >= -0.05)) return { state: 'decision_imminent', summary: 'Decision imminent', chips: ['Near decision'] };
  if (bidderCount >= 2 && urgency !== 'low') return { state: 'leaning_toward_offer', summary: 'Leaning toward top offer', chips: ['Competitive market'] };
  if (bidderCount <= 1 && urgency === 'low') return { state: 'market_cooling', summary: 'Market cooling', chips: ['Cooling market'] };
  return { state: 'listening_to_offers', summary: 'Listening to offers', chips: ['Open market'] };
}
