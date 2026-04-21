import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import PlayerProfileModalBoundary from '../PlayerProfileModalBoundary.jsx';

describe('PlayerProfileModalBoundary', () => {
  it('renders children during normal flow', () => {
    const html = renderToString(
      <PlayerProfileModalBoundary playerId="p1" onClose={vi.fn()}>
        <div>Child content</div>
      </PlayerProfileModalBoundary>,
    );

    expect(html).toContain('Child content');
  });
});
