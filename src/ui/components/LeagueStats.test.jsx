/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
afterEach(() => cleanup());
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LeagueStats from './LeagueStats.jsx';

describe('LeagueStats', () => {
  it('renders leader cards and table with data', () => {
    render(<LeagueStats league={{seasonId:2026,week:4,teams:[{id:1,abbr:'AAA',roster:[{id:1,name:'QB',position:'QB',seasonStats:{passYards:200}}]}],schedule:[]}} />);
    expect(screen.getByText(/Passing yards/i)).toBeTruthy();
    expect(screen.getAllByText('QB').length).toBeGreaterThan(0);
  });

  it('renders empty states', () => {
    render(<LeagueStats league={{teams:[],schedule:[]}} />);
    expect(screen.getByText(/No data for this category yet/i)).toBeTruthy();
  });

  it('calls onPlayerSelect from player row', () => {
    const onPlayerSelect = vi.fn();
    render(<LeagueStats onPlayerSelect={onPlayerSelect} league={{teams:[{id:1,abbr:'AAA',roster:[{id:1,name:'QB',position:'QB',seasonStats:{passYards:200}}]}],schedule:[]}} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^QB$/ })[0]);
    expect(onPlayerSelect).toHaveBeenCalled();
  });
});
