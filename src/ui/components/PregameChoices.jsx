import React, { useEffect, useRef } from 'react';

/** Presentation choices only. App retains the existing simulation commands. */
export default function PregameChoices({ busy, tendency, onTendencyChange, onWatch, onSimWeek }) {
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.querySelector('button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const containFocus = (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...root.current.querySelectorAll('button:not(:disabled), summary')]
      .filter((el) => el.getClientRects().length > 0 && !el.closest('fieldset:disabled'));
    const target = event.shiftKey ? controls.at(-1) : controls[0];
    if ((event.shiftKey && document.activeElement === controls[0]) || (!event.shiftKey && document.activeElement === controls.at(-1))) {
      event.preventDefault();
      target?.focus();
    }
  };
  return <div className="pregame-choices" ref={root} onKeyDown={containFocus}>
    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onWatch('watch')}>
      <strong>Watch Game</strong><small>Follow the broadcast and key moments.</small>
    </button>
    <button type="button" className="btn" disabled={busy} onClick={() => onWatch('instant')}>
      <strong>Quick Sim</strong><small>Jump to the result and postgame review.</small>
    </button>
    <details className="guided-detail">
      <summary>More Options</summary>
      <div className="pregame-advanced">
        <p>Watch modes change presentation pace. Coaching tendency is a separate game choice.</p>
        <fieldset disabled={busy}>
          <legend>Coaching tendency</legend>
          <div className="pregame-tendencies">
            {['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'].map((key) => <button type="button" className="btn" key={key} aria-pressed={tendency === key} onClick={() => onTendencyChange(key)}>{key.toLowerCase()}</button>)}
          </div>
        </fieldset>
        <button type="button" className="btn" disabled={busy} onClick={() => onWatch('watch')}><strong>Watch (Broadcast Pace)</strong><small>Full game presentation.</small></button>
        <button type="button" className="btn" disabled={busy} onClick={() => onWatch('fast')}><strong>Fast Watch (Condensed)</strong><small>Move through the presentation faster.</small></button>
        <button type="button" className="btn" disabled={busy} onClick={() => onWatch('instant')}><strong>Sim to End (Instant Recap)</strong><small>Show the result and recap immediately.</small></button>
        <button type="button" className="btn" disabled={busy} onClick={onSimWeek}><strong>Simulate Week (Skip Presentation)</strong><small>Advance the entire week without watching.</small></button>
      </div>
    </details>
  </div>;
}
