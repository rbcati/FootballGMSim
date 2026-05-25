/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import BulkReleasePreviewModal from '../BulkReleasePreviewModal.jsx';

afterEach(() => cleanup());

describe('BulkReleasePreviewModal', () => {
  const players = [
    { id: 1, name: 'Starter WR', pos: 'WR', ovr: 84, depthOrder: 1, age: 26, contract: { baseAnnual: 10, signingBonus: 6, yearsTotal: 3, yearsRemaining: 2 } },
    { id: 2, name: 'Depth LB', pos: 'LB', ovr: 71, depthOrder: 3, age: 29, contract: { baseAnnual: 3, signingBonus: 0, yearsTotal: 1, yearsRemaining: 1 } },
    { id: 1, name: 'Starter WR duplicate', pos: 'WR', ovr: 84, depthOrder: 1, age: 26, contract: { baseAnnual: 10, signingBonus: 6, yearsTotal: 3, yearsRemaining: 2 } },
  ];

  it('renders selected players and deduped totals', () => {
    render(<BulkReleasePreviewModal open players={players} rosterCount={53} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /bulk release preview/i })).toBeTruthy();
    expect(screen.getByText('Projected roster')).toBeTruthy();
    expect(screen.getByText('51')).toBeTruthy();
    expect(screen.getByText(/\$15.0M/)).toBeTruthy();
    expect(screen.getAllByText(/\$4.0M/).length).toBeGreaterThan(0);
  });

  it('cancel is safe and confirm is single-call with deduped players', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<BulkReleasePreviewModal open players={players} rosterCount={53} onCancel={onCancel} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(0);

    fireEvent.click(screen.getByRole('button', { name: /confirm bulk release/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toHaveLength(2);
  });

  it('renders risk warnings for high-risk cuts and handles sparse contracts', () => {
    render(<BulkReleasePreviewModal open players={[{ id: 4, name: 'Rookie QB', pos: 'QB', ovr: 83, depthOrder: 1, age: 22, contract: {} }]} rosterCount={53} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/risk warnings/i)).toBeTruthy();
    expect(screen.getByText(/high ovr cut/i)).toBeTruthy();
    expect(screen.getByText(/projected starter/i)).toBeTruthy();
  });
});
