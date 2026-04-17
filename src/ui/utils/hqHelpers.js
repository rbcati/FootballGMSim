export function getTeamStatusLine(team, league, weekly) {
  if (!team || !league) return "Season in progress";

  const phase = league.phase;
  const wins = Number(team.wins || 0);
  const losses = Number(team.losses || 0);
  const totalGames = wins + losses;

  if (phase === 'preseason') return "Finalizing roster for Week 1";
  if (phase === 'playoffs') return "Postseason pursuit";
  if (phase === 'offseason' || phase === 'draft' || phase === 'free_agency') return "Building for next season";

  if (weekly?.pressurePoints?.ownerApproval < 40) return "Owner pressure rising";
  if (totalGames > 12) {
    if (team.isPlayoffSeed) return "Playoff push"; // Assuming this might be in state
    if (wins > losses) return "Wildcard race";
  }

  if (team.ovr > 85 && wins < losses) return "Underachieving season";
  if (team.ovr < 75 && wins > losses) return "Exceeding expectations";

  return "Must-win week ahead";
}

export function getActionContext(type, weekly, nextGame) {
  switch (type) {
    case 'lineup':
      if (weekly?.pressurePoints?.injuriesCount > 0) {
        return `${weekly.pressurePoints.injuriesCount} active injury impacts`;
      }
      return "Ensure depth is set";
    case 'gameplan':
      if (nextGame?.opp) {
        const opp = nextGame.opp;
        if (opp.offenseRating > 85) return "Facing elite offense";
        if (opp.defenseRating > 85) return "Heavy defensive test";
        return `Prepare for ${opp.abbr}`;
      }
      return "Optimize strategy";
    case 'news':
      return "Review league developments";
    case 'opponent':
      if (nextGame?.opp) {
        return `Matchup vs ${nextGame.opp.abbr}`;
      }
      return "Scout upcoming games";
    default:
      return null;
  }
}
