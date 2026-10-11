import { describe, expect, it } from 'vitest';
import { createNewGameState, descendFloor } from '../../src/domain/gameFactory';
import { generateStructuredMaze } from '../../src/domain/maze/structuredGenerate';
import { movePosition } from '../../src/domain/maze/movement';
import { graphMetrics } from './graph';
import { floorDimensions, inspectOrdinary, measureOrdinary, measureOrdinarySize, roleBoundaryProbe, seededRng } from './ordinary';

describe('D0 audit measurements (not generator repair)', () => {
  it('distinguishes branches, chains, loops and disconnected nodes', () => {
    expect(graphMetrics(['a', 'b', 'c', 'd'], [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'a', to: 'd' }]))
      .toMatchObject({ forks: 1, endpoints: 3, loops: 0, components: 1, diameterHops: 2, terminalBranchMaxHops: 1 });
    expect(graphMetrics(['a', 'b', 'c', 'd'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }]))
      .toMatchObject({ forks: 0, endpoints: 2, diameterHops: 3, terminalBranchMaxHops: 3 });
    expect(graphMetrics(['a', 'b', 'c', 'd'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }]))
      .toMatchObject({ loops: 1, components: 2, diameterHops: 1 });
  });

  it('reports duplicate identities without negative loop counts', () => {
    expect(graphMetrics(['a', 'a', 'b'], [{ from: 'a', to: 'b' }]))
      .toMatchObject({ nodes: 2, duplicateNodes: 1, loops: 0, endpoints: 2 });
  });

  it('rejects phantom traversal and nonreciprocal connections in audit metrics', () => {
    const maze = generateStructuredMaze(9, 13, seededRng(42));
    const before = inspectOrdinary(maze).metrics;
    maze.cells.find(cell => cell.row === 0 && cell.column === 0)!.links.push('north');
    const phantom = inspectOrdinary(maze).metrics;
    expect(phantom.invalidLocalLinks).toBeGreaterThan(0);
    expect(phantom.reachableCells).toBe(before.reachableCells);
    const [from, to] = maze.layout!.connections![0].path;
    const target = maze.cells.find(cell => cell.row === to.row && cell.column === to.column)!;
    target.links = target.links.filter(direction => {
      const next = movePosition(to, direction);
      return next.row !== from.row || next.column !== from.column;
    });
    expect(inspectOrdinary(maze).metrics.connectorViolations).toBeGreaterThan(0);
  });

  it('checks the mirrored dimension helper against actual game descent', () => {
    const rng = seededRng(42);
    let game = createNewGameState();
    for (let level = 1; level <= 12; level++) {
      const expected = floorDimensions(level);
      expect(game.mazeMaxRooms).toBe(expected.mazeMaxRooms);
      expect([game.maze.rows, game.maze.columns]).toEqual([expected.rows, expected.columns]);
      game = descendFloor({ ...game, maze: { ...game.maze, active: game.maze.end },
        quests: game.quests.map(quest => ({ ...quest, status: 'claimed' })),
        chests: game.chests.map(chest => ({ ...chest, opened: true })) }, rng);
    }
  });

  it('is deterministic and records coverage instead of equating allocation with usable area', () => {
    const report = measureOrdinary(42, 25);
    expect(report).toEqual(measureOrdinary(42, 25));
    expect(report.metrics?.walkableCells).toBe(report.metrics?.reachableCells);
    expect(report.metrics?.walkableCoverage).toBeLessThan(0.1);
    expect(report.metrics).toMatchObject({ invalidRoles: 0, overlapPairs: 0, connectorViolations: 0 });
  });

  it('records the current >8 role defect rather than silently supplying fallback roles', () => {
    expect(roleBoundaryProbe(8).invalidRoles).toBe(0);
    expect(roleBoundaryProbe(9).invalidRoles).toBe(1);
    expect(roleBoundaryProbe(12).invalidRoles).toBe(4);
  });

  it.each([[1, 1], [1, 9], [2, 2], [3, 3], [9, 13]])('handles bounded small %ix%i layouts', (rows, columns) => {
    const { metrics } = measureOrdinarySize(rows, columns, 7);
    expect(metrics.allocatedCells).toBe(rows * columns);
    expect(metrics.graph.components).toBe(1);
    expect(metrics.overlapPairs).toBe(0);
  });

  it('skips allocation beyond the diagnostic budget and rejects unbounded levels', () => {
    expect(measureOrdinary(42, 60)).toMatchObject({ status: 'limited', reason: 'cell-allocation-limit', metrics: null });
    expect(() => floorDimensions(Infinity)).toThrow(RangeError);
    expect(() => floorDimensions(129)).toThrow(RangeError);
  });
});
