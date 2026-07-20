/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import LiveGameViewer from '../LiveGameViewer.jsx';

const homeTeam = { id: 1, abbr: 'MIA', name: 'Miami' };
const awayTeam = { id: 0, abbr: 'BUF', name: 'Buffalo' };

// Narrated logs whose running score (26-3) deliberately contradicts the
// canonical league-recorded final (35-41) — the real production shape, since
// the narration and scoring engines are separate.
const contradictoryLogs = [
  { text: 'C. Harris finds L. Ortiz for 13 yds.', quarter: 1, clock: '15:10', homeScore: 0, awayScore: 0, possession: 'home' },
  { text: 'TOUCHDOWN! L. Ortiz catches 17-yard TD pass from C. Harris!', quarter: 1, clock: '15:10', homeScore: 0, awayScore: 0, possession: 'home', type: 'touchdown', isTouchdown: true },
  { text: 'D. Knight connects with M. Jones for 1 yds.', quarter: 1, clock: '13:20', homeScore: 6, awayScore: 0, possession: 'away' },
  { text: 'MIA punts.', quarter: 4, clock: '5:30', homeScore: 26, awayScore: 3, possession: 'home', type: 'punt' },
];

const canonicalFinal = { home: 35, away: 41 };

function renderViewer(extraProps = {}) {
  return render(
    <LiveGameViewer
      logs={contradictoryLogs}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      initialMode="pause"
      finalScore={canonicalFinal}
      {...extraProps}
    />,
  );
}

afterEach(() => cleanup());

describe('LiveGameViewer — score authority', () => {
  it('never renders the narrated running score in the scorebug during playback', () => {
    renderViewer();
    const bug = screen.getByTestId('watch-scorebug');
    // Both score cells are placeholder dashes, not narration snapshots
    // (0-0 / 6-0 / 26-3).
    const cells = within(bug).getAllByLabelText(/score shown at the final whistle/i);
    expect(cells.length).toBe(2);
    cells.forEach((cell) => expect(cell.textContent.trim()).toBe('–'));
  });

  it('shows the canonical league-recorded final once the feed completes', () => {
    renderViewer({ initialMode: 'instant' });
    const finalCard = document.querySelector('.watch-final-card');
    expect(finalCard.textContent).toContain('BUF 41');
    expect(finalCard.textContent).toContain('MIA 35');
    // The narrated 26-3 never appears anywhere.
    expect(document.body.textContent).not.toMatch(/26\s*[–-]\s*3|3\s*[–-]\s*26/);
    const bug = screen.getByTestId('watch-scorebug');
    expect(bug.textContent).toContain('41');
    expect(bug.textContent).toContain('35');
    expect(bug.textContent).toContain('FINAL');
  });

  it('reports the canonical final (not narration) through onComplete', () => {
    const onComplete = vi.fn();
    renderViewer({ initialMode: 'instant', onComplete });
    fireEvent.click(screen.getByRole('button', { name: /Open Final Game Book/i }));
    expect(onComplete).toHaveBeenCalledWith({ homeScore: 35, awayScore: 41 });
  });

  it('shows an honest pending note instead of a fabricated final when no canonical score exists', () => {
    const onComplete = vi.fn();
    renderViewer({ initialMode: 'instant', finalScore: null, onComplete });
    expect(screen.getByTestId('watch-final-pending')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open Final Game Book/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Continue to recovery/i }));
    expect(onComplete).toHaveBeenCalledWith({});
    const bug = screen.getByTestId('watch-scorebug');
    expect(bug.textContent).not.toMatch(/26|41|35/);
  });
});

describe('LiveGameViewer — feed clock and scoring emphasis', () => {
  it('does not repeat the fabricated drive clock on event rows', () => {
    renderViewer({ initialMode: 'instant' });
    expect(document.querySelector('.live-feed').textContent).not.toContain('15:10');
  });

  it('keeps scoring rows visually distinct via the TD tag and major styling', () => {
    renderViewer({ initialMode: 'instant' });
    const feed = document.querySelector('.live-feed');
    const tdTag = feed.querySelector('.feed-tag-td');
    expect(tdTag).toBeTruthy();
    expect(feed.querySelector('.feed-row.major')).toBeTruthy();
  });

  it('labels the feed with explicit newest-last ordering for consistency', () => {
    renderViewer();
    expect(screen.getByRole('log', { name: /newest play last/i })).toBeTruthy();
  });
});

describe('LiveGameViewer — compact mobile controls', () => {
  it('keeps pause, all speed steps, and skip options available in the sticky tray', () => {
    renderViewer();
    const tray = document.querySelector('.watch-controls-tray');
    expect(tray).toBeTruthy();
    expect(within(tray).getByRole('button', { name: /Resume playback/i })).toBeTruthy();
    for (const label of ['Slow', 'Normal', 'Fast', '2×']) {
      expect(within(tray).getByRole('button', { name: label })).toBeTruthy();
    }
    // Skip actions live behind one explicit disclosure, not a full column.
    const skipMenu = tray.querySelector('.skip-menu');
    expect(skipMenu).toBeTruthy();
    expect(within(skipMenu).getByRole('button', { name: /Sim End/i })).toBeTruthy();
    expect(within(skipMenu).getByRole('button', { name: /Next Score/i })).toBeTruthy();
  });

  it('never renders play-call controls that claim strategic agency (#1700 review defect #2)', () => {
    // The watched game is fully simulated before playback, so Run Heavy / Pass
    // Heavy / Timeout could not affect the result on any path. They are removed
    // (not merely hidden) and onPlaycallOverride is never invoked.
    const onPlaycallOverride = vi.fn();
    renderViewer({ onPlaycallOverride });
    expect(screen.queryByRole('button', { name: /Run Heavy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pass Heavy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Timeout/i })).toBeNull();
    expect(onPlaycallOverride).not.toHaveBeenCalled();
  });
});
