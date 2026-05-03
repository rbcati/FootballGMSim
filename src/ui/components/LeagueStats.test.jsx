/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
afterEach(() => cleanup());
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LeagueStats from './LeagueStats.jsx';

const league = {seasonId:2026,week:4,teams:[{id:1,abbr:'AAA',roster:[{id:1,name:'QB',position:'QB',seasonStats:{passYards:200,passComp:20,passAtt:30,rushYards:10,recYards:0,tackles:1,fgm:0}},{id:2,name:'RB',position:'RB',seasonStats:{rushYards:120,rushAtt:20}}]},{id:2,abbr:'BBB',roster:[{id:3,name:'WR',position:'WR',seasonStats:{recYards:140,receptions:7,targets:10}}]}],schedule:[{played:true,homeId:1,awayId:2,homeScore:24,awayScore:17}]};

describe('LeagueStats', () => {
  it('renders full passing columns and filters search', () => {
    render(<LeagueStats league={league} />);
    expect(screen.getByRole('button', { name: /^Cmp/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Rate/ })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Search name\/team\/pos/i), { target: { value: 'WR' } });
    expect(screen.queryByRole('button', { name: /^QB$/ })).toBeFalsy();
    expect(screen.getByRole('button', { name: 'passing' }).getAttribute('style')).toContain('font-weight: 700');
  });

  it('sorting changes row order', () => {
    render(<LeagueStats league={{...league, teams:[{id:1,abbr:'AAA',roster:[{id:1,name:'A',position:'QB',seasonStats:{passYards:100}},{id:2,name:'B',position:'QB',seasonStats:{passYards:300}}]}]}} />);
    const yds = screen.getByRole('button', { name: /^Yds ↓/ });
    expect(screen.getAllByRole('button', { name: /^(A|B)$/ })[0].textContent).toBe('B');
    fireEvent.click(yds);
    expect(screen.getAllByRole('button', { name: /^(A|B)$/ })[0].textContent).toBe('A');
  });

  it('calls player select and shows team rankings fallback', () => {
    const onPlayerSelect = vi.fn();
    render(<LeagueStats onPlayerSelect={onPlayerSelect} league={{teams:[{id:1,abbr:'AAA',roster:[{id:1,name:'QB',position:'QB',seasonStats:{passYards:200}}]}],schedule:[]}} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^QB$/ })[0]);
    expect(onPlayerSelect).toHaveBeenCalled();
    expect(screen.getAllByText(/No team ranking data recorded yet/i).length).toBeGreaterThan(0);
  });

  it('shows rank column and team click callback', () => {
    const onTeamSelect = vi.fn();
    render(<LeagueStats onTeamSelect={onTeamSelect} league={league} />);
    expect(screen.getAllByText('Rank').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'AAA' })[0]);
    expect(onTeamSelect).toHaveBeenCalledWith(1);
    expect(screen.queryByText('Yds Allowed')).toBeFalsy();
  });
});
