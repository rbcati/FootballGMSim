import React, { useMemo, useState, useEffect } from 'react';
import Scorebug from './Scorebug/Scorebug.jsx';
import GameEventFeed from './GameEventFeed/GameEventFeed.jsx';
import { mapArchiveEventsToLiveFeed, getNextImportantEvent } from '../../core/liveGame/liveGameEvents.js';
import { getCurrentStandoutPlayers, summarizeGameSwing } from '../utils/liveGamePresentation.js';

const SPEED_STEPS = [
  { key: 'slow', label: 'Slow', ms: 1400 },
  { key: 'normal', label: 'Normal', ms: 850 },
  { key: 'fast', label: 'Fast', ms: 350 },
  { key: 'veryFast', label: 'Very Fast', ms: 140 },
];

export default function LiveGameViewer({ logs = [], homeTeam, awayTeam, onComplete, initialMode = 'watch', onPlaycallOverride }) {
  const events = useMemo(() => mapArchiveEventsToLiveFeed(logs, {
    gameId: `${homeTeam?.id || 'h'}-${awayTeam?.id || 'a'}`,
    homeTeamId: homeTeam?.id,
    awayTeamId: awayTeam?.id,
  }), [logs, homeTeam?.id, awayTeam?.id]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(initialMode === 'pause');
  const [speed, setSpeed] = useState(initialMode === 'fast' ? 'fast' : 'normal');
  const [lastLeadTeamId, setLastLeadTeamId] = useState(null);
  const [momentBanner, setMomentBanner] = useState(null);

  useEffect(() => {
    if (initialMode === 'instant') {
      setIndex(Math.max(0, events.length - 1));
      setPaused(true);
    } else if (initialMode === 'fast') {
      setSpeed('veryFast');
      setPaused(false);
    }
  }, [initialMode, events.length]);

  useEffect(() => {
    if (paused || index >= events.length - 1) return;
    const delay = SPEED_STEPS.find((step) => step.key === speed)?.ms ?? 850;
    const timer = setTimeout(() => setIndex((prev) => Math.min(events.length - 1, prev + 1)), delay);
    return () => clearTimeout(timer);
  }, [paused, speed, index, events.length]);

  const currentEvent = events[index] || {};
  const standout = useMemo(() => getCurrentStandoutPlayers(events, index + 1), [events, index]);
  const swing = useMemo(() => summarizeGameSwing(events, index + 1), [events, index]);

  const scoreState = {
    score: currentEvent.score || { home: 0, away: 0 },
    quarter: currentEvent.quarter || 1,
    clock: currentEvent.clock || '15:00',
    downDistance: currentEvent.down ? `${currentEvent.down}${ordinal(currentEvent.down)} & ${currentEvent.distance || 10}` : 'Drive update',
    ballSpot: currentEvent.fieldPosition != null ? `Ball on ${Math.round(Number(currentEvent.fieldPosition) || 50)}` : 'Ball spot --',
    fieldPosition: currentEvent.fieldPosition,
    possessionTeamId: currentEvent.possessionTeamId,
  };
  const leadTeamId = scoreState.score.home === scoreState.score.away
    ? null
    : scoreState.score.home > scoreState.score.away ? homeTeam?.id : awayTeam?.id;
  const isFinalMinutes = Number(scoreState.quarter) >= 4 && /^([0-4]):/.test(String(scoreState.clock || ''));

  const finished = index >= events.length - 1;
  const modeLabel = paused ? 'Paused' : `Watch · ${SPEED_STEPS.find((step) => step.key === speed)?.label ?? 'Normal'}`;

  useEffect(() => {
    if (!currentEvent?.eventType) return;
    if (leadTeamId != null && lastLeadTeamId != null && leadTeamId !== lastLeadTeamId) {
      setMomentBanner({ type: 'lead', text: `Lead Change · ${leadTeamId === homeTeam?.id ? homeTeam?.abbr : awayTeam?.abbr} in front` });
    } else if (currentEvent.eventType === 'touchdown') {
      setMomentBanner({ type: 'score', text: 'Touchdown' });
    } else if (currentEvent.eventType === 'field_goal') {
      setMomentBanner({ type: 'score', text: 'Field Goal' });
    } else if (currentEvent.eventType === 'turnover') {
      setMomentBanner({ type: 'turnover', text: 'Turnover' });
    } else if (currentEvent.eventType === 'game_end') {
      setMomentBanner({ type: 'final', text: 'Final Whistle' });
    } else {
      setMomentBanner(null);
    }
    setLastLeadTeamId(leadTeamId);
  }, [currentEvent?.eventType, leadTeamId, lastLeadTeamId, homeTeam?.abbr, homeTeam?.id, awayTeam?.abbr, awayTeam?.id]);

  return (
    <div className="watch-overlay">
      <style>{styles}</style>
      <header className="watch-header">
        <Scorebug homeTeam={homeTeam} awayTeam={awayTeam} state={scoreState} />
        <div className="watch-state-strip">
          <span className="watch-mode-chip">{modeLabel}</span>
          {isFinalMinutes ? <span className="watch-mode-chip clutch">Final Minutes</span> : null}
          {finished ? <span className="watch-mode-chip final">Complete</span> : null}
        </div>
        {momentBanner ? <div className={`watch-moment-banner ${momentBanner.type}`}>{momentBanner.text}</div> : null}
      </header>

      <main className="watch-main">
        <section className="watch-panel">
          <div className={`momentum ${swing.tone}`}>Momentum: {swing.label}</div>
          <div className="jump-row">
            <JumpBtn label="Scoring Plays" onClick={() => setIndex(getNextImportantEvent(events, index, 'score'))} />
            <JumpBtn label="Red Zone" onClick={() => setIndex(getNextImportantEvent(events, index, 'redZone'))} />
            <JumpBtn label="Turnovers" onClick={() => setIndex(getNextImportantEvent(events, index, 'turnover'))} />
            <JumpBtn label="Final Minutes" onClick={() => setIndex(getNextImportantEvent(events, index, 'finalMinutes'))} />
            <JumpBtn label="End" onClick={() => setIndex(events.length - 1)} />
          </div>
          <GameEventFeed events={events} activeIndex={index} />
        </section>

        <aside className="watch-side">
          <h3>Standouts</h3>
          <ul>
            <li>QB: {formatQb(standout.qb)}</li>
            <li>Rush: {formatRush(standout.rusher)}</li>
            <li>Rec: {formatRec(standout.receiver)}</li>
            <li>Sacks: {standout.sacks ? `${standout.sacks.player} (${standout.sacks.sacks})` : '—'}</li>
            <li>INT: {standout.picks ? `${standout.picks.player} (${standout.picks.picks})` : '—'}</li>
          </ul>
          <div className="controls">
            <button onClick={() => setPaused((prev) => !prev)}>{paused ? 'Resume' : 'Pause'}</button>
            {SPEED_STEPS.map((step) => (
              <button key={step.key} className={speed === step.key ? 'active' : ''} onClick={() => { setSpeed(step.key); setPaused(false); }}>{step.label}</button>
            ))}
            <button title="Lean run on next drive." onClick={() => onPlaycallOverride?.({ type: 'run_heavy' })}>Run Heavy</button>
            <button title="Lean pass on next drive." onClick={() => onPlaycallOverride?.({ type: 'pass_heavy' })}>Pass Heavy</button>
            <button title="Request a timeout for your team." onClick={() => onPlaycallOverride?.({ type: 'timeout' })}>Timeout</button>
            <button onClick={() => setIndex(getNextImportantEvent(events, index, 'score'))}>Skip to Next Score</button>
            <button onClick={() => setIndex(getNextImportantEvent(events, index, 'keyPlay'))}>Skip to Key Play</button>
            <button onClick={() => setIndex(events.length - 1)}>Sim to End</button>
          </div>
          {finished ? (
            <div className="watch-final-card">
              <div className="watch-final-label">Final</div>
              <div className="watch-final-score">
                <span>{awayTeam?.abbr || 'AWY'} {scoreState.score.away}</span>
                <span>{homeTeam?.abbr || 'HME'} {scoreState.score.home}</span>
              </div>
              <button className="finish" onClick={() => onComplete?.({ homeScore: scoreState.score.home, awayScore: scoreState.score.away })}>Open Final Game Book</button>
            </div>
          ) : null}
        </aside>
      </main>
    </div>
  );
}

function JumpBtn({ label, onClick }) {
  return <button className="jump-btn" onClick={onClick}>{label}</button>;
}

function ordinal(n) {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}

function formatQb(v) { return v ? `${v.player} ${v.comp}/${v.att} ${v.yds}y ${v.td}TD` : '—'; }
function formatRush(v) { return v ? `${v.player} ${v.yds}y (${v.att} att)` : '—'; }
function formatRec(v) { return v ? `${v.player} ${v.rec} rec, ${v.yds}y` : '—'; }

const styles = `
.watch-overlay { position: fixed; inset: 0; background: #071021; color: #f3f6ff; z-index: 7000; display:flex; flex-direction:column; }
.watch-header { position: sticky; top: 0; z-index: 2; padding: 10px; background: #071021; border-bottom: 1px solid #253149; }
.watch-state-strip { display:flex; align-items:center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.watch-mode-chip { font-size: 11px; border-radius: 999px; padding: 3px 9px; border: 1px solid #3d4d6d; background: #12213b; color: #d9e7ff; }
.watch-mode-chip.clutch { border-color: #d6a94f; color: #ffd88f; }
.watch-mode-chip.final { border-color: #56b58a; color: #91f0c3; }
.watch-moment-banner { margin-top: 8px; font-size: 12px; font-weight: 800; border-radius: 9px; padding: 7px 10px; letter-spacing: .01em; }
.watch-moment-banner.score { background: rgba(95, 190, 130, 0.22); color: #b8f5cb; border: 1px solid rgba(95, 190, 130, 0.45); }
.watch-moment-banner.turnover { background: rgba(255, 95, 95, 0.2); color: #ffd1d1; border: 1px solid rgba(255, 95, 95, 0.45); }
.watch-moment-banner.lead { background: rgba(124, 196, 255, 0.2); color: #d5ebff; border: 1px solid rgba(124, 196, 255, 0.45); }
.watch-moment-banner.final { background: rgba(255, 215, 100, 0.2); color: #ffeec6; border: 1px solid rgba(255, 215, 100, 0.5); }
.live-scorebug { display:grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items:center; }
.sb-team { display:flex; justify-content:space-between; align-items:center; background:#111c33; border:1px solid #30405f; padding:8px 10px; border-radius:10px; }
.sb-team.has-ball { border-color:#fbbf24; box-shadow: inset 0 0 0 1px #fbbf24; }
.sb-center { text-align:center; font-size:12px; color:#d0dbf5; }
.sb-flags { display:flex; justify-content:center; gap:4px; margin-top:4px; flex-wrap:wrap; }
.sb-flag { font-size: 9px; font-weight: 800; letter-spacing: .05em; border-radius: 999px; padding: 2px 6px; background: #1c2f4d; border: 1px solid #3d5b88; }
.sb-flag.redzone { border-color: #8a3e3e; background: #3c1d28; color: #ffb9b9; }
.sb-flag.clutch { border-color: #8f6f2b; background: #3a2f18; color: #ffe4a3; }
.sb-flag.overtime { border-color: #5377b0; background: #1c335d; color: #c6ddff; }
.watch-main { display:grid; grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 10px; height: 100%; overflow: hidden; }
.watch-panel, .watch-side { background:#0f172b; border:1px solid #2d3a55; border-radius:12px; padding:10px; overflow:auto; }
.momentum { font-size:12px; margin-bottom:8px; padding:6px 8px; border-radius:8px; font-weight:700; }
.momentum.offense { background:#173b2f; } .momentum.defense { background:#3d2527; } .momentum.swing { background:#3b2f18; } .momentum.neutral { background:#253149; }
.jump-row { display:flex; gap:6px; overflow:auto; padding-bottom:6px; }
.jump-btn { white-space:nowrap; background:#182741; color:#d8e6ff; border:1px solid #37527d; border-radius:999px; padding:6px 10px; font-size:12px; }
.live-feed { display:grid; gap:8px; }
.feed-quarter-marker { font-size: 10px; color: #90a7cf; text-transform: uppercase; letter-spacing: .08em; border-top: 1px dashed #334866; padding-top: 8px; margin-top: 2px; }
.feed-row { display:grid; grid-template-columns:auto 1fr; gap:8px; border-left:2px solid #344766; padding:6px 0 6px 8px; border-radius: 8px; }
.feed-row.routine { background: rgba(18,31,53,0.4); }
.feed-row.major { background: rgba(33,54,88,0.62); border-left-color: #6ca3df; }
.feed-row.latest { border-left-color:#7cc4ff; background:#13213a; box-shadow: inset 0 0 0 1px rgba(124, 196, 255, 0.2); }
.feed-time { font-size:11px; color:#9fb4d8; }
.feed-headline { font-size:13px; font-weight: 600; }
.feed-meta { display:flex; gap:6px; flex-wrap:wrap; font-size:11px; color:#9fb4d8; }
.feed-score { font-weight: 700; color: #d8e8ff; }
.feed-tag { background:#1b2f4f; border:1px solid #415d89; border-radius:999px; padding:1px 6px; }
.watch-side ul { margin: 0; padding-left: 16px; display:grid; gap:4px; }
.controls { display:grid; gap:6px; margin-top:10px; }
.controls button, .finish { background:#1c2e4d; color:white; border:1px solid #456596; border-radius:8px; padding:8px; }
.controls .active { border-color:#7cc4ff; }
.watch-final-card { border: 1px solid #3d5378; border-radius: 10px; margin-top: 12px; padding: 10px; background: #13203a; }
.watch-final-label { text-transform: uppercase; font-size: 11px; letter-spacing: .08em; color: #98b4dd; margin-bottom: 4px; }
.watch-final-score { display:flex; flex-direction: column; gap:4px; font-size: 15px; font-weight: 800; color: #ecf4ff; }
.finish { margin-top:10px; width:100%; background:#1d4ed8; font-weight: 800; }
@media (min-width: 960px) { .watch-main { grid-template-columns: 2fr 1fr; } }
`;
