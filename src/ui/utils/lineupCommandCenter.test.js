import { describe, expect, it } from 'vitest';
import { DEPTH_CHART_ROWS } from '../../core/depthChart.js';
import { deriveRosterReadinessModel } from './rosterReadinessModel.js';
import { calculatePlayerSchemeFit, DEFENSIVE_SCHEMES, OFFENSIVE_SCHEMES } from '../../core/scheme-core.js';
import { buildReplacementUpdates, deriveEditableCanonicalLineup, deriveLineupRatingSnapshot, getPersistedDepthAssignment, resolveLineupAssignments } from './lineupCommandCenter.js';

const attributes = (rating) => ({ throwAccuracyShort: rating, throwAccuracyDeep: rating, throwPower: rating, release: rating, routeRunning: rating, separation: rating, catchInTraffic: rating, ballTracking: rating, decisionMaking: rating, pocketPresence: rating, passBlockFootwork: rating, passBlockStrength: rating, passRush: rating, pressCoverage: rating, zoneCoverage: rating });
const make = (id, pos, rowKey, order, rating, extra = {}) => ({ id, name: `P${id}`, pos, ovr: rating, teamId: 1, attributesV2: attributes(rating), ratings: { throwPower: rating, throwAccuracy: rating, awareness: rating, speed: rating, acceleration: rating, catching: rating, catchInTraffic: rating, passBlock: rating, runBlock: rating, runStop: rating, passRushPower: rating, passRushSpeed: rating, coverage: rating, intelligence: rating }, depthChart: { rowKey, order }, ...extra });
const offenseRows = ['QB', 'RB', 'WR', 'WR', 'TE', 'OL', 'OL', 'OL', 'OL', 'OL', 'WR'];
const defenseRows = ['EDGE', 'IDL', 'IDL', 'LB', 'LB', 'LB', 'CB', 'CB', 'S', 'S', 'EDGE'];
const roster = [...offenseRows.map((row, index) => make(index + 1, row === 'OL' ? 'LT' : row, row, index + 1, 60 + index)), ...defenseRows.map((row, index) => make(index + 101, row === 'EDGE' ? 'DE' : row === 'IDL' ? 'DT' : row, row, index + 1, 70 + index))];
const team = { id: 1, strategies: { offSchemeId: 'VERTICAL', defSchemeId: 'COVER_2' } };

describe('lineup command center derivation', () => {
  it('uses canonical starters, changes strength only when the selected unit changes, and keeps bench reorders inert', () => {
    const weak = make(500, 'QB', 'QB', 1, 35);
    const strong = make(501, 'QB', 'QB', 2, 95);
    const baseRoster = [...roster.filter((p) => p.depthChart.rowKey !== 'QB'), weak, strong];
    const before = deriveLineupRatingSnapshot({ team, roster: baseRoster });
    const updates = buildReplacementUpdates(baseRoster, weak, strong, 'OFFENSE');
    const replaced = baseRoster.map((player) => {
      const update = updates.find((entry) => entry.playerId === player.id);
      return update ? { ...player, depthChart: { rowKey: update.rowKey, order: update.newOrder } } : player;
    });
    const after = deriveLineupRatingSnapshot({ team, roster: replaced });
    expect(before.offenseStarterIds).toContain(500);
    expect(after.offenseStarterIds).toContain(501);
    expect(after.offense).toBeGreaterThan(before.offense);

    const benchOnly = replaced.map((player) => player.id === 500 ? { ...player, depthChart: { rowKey: 'QB', order: 3 } } : player);
    const benchSnapshot = deriveLineupRatingSnapshot({ team, roster: benchOnly });
    expect(benchSnapshot.offenseStarterIds).toEqual(after.offenseStarterIds);
    expect([benchSnapshot.overall, benchSnapshot.offense, benchSnapshot.defense]).toEqual([after.overall, after.offense, after.defense]);
  });

  it('normalizes detailed positions for canonical scheme fit', () => {
    for (const [pos, scheme] of [['LT', OFFENSIVE_SCHEMES.VERTICAL], ['DT', DEFENSIVE_SCHEMES.COVER_2], ['MLB', DEFENSIVE_SCHEMES.BLITZ_34], ['FS', DEFENSIVE_SCHEMES.MAN_COVERAGE]]) {
      expect(calculatePlayerSchemeFit(make(pos, pos, pos, 1, 88), scheme)).toBe(88);
    }
  });

  it('compares schemes from starters rather than a scheme-skewed bench', () => {
    const starters = roster.map((player) => ({ ...player, ratings: { ...player.ratings, speed: 95, acceleration: 95, throwPower: 95, runBlock: 30, trucking: 30 } }));
    const bench = Array.from({ length: 20 }, (_, index) => make(700 + index, 'RB', 'RB', 20 + index, 90, { ratings: { trucking: 99, acceleration: 90, speed: 30, catching: 30, awareness: 80, juking: 60 } }));
    const result = deriveLineupRatingSnapshot({ team, roster: [...starters, ...bench] });
    expect(result.offenseComparison[0].id).toBe('VERTICAL');
  });

  it('inherits availability filtering from the canonical unit authority', () => {
    const unavailableStar = make(900, 'QB', 'QB', 1, 99, { injured: true, injuryWeeksRemaining: 4 });
    const available = make(901, 'QB', 'QB', 2, 65);
    const result = deriveLineupRatingSnapshot({ team, roster: [...roster.filter((p) => p.depthChart.rowKey !== 'QB'), unavailableStar, available] });
    expect(result.offenseStarterIds).not.toContain(900);
    expect(result.offenseStarterIds).toContain(901);
    const editable = deriveEditableCanonicalLineup({ roster: [...roster.filter((p) => p.depthChart.rowKey !== 'QB'), unavailableStar, available], simulationStarterIds: result.offenseStarterIds, group: 'OFFENSE' });
    expect(editable.find((player) => player.depthChart.rowKey === 'QB')?.id).toBe(900);
  });

  it('distinguishes persisted depth ownership from positional eligibility', () => {
    expect(getPersistedDepthAssignment(make(910, 'K', 'K', 1, 70))).toEqual({ rowKey: 'K', order: 1 });
    expect(getPersistedDepthAssignment({ id: 911, pos: 'K' })).toBeNull();
    expect(getPersistedDepthAssignment({ id: 912, pos: 'WR', depthChart: { rowKey: 'K', order: 1 } })).toBeNull();
  });

  it.each([
    ['K', 'K'],
    ['P', 'P'],
    ['RS', 'WR'],
  ])('adds only the selected unassigned %s candidate to the persisted row', (rowKey, pos) => {
    const starter = make(`${rowKey}-1`, pos, rowKey, 1, 70);
    const selected = { ...make(`${rowKey}-2`, pos, rowKey, 2, 72), depthChart: undefined, depthOrder: undefined };
    const untouched = { ...make(`${rowKey}-3`, pos, rowKey, 3, 74), depthChart: undefined, depthOrder: undefined };
    expect(buildReplacementUpdates([starter, selected, untouched], starter, selected, 'SPECIAL')).toEqual([
      { playerId: `${rowKey}-2`, rowKey, newOrder: 1 },
      { playerId: `${rowKey}-1`, rowKey, newOrder: 2 },
    ]);
  });

  it('preserves an existing same-row specialist backup without assigning unrelated eligible players', () => {
    const starter = make('K-1', 'K', 'K', 1, 70);
    const backup = make('K-2', 'K', 'K', 2, 72);
    const untouched = { ...make('K-3', 'K', 'K', 3, 74), depthChart: undefined, depthOrder: undefined };
    expect(buildReplacementUpdates([starter, backup, untouched], starter, backup, 'SPECIAL')).toEqual([
      { playerId: 'K-2', rowKey: 'K', newOrder: 1 },
      { playerId: 'K-1', rowKey: 'K', newOrder: 2 },
    ]);
  });
});


describe('resolved lineup assignments', () => {
  const complete = DEPTH_CHART_ROWS.flatMap((row, rowIndex) => Array.from({ length: row.slots }, (_, index) => make(rowIndex * 100 + index + 1, row.match[0], row.key, index + 1, 78)));

  it('reuses the existing full legacy fallback without writing player metadata', () => {
    const legacy = complete.map((entry) => ({ ...entry, depthChart: undefined }));
    expect(resolveLineupAssignments({ team, roster: legacy })).toEqual(deriveRosterReadinessModel({ team, roster: legacy }).assignments);
    expect(legacy.every((entry) => entry.depthChart === undefined)).toBe(true);
  });

  it('preserves explicit empty team rows even when a legacy fallback could fill them', () => {
    const legacy = complete.map((entry) => ({ ...entry, depthChart: undefined }));
    const resolved = resolveLineupAssignments({ team: { ...team, depthChart: { RS: [] } }, roster: legacy });
    expect(resolved.RS).toEqual([]);
    expect(resolved.K).toHaveLength(1);
    expect(resolved.P).toHaveLength(1);
  });

  it('does not certify a kicker backup as an inferred punter or returner', () => {
    const legacy = [make(1, 'K', 'K', 1, 78), make(2, 'K', 'K', 2, 76)].map((entry) => ({ ...entry, depthChart: undefined }));
    const resolved = resolveLineupAssignments({ team, roster: legacy });
    expect(resolved.K).toEqual([1]);
    expect(resolved.P).toEqual([]);
    expect(resolved.RS).toEqual([]);
  });

  it('keeps a missing row empty on a fully persisted roster', () => {
    const noReturners = complete.filter((entry) => entry.depthChart.rowKey !== 'RS');
    expect(resolveLineupAssignments({ team, roster: noReturners }).RS).toEqual([]);
  });
});
