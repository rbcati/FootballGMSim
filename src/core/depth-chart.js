import { canPlayerPlay } from './injury-core.js';

/**
 * Automatically sorts the team's roster to optimize the depth chart.
 * Moves injured players to the bottom and healthy backups up.
 * Secondary sort is OVR descending.
 * @param {Object} team - The team object containing a roster array.
 */
export function autoSortDepthChart(team) {
  if (!team || !team.roster || !Array.isArray(team.roster)) return;

  team.roster.sort((a, b) => {
    const aPlay = canPlayerPlay(a);
    const bPlay = canPlayerPlay(b);

    // 1. Healthy players first
    if (aPlay && !bPlay) return -1;
    if (!aPlay && bPlay) return 1;

    // 2. OVR descending
    return (b.ovr || 0) - (a.ovr || 0);
  });
}
