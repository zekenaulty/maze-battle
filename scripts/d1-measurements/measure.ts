import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import type { GameState } from '../../src/domain/types';
import { generateModuleMaze } from '../../src/domain/maze/moduleGenerate';
import { createModuleRecipe } from '../../src/domain/expedition/topology/modules/policy';
import { ModuleAssembly } from '../../src/domain/expedition/topology/modules/assembly';
import { moduleQuality } from '../../src/domain/expedition/topology/modules/quality';
import { createNewGameState, moveActive, normalizeGameState } from '../../src/domain/gameFactory';
import { createMazePathSearch } from '../../src/domain/maze/solver';
import { cellKey, samePosition } from '../../src/domain/maze/key';
import { movePosition, opposite } from '../../src/domain/maze/movement';

const fixedTime = '2026-10-11T00:00:00.000Z';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const timed = <T>(fn: () => T) => {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
};
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const recipeFor = (seed: number, budget: number, level = 1) => ({
  ...createModuleRecipe('d1-measurements', level, seed), roomBudget: budget,
});
function newGame(seed: number, budget: number, level = 1) {
  const generation = timed(() => generateModuleMaze(recipeFor(seed, budget, level)));
  const creation = timed(() => createNewGameState({ id: `d1-${budget}-${seed}`, maze: generation.value,
    dungeonLevel: level, randomBattles: false, mode: 'manual', createdAt: fixedTime, updatedAt: fixedTime }));
  return { game: creation.value, generationMs: generation.ms, createGameMs: creation.ms };
}

function persistence(game: GameState) {
  const stringifyMs: number[] = [], parseMs: number[] = [], normalizeMs: number[] = [], reloadMs: number[] = [];
  let serialized = '';
  let reloaded = game;
  for (let i = 0; i < 3; i++) {
    const encoded = timed(() => JSON.stringify(game));
    serialized = encoded.value;
    stringifyMs.push(encoded.ms);
    const parsed = timed(() => JSON.parse(serialized));
    parseMs.push(parsed.ms);
    const normalized = timed(() => normalizeGameState(parsed.value));
    normalizeMs.push(normalized.ms);
    reloadMs.push(parsed.ms + normalized.ms);
    reloaded = normalized.value;
  }
  assert.equal(hash(reloaded.maze), hash(game.maze));
  assert.equal(reloaded.floors.length, game.floors.length);
  for (const floor of game.floors) assert.equal(hash(reloaded.floors.find(f => f.level === floor.level)?.maze), hash(floor.maze));
  const active = game.floors.find(floor => floor.level === game.dungeonLevel)!;
  assert.equal(hash(active.maze), hash(game.maze));
  return { fullGameStateBytes: Buffer.byteLength(serialized), activeMazeBytes: bytes(game.maze),
    floorArrayBytes: bytes(game.floors), activeFloorDuplicateMazeBytes: bytes(active.maze),
    fullWithoutActiveFloorEntryBytes: bytes({ ...game, floors: game.floors.filter(f => f.level !== game.dungeonLevel) }),
    stringifyMs, parseMs, normalizeMs, reloadMs,
    medianStringifyMs: median(stringifyMs), medianNormalizeMs: median(normalizeMs), medianReloadMs: median(reloadMs),
    preservedAllFloorMazes: true };
}

function traverse(initial: GameState) {
  let game = initial;
  const search = createMazePathSearch(game.maze);
  const farthest = [...game.maze.layout!.rooms].sort((a, b) => search.distanceTo(b.center) - search.distanceTo(a.center) || a.id.localeCompare(b.id))[0];
  const requested = [{ id: 'exit', position: game.maze.end },
    ...game.chests.map(chest => ({ id: chest.id, position: chest.position })),
    { id: `farthest-${farthest.id}`, position: farthest.center }, { id: 'return-start', position: game.maze.start }];
  const seen = new Set<string>();
  const targets = requested.filter(target => {
    const key = cellKey(target.position);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const stepTimes: number[] = [], routes: object[] = [];
  const started = performance.now();
  let routeSearchMs = 0, reached = 0;
  for (const target of targets) {
    const route = timed(() => createMazePathSearch(game.maze).pathTo(target.position));
    routeSearchMs += route.ms;
    assert.ok(route.value, `Unreachable ${target.id}`);
    let done = 0;
    for (const direction of route.value.directions) {
      if (stepTimes.length >= 1024 || performance.now() - started >= 10000) break;
      const expected = movePosition(game.maze.active, direction);
      const movement = timed(() => moveActive(game, direction, { triggerStairs: false }));
      game = movement.value;
      stepTimes.push(movement.ms);
      assert.ok(samePosition(game.maze.active, expected));
      assert.equal(game.dungeonLevel, initial.dungeonLevel);
      assert.equal(game.battle, undefined);
      done++;
    }
    const arrived = samePosition(game.maze.active, target.position);
    routes.push({ id: target.id, distance: route.value.distance, stepsCompleted: done, arrived });
    if (!arrived) break;
    reached++;
  }
  const sorted = [...stepTimes].sort((a, b) => a - b);
  return { status: reached === targets.length ? 'complete' : 'bounded', targets: targets.length, reached, routes,
    moves: stepTimes.length, moveActiveMs: stepTimes.reduce((a, b) => a + b, 0), routeSearchMs,
    wallMs: performance.now() - started, stepMedianMs: median(stepTimes), stepP95Ms: sorted[Math.ceil(sorted.length * .95) - 1],
    stepMaxMs: Math.max(...stepTimes), visitedCells: game.maze.visited.length, exploredCells: game.maze.visibility!.explored.length,
    initialQuests: initial.quests.length, finalQuests: game.quests.length,
    claimedQuests: game.quests.filter(q => q.status === 'claimed').length,
    openedChests: game.chests.filter(chest => chest.opened).length, battle: Boolean(game.battle),
    fullGameStateBytesAfterTraversal: bytes(game), geometryPreserved: hash(game.maze.cells) === hash(initial.maze.cells) };
}

export function measureFloor(seed: number, budget: number) {
  const assembled = timed(() => {
    const builder = new ModuleAssembly(recipeFor(seed, budget));
    const state = builder.finish();
    return { state, work: builder.work };
  });
  const quality = moduleQuality(assembled.value.state);
  const { game, generationMs, createGameMs } = newGame(seed, budget);
  const maze = game.maze;
  assert.equal(maze.layout!.rooms.length, budget);
  assert.equal(maze.cells.length, quality.projectionCells);
  const reachable = createMazePathSearch(maze);
  const walkable = maze.cells.filter(cell => cell.links.length > 0).length;
  const allCentersReachable = maze.layout!.rooms.every(room => Number.isFinite(reachable.distanceTo(room.center)));
  assert.ok(allCentersReachable);
  assert.equal(reachable.visitedCount, walkable);
  for (const cell of maze.cells) for (const direction of cell.links) {
    const to = movePosition(cell, direction);
    assert.ok(to.row >= 0 && to.column >= 0 && to.row < maze.rows && to.column < maze.columns);
    assert.ok(maze.cells[to.row * maze.columns + to.column].links.includes(opposite(direction)));
  }
  const rooms = maze.layout!.rooms;
  const graph = new Map(rooms.map(room => [room.id, [] as string[]]));
  for (const connection of maze.layout!.connections!) {
    graph.get(connection.fromRoomId)!.push(connection.toRoomId);
    graph.get(connection.toRoomId)!.push(connection.fromRoomId);
  }
  const degreeHistogram: Record<string, number> = {};
  for (const links of graph.values()) degreeHistogram[links.length] = (degreeHistogram[links.length] ?? 0) + 1;
  const distances = (from: string) => {
    const found = new Map([[from, 0]]), queue = [from];
    for (let i = 0; i < queue.length; i++) for (const to of graph.get(queue[i])!) if (!found.has(to)) {
      found.set(to, found.get(queue[i])! + 1); queue.push(to);
    }
    return found;
  };
  const independentDiameter = Math.max(...rooms.map(room => Math.max(...distances(room.id).values())));
  assert.equal(independentDiameter, quality.diameter);
  const leafDepths = [...distances('entry')].filter(([id]) => graph.get(id)!.length === 1).map(([, d]) => d).sort((a, b) => a - b);
  const entryDistances = distances('entry');
  let tip = [...entryDistances].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const spine = new Set([tip]);
  while (tip !== 'entry') {
    tip = graph.get(tip)!.find(id => entryDistances.get(id) === entryDistances.get(tip)! - 1)!;
    spine.add(tip);
  }
  const sideDepths = [...graph].filter(([, neighbors]) => neighbors.length === 1)
    .map(([id]) => Math.min(...[...distances(id)].filter(([to]) => spine.has(to)).map(([, distance]) => distance)))
    .sort((a, b) => a - b);
  const roomAreas = rooms.map(room => room.rows * room.columns);
  const structural = { ...quality, walkableCells: walkable, walkableCoverage: walkable / maze.cells.length,
    voidCells: maze.cells.length - walkable, allCentersReachable, degreeHistogram, independentDiameter, leafDepths, sideDepths,
    minRoomArea: Math.min(...roomAreas), maxRoomArea: Math.max(...roomAreas), medianRoomArea: median(roomAreas),
    minimum5x5NonEntryFraction: rooms.filter(room => room.id !== 'entry' && room.rows === 5 && room.columns === 5).length / (budget - 1),
    forkFraction: quality.forks / budget,
    farthestCellDistance: Math.max(...rooms.map(room => reachable.distanceTo(room.center))),
    passageLengths: assembled.value.state.spaces.filter(space => space.kind === 'passage').map(space => Math.max(space.rows, space.columns)) };
  const saved = persistence(game);
  const traversal = traverse(game);
  return { status: traversal.status === 'complete' ? 'complete' : 'partial', recipe: recipeFor(seed, budget),
    geometrySha256: hash({ cells: maze.cells, layout: maze.layout, start: maze.start, end: maze.end }),
    generationMs, createGameMs, assemblyDiagnosticMs: assembled.ms,
    work: { committedProposalCounters: { candidates: assembled.value.work.candidates,
      occupancyQueries: assembled.value.work.occupancyQueries, localChecks: assembled.value.work.localChecks },
    physicalIndexReads: assembled.value.work.index }, structural, persistence: saved, traversal };
}

export function measureArchives(budget: number, count: number) {
  const games: GameState[] = [];
  let generatedMs = 0;
  for (let level = 1; level <= count; level++) {
    const fixture = newGame(42 + level - 1, budget, level);
    games.push(fixture.game);
    generatedMs += fixture.generationMs;
  }
  const active = games[games.length - 1];
  const joined = timed(() => normalizeGameState({ ...active, floors: games.flatMap(game => game.floors),
    chests: games.flatMap(game => game.chests), quests: games.flatMap(game => game.quests) }));
  assert.equal(joined.value.floors.length, count);
  const saved = persistence(joined.value);
  return { status: 'complete', generatedMs, fixtureAssemblyNormalizeMs: joined.ms, totalFloors: count,
    archivedFloors: count - 1, cellsAcrossFloors: games.reduce((sum, game) => sum + game.maze.cells.length, 0),
    persistence: saved, constructedArchiveNotStairsProof: true };
}
