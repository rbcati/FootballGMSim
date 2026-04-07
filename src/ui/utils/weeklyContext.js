import { evaluateOwnerMessageContext } from './ownerMessages.js';
import { buildDirectionGuidance, buildTeamIntelligence } from './teamIntelligence.js';
import { buildStorylineCards } from './leagueNarratives.js';
import { deriveFranchisePressure } from './pressureModel.js';

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

function mapPhaseShortcuts(phase) {
  if (phase === 'offseason_resign') {
    return [
      { label: 'FA Hub', tab: 'FA Hub' },
      { label: 'Free Agency', tab: 'Free Agency' },
      { label: 'Financials', tab: 'Financials' },
    ];
  }
  if (phase === 'free_agency') {
    return [
      { label: 'FA Hub', tab: 'FA Hub' },
      { label: 'Free Agency', tab: 'Free Agency' },
      { label: 'Financials', tab: 'Financials' },
      { label: 'Trades', tab: 'Trades' },
    ];
  }
  if (phase === 'draft') {
    return [
      { label: 'Draft Room', tab: 'Draft Room' },
      { label: 'Big Board', tab: '🎓 Draft' },
      { label: 'Mock Draft', tab: 'Mock Draft' },
    ];
  }
  if (phase === 'preseason') {
    return [
      { label: 'Roster Cuts', tab: 'Roster Hub' },
      { label: 'Depth Chart', tab: 'Depth Chart' },
      { label: 'Training', tab: 'Training' },
    ];
  }
  if (phase === 'playoffs') {
    return [
      { label: 'Postseason', tab: 'Postseason' },
      { label: 'Game Plan', tab: 'Game Plan' },
      { label: 'Injuries', tab: 'Injuries' },
      { label: 'Depth Chart', tab: 'Depth Chart' },
    ];
  }
  return [
    { label: 'Game Plan', tab: 'Game Plan' },
    { label: 'Roster', tab: 'Roster' },
    { label: 'Injuries', tab: 'Injuries' },
    { label: 'Trades', tab: 'Trades' },
  ];
}

function phasePriorityLabel(phase) {
  if (phase === 'offseason_resign') return 'Lock extension decisions before market opens.';
  if (phase === 'free_agency') return 'Bid early on needs and protect cap flexibility.';
  if (phase === 'draft') return 'Finalize board priorities before your pick window.';
  if (phase === 'preseason') return 'Complete cuts and lock depth roles before kickoff.';
  if (phase === 'playoffs') return 'Preserve health and optimize matchups for elimination games.';
  return 'Prepare your next game and keep the weekly loop moving.';
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
  const intel = buildTeamIntelligence(userTeam, { week });
  const contractMarket = league?.contractMarket ?? null;
  const storylineCards = buildStorylineCards(league);
  const chemistry = intel?.chemistry;

  const ownerContext = evaluateOwnerMessageContext({
    league,
    userTeam,
    currentWeek: week,
    currentSeason: league?.year,
  });

  const pressure = deriveFranchisePressure(league, { intel, direction, ownerContext });

  const urgent = [];

  if (ownerContext?.pressureState === 'urgent_demand') {
    urgent.push({ tone: 'danger', level: 'blocker', rank: 100, label: 'Owner Directive', detail: ownerContext.message, why: 'Ignoring this can rapidly damage job security.', tab: '🤖 GM Advisor' });
  } else if (ownerContext?.pressureState === 'warning') {
    urgent.push({ tone: 'warning', level: 'recommendation', rank: 80, label: 'Owner Pressure', detail: ownerContext.message, why: 'Owner sentiment influences franchise stability.', tab: '🤖 GM Advisor' });
  }

  if (streak?.type === 'L' && streak.count >= 3) {
    urgent.push({ tone: 'danger', level: 'recommendation', rank: 75, label: `Slide Alert (${streak.type}${streak.count})`, detail: 'Results are slipping. Adjust depth chart, scheme, or personnel.', why: 'Another loss can shift season direction.', tab: 'Game Plan' });
  }

  if (injuries.length >= 2) {
    urgent.push({ tone: injuries.length >= 4 ? 'danger' : 'warning', level: injuries.length >= 4 ? 'blocker' : 'recommendation', rank: injuries.length >= 4 ? 95 : 65, label: 'Injury Depth Risk', detail: `${injuries.length} active injuries are stressing depth.`, why: 'Depth decisions directly impact next game performance.', tab: 'Injuries' });
  }

  if (incomingOffers.length > 0) {
    urgent.push({ tone: 'info', level: 'recommendation', rank: 62, label: 'Trade Calls Waiting', detail: `${incomingOffers.length} incoming offer${incomingOffers.length > 1 ? 's' : ''} in your inbox.`, why: 'Active offers can improve cap flexibility or fill needs fast.', tab: 'Trades' });
  }

  if (capRoom >= 28 && direction !== 'rebuilding') {
    urgent.push({ tone: 'warning', level: 'recommendation', rank: 60, label: 'Cap Flex Unused', detail: `You still have $${capRoom.toFixed(1)}M in space.`, why: 'Unused cap in contention windows can waste roster opportunity.', tab: '💰 Cap' });
  }

  if (expiring.length >= 5 && week >= 8) {
    urgent.push({ tone: 'info', level: 'recommendation', rank: 58, label: 'Contract Clock', detail: `${expiring.length} rotation players are expiring.`, why: 'Delays increase free-agency replacement pressure.', tab: 'Financials' });
  }

  if (chemistry?.state === 'Fragmented' || chemistry?.state === 'Uneasy') {
    urgent.push({
      tone: chemistry.state === 'Fragmented' ? 'danger' : 'warning',
      level: 'recommendation',
      rank: chemistry.state === 'Fragmented' ? 84 : 66,
      label: 'Locker-room chemistry',
      detail: `${chemistry.state}: ${chemistry.reasons?.[0] ?? 'morale and role tension need attention'}.`,
      why: 'Chemistry influences consistency, free-agency appeal, and media pressure.',
      tab: 'Roster',
    });
  }

  if ((intel?.warnings ?? []).length > 0) {
    urgent.push({
      tone: 'warning',
      level: 'recommendation',
      rank: 74,
      label: 'Roster pressure point',
      detail: intel.warnings[0],
      why: 'Ignoring roster pressure points increases emergency spending later.',
      tab: 'Roster',
    });
  }

  const ownerContractPressure = ownerContext?.key?.includes('expiring_core_ignored');
  if ((contractMarket?.priorityExpiring ?? 0) >= 2 && !ownerContractPressure) {
    urgent.push({
      tone: 'warning',
      level: 'recommendation',
      rank: 70,
      label: 'Priority Expiring Starters',
      detail: `${contractMarket.priorityExpiring} key contracts need action soon.`,
      why: 'Losing core starters can force expensive replacements.',
      tab: 'Financials',
    });
  }
  if ((contractMarket?.bidRiskCount ?? 0) >= 1) {
    urgent.push({
      tone: 'danger',
      level: 'blocker',
      rank: 88,
      label: 'Bid Risk',
      detail: `${contractMarket.bidRiskCount} active bid${contractMarket.bidRiskCount > 1 ? 's are' : ' is'} at risk.`,
      why: 'Targets may sign elsewhere within the current window.',
      tab: 'FA Hub',
    });
  }
  if ((contractMarket?.closeToDecisionCount ?? 0) >= 1) {
    urgent.push({
      tone: 'warning',
      level: 'recommendation',
      rank: 76,
      label: 'Decision Window',
      detail: `${contractMarket.closeToDecisionCount} target${contractMarket.closeToDecisionCount > 1 ? 's are' : ' is'} close to deciding.`,
      why: 'This is the final chance to improve your offer.',
      tab: 'Free Agency',
    });
  } else if ((contractMarket?.likelyToTest ?? 0) >= 2) {
    urgent.push({
      tone: 'info',
      level: 'recommendation',
      rank: 50,
      label: 'Testing Market Risk',
      detail: `${contractMarket.likelyToTest} players are likely to test free agency.`,
      why: 'Market competition usually increases replacement cost.',
      tab: 'Financials',
    });
  }


  if (pressure?.media?.reasons?.[0]) {
    urgent.push({ tone: pressure.media.score >= 76 ? 'danger' : 'warning', level: 'recommendation', rank: pressure.media.score >= 76 ? 90 : 68, label: 'Media Temperature', detail: pressure.media.reasons[0], why: 'Narrative heat can increase scrutiny on every decision.', tab: 'News' });
  }

  if (pressure?.fans?.reasons?.[0]) {
    urgent.push({ tone: pressure.fans.score < 45 ? 'warning' : 'info', level: 'recommendation', rank: 64, label: 'Fan Sentiment', detail: pressure.fans.reasons[0], why: 'Fan mood affects franchise momentum and owner confidence.', tab: 'News' });
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
  const directionGuidance = buildDirectionGuidance(intel);

  const rankedUrgent = urgent
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, 6);

  return {
    week,
    direction,
    ownerContext,
    incomingOffers,
    focus,
    advisorPulse,
    directionGuidance,
    teamIntel: intel,
    urgentItems: rankedUrgent,
    topPriorities: rankedUrgent.slice(0, 3),
    phasePriority: phasePriorityLabel(league?.phase),
    phaseShortcuts: mapPhaseShortcuts(league?.phase),
    marketSummary: {
      bidRiskCount: Number(contractMarket?.bidRiskCount ?? 0),
      closeToDecisionCount: Number(contractMarket?.closeToDecisionCount ?? 0),
      likelyToTest: Number(contractMarket?.likelyToTest ?? 0),
      coolingCount: Number(contractMarket?.coolingCount ?? 0),
      heatingCount: Number(contractMarket?.heatingCount ?? 0),
      hotPositions: Array.isArray(contractMarket?.hotPositions) ? contractMarket.hotPositions : [],
    },
    storylineCards,
    pressure,
    chemistry,
    pressurePoints: {
      ownerApproval: safeNum(league?.ownerApproval ?? league?.ownerMood, null),
      ownerState: pressure?.owner?.state ?? null,
      fanState: pressure?.fans?.state ?? null,
      mediaState: pressure?.media?.state ?? null,
      capRoom,
      expiringCount: expiring.length,
      injuriesCount: injuries.length,
      incomingTradeCount: incomingOffers.length,
      nextMilestone: league?.phase === 'playoffs'
        ? 'Survive and advance'
        : league?.phase === 'draft'
          ? 'Next draft pick window'
          : league?.phase === 'free_agency'
            ? 'Current free-agency bid cycle'
            : league?.phase === 'offseason_resign'
              ? 'Re-signing window closes soon'
              : `Week ${week + 1}`,
    },
    marketPulse: (contractMarket?.bidRiskCount ?? 0) > 0
      ? `${contractMarket.bidRiskCount} contract market${contractMarket.bidRiskCount > 1 ? 's are' : ' is'} heating up against your bids.`
      : (contractMarket?.closeToDecisionCount ?? 0) > 0
        ? `${contractMarket.closeToDecisionCount} target${contractMarket.closeToDecisionCount > 1 ? 's are' : ' is'} nearing a decision.`
        : contractMarket?.hotPositions?.length
      ? `Market heating up at ${contractMarket.hotPositions.map((p) => p.pos).join(', ')}.`
      : incomingOffers[0]?.reason ?? (week >= 10 ? 'Deadline pressure is rising across the league.' : 'Market is active but selective.'),
  };
}
