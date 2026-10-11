import { describe, expect, it } from 'vitest';
import { findPath } from '../../maze/solver';
import { knownRpgRoute } from './index';
import { address, fixture, observed, projected, routeBudget } from './fixtures.test-support';

describe('bounded actor-known routes', () => {
  it('is deterministic on equal-cost paths and agrees with the existing maze solver', () => {
    const game = fixture(2, 4);
    game.maze.rows = 2;
    game.maze.cells = [
      { row: 0, column: 0, links: ['east', 'south'] }, { row: 0, column: 1, links: ['south', 'west'] },
      { row: 1, column: 0, links: ['north', 'east'] }, { row: 1, column: 1, links: ['west', 'north'] },
    ];
    const knowledge = projected(observed(game));
    const target = address(1, 1, 1);
    const route = knownRpgRoute(knowledge, address(0), target, routeBudget);
    expect(route.status).toBe('ready');
    if (route.status !== 'ready') throw new Error('Missing route');
    expect(route.directions).toEqual(['east', 'south']);
    expect(route.directions).toEqual(findPath(game.maze, target)!.directions);
    expect(route.path).toEqual([address(1), target]);
    expect(knownRpgRoute(knowledge, address(0), address(1), { maxVisits: 2, maxSteps: 1 }))
      .toMatchObject({ status: 'ready', directions: ['east'], visits: 2 });
    game.maze.cells.reverse();
    game.maze.cells.forEach(cell => cell.links.reverse());
    expect(knownRpgRoute(projected(observed(game)), address(0), target, routeBudget)).toEqual(route);
  });

  it('requires reciprocal earned edges, without a hidden fallback or implied adjacency', () => {
    const game = fixture(4, 4);
    game.maze.cells[1].links = ['east'];
    const knowledge = projected(observed(game));
    expect(knowledge.cellCount).toBe(4);
    expect(knownRpgRoute(knowledge, address(0), address(1), routeBudget)).toEqual({ status: 'unknown', reason: 'no_known_route' });
  });

  it('refuses unknown addresses, cross-floor paths and exhausted visit/step budgets', () => {
    const knowledge = projected(observed(fixture(10, 9)));
    expect(knownRpgRoute(knowledge, address(10), address(1), routeBudget)).toEqual({ status: 'unknown', reason: 'origin_unknown' });
    expect(knownRpgRoute(knowledge, address(0), address(10), routeBudget)).toEqual({ status: 'unknown', reason: 'target_unknown' });
    expect(knownRpgRoute(knowledge, address(0), address(1, 2), routeBudget)).toEqual({ status: 'refused', reason: 'cross_floor' });
    expect(knownRpgRoute(knowledge, address(0), address(9), { maxVisits: 5, maxSteps: 20 })).toEqual({ status: 'refused', reason: 'visit_limit' });
    expect(knownRpgRoute(knowledge, address(0), address(9), { maxVisits: 10, maxSteps: 8 })).toEqual({ status: 'refused', reason: 'step_limit' });
    expect(knownRpgRoute(knowledge, address(0), address(0), { maxVisits: 1, maxSteps: 0 })).toMatchObject({ status: 'ready', path: [], distance: 0, visits: 1 });
    expect(knownRpgRoute(knowledge, address(0), address(9), { maxVisits: 10, maxSteps: 9 }).status).toBe('ready');
  });

  it.each([0, -1, 0.5, 513, NaN, Infinity])('validates maxVisits %s without clamping', maxVisits => {
    expect(knownRpgRoute(projected(), address(0), address(1), { maxVisits, maxSteps: 1 }))
      .toEqual({ status: 'refused', reason: 'invalid_budget' });
  });

  it.each([-1, 0.5, 257, NaN, Infinity])('validates maxSteps %s without clamping', maxSteps => {
    expect(knownRpgRoute(projected(), address(0), address(1), { maxVisits: 20, maxSteps }))
      .toEqual({ status: 'refused', reason: 'invalid_budget' });
  });

  it('only point-reads the bounded reachable knowledge and does not enumerate the full floor', () => {
    const first = projected();
    const cells = new Proxy(first.floors[1].cells, {
      ownKeys() { throw new Error('Whole-floor enumeration'); },
      get(target, key) {
        if (!['0:0', '0:1', '0:2'].includes(String(key))) throw new Error('Distant cell read');
        return Reflect.get(target, key);
      },
    });
    const knowledge = { ...first, floors: { 1: { ...first.floors[1], cells } } };
    const before = JSON.stringify(first);
    expect(knownRpgRoute(knowledge, address(0), address(2), { maxVisits: 3, maxSteps: 2 })).toMatchObject({ status: 'ready', visits: 3 });
    expect(JSON.stringify(first)).toBe(before);
  });
});
