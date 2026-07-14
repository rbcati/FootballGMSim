import React, { useMemo, useState, useEffect } from 'react';
import Scorebug from './Scorebug/Scorebug.jsx';
import GameEventFeed from './GameEventFeed/GameEventFeed.jsx';
import { mapArchiveEventsToLiveFeed, getNextImportantEvent } from '../../core/liveGame/liveGameEvents.js';
import { readStrictFinalScore } from '../../core/gameArchive.js';
import { getCurrentStandoutPlayers, summarizeGameSwing } from '../utils/liveGamePresentation.js';

const SPEED_STEPS = [
  { key: 'slow',     label: 'Slow',      ms: 1400 },
  { key: 'normal',   label: 'Normal',    ms: 850  },
  { key: 'fast',     label: 'Fast',      ms: 350  },
  { key: 'veryFast', label: '2×',        ms: 140  },
];

const TENDENCY_CONFIG = {
  AGGRESSIVE:   { label: 'Aggressive',   chipClass: 'aggressive'   },
  BALANCED:     { label: 'Balanced',     chipClass: 'balanced'     },
  CONSERVATIVE: { label: 'Conservative', chipClass: 'conservative' },
};

export default function LiveGameViewer({ logs = [], homeTeam, awayTeam, onComplete, initialMode = 'watch', onPlaycallOverride, userTendency = 'BALANCED', finalScore = null }) {
  // Canonical final: the league-recorded result (GAME_EVENT payload). The
  // narrated play stream is a separate engine whose running score can
  // contradict it, so this is the only score the viewer will ever display.
  const canonicalFinal = useMemo(() => {
    return readStrictFinalScore({ score: finalScore });
  }, [finalScore]);

  const events = useMemo(() => mapArchiveEventsToLiveFeed(logs, {
    gameId: `${homeTeam?.id || 'h'}-${awayTeam?.id || 'a'}`,
    homeTeamId: homeTeam?.id,
    awayTeamId: awayTeam?.id,
    finalScore: canonicalFinal,
  }), [logs, homeTeam?.id, awayTeam?.id, canonicalFinal]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(initialMode === 'pause');
  const [speed, setSpeed] = useState(initialMode === 'fast' ? 'fast' : 'normal');
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

  const finished = index >= events.length - 1;
  // Scores shown only once the canonical final is in play — never the narrated
  // per-play snapshots, which belong to a different scoring engine.
  const displayScore = finished && canonicalFinal ? canonicalFinal : null;

  const scoreState = {
    score: displayScore,
    quarter: currentEvent.quarter || 1,
    // No trustworthy per-play clock exists (drive-granular estimates only) —
    // the scorebug shows quarter + event progress instead of a fake clock.
    clock: null,
    progressLabel: finished ? 'Final' : `Play ${Math.min(index + 1, events.length)} of ${events.length}`,
    downDistance: currentEvent.down ? `${currentEvent.down}${ordinal(currentEvent.down)} & ${currentEvent.distance || 10}` : 'Drive update',
    ballSpot: currentEvent.fieldPosition != null ? `Ball on ${Math.round(Number(currentEvent.fieldPosition) || 50)}` : 'Ball spot --',
    fieldPosition: currentEvent.fieldPosition,
    possessionTeamId: currentEvent.possessionTeamId,
    isFinal: finished,
  };
  const isLateGame = Number(scoreState.quarter) >= 4 && index >= Math.floor((events.length - 1) * 0.85);

  const modeLabel = paused ? 'Paused' : `Watch · ${SPEED_STEPS.find((step) => step.key === speed)?.label ?? 'Normal'}`;

  useEffect(() => {
    if (!currentEvent?.eventType) return;
    if (currentEvent.eventType === 'touchdown') {
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
  }, [currentEvent?.eventType]);

  const finalHomeScore = displayScore?.home ?? null;
  const finalAwayScore = displayScore?.away ?? null;

  return (
    <div className="watch-overlay">
      <style>{styles}</style>
      <header className="watch-header">
        <Scorebug homeTeam={homeTeam} awayTeam={awayTeam} state={scoreState} />
        <div className="watch-state-strip">
          <span className="watch-mode-chip">{modeLabel}</span>
          {isLateGame && !finished ? <span className="watch-mode-chip clutch">Late Game</span> : null}
          {finished ? <span className="watch-mode-chip final">Complete</span> : null}
          {(() => {
            const tc = TENDENCY_CONFIG[userTendency] || TENDENCY_CONFIG.BALANCED;
            return <span className={`watch-mode-chip tendency-${tc.chipClass}`}>{tc.label}</span>;
          })()}
        </div>
        {momentBanner ? <div className={`watch-moment-banner ${momentBanner.type}`} role="status">{momentBanner.text}</div> : null}
      </header>

      <main className="watch-main">
        <section className="watch-panel">
          <div className={`momentum ${swing.tone}`}>Momentum: {swing.label}</div>
          <div className="jump-row" role="group" aria-label="Jump to game moments">
            <JumpBtn label="Scores" onClick={() => setIndex(getNextImportantEvent(events, index, 'score'))} />
            <JumpBtn label="Red Zone" onClick={() => setIndex(getNextImportantEvent(events, index, 'redZone'))} />
            <JumpBtn label="Turnovers" onClick={() => setIndex(getNextImportantEvent(events, index, 'turnover'))} />
            <JumpBtn label="Late Game" onClick={() => setIndex(getNextImportantEvent(events, index, 'finalMinutes'))} />
            <JumpBtn label="End" onClick={() => setIndex(events.length - 1)} />
          </div>
          <GameEventFeed events={events} activeIndex={index} />
        </section>

        <aside className="watch-side">
          <details className="standout-panel" open>
            <summary className="watch-side-title">Standouts</summary>
            <ul className="standout-list">
              <li><span className="standout-pos">QB</span>{formatQb(standout.qb)}</li>
              <li><span className="standout-pos">Rush</span>{formatRush(standout.rusher)}</li>
              <li><span className="standout-pos">Rec</span>{formatRec(standout.receiver)}</li>
              <li><span className="standout-pos">Sacks</span>{standout.sacks ? `${standout.sacks.player} (${standout.sacks.sacks})` : '—'}</li>
              <li><span className="standout-pos">INT</span>{standout.picks ? `${standout.picks.player} (${standout.picks.picks})` : '—'}</li>
            </ul>
          </details>

          {finished ? (
            <div className="watch-final-card">
              <div className="watch-final-label">Final</div>
              {displayScore ? (
                <div className="watch-final-score">
                  <span>{awayTeam?.abbr || 'AWY'} {finalAwayScore}</span>
                  <span>{homeTeam?.abbr || 'HME'} {finalHomeScore}</span>
                </div>
              ) : (
                <div className="watch-final-pending" data-testid="watch-final-pending">
                  Official score is still being recorded. Game Book review unlocks after the league records both scores.
                </div>
              )}
              <button
                className="finish"
                onClick={() => onComplete?.(displayScore ? { homeScore: displayScore.home, awayScore: displayScore.away } : {})}
              >
                {displayScore ? 'Open Final Game Book' : 'Continue to recovery'}
              </button>
            </div>
          ) : null}
        </aside>
      </main>

      {/* Compact sticky control tray — one row of playback controls above the
          safe area so the feed owns the screen on mobile. */}
      <footer className="watch-controls-tray" aria-label="Playback controls">
        <button
          className="ctrl-btn pause-btn"
          onClick={() => setPaused((prev) => !prev)}
          aria-label={paused ? 'Resume playback' : 'Pause playback'}
        >
          {paused ? '▶' : '⏸'}
        </button>
        <div className="speed-row" role="group" aria-label="Playback speed">
          {SPEED_STEPS.map((step) => (
            <button
              key={step.key}
              className={`ctrl-btn${speed === step.key && !paused ? ' active' : ''}`}
              onClick={() => { setSpeed(step.key); setPaused(false); }}
              aria-pressed={speed === step.key && !paused}
            >
              {step.label}
            </button>
          ))}
        </div>
        <details className="skip-menu">
          <summary className="ctrl-btn skip-trigger" aria-label="Skip options">Skip ▾</summary>
          <div className="skip-menu-list">
            <button className="ctrl-btn" onClick={() => setIndex(getNextImportantEvent(events, index, 'score'))}>Next Score</button>
            <button className="ctrl-btn" onClick={() => setIndex(getNextImportantEvent(events, index, 'keyPlay'))}>Key Play</button>
            <button className="ctrl-btn" onClick={() => setIndex(events.length - 1)}>Sim End</button>
            {onPlaycallOverride ? (
              <>
                <button className="ctrl-btn" title="Lean run on next drive." onClick={() => onPlaycallOverride?.({ type: 'run_heavy' })}>Run Heavy</button>
                <button className="ctrl-btn" title="Lean pass on next drive." onClick={() => onPlaycallOverride?.({ type: 'pass_heavy' })}>Pass Heavy</button>
                <button className="ctrl-btn" title="Request a timeout." onClick={() => onPlaycallOverride?.({ type: 'timeout' })}>Timeout</button>
              </>
            ) : null}
          </div>
        </details>
      </footer>
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
function formatRush(v) { return v ? `${v.player} ${v.yds}y (${v.att})` : '—'; }
function formatRec(v) { return v ? `${v.player} ${v.rec} rec ${v.yds}y` : '—'; }

const styles = `
/* ── Layout ─────────────────────────────────────────────────────────── */
.watch-overlay { position:fixed; inset:0; background:#071021; color:#f3f6ff; z-index:7000; display:flex; flex-direction:column; overflow:hidden; }
.watch-header { position:sticky; top:0; z-index:2; padding:calc(6px + env(safe-area-inset-top, 0px)) 10px 6px; background:#071021; border-bottom:1px solid #253149; }
.watch-state-strip { display:flex; align-items:center; gap:5px; margin-top:5px; flex-wrap:wrap; }
.watch-main { display:grid; grid-template-columns:minmax(0,1fr); gap:8px; padding:8px; flex:1; overflow:hidden; min-height:0; }
@media (min-width:960px) { .watch-main { grid-template-columns:2fr 1fr; } }
.watch-panel, .watch-side { background:#0f172b; border:1px solid #2d3a55; border-radius:12px; padding:10px; overflow:auto; }
@media (max-width:959px) {
  /* Feed first; side rail collapses to a compact strip below it. */
  .watch-main { grid-template-rows:minmax(0,1fr) auto; }
  .watch-side { max-height:32vh; }
}

/* ── Mode chips ──────────────────────────────────────────────────────── */
.watch-mode-chip { font-size:11px; border-radius:999px; padding:3px 8px; border:1px solid #3d4d6d; background:#12213b; color:#d9e7ff; }
.watch-mode-chip.clutch { border-color:#d6a94f; color:#ffd88f; }
.watch-mode-chip.final { border-color:#56b58a; color:#91f0c3; }
.watch-mode-chip.tendency-aggressive { border-color:#ff453a; color:#ffb3b0; background:rgba(255,69,58,.15); }
.watch-mode-chip.tendency-balanced { border-color:#0a84ff; color:#a8d4ff; background:rgba(10,132,255,.12); }
.watch-mode-chip.tendency-conservative { border-color:#34c759; color:#a3f0b8; background:rgba(52,199,89,.12); }

/* ── Moment banner ───────────────────────────────────────────────────── */
.watch-moment-banner { margin-top:6px; font-size:12px; font-weight:800; border-radius:8px; padding:5px 10px; }
.watch-moment-banner.score { background:rgba(95,190,130,.22); color:#b8f5cb; border:1px solid rgba(95,190,130,.45); }
.watch-moment-banner.turnover { background:rgba(255,95,95,.2); color:#ffd1d1; border:1px solid rgba(255,95,95,.45); }
.watch-moment-banner.lead { background:rgba(124,196,255,.2); color:#d5ebff; border:1px solid rgba(124,196,255,.45); }
.watch-moment-banner.final { background:rgba(255,215,100,.2); color:#ffeec6; border:1px solid rgba(255,215,100,.5); }

/* ── Scorebug ────────────────────────────────────────────────────────── */
.live-scorebug { display:grid; grid-template-columns:1fr auto 1fr; gap:8px; align-items:center; }
.sb-team { display:flex; justify-content:space-between; align-items:center; background:#111c33; border:1px solid #30405f; padding:7px 10px; border-radius:9px; }
.sb-team.has-ball { border-color:#fbbf24; box-shadow:inset 0 0 0 1px #fbbf24; }
.sb-score-pending { color:#7d92ba; font-weight:600; letter-spacing:.08em; }
.sb-center { text-align:center; font-size:12px; color:#d0dbf5; }
.sb-flags { display:flex; justify-content:center; gap:4px; margin-top:4px; flex-wrap:wrap; }
.sb-flag { font-size:9px; font-weight:800; letter-spacing:.05em; border-radius:999px; padding:2px 6px; background:#1c2f4d; border:1px solid #3d5b88; }
.sb-flag.redzone { border-color:#8a3e3e; background:#3c1d28; color:#ffb9b9; }
.sb-flag.clutch { border-color:#8f6f2b; background:#3a2f18; color:#ffe4a3; }
.sb-flag.overtime { border-color:#5377b0; background:#1c335d; color:#c6ddff; }
.sb-flag.final { border-color:#56b58a; background:#12321f; color:#91f0c3; }

/* ── Momentum / jump row ─────────────────────────────────────────────── */
.momentum { font-size:11px; margin-bottom:7px; padding:5px 8px; border-radius:7px; font-weight:700; }
.momentum.offense { background:#173b2f; }
.momentum.defense { background:#3d2527; }
.momentum.swing { background:#3b2f18; }
.momentum.neutral { background:#253149; }
.jump-row { display:flex; gap:5px; overflow-x:auto; padding-bottom:5px; -webkit-overflow-scrolling:touch; }
.jump-btn { white-space:nowrap; background:#182741; color:#d8e6ff; border:1px solid #37527d; border-radius:999px; padding:6px 12px; font-size:11px; cursor:pointer; flex-shrink:0; min-height:32px; }

/* ── Live feed ───────────────────────────────────────────────────────── */
.live-feed { display:grid; gap:5px; }
.feed-quarter-marker { font-size:10px; color:#90a7cf; text-transform:uppercase; letter-spacing:.08em; border-top:1px dashed #334866; padding-top:6px; margin-top:2px; }
.feed-possession-divider { height:1px; background:rgba(61,77,109,.5); margin:2px 0; }
.feed-row { display:grid; grid-template-columns:42px 1fr; gap:6px; border-left:2px solid #344766; padding:5px 0 5px 7px; border-radius:6px; }
.feed-row.routine { background:rgba(18,31,53,.4); }
.feed-row.major { background:rgba(33,54,88,.62); border-left-color:#6ca3df; }
.feed-row.latest { border-left-color:#7cc4ff; background:#13213a; box-shadow:inset 0 0 0 1px rgba(124,196,255,.2); }
.feed-time { font-size:10px; color:#9fb4d8; line-height:1.3; }
.feed-clock { display:block; font-size:9px; color:#6b84aa; }
.feed-headline { font-size:13px; font-weight:600; line-height:1.35; word-break:break-word; }
.feed-meta { display:flex; gap:4px; flex-wrap:wrap; font-size:10px; margin-top:3px; align-items:center; }
.feed-score { font-weight:700; color:#d8e8ff; }
/* Impact badges */
.feed-tag { border-radius:999px; padding:1px 6px; font-size:9px; font-weight:800; letter-spacing:.04em; white-space:nowrap; }
.feed-tag-td { background:rgba(56,161,105,.25); color:#68d391; border:1px solid rgba(56,161,105,.5); }
.feed-tag-turnover { background:rgba(229,62,62,.2); color:#fc8181; border:1px solid rgba(229,62,62,.45); }
.feed-tag-sack { background:rgba(214,169,79,.2); color:#fbd38d; border:1px solid rgba(214,169,79,.4); }
.feed-tag-bigplay { background:rgba(99,179,237,.2); color:#90cdf4; border:1px solid rgba(99,179,237,.4); }
.feed-tag-redzone { background:rgba(197,48,48,.2); color:#feb2b2; border:1px solid rgba(197,48,48,.4); }
.feed-tag-clutch { background:rgba(159,122,234,.2); color:#d6bcfa; border:1px solid rgba(159,122,234,.4); }
.feed-tag-default { background:#1b2f4f; color:#a0aec0; border:1px solid #415d89; }

/* ── Standouts ───────────────────────────────────────────────────────── */
.standout-panel > summary { cursor:pointer; list-style:none; }
.standout-panel > summary::-webkit-details-marker { display:none; }
.standout-panel > summary::after { content:'▾'; margin-left:6px; color:#6a87b8; }
.standout-panel:not([open]) > summary::after { content:'▸'; }
.watch-side-title { margin:0 0 8px; font-size:13px; font-weight:700; color:#c8d8f5; }
.standout-list { margin:0; padding:0; list-style:none; display:grid; gap:4px; }
.standout-list li { display:flex; align-items:baseline; gap:6px; font-size:12px; line-height:1.4; }
.standout-pos { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#6a87b8; min-width:32px; flex-shrink:0; }
@media (max-width:959px) {
  .standout-list { grid-template-columns:1fr 1fr; }
}

/* ── Compact sticky control tray ─────────────────────────────────────── */
.watch-controls-tray {
  display:flex; align-items:center; gap:6px;
  padding:6px 10px calc(6px + env(safe-area-inset-bottom, 0px));
  background:#0c1730; border-top:1px solid #2d3a55;
  flex-shrink:0;
}
.speed-row { display:flex; gap:4px; flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch; flex:1; min-width:0; }
.ctrl-btn { background:#1c2e4d; color:#c8d8f5; border:1px solid #456596; border-radius:8px; padding:8px 10px; font-size:11px; cursor:pointer; white-space:nowrap; min-height:44px; min-width:44px; }
.ctrl-btn.active { border-color:#7cc4ff; color:#b8e0ff; background:#182948; }
.ctrl-btn:hover { background:#233660; }
.pause-btn { font-size:14px; padding:8px 12px; flex-shrink:0; }
.skip-menu { position:relative; flex-shrink:0; }
.skip-menu > summary { list-style:none; display:inline-flex; align-items:center; }
.skip-menu > summary::-webkit-details-marker { display:none; }
.skip-menu[open] .skip-menu-list {
  position:absolute; right:0; bottom:calc(100% + 6px);
  display:flex; flex-direction:column; gap:4px;
  background:#0f1c38; border:1px solid #334870; border-radius:10px;
  padding:6px; min-width:132px; box-shadow:0 -8px 24px rgba(0,0,0,.45); z-index:3;
}

/* ── Final card ──────────────────────────────────────────────────────── */
.watch-final-card { border:1px solid #3d5378; border-radius:10px; margin-top:12px; padding:10px; background:#13203a; }
.watch-final-label { text-transform:uppercase; font-size:10px; letter-spacing:.08em; color:#98b4dd; margin-bottom:4px; }
.watch-final-score { display:flex; flex-direction:column; gap:4px; font-size:15px; font-weight:800; color:#ecf4ff; }
.watch-final-pending { font-size:12px; color:#b9c9e6; line-height:1.4; }
.finish { margin-top:10px; width:100%; background:#1d4ed8; color:#fff; font-weight:800; border:none; border-radius:8px; padding:11px; cursor:pointer; font-size:13px; min-height:44px; }
`;
