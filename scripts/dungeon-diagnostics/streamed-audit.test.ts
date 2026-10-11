// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { connection } from '../../src/domain/expedition/topology/geometry';
import type { TopologyConnection, TopologySpace } from '../../src/domain/expedition/topology/types';
import { inspectStreamedSnapshot } from './streamed';

function room(id: string, row: number, column: number, rows = 3, columns = 3): TopologySpace {
  return { schematic: 'stone-room-v1', spec: { id, kind: 'room', name: id, seed: 0,
    origin: { row, column }, rows, columns, openings: [], chests: [] } };
}
const start = { spaceId: 'r0', row: 1, column: 1 };

describe('independent streamed measurement checks', () => {
  it('matches a matrix oracle for all 64 simple four-room graphs', () => {
    const pairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    for (let mask = 0; mask < 64; mask++) {
      const rooms = Array.from({ length: 4 }, (_, index) => room(`r${index}`, 0, index * 10));
      const spaces = [...rooms];
      const links: TopologyConnection[] = [];
      const edges = pairs.filter((_, index) => mask & (1 << index));
      const matrix = rooms.map((_, first) => rooms.map((_, second) => first === second ? 0 : Infinity));
      const degrees = [0, 0, 0, 0];
      for (const [index, [from, to]] of edges.entries()) {
        const passage = room(`p${index}`, 10 + index, 0, 1, 1);
        passage.spec.kind = 'passage';
        spaces.push(passage);
        // Abstract graph fixtures intentionally do not imply physically valid placement.
        links.push(connection(`in${index}`, rooms[from].spec, passage.spec, 'east'),
          connection(`out${index}`, passage.spec, rooms[to].spec, 'east'));
        matrix[from][to] = matrix[to][from] = 1;
        degrees[from]++;
        degrees[to]++;
      }
      for (let via = 0; via < 4; via++) for (let from = 0; from < 4; from++) for (let to = 0; to < 4; to++) {
        matrix[from][to] = Math.min(matrix[from][to], matrix[from][via] + matrix[via][to]);
      }
      const components = new Set(matrix.map(row => row.findIndex(Number.isFinite))).size;
      const depth = (index: number) => Number.isFinite(matrix[0][index]) ? matrix[0][index] : null;
      const graph = inspectStreamedSnapshot(spaces, links, start).roomGraph;
      expect(graph, `graph mask ${mask}`).toMatchObject({ nodes: 4, edges: edges.length,
        degrees: Object.fromEntries(degrees.map((degree, index) => [`r${index}`, degree])),
        forks: degrees.filter(degree => degree >= 3).length,
        endpoints: degrees.filter(degree => degree === 1).length,
        isolated: degrees.filter(degree => degree === 0).length,
        components, loops: edges.length - 4 + components,
        diameter: components === 1 ? Math.max(...matrix.flat()) : null,
        depthsFromEntry: Object.fromEntries(rooms.map((_, index) => [`r${index}`, depth(index)])),
        branchDepths: Object.fromEntries(rooms.flatMap((_, index) => index && degrees[index] === 1 ? [[`r${index}`, depth(index)]] : [])),
      });
    }
  });

  it('matches a cell-set oracle for union coverage and overlap pairs in 32 layouts', () => {
    for (let layout = 0; layout < 32; layout++) {
      const spaces = Array.from({ length: 4 }, (_, index) => room(`r${index}`,
        (layout + 3 * index) % 7 - 3, (layout * (index + 1)) % 9 - 4,
        1 + (layout + index) % 3, 1 + (layout * index) % 4));
      const cells = spaces.map(({ spec }) => new Set(Array.from({ length: spec.rows * spec.columns }, (_, index) =>
        `${spec.origin.row + Math.floor(index / spec.columns)},${spec.origin.column + index % spec.columns}`)));
      const union = new Set(cells.flatMap(value => [...value]));
      const coordinates = [...union].map(value => value.split(',').map(Number));
      const minRow = Math.min(...coordinates.map(value => value[0]));
      const maxRow = Math.max(...coordinates.map(value => value[0]));
      const minColumn = Math.min(...coordinates.map(value => value[1]));
      const maxColumn = Math.max(...coordinates.map(value => value[1]));
      const boundingArea = (maxRow - minRow + 1) * (maxColumn - minColumn + 1);
      let overlapPairs = 0;
      for (let first = 0; first < cells.length; first++) for (let second = first + 1; second < cells.length; second++) {
        if ([...cells[first]].some(cell => cells[second].has(cell))) overlapPairs++;
      }
      const value = inspectStreamedSnapshot(spaces, [], start);
      expect(value.roomFootprint, `footprint layout ${layout}`).toEqual({
        bounds: { row: minRow, column: minColumn, rows: maxRow - minRow + 1, columns: maxColumn - minColumn + 1 },
        summedArea: cells.reduce((sum, value) => sum + value.size, 0), unionArea: union.size,
        boundingArea, coverage: union.size / boundingArea,
      });
      expect(value.validation.overlapPairs).toBe(overlapPairs);
      expect(value.validation.overlapComparisons).toBe(6);
    }
  });

  it('keeps abstract reachability separate from invalid start-cell traversal', () => {
    const value = inspectStreamedSnapshot([room('r0', 0, 0)], [], { ...start, row: 99 });
    expect(value.roomGraph).toMatchObject({ components: 1, depthsFromEntry: { r0: 0 } });
    expect(value.physicalTraversal).toMatchObject({ reachedCells: 0, unreachableCells: 9, valid: false });
  });
});
