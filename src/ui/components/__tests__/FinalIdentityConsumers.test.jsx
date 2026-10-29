/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { makeLeague } from '../../../core/league.js';
import { DEFAULT_TEAMS } from '../../../data/default-teams.js';
import { autoBuildDepthChart, applyDepthChartToPlayers } from '../../../core/depthChart.js';
import { deriveInjuryReadinessModel } from '../../utils/injuryReadinessModel.js';
import { buildCounterAdjustment } from '../../utils/tradeFinder.js';
import InjuryReport from '../InjuryReport.jsx';
import BulkReleasePreviewModal from '../BulkReleasePreviewModal.jsx';
import TradeFinder from '../TradeFinder.jsx';

afterEach(cleanup);
function injuryFixture(numeric = false) {
  const team = makeLeague(DEFAULT_TEAMS.slice(0, 2), { rngSeed: 1807, year: 2026 }).teams[0];
  team.roster = applyDepthChartToPlayers(team.roster, autoBuildDepthChart(team.roster));
  if (numeric) team.roster = team.roster.map((p, i) => ({ ...p, id: i + 1 }));
  const injured = ['P', 'QB', 'RB', 'WR'].map(pos => team.roster.filter(p => p.pos === pos).sort((a,b) => a.depthChart.order - b.depthChart.order)[pos === 'P' ? 0 : 2]);
  for (const p of injured) { p.injuryWeeksRemaining = 1; p.injury = { type: 'Minor strain', weeksRemaining: 1 }; }
  return { league: { year: 2026, week: 1, userTeamId: team.id, teams: [team] }, injured };
}

describe('final critical UI identity consumers', () => {
  for (const numeric of [false, true]) it(`injury report has only genuine replacement risk (${numeric ? 'numeric' : 'opaque'})`, () => {
    const { league, injured } = injuryFixture(numeric);
    const model = deriveInjuryReadinessModel({ league });
    console.log('INJURY REPRO', numeric, model.status.label, model.myTeamInjured.filter(p => p.replacementRisk).map(p => p.pos));
    expect(model.replacementRiskCount).toBe(1);
    expect(model.status.label).toBe('Needs Attention');
    expect(model.myTeamInjured.filter(p => p.replacementRisk).map(p => p.id)).toEqual([injured[0].id]);
    expect(model.myTeamInjured.filter(p => p.isStarter).map(p => p.pos)).toEqual(['P']);
    for (const p of injured) expect(model.myTeamInjured.find(row => row.id === p.id)).toMatchObject({ id: p.id, name: p.name, pos: p.pos });
    const view = render(<InjuryReport league={league} />);
    expect(view.getAllByText('Needs Attention').length).toBeGreaterThan(0);
    expect(view.queryByText('Critical')).toBeNull();
    for (const p of injured) expect(view.getAllByText(p.name, { exact: false }).length).toBeGreaterThan(0);
    cleanup();
    for (const team of league.teams) for (const p of team.roster) { p.injuryWeeksRemaining = 0; if (p.injury) p.injury.weeksRemaining = 0; }
    expect(deriveInjuryReadinessModel({ league }).status.label).toBe('Full Strength');
    expect(render(<InjuryReport league={league} />).getAllByText('Full Strength').length).toBeGreaterThan(0);
  });
  it('deduplicates repeated opaque references without collapsing distinct players', () => {
    const { league, injured } = injuryFixture();
    league.roster = [...league.teams[0].roster, ...injured];
    league.teams[0].roster.push(injured[1]);
    const model = deriveInjuryReadinessModel({ league });
    expect(model.leagueInjuredCount).toBe(4);
    expect(model.myTeamInjured).toHaveLength(4);
    expect(new Set(model.myTeamInjured.map(p => p.id)).size).toBe(4);
  });
  it('opaque and numeric versions have equivalent per-position risk calculations', () => {
    const { league } = injuryFixture();
    const numericLeague = structuredClone(league);
    numericLeague.teams[0].roster.forEach((p,i) => { p.id = i + 1; });
    const shape = career => { const m = deriveInjuryReadinessModel({ league: career }); return { status: m.status, groups: m.affectedPositionGroups, injuries: m.myTeamInjured.map(p => ({ name: p.name, pos: p.pos, starter: p.isStarter, risk: p.replacementRisk })) }; };
    expect(shape(league)).toEqual(shape(numericLeague));
  });
  for (const numeric of [false, true]) it(`bulk preview preserves original selected objects and count (${numeric ? 'numeric' : 'opaque'})`, () => {
    const players = makeLeague(DEFAULT_TEAMS.slice(0, 2), { rngSeed: 1807 }).teams[0].roster.slice(0, 2).map((p,i) => numeric ? { ...p, id: i + 1 } : p);
    const confirm = vi.fn();
    const view = render(<BulkReleasePreviewModal open rosterCount={53} players={[players[0], players[1], { ...players[0], id: String(players[0].id) }, { id: null }, { id: true }, { id: NaN }, { id: '' }, { id: {} }]} onConfirm={confirm} />);
    expect(view.getByText('Selected players').parentElement.textContent).toContain('2');
    fireEvent.click(view.getByText('Confirm Bulk Release'));
    expect(confirm).toHaveBeenCalledWith(players);
    expect(confirm.mock.calls[0][0][0]).toBe(players[0]);
    expect(confirm.mock.calls[0][0][1]).toBe(players[1]);
  });
  for (const ids of [['own-qb', 'target-a', 'target-b'], [11, 21, 22], [11, 21, 0]]) it(`Finder suggests an eligible unselected player (${typeof ids[0]})`, async () => {
    const p = (id,name,ovr,pos='WR') => ({ id,name,pos,age:24,ovr,potential:90,contract:{ baseAnnual:2, years:3 }, tradeStatus:'available' });
    const own = p(ids[0], 'Outgoing Quarterback', 95, 'QB');
    const a = p(ids[1], 'Target A', 75), b = p(ids[2], 'Target B', 74);
    const partner = { id:1,name:'Rebuilders',abbr:'REB',wins:0,losses:10,capRoom:100,roster:[a,b],picks:[],teamIntel:{direction:'rebuilding'} };
    const args = { partnerTeam: partner, outgoingPlayers:[own], incomingPlayers:[a] };
    expect(buildCounterAdjustment(args).playerId).toBe(b.id);
    const changed = vi.fn();
    const league = { year:2026,week:10,userTeamId:0,teams:[{id:0,name:'User',roster:[own],picks:[],capRoom:100,wins:8,losses:2},partner] };
    const view = render(<TradeFinder league={league} workspace={{ partnerTeamId:1,outgoingPlayerIds:[own.id],incomingPlayerIds:[a.id] }} onWorkspaceChange={changed} />);
    fireEvent.click(view.getByText('Make this deal work'));
    await waitFor(() => expect(changed.mock.calls.some(([row]) => row.incomingPlayerIds?.length === 2 && row.incomingPlayerIds[0] === a.id && row.incomingPlayerIds[1] === b.id)).toBe(true));
    expect(buildCounterAdjustment({ ...args, incomingPlayers:[a,b] }).playerId).toBeUndefined();
    fireEvent.click(view.getByText('Make this deal work'));
    expect(changed.mock.calls.at(-1)[0].incomingPlayerIds).toEqual([a.id,b.id]);
    expect(view.getByText(/No eligible unselected player/i)).toBeTruthy();
  });
});

// Bounded audit: observe the real optimistic depth update while the worker is pending.
for (const numeric of [false,true]) it(`auto-build updates local depth attribution before commit (${numeric})`, async () => {
  const { default: Roster } = await import('../Roster.jsx');
  const { act } = await import('@testing-library/react');
  const team = makeLeague(DEFAULT_TEAMS.slice(0,2),{rngSeed:1807}).teams[0];
  if (numeric) team.roster = team.roster.map((p,i)=>({...p,id:i+1}));
  let finish;
  const pending = new Promise(resolve=>{finish=resolve;});
  const actions = {getRoster:vi.fn(async()=>({payload:{team,players:team.roster}})),updateDepthChart:vi.fn(()=>pending)};
  const view = render(<Roster league={{userTeamId:team.id,teams:[team],year:2026,week:1,phase:'regular'}} actions={actions} initialViewMode="depth" />);
  const button = await view.findByRole('button',{name:'Auto-Build Depth Chart'});
  const unset = new RegExp(`Depth setup ${team.roster.length} unset`);
  expect(view.getByText(unset)).toBeTruthy();
  fireEvent.click(button);
  try {
    await waitFor(()=>expect(view.queryByText(unset)).toBeNull());
    expect(actions.updateDepthChart.mock.calls[0][0].every(row=>team.roster.some(p=>p.id===row.playerId))).toBe(true);
  } finally { await act(async()=>{finish();await pending;}); }
});
