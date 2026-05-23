/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ReleasePreviewModal from '../ReleasePreviewModal.jsx';

afterEach(() => cleanup());

describe('ReleasePreviewModal', () => {
  it('renders estimated contract/dead-cap breakdown for bonus contracts', () => {
    render(
      <ReleasePreviewModal
        open
        capRoomNow={32}
        player={{
          id: 7,
          name: 'Marcus Vale',
          pos: 'WR',
          ovr: 84,
          contract: { baseAnnual: 12, signingBonus: 9, yearsTotal: 3, yearsRemaining: 2 },
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /release preview for marcus vale/i })).toBeTruthy();
    expect(screen.getByText('Estimated Dead Cap')).toBeTruthy();
    expect(screen.getByText('$6.0M')).toBeTruthy();
    expect(screen.getByText('Projected Cap Room Preview')).toBeTruthy();
    expect(screen.getByText(/exact processing follows league release rules/i)).toBeTruthy();
  });

  it('supports legacy flat contracts with zeroed bonus/dead-cap values', () => {
    render(
      <ReleasePreviewModal
        open
        capRoomNow={14}
        player={{ id: 8, name: 'Legacy Lineman', pos: 'OL', ovr: 68, contract: { baseAnnual: 4, years: 1 } }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Annual Signing Bonus Proration').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$0.0M').length).toBeGreaterThan(0);
  });

  it('cancel and confirm handlers are isolated and called exactly once', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ReleasePreviewModal
        open
        capRoomNow={18}
        player={{ id: 9, name: 'Callback Test', pos: 'LB', ovr: 77, contract: { baseAnnual: 7, yearsRemaining: 2 } }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(0);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Release' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
