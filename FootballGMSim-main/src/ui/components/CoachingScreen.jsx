import React from 'react';

const OFFENSIVE_SCHEMES = ['Air Raid', 'West Coast', 'Run Heavy', 'Spread', 'Pro Style'];
const DEFENSIVE_SCHEMES = ['4-3', '3-4', 'Cover 2', 'Man Press', 'Zone Blitz'];

const FIT = {
  QB: ['Air Raid', 'Spread'], RB: ['Run Heavy', 'Pro Style'], WR: ['Air Raid', 'West Coast'], TE: ['Pro Style', 'West Coast'], OL: ['Run Heavy', 'Pro Style'],
  DL: ['4-3', 'Zone Blitz'], LB: ['3-4', 'Zone Blitz'], CB: ['Man Press', 'Cover 2'], S: ['Cover 2', 'Zone Blitz'],
};

export default function CoachingScreen({ league }) {
  const userTeam = (Array.isArray(league?.teams) ? league?.teams : []).find((t) => t?.id === league?.userTeamId) ?? {};
  const roster = Array.isArray(userTeam?.roster) ? userTeam?.roster : [];
  const offScheme = userTeam?.offScheme ?? 'Pro Style';
  const defScheme = userTeam?.defScheme ?? '4-3';
  const staff = userTeam?.coachingStaff ?? {
    headCoach: { name: 'Interim HC', offenseMind: 70, defenseMind: 70, morale: 75 },
    offCoord: { name: 'Interim OC', scheme: offScheme, rating: 70 },
    defCoord: { name: 'Interim DC', scheme: defScheme, rating: 70 },
  };

  const fitCounts = roster.reduce((acc, p) => {
    const pref = FIT[p?.pos] ?? [];
    const scheme = ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p?.pos) ? offScheme : defScheme;
    if (pref.includes(scheme)) acc.good += 1;
    else acc.bad += 1;
    return acc;
  }, { good: 0, bad: 0 });

  return <div className="card-premium" style={{ padding: 16 }}>
    <h3>Coaching Staff</h3>
    <div>HC: {staff?.headCoach?.name} ({staff?.headCoach?.offenseMind}/{staff?.headCoach?.defenseMind}) morale {staff?.headCoach?.morale}</div>
    <div>OC: {staff?.offCoord?.name} · {staff?.offCoord?.scheme} · {staff?.offCoord?.rating}</div>
    <div>DC: {staff?.defCoord?.name} · {staff?.defCoord?.scheme} · {staff?.defCoord?.rating}</div>
    <div style={{ marginTop: 8 }}>
      Offensive Scheme: <select defaultValue={offScheme}>{OFFENSIVE_SCHEMES.map((s) => <option key={s}>{s}</option>)}</select>
    </div>
    <div>
      Defensive Scheme: <select defaultValue={defScheme}>{DEFENSIVE_SCHEMES.map((s) => <option key={s}>{s}</option>)}</select>
    </div>
    <div style={{ marginTop: 8 }}>Fit impact: {fitCounts.good} players benefit, {fitCounts.bad} players mismatched</div>
  </div>;
}
