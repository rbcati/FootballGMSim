import { evaluateOwnerMessageContext } from './ownerMessages.js';

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getUserTeam(league) {
  return league?.teams?.find((t) => t.id === league?.userTeamId) ?? null;
}

function computeStreak(recentResults) {
  if (!Array.isArray(recentResults) || recentResults.length === 0) return null;
  let type = null;
  let count = 0;
  for (let i = recentResults.length - 1; i >= 0; i -= 1) {
    const result = recentResults[i];
    if (result !== 'W' && result !== 'L') continue;
    if (type == null) {
      type = result;
      count = 1;
      continue;
    }
    if (result === type) count += 1;
    else break;
  }
  return type ? { type, count } : null;
}

function classifyDirection(team, week) {
  const wins = safeNum(team?.wins);
  const losses = safeNum(team?.losses);
  const ties = safeNum(team?.ties);
  const games = wins + losses + ties;
  const winPct = games > 0 ? (wins + ties * 0.5) / games : 0.5;
  if (week <= 4) {
    if (winPct >= 0.7) return 'contender';
    if (winPct <= 0.3) return 'retool';
    return 'balanced';
  }
  if (winPct >= 0.62) return 'contender';
  if (winPct <= 0.35) return 'rebuilding';
  if (winPct <= 0.45) return 'desperate';
  return 'balanced';
}

export function evaluateWeeklyContext(league) {
  const userTeam = getUserTeam(league);
  if (!league || !userTeam) return null;

  const week = safeNum(league?.week, 1);
  const streak = computeStreak(userTeam?.recentResults ?? []);
  const capRoom = safeNum(userTeam?.capRoom ?? userTeam?.capSpace, 0);
  const injuries = (userTeam?.roster ?? []).filter((p) => p?.injury || safeNum(p?.injuredWeeks) > 0);
  const expiring = (userTeam?.roster ?? []).filter((p) => safeNum(p?.contract?.yearsRemaining ?? p?.contractYearsLeft ?? p?.years ?? 2, 2) <= 1);
  const incomingOffers = Array.isArray(league?.incomingTradeOffers) ? league.incomingTradeOffers : [];
  const direction = classifyDirection(userTeam, week);
  const contractMarket = league?.contractMarket ?? null;

  const ownerContext = evaluateOwnerMessageContext({
    league,
    userTeam,
    currentWeek: week,
    currentSeason: league?.year,
  });

  const urgent = [];

  if (ownerContext?.pressureState === 'urgent_demand') {
    urgent.push({ tone: 'danger', label: 'Owner Directive', detail: ownerContext.message, tab: '🤖 GM Advisor' });
  } else if (ownerContext?.pressureState === 'warning') {
    urgent.push({ tone: 'warning', label: 'Owner Pressure', detail: ownerContext.message, tab: '🤖 GM Advisor' });
  }

  if (streak?.type === 'L' && streak.count >= 3) {
    urgent.push({ tone: 'danger', label: `Slide Alert (${streak.type}${streak.count})`, detail: 'Results are sliding. Adjust depth chart, scheme, or personnel.', tab: 'Game Plan' });
  }

  if (injuries.length >= 2) {
    urgent.push({ tone: 'warning', label: 'Injury Depth Risk', detail: `${injuries.length} active injuries are stressing depth.`, tab: 'Injuries' });
  }

  if (incomingOffers.length > 0) {
    urgent.push({ tone: 'info', label: 'Trade Calls Waiting', detail: `${incomingOffers.length} incoming offer${incomingOffers.length > 1 ? 's' : ''} in your inbox.`, tab: 'Trades' });
  }

  if (capRoom >= 28 && direction !== 'rebuilding') {
    urgent.push({ tone: 'warning', label: 'Cap Flex Unused', detail: `You still have $${capRoom.toFixed(1)}M in space.`, tab: '💰 Cap' });
  }

  if (expiring.length >= 5 && week >= 8) {
    urgent.push({ tone: 'info', label: 'Contract Clock', detail: `${expiring.length} rotation players are expiring.`, tab: 'Financials' });
  }
  const ownerContractPressure = ownerContext?.key?.includes('expiring_core_ignored');
  if ((contractMarket?.priorityExpiring ?? 0) >= 2 && !ownerContractPressure) {
    urgent.push({
      tone: 'warning',
      label: 'Priority Expiring Starters',
      detail: `${contractMarket.priorityExpiring} key contracts need action soon.`,
      tab: 'Financials',
    });
  }
  if ((contractMarket?.bidRiskCount ?? 0) >= 1) {
    urgent.push({
      tone: 'danger',
      label: 'Bid Risk',
      detail: `${contractMarket.bidRiskCount} active bid${contractMarket.bidRiskCount > 1 ? 's are' : ' is'} at risk.`,
      tab: 'Free Agency',
    });
  }
  if ((contractMarket?.closeToDecisionCount ?? 0) >= 1) {
    urgent.push({
      tone: 'warning',
      label: 'Decision Window',
      detail: `${contractMarket.closeToDecisionCount} target${contractMarket.closeToDecisionCount > 1 ? 's are' : ' is'} close to deciding.`,
      tab: 'Free Agency',
    });
  } else if ((contractMarket?.likelyToTest ?? 0) >= 2) {
    urgent.push({
      tone: 'info',
      label: 'Testing Market Risk',
      detail: `${contractMarket.likelyToTest} players are likely to test free agency.`,
      tab: 'Financials',
    });
  }

  const focus = ownerContext?.expectedAction
    ? { title: ownerContext.expectedAction, subtitle: 'Owner expectation is active this week.' }
    : direction === 'contender'
      ? { title: 'Push for short-term upgrades', subtitle: 'You are in a win-now lane. Target immediate impact moves.' }
      : direction === 'rebuilding'
        ? { title: 'Convert veterans into future value', subtitle: 'Lean into long-term timeline decisions before value drops.' }
        : { title: 'Stabilize and pick a direction', subtitle: 'Avoid passive weeks. Improve weak spots or reset timeline.' };

  const advisorPulse = direction === 'contender'
    ? 'Prioritize immediate starters and avoid dead cap traps.'
    : direction === 'rebuilding'
      ? 'Prioritize picks, young upside, and flexible contracts.'
      : 'Balance floor and ceiling—do not overpay before your direction is clear.';

  return {
    week,
    direction,
    ownerContext,
    incomingOffers,
    focus,
    advisorPulse,
    urgentItems: urgent.slice(0, 4),
    marketPulse: (contractMarket?.bidRiskCount ?? 0) > 0
      ? `${contractMarket.bidRiskCount} contract market${contractMarket.bidRiskCount > 1 ? 's are' : ' is'} heating up against your bids.`
      : (contractMarket?.closeToDecisionCount ?? 0) > 0
        ? `${contractMarket.closeToDecisionCount} target${contractMarket.closeToDecisionCount > 1 ? 's are' : ' is'} nearing a decision.`
        : contractMarket?.hotPositions?.length
      ? `Market heating up at ${contractMarket.hotPositions.map((p) => p.pos).join(', ')}.`
      : incomingOffers[0]?.reason ?? (week >= 10 ? 'Deadline pressure is rising across the league.' : 'Market is active but selective.'),
  };
}
