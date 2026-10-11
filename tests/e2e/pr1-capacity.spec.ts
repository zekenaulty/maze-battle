import { expect, test } from '@playwright/test';

for (const source of ['manual', 'auto'] as const) test(`${source} capacity failure preserves the saved floor and usable control`, async ({ page }) => {
  await page.goto('/tests/e2e/pr1-custody-fixture.html');
  await page.waitForFunction(() => !!window.ordinaryCustody);
  const result = await page.evaluate(async source => {
    const h = window.ordinaryCustody;
    const paths = { factory: '/src/domain/gameFactory.ts', legacy: '/src/domain/maze/structuredGenerate.ts',
      solver: '/src/domain/maze/solver.ts', movement: '/src/hooks/useGameLoop.ts', auto: '/src/domain/automation/autopilot.ts' };
    const factory = await import(/* @vite-ignore */ paths.factory) as typeof import('../../src/domain/gameFactory');
    const legacy = await import(/* @vite-ignore */ paths.legacy) as typeof import('../../src/domain/maze/structuredGenerate');
    const solver = await import(/* @vite-ignore */ paths.solver) as typeof import('../../src/domain/maze/solver');
    const movement = await import(/* @vite-ignore */ paths.movement) as typeof import('../../src/hooks/useGameLoop');
    const auto = await import(/* @vite-ignore */ paths.auto) as typeof import('../../src/domain/automation/autopilot');
    const maze = legacy.generateStructuredMaze(9, 13, () => 0.42);
    let game = factory.createNewGameState({ id: 'capacity-test', dungeonLevel: 125, maze, randomBattles: false });
    const route = solver.findPath(game.maze, game.maze.end)!.directions;
    for (const direction of route.slice(0, -1)) game = factory.moveActive(game, direction, { triggerStairs: false });
    game = { ...game, chests: game.chests.map(chest => ({ ...chest, opened: true })),
      quests: game.quests.map(quest => ({ ...quest, status: 'claimed' })) };
    if (source === 'auto') {
      game = { ...factory.moveActive(game, route.at(-1)!, { triggerStairs: false }), mode: 'auto-play' };
    }
    await h.repository.saveGame('auto', 'Capacity fixture', 'auto', game);
    await h.start();
    const session = h.controller!;
    const before = await h.custody.readGameControl();
    session.transition(source === 'manual' ? state => movement.moveManually(state, route.at(-1)!)
      : state => auto.advanceAutopilot(state, () => 0.5), { source, action: 'capacity-descent' });
    await session.flush();
    const failed = await h.custody.readGameControl();
    const controlled = session.view.controlled;
    const trace = session.view.telemetry;
    session.transition(state => ({ ...state, facing: 'north' }), { source: 'manual', action: 'still-controllable' });
    await session.flush();
    const afterInput = await h.custody.readGameControl();
    session.stop();
    await h.start();
    return { before, failed, afterInput, controlled, trace, reloaded: h.controller!.view };
  }, source);
  expect(result.failed.game?.maze).toEqual(result.before.game?.maze);
  expect(result.failed.game?.floors).toEqual(result.before.game?.floors);
  expect(result.failed.game?.chests).toEqual(result.before.game?.chests);
  expect(result.failed.game?.quests).toEqual(result.before.game?.quests);
  expect(result.failed.game?.dungeonLevel).toBe(125);
  expect(result.failed.game?.mode).toBe('manual');
  expect(result.failed.game?.autopilot).toMatchObject({ phase: 'blocked', route: [], reason: expect.stringContaining('258 modules') });
  expect(result.failed.control?.epoch).toBe(result.before.control?.epoch);
  expect(result.controlled).toBe(true);
  expect(result.afterInput.control!.revision).toBeGreaterThan(result.failed.control!.revision);
  expect(result.afterInput.game?.facing).toBe('north');
  expect(result.reloaded.controlled).toBe(true);
  expect(result.reloaded.game?.maze).toEqual(result.before.game?.maze);
  expect(result.reloaded.game?.automationPaused).toBe(true);
});
