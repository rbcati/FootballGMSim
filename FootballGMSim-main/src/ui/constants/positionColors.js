export const POS_COLORS = Object.freeze({
  QB: '#007aff',
  RB: '#34c759',
  WR: '#ff9f0a',
  TE: '#af52de',
  OL: '#636366',
  DL: '#ff453a',
  LB: '#ff6b35',
  DB: '#5ac8fa',
  CB: '#5ac8fa',
  S: '#5ac8fa',
  K: '#30b0c7',
  P: '#30b0c7',
  default: '#636366',
});

export function getPositionColor(position) {
  const pos = String(position ?? '').toUpperCase();
  if (['CB', 'S', 'SS', 'FS', 'DB'].includes(pos)) return POS_COLORS.DB;
  return POS_COLORS[pos] ?? POS_COLORS.default;
}
