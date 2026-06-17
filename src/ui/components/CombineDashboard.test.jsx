/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CombineDashboard from './CombineDashboard.jsx';

function makeProspect(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'WR',
    workoutCompleted: false,
    combineMetrics: {
      fortyYardDash: 4.45,
      benchPressReps: 18,
      combineGrade: 6.5,
      threeCone: 6.85,
      verticalJump: 34,
    },
    ...overrides,
  };
}

function makeActions(overrides = {}) {
  return {
    send: vi.fn(),
    runCombineWorkout: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

// ── 1. Header shows amber styling when invites remain ─────────────────────────

describe('CombineDashboard header', () => {
  it('shows amber header when combineInvitesLeft > 0', () => {
    render(
      <CombineDashboard
        prospects={[makeProspect()]}
        combineInvitesLeft={6}
        actions={makeActions()}
      />,
    );
    expect(screen.queryByTestId('combine-header-amber')).not.toBeNull();
    expect(screen.queryByTestId('combine-header-muted')).toBeNull();
  });

  // ── 2. Header shows muted styling when no invites remain ─────────────────

  it('shows muted header when combineInvitesLeft = 0', () => {
    render(
      <CombineDashboard
        prospects={[makeProspect()]}
        combineInvitesLeft={0}
        actions={makeActions()}
      />,
    );
    expect(screen.queryByTestId('combine-header-muted')).not.toBeNull();
    expect(screen.queryByTestId('combine-header-amber')).toBeNull();
  });

  // ── 3. Header displays invite count ──────────────────────────────────────

  it('displays remaining invite count in header', () => {
    render(
      <CombineDashboard
        prospects={[makeProspect()]}
        combineInvitesLeft={4}
        actions={makeActions()}
      />,
    );
    const header = screen.queryByTestId('combine-header-amber');
    expect(header.textContent).toMatch(/Invites Remaining: 4 \/ 6/);
  });
});

// ── 4. Prospect table renders ────────────────────────────────────────────────

describe('CombineDashboard prospect table', () => {
  it('renders the prospect table with prospect name', () => {
    render(
      <CombineDashboard
        prospects={[makeProspect({ name: 'John Speed', pos: 'WR' })]}
        combineInvitesLeft={3}
        actions={makeActions()}
      />,
    );
    expect(screen.queryByTestId('combine-prospect-table')).not.toBeNull();
    expect(screen.getByText('John Speed')).toBeTruthy();
  });

  // ── 5. Empty state when no prospects ─────────────────────────────────────

  it('shows empty state when no prospects are provided', () => {
    render(
      <CombineDashboard
        prospects={[]}
        combineInvitesLeft={0}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText(/No prospects available/i)).toBeTruthy();
  });

  // ── 6. Row has correct data-highlight for freak ───────────────────────────

  it('marks freak prospects with data-highlight="freak"', () => {
    const freak = makeProspect({
      id: 99,
      combineMetrics: { combineGrade: 9.0, fortyYardDash: 4.30, benchPressReps: 32, threeCone: 6.50, verticalJump: 40 },
    });
    render(<CombineDashboard prospects={[freak]} combineInvitesLeft={3} actions={makeActions()} />);
    const row = screen.queryByTestId('combine-row-99');
    expect(row).not.toBeNull();
    expect(row.getAttribute('data-highlight')).toBe('freak');
  });

  // ── 7. Row has correct data-highlight for bust ────────────────────────────

  it('marks bust prospects with data-highlight="bust"', () => {
    const bust = makeProspect({
      id: 88,
      combineMetrics: { combineGrade: 2.5, fortyYardDash: 4.76, benchPressReps: 8, threeCone: 7.48, verticalJump: 20 },
    });
    render(<CombineDashboard prospects={[bust]} combineInvitesLeft={3} actions={makeActions()} />);
    const row = screen.queryByTestId('combine-row-88');
    expect(row).not.toBeNull();
    expect(row.getAttribute('data-highlight')).toBe('bust');
  });
});

// ── 8. Invite button with invites available ───────────────────────────────────

describe('CombineDashboard invite action', () => {
  it('shows active invite button when invites remain and workout not completed', () => {
    const prospect = makeProspect({ id: 5, workoutCompleted: false });
    render(<CombineDashboard prospects={[prospect]} combineInvitesLeft={3} actions={makeActions()} />);
    const btn = screen.queryByTestId('combine-invite-btn-5');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(false);
  });

  // ── 9. Invite button disabled when no invites remain ─────────────────────

  it('shows disabled invite button when no invites remain', () => {
    const prospect = makeProspect({ id: 6, workoutCompleted: false });
    render(<CombineDashboard prospects={[prospect]} combineInvitesLeft={0} actions={makeActions()} />);
    const btn = screen.queryByTestId('combine-invite-disabled-6');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });

  // ── 10. Clicking invite calls actions.runCombineWorkout ──────────────────

  it('clicking invite button calls actions.runCombineWorkout with prospectId', async () => {
    const actions = makeActions({
      runCombineWorkout: vi.fn().mockResolvedValue({ payload: { performanceCard: 'Great workout!' } }),
    });
    const prospect = makeProspect({ id: 7 });
    render(<CombineDashboard prospects={[prospect]} combineInvitesLeft={3} actions={actions} />);
    fireEvent.click(screen.getByTestId('combine-invite-btn-7'));
    await waitFor(() => expect(actions.runCombineWorkout).toHaveBeenCalledWith(7));
  });

  // ── 11. Verified badge shown for completed workouts ───────────────────────

  it('shows Verified badge when workoutCompleted is true', () => {
    const prospect = makeProspect({ id: 10, workoutCompleted: true, trueOvr: 82 });
    render(<CombineDashboard prospects={[prospect]} combineInvitesLeft={3} actions={makeActions()} />);
    const badge = screen.queryByTestId('combine-verified-10');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toMatch(/Verified/);
  });
});

// ── 12. Performance card toast ────────────────────────────────────────────────

describe('CombineDashboard performance card toast', () => {
  it('shows toast when lastWorkoutCard prop is set', () => {
    const { rerender } = render(
      <CombineDashboard prospects={[makeProspect()]} combineInvitesLeft={3} lastWorkoutCard={null} actions={makeActions()} />,
    );
    expect(screen.queryByTestId('combine-performance-card')).toBeNull();

    rerender(
      <CombineDashboard prospects={[makeProspect()]} combineInvitesLeft={3} lastWorkoutCard="Player X ran a 4.38 forty." actions={makeActions()} />,
    );
    const card = screen.queryByTestId('combine-performance-card');
    expect(card).not.toBeNull();
    expect(card.textContent).toMatch(/Player X ran a 4.38 forty/);
  });

  it('shows toast with performanceCard from runCombineWorkout Promise response', async () => {
    const actions = makeActions({
      runCombineWorkout: vi.fn().mockResolvedValue({ payload: { performanceCard: 'Incredible workout. 4.29 forty!' } }),
    });
    const prospect = makeProspect({ id: 20 });
    render(<CombineDashboard prospects={[prospect]} combineInvitesLeft={6} actions={actions} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('combine-invite-btn-20'));
    });

    await waitFor(() => {
      const card = screen.queryByTestId('combine-performance-card');
      expect(card).not.toBeNull();
    });
    expect(screen.queryByTestId('combine-performance-card').textContent).toMatch(/Incredible workout\. 4\.29 forty!/);
  });
});
