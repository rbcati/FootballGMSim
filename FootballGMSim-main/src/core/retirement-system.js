/**
 * retirement-system.js — Sudden & Standard Retirement Engine
 *
 * Two retirement paths:
 *
 * 1. **Sudden Retirement** (under age 30):
 *    - Severe injury history (injuryWeeks >= 16) → 3% base chance
 *    - "Low Work Ethic" trait → +4% chance
 *    - "Divisive" trait → +3% chance
 *    - Combined cap: 8% max so it stays rare but impactful
 *
 * 2. **Standard Retirement** (age-based):
 *    - RB age 30+: 10% base, +12% per year over 30
 *    - All others age 34+: 20% base, +15% per year over 34
 *    - Physical regression (OVR dropped 5+ in a season) adds +10%
 *    - Cap at 90% to leave a sliver of veterans hanging on
 *
 * No DOM / Window dependencies — pure JS, safe for Web Workers.
 */

import { Utils } from './utils.js';

/**
 * Evaluate all players for retirement (sudden + standard).
 * Mutates nothing — returns a list of player IDs that should retire,
 * along with metadata for news generation.
 *
 * @param {Object[]} players - All active players from cache (already aged +1)
 * @returns {{ retirements: Array<{ id, name, pos, age, ovr, teamId, reason }> }}
 */
export function evaluateRetirements(players) {
  const retirements = [];

  for (const player of players) {
    if (player.status === 'draft_eligible' || player.status === 'retired') continue;
    if (!player.ratings) continue;

    const age = player.age ?? 22;
    const ovr = player.ovr ?? 60;
    const traits = player.personality?.traits ?? [];
    const injuryWeeks = player.injuryWeeks ?? 0;
    const progressionDelta = player.progressionDelta ?? 0;

    let willRetire = false;
    let reason = null;

    // ── Sudden Retirement: under 30 ─────────────────────────────────────
    if (age < 30) {
      let suddenChance = 0;

      // Severe injury history
      if (injuryWeeks >= 16) {
        suddenChance += 0.03;
      }

      // Personality trait modifiers
      if (traits.includes('Low Work Ethic')) {
        suddenChance += 0.04;
      }
      if (traits.includes('Divisive')) {
        suddenChance += 0.03;
      }

      // Cap at 8% to keep it rare
      suddenChance = Math.min(0.08, suddenChance);

      if (suddenChance > 0 && Utils.random() < suddenChance) {
        willRetire = true;
        if (injuryWeeks >= 16) {
          reason = 'sudden_injury';
        } else if (traits.includes('Low Work Ethic')) {
          reason = 'sudden_motivation';
        } else {
          reason = 'sudden_personal';
        }
      }
    }

    // ── Standard Retirement: age-scaled ──────────────────────────────────
    if (!willRetire) {
      let retireChance = 0;

      if (player.pos === 'RB' && age >= 30) {
        // RBs have a shorter shelf life
        retireChance = 0.10 + (age - 30) * 0.12;
      } else if (age >= 34) {
        // All other positions
        retireChance = 0.20 + (age - 34) * 0.15;
      }

      // Physical regression accelerates retirement
      if (progressionDelta <= -5) {
        retireChance += 0.10;
      }

      // Cap at 90%
      retireChance = Math.min(0.90, retireChance);

      if (retireChance > 0 && Utils.random() < retireChance) {
        willRetire = true;
        reason = 'standard';
      }
    }

    if (willRetire) {
      retirements.push({
        id: player.id,
        name: player.name,
        pos: player.pos,
        age,
        ovr,
        teamId: player.teamId ?? null,
        reason,
      });
    }
  }

  return { retirements };
}
