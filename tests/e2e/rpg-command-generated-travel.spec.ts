import { test, expect, fixture } from './rpg-command-browser';
import { generateModuleMaze } from '../../src/domain/maze/moduleGenerate';
import { createModuleRecipe } from '../../src/domain/expedition/topology/modules/policy';
import { findPath } from '../../src/domain/maze/solver';
import { movePosition, opposite } from '../../src/domain/maze/movement';

test('actual-game travel crosses generated module sockets using only the previously walked route', async ({ page }, info) => {
  await fixture(page);
  const maze = generateModuleMaze(createModuleRecipe('a1-generated-known-route', 1, 42));
  maze.visibility = { radius: 2, explored: [] };
  // Privileged audit/setup only: the host receives earned observations, not this solver or its path.
  const path = findPath(maze, maze.end)!;
  let point = maze.start;
  const positions = [point, ...path.directions.map(direction => (point = movePosition(point, direction)))];
  const keys = new Set(positions.map(p => `${p.row}:${p.column}`));
  const crossed = maze.layout!.connections!.filter(join => join.path.every(p => keys.has(`${p.row}:${p.column}`)));
  expect(crossed.length).toBeGreaterThanOrEqual(2);
  expect(path.distance).toBeLessThanOrEqual(128);
  const result = await page.evaluate(async ({ maze, forward, reverse }) => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze = maze;
    await h.repository.saveGame('auto', 'Generated known route', 'auto', game);
    const session = new h.GameSession(() => {}); await session.start();
    try {
      // Earn the route through ordinary, receipted movement and return before delegating.
      for (const direction of [...forward, ...reverse]) {
        const moved = await session.executeCommand(session.commandRequest({ type: 'move', direction, triggerStairs: false }));
        if (moved.outcome.status !== 'applied') throw new Error(`Fixture failed to walk its known route: ${JSON.stringify(moved.outcome)}`);
      }
      const before = session.view.game!;
      for (let batch = 0; ; batch++) {
        const memory = await session.prepareTravelMemory();
        if (memory.status === 'ready') break;
        if (memory.status !== 'partial' || batch >= 31) throw new Error('Fixture preparation bound exceeded.');
      }
      const admitted = await session.executeTravel(session.travelRequest('generated-known-route', { type: 'start',
        target: { floor: 1, ...maze.end }, limits: { steps: 128, replans: 4, durationMs: 120_000 } }));
      const windows = [];
      for (let window = 0; window < 8; window++) {
        const result = await h.travel.runTravelWindow(session, 'generated-known-route', { maxSteps: 16 });
        windows.push({ steps: result.steps, reason: result.reason });
        if (result.reason !== 'window-ended') break;
      }
      const after = session.view.game!, travel = await session.readTravel(), db = await h.repository.getDatabase();
      const receipts = (await db.getAll('rpgTravelActions')).filter(receipt => receipt.command);
      return { admitted, windows, travel, steps: receipts.map(receipt => receipt.travel!.position),
        before: { chests: before.chests, inventory: before.inventory, maze: before.maze.cells },
        after: { active: after.maze.active, floor: after.dungeonLevel, chests: after.chests, inventory: after.inventory, maze: after.maze.cells } };
    } finally { session.stop(); }
  }, { maze, forward: path.directions, reverse: [...path.directions].reverse().map(opposite) });
  expect(result.admitted.disposition).toBe('applied');
  expect(result.travel!.travel.operation).toMatchObject({ status: 'arrived', steps: path.distance });
  expect(result.after.active).toEqual(maze.end); expect(result.after.floor).toBe(1);
  expect(result.after.chests).toEqual(result.before.chests); expect(result.after.inventory).toEqual(result.before.inventory);
  expect(result.after.maze).toEqual(result.before.maze);
  const visited = new Set(result.steps.map(p => `${p.row}:${p.column}`));
  for (const join of crossed) for (const cell of join.path) expect(visited.has(`${cell.row}:${cell.column}`)).toBe(true);
  await info.attach('generated-known-route-audit', { contentType: 'application/json', body: JSON.stringify({
    recipe: maze.layout!.assembly!.recipe, doorways: crossed.map(join => join.id),
    steps: result.steps, windows: result.windows, operation: result.travel!.travel.operation,
  }) });
});
