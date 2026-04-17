import React, { useMemo } from 'react';

function asPercent(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${Math.round(n * 100)}%`;
}

function asClock(clockSec: unknown) {
  const n = Number(clockSec);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, n);
  const min = Math.floor(clamped / 60);
  const sec = clamped % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function compareWinner(awayRaw: unknown, homeRaw: unknown) {
  const awayNum = Number(awayRaw);
  const homeNum = Number(homeRaw);
  if (!Number.isFinite(awayNum) || !Number.isFinite(homeNum) || awayNum === homeNum) {
    return { awayWins: false, homeWins: false };
  }
  return { awayWins: awayNum > homeNum, homeWins: homeNum > awayNum };
}

function TacticalBar({ label, awayValue, homeValue, awayRaw, homeRaw }: {
  label: string;
  awayValue: string | number;
  homeValue: string | number;
  awayRaw: unknown;
  homeRaw: unknown;
}) {
  const awayNum = Number(awayRaw);
  const homeNum = Number(homeRaw);
  const total = Math.max(awayNum + homeNum, 1);
  const awayWidth = Number.isFinite(awayNum) ? `${Math.max((awayNum / total) * 100, 4)}%` : '50%';
  const homeWidth = Number.isFinite(homeNum) ? `${Math.max((homeNum / total) * 100, 4)}%` : '50%';
  const winners = compareWinner(awayRaw, homeRaw);

  return (
    <div className="gdv2-compare-row">
      <div className={winners.awayWins ? 'gdv2-compare-value is-winner' : 'gdv2-compare-value'}>{awayValue}</div>
      <div className="gdv2-compare-center">
        <div className="gdv2-compare-label">{label}</div>
        <div className="gdv2-bar-track" aria-hidden>
          <div className="gdv2-bar-away" style={{ width: awayWidth }} />
          <div className="gdv2-bar-home" style={{ width: homeWidth }} />
        </div>
      </div>
      <div className={winners.homeWins ? 'gdv2-compare-value is-winner' : 'gdv2-compare-value'}>{homeValue}</div>
    </div>
  );
}

export default function GameDetailV2({ game, awayTeam, homeTeam }: { game: any; awayTeam: any; homeTeam: any; }) {
  const digest = useMemo(() => (Array.isArray(game?.eventDigest) ? game.eventDigest : []), [game?.eventDigest]);

  const tacticalReasons = useMemo(() => {
    const reasons = [game?.topReason1, game?.topReason2, game?.summary?.topReason1, game?.summary?.topReason2].filter(Boolean);
    return Array.from(new Set(reasons));
  }, [game]);

  const headlineMoments = useMemo(() => (Array.isArray(game?.summary?.headlineMoments) ? game.summary.headlineMoments : []), [game?.summary?.headlineMoments]);

  const driveStats = useMemo(() => {
    const root = game?.teamDriveStats ?? game?.summary?.teamStats;
    if (root?.home || root?.away) return root;
    return null;
  }, [game]);

  const comparisonRows = useMemo(() => {
    if (!driveStats?.home || !driveStats?.away) return [];
    const rows = [
      { key: 'successRate', label: 'Success Rate', awayRaw: driveStats.away.successRate, homeRaw: driveStats.home.successRate, awayValue: asPercent(driveStats.away.successRate) ?? '—', homeValue: asPercent(driveStats.home.successRate) ?? '—' },
      { key: 'explosivePlays', label: 'Explosive Plays', awayRaw: driveStats.away.explosivePlays, homeRaw: driveStats.home.explosivePlays, awayValue: driveStats.away.explosivePlays ?? '—', homeValue: driveStats.home.explosivePlays ?? '—' },
      { key: 'redZone', label: 'Red Zone Efficiency', awayRaw: Number(driveStats.away.redZoneScores ?? 0) / Math.max(1, Number(driveStats.away.redZoneTrips ?? 0)), homeRaw: Number(driveStats.home.redZoneScores ?? 0) / Math.max(1, Number(driveStats.home.redZoneTrips ?? 0)), awayValue: `${driveStats.away.redZoneScores ?? 0}/${driveStats.away.redZoneTrips ?? 0}`, homeValue: `${driveStats.home.redZoneScores ?? 0}/${driveStats.home.redZoneTrips ?? 0}` },
      { key: 'passYd', label: 'Pass Yards', awayRaw: driveStats.away.passYd, homeRaw: driveStats.home.passYd, awayValue: driveStats.away.passYd ?? '—', homeValue: driveStats.home.passYd ?? '—' },
      { key: 'rushYd', label: 'Rush Yards', awayRaw: driveStats.away.rushYd, homeRaw: driveStats.home.rushYd, awayValue: driveStats.away.rushYd ?? '—', homeValue: driveStats.home.rushYd ?? '—' },
      { key: 'plays', label: 'Total Plays', awayRaw: driveStats.away.plays, homeRaw: driveStats.home.plays, awayValue: driveStats.away.plays ?? '—', homeValue: driveStats.home.plays ?? '—' },
      { key: 'turnovers', label: 'Turnovers Forced', awayRaw: Number(driveStats.home.turnovers ?? 0), homeRaw: Number(driveStats.away.turnovers ?? 0), awayValue: driveStats.away.turnovers ?? '—', homeValue: driveStats.home.turnovers ?? '—' },
      { key: 'sacksMade', label: 'Sacks', awayRaw: driveStats.away.sacksMade, homeRaw: driveStats.home.sacksMade, awayValue: driveStats.away.sacksMade ?? '—', homeValue: driveStats.home.sacksMade ?? '—' },
    ];
    return rows.filter((row) => row.awayRaw != null || row.homeRaw != null);
  }, [driveStats]);

  const flowStory = useMemo(() => {
    const notes: string[] = [];
    const add = (line?: string | null) => {
      if (!line || notes.includes(line)) return;
      notes.push(line);
    };
    const abbrFor = (side: 'away' | 'home') => (side === 'away' ? awayTeam?.abbr ?? 'Away' : homeTeam?.abbr ?? 'Home');

    const biggestSwing = [...digest]
      .map((item, idx) => ({ item, idx, swing: Math.abs(Number(item?.winProbSwing ?? item?.leverage ?? 0)) }))
      .sort((a, b) => b.swing - a.swing || b.idx - a.idx)[0];
    if (biggestSwing?.swing && biggestSwing.swing > 0) {
      const swingPct = `${Math.round(biggestSwing.swing * 100)}%`;
      const team = biggestSwing.item?.team === 'away' || biggestSwing.item?.team === 'home'
        ? abbrFor(biggestSwing.item.team)
        : 'Neutral';
      add(`Biggest swing: ${team} generated a ${swingPct} leverage moment in Q${biggestSwing.item?.quarter ?? '—'}.`);
    } else if (digest.length) {
      add(`Biggest swing: ${digest[digest.length - 1]?.text ?? 'late-game leverage shifted with one key play.'}`);
    }

    if (driveStats?.away || driveStats?.home) {
      const awayExplosive = Number(driveStats?.away?.explosivePlays ?? 0);
      const homeExplosive = Number(driveStats?.home?.explosivePlays ?? 0);
      if (awayExplosive !== homeExplosive) {
        const winner = awayExplosive > homeExplosive ? 'away' : 'home';
        add(`${abbrFor(winner)} won the explosives battle (${Math.max(awayExplosive, homeExplosive)} vs ${Math.min(awayExplosive, homeExplosive)}).`);
      }

      const awayTurnovers = Number(driveStats?.away?.turnovers ?? 0);
      const homeTurnovers = Number(driveStats?.home?.turnovers ?? 0);
      if (awayTurnovers !== homeTurnovers) {
        const cleanerSide = awayTurnovers < homeTurnovers ? 'away' : 'home';
        add(`${abbrFor(cleanerSide)} protected the ball better and finished cleaner in turnover sequences.`);
      }

      const awayRzTrips = Number(driveStats?.away?.redZoneTrips ?? 0);
      const homeRzTrips = Number(driveStats?.home?.redZoneTrips ?? 0);
      if (awayRzTrips > 0 || homeRzTrips > 0) {
        const awayRzRate = Number(driveStats?.away?.redZoneScores ?? 0) / Math.max(1, awayRzTrips);
        const homeRzRate = Number(driveStats?.home?.redZoneScores ?? 0) / Math.max(1, homeRzTrips);
        if (awayRzRate !== homeRzRate) {
          const winner = awayRzRate > homeRzRate ? 'away' : 'home';
          add(`Red-zone finishing tilted to ${abbrFor(winner)} (${Math.round(Math.max(awayRzRate, homeRzRate) * 100)}%).`);
        }
      }
    }

    const decidingStretch = [...digest]
      .filter((item) => item?.isScore || item?.type === 'turnover' || item?.turnover)
      .slice(-2);
    if (decidingStretch.length) {
      const summary = decidingStretch
        .map((item) => `Q${item?.quarter ?? '—'} ${item?.text ?? 'key play'}`)
        .join(' → ');
      add(`Deciding stretch: ${summary}`);
    }

    return notes.slice(0, 5);
  }, [digest, driveStats, awayTeam?.abbr, homeTeam?.abbr]);

  const hasRecapData = digest.length > 0 || tacticalReasons.length > 0 || headlineMoments.length > 0 || comparisonRows.length > 0 || flowStory.length > 0;
  if (!hasRecapData) return null;

  return (
    <section className="bs-section" data-testid="tactical-recap-v2">
      <h4>Tactical recap</h4>

      {tacticalReasons.length ? <div className="gdv2-reason-list">{tacticalReasons.map((reason) => <div key={reason} className="gdv2-reason">{reason}</div>)}</div> : null}
      {headlineMoments.length ? <div className="gdv2-headlines">{headlineMoments.map((moment, idx) => <div key={`headline-${idx}`} className="gdv2-headline-item">{moment}</div>)}</div> : null}

      {digest.length ? (
        <div className="gdv2-play-feed">
          {digest.map((item: any, idx: number) => (
            <div key={`digest-${idx}`} className="gdv2-play-item">
              <div className="gdv2-play-meta">
                <span>Q{item?.quarter ?? '—'}</span>
                <span>{asClock(item?.clockSec) ?? item?.clock ?? '—'}</span>
                <span>{item?.team === 'home' ? homeTeam?.abbr : item?.team === 'away' ? awayTeam?.abbr : 'NEU'}</span>
                <span>{item?.type ? String(item.type).replaceAll('_', ' ') : 'event'}</span>
              </div>
              <div>{item?.text ?? 'Key game event.'}</div>
              <div className="gdv2-play-score">{item?.awayScore ?? game?.awayScore ?? '—'} - {item?.homeScore ?? game?.homeScore ?? '—'}</div>
            </div>
          ))}
        </div>
      ) : null}

      {flowStory.length ? (
        <div className="bs-storylines-box" data-testid="game-flow-momentum">
          <h5>Game flow &amp; momentum</h5>
          <ul className="bs-list">
            {flowStory.map((line, idx) => <li key={`flow-${idx}`} className="bs-list-item">{line}</li>)}
          </ul>
        </div>
      ) : null}

      {comparisonRows.length ? <div className="gdv2-compare-grid">{comparisonRows.map((row) => <TacticalBar key={row.key} label={row.label} awayValue={row.awayValue} homeValue={row.homeValue} awayRaw={row.awayRaw} homeRaw={row.homeRaw} />)}</div> : null}
    </section>
  );
}
