export const TRADE_STATUSES = ['untouchable', 'soft_block', 'available', 'actively_shopping', 'not_available'];
export const CONTRACT_PLAN_FLAGS = ['shortlist_extension', 'trade_candidate', 'defer_offseason', 'prioritize_deadline'];

export const TRADE_STATUS_LABELS = {
  untouchable: 'Untouchable',
  soft_block: 'Soft Block',
  available: 'Available',
  actively_shopping: 'Actively Shopping',
  not_available: 'Not Available',
};

export const TRADE_STATUS_TOOLTIPS = {
  untouchable: 'Core player. AI and helper tools should avoid including this player.',
  soft_block: 'Can move, but requires premium return.',
  available: 'Open to fair offers.',
  actively_shopping: 'You are seeking offers and willing to move quickly.',
  not_available: 'Keep off the market unless strategic context changes.',
};

export const CONTRACT_PLAN_LABELS = {
  shortlist_extension: 'Extension shortlist',
  trade_candidate: 'Trade candidate',
  defer_offseason: 'Defer to offseason',
  prioritize_deadline: 'Priority before deadline',
};

export function normalizeManagement(player = {}) {
  const contractPlan = Array.isArray(player?.contractPlan)
    ? player.contractPlan.filter((flag) => CONTRACT_PLAN_FLAGS.includes(flag))
    : [];
  const tradeStatus = TRADE_STATUSES.includes(player?.tradeStatus)
    ? player.tradeStatus
    : player?.onTradeBlock
      ? 'actively_shopping'
      : 'available';
  return { tradeStatus, contractPlan };
}

export function hasContractPlan(player = {}, flag) {
  return normalizeManagement(player).contractPlan.includes(flag);
}

export function toggleContractPlan(player = {}, flag) {
  if (!CONTRACT_PLAN_FLAGS.includes(flag)) return normalizeManagement(player).contractPlan;
  const current = normalizeManagement(player).contractPlan;
  return current.includes(flag)
    ? current.filter((f) => f !== flag)
    : [...current, flag];
}
