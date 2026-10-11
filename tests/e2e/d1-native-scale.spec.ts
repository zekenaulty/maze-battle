import { expect, test } from '@playwright/test';

for (const fixture of [{ rooms: 256, floors: 1 }, { rooms: 128, floors: 16 }]) {
  test(`native persisted travel: ${fixture.rooms} rooms, ${fixture.floors} floors`, async ({ page }, info) => {
    await page.goto('/tests/e2e/pr1-custody-fixture.html');
    await page.waitForFunction(() => !!window.ordinaryCustody);
    const result = await page.evaluate(async fixture => {
      const h = window.ordinaryCustody;
      const paths = { projection: '/src/domain/maze/moduleGenerate.ts', policy: '/src/domain/expedition/topology/modules/policy.ts',
        factory: '/src/domain/gameFactory.ts', solver: '/src/domain/maze/solver.ts', movement: '/src/domain/maze/movement.ts' };
      const { generateModuleMaze } = await import(/* @vite-ignore */ paths.projection) as typeof import('../../src/domain/maze/moduleGenerate');
      const { createModuleRecipe } = await import(/* @vite-ignore */ paths.policy) as typeof import('../../src/domain/expedition/topology/modules/policy');
      const { moveActive } = await import(/* @vite-ignore */ paths.factory) as typeof import('../../src/domain/gameFactory');
      const { findPath } = await import(/* @vite-ignore */ paths.solver) as typeof import('../../src/domain/maze/solver');
      const { movePosition } = await import(/* @vite-ignore */ paths.movement) as typeof import('../../src/domain/maze/movement');
      const floors = Array.from({ length: fixture.floors }, (_, i) => ({ level: i + 1, mazeMaxRooms: 32,
        maze: generateModuleMaze({ ...createModuleRecipe('native-scale', i + 1, 42 + i), roomBudget: fixture.rooms }) }));
      const game = h.createNewGameState({ id: 'native-scale', dungeonLevel: fixture.floors,
        maze: floors.at(-1)!.maze, floors, randomBattles: false });
      const bytes = new TextEncoder().encode(JSON.stringify(game)).length;
      const initialGeometry = JSON.stringify(game.floors.map(f => ({ cells: f.maze.cells, layout: f.maze.layout })));
      await h.repository.saveGame('auto', 'Native scale', 'auto', game);
      let start = performance.now();
      await h.start();
      const startMs = performance.now() - start;
      const session = h.controller!;
      const route = findPath(game.maze, game.maze.end)!.directions.slice(0, 16);
      const latencies: number[] = [];
      let expected = game.maze.active;
      for (const direction of route) {
        start = performance.now();
        session.transition(state => moveActive(state, direction, { triggerStairs: false }), { source: 'manual', action: 'scale-move' });
        await session.flush();
        latencies.push(performance.now() - start);
        expected = movePosition(expected, direction);
        if (JSON.stringify(session.view.game!.maze.active) !== JSON.stringify(expected)) throw new Error('Native move failed');
        if (!session.view.controlled) throw new Error(session.view.status);
      }
      const after = await h.custody.readGameControl();
      const geometryPreserved = initialGeometry === JSON.stringify(after.game!.floors.map(f => ({ cells: f.maze.cells, layout: f.maze.layout })));
      session.stop();
      start = performance.now();
      await h.start();
      const reloadMs = performance.now() - start;
      const sameReload = JSON.stringify(h.controller!.view.game) === JSON.stringify(after.game);
      h.controller!.stop();
      return { fixture, bytes, moves: route.length, startMs, latencies, reloadMs, geometryPreserved, sameReload,
        controlledBeforeStop: session.view.status === 'Saved' };
    }, fixture);
    expect(result.moves).toBe(16);
    expect(result.geometryPreserved).toBe(true);
    expect(result.sameReload).toBe(true);
    expect(result.controlledBeforeStop).toBe(true);
    await info.attach('native-scale', { contentType: 'application/json', body: JSON.stringify(result, null, 2) });
    console.log(JSON.stringify(result));
  });
}
