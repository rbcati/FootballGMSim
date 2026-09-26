import { mapOverallToAttributesV2 } from '../src/core/migration/attributeMigrator.ts';
import { deriveGamePlanMultipliers } from '../src/core/sim/gamePlanMultipliers.ts';
import { simulateRichGame } from '../src/core/sim/richGameSimulator.ts';

const RATES = [0, 25, 50, 75, 100];
const GAMES_PER_RATE = 300;

function mean(total: number, denominator = GAMES_PER_RATE): number {
  return Number((total / denominator).toFixed(3));
}

const rows = RATES.map((rate) => {
  const totals = { passAtt: 0, passComp: 0, sacks: 0, explosive: 0, turnovers: 0, points: 0, wins: 0 };
  for (let index = 0; index < GAMES_PER_RATE; index += 1) {
    // Rotate broad, equal-strength roster contexts. Only the home defense's
    // strategy differs between sweep rows; opponent plan remains neutral.
    const strength = 64 + ((index * 17) % 29);
    const opponentStrength = 64 + ((index * 11) % 29);
    const result = simulateRichGame({
      gameId: `blitz-sweep-${rate}-${index}`,
      seed: 70_000 + index,
      homeTeamId: 1,
      awayTeamId: 2,
      homeOffense: mapOverallToAttributesV2(strength, 5.5, `ho-${index}`),
      homeDefense: mapOverallToAttributesV2(strength, 5.5, `hd-${index}`),
      awayOffense: mapOverallToAttributesV2(opponentStrength, 5.5, `ao-${index}`),
      awayDefense: mapOverallToAttributesV2(opponentStrength, 5.5, `ad-${index}`),
      homePrepMultipliers: deriveGamePlanMultipliers({ gamePlan: { blitzFrequency: rate } }),
      awayPrepMultipliers: deriveGamePlanMultipliers({ gamePlan: { blitzFrequency: 30 } }),
    });
    const opponent = result.teamStats.away;
    totals.passAtt += opponent.passAtt;
    totals.passComp += opponent.passComp;
    totals.sacks += result.teamStats.home.sacksMade;
    totals.explosive += opponent.explosivePlays;
    totals.turnovers += opponent.turnovers;
    totals.points += result.awayScore;
    totals.wins += Number(result.homeScore > result.awayScore);
  }
  const factors = deriveGamePlanMultipliers({ gamePlan: { blitzFrequency: rate } });
  return {
    blitz: rate,
    sackRate: mean(totals.sacks, totals.passAtt),
    pressureOpportunityDelta: factors.blitzPressureDelta,
    opponentCompletionRate: mean(totals.passComp, totals.passAtt),
    explosiveAllowedPerGame: mean(totals.explosive),
    turnoversPerGame: mean(totals.turnovers),
    pointsAllowedPerGame: mean(totals.points),
    winRate: mean(totals.wins),
  };
});

console.table(rows);
