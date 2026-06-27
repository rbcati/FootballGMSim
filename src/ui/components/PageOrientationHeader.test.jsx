/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PageOrientationHeader from './PageOrientationHeader.jsx';
import { getPageOrientation } from '../constants/navigationCopy.js';

describe('PageOrientationHeader', () => {
  afterEach(() => cleanup());

  it('renders the title and subtitle for a known page', () => {
    render(<PageOrientationHeader tab="Free Agency" />);
    const header = screen.getByTestId('page-orientation');
    const expected = getPageOrientation('Free Agency');
    expect(header.textContent).toContain(expected.title);
    expect(header.textContent).toContain(expected.subtitle);
  });

  it('orients deep mobile-reachable pages like Hall of Fame', () => {
    render(<PageOrientationHeader tab="Hall of Fame" />);
    expect(screen.getByTestId('page-orientation').textContent).toMatch(/hall of fame/i);
  });

  it('renders nothing for HQ, which owns its own header', () => {
    const { container } = render(<PageOrientationHeader tab="HQ" />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('page-orientation')).toBeNull();
  });

  it('renders nothing for an unknown destination instead of an empty box', () => {
    const { container } = render(<PageOrientationHeader tab="Not A Real Tab" />);
    expect(container.firstChild).toBeNull();
  });
});
