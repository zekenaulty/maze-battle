import { test, expect, fixture } from './rpg-command-browser';

for (const manual of [false, true]) test(`real corridor trail checkpoint ${manual ? 'refuses a capacity-consuming adoption' : 'yields before storage overflow'}`, async ({ page }, info) => {
  test.setTimeout(120_000);
  await fixture(page);
  const outcome = await page.evaluate(async manual => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze = h.lineMaze(270); game.maze.visibility = { radius: 2, explored: [] };
    game.chests = [{ id: 'distant-chest', level: 1, position: { row: 0, column: 269 }, opened: false }];
    game.floors = []; game.quests = [];
    await h.repository.saveGame('auto', 'Long ordinary corridor', 'auto', game);
    const session = new h.GameSession(() => {}); await session.start(); await session.prepareTravelMemory();
    const sourceId = (await h.repository.getGame('auto'))!.observationHead!, id = 'corridor-capacity';
    await session.executeTravel(session.travelRequest(id, { type: 'explore', continuation: 'corridor-v1',
      frontier: { anchor: { floor: 1, row: 0, column: 2 }, direction: 'east', sourceId },
      limits: { steps: null, replans: null, durationMs: null } }));
    for (let i = 0; i < (manual ? 254 : 255); i++) {
      await session.prepareTravelMemory(); const record = (await session.readTravel())!.travel;
      if (record.operation.status !== 'running') throw new Error(`Unexpected early stop at ${i}: ${record.operation.reason}`);
      await session.executeTravel(session.travelRequest(id, { type: 'step', sequence: record.operation.nextStep }));
    }
    const before = (await session.readTravel())!.travel;
    let adoption;
    if (manual) {
      await session.executeCommand(session.commandRequest({ type: 'move', direction: 'east', triggerStairs: false }));
      await session.prepareTravelMemory();
      adoption = await session.executeTravel(session.travelRequest(id, { type: 'adopt' }));
    }
    const after = (await session.readTravel())!, controlled = session.view.controlled, position = session.view.game!.maze.active;
    session.stop(); return { before, adoption, after, controlled, position };
  }, manual);
  expect(outcome.controlled).toBe(true); expect(outcome.position).toEqual({ row: 0, column: 255 });
  if (manual) {
    expect(outcome.before.exploration!.trail).toHaveLength(255);
    expect(outcome.adoption!.disposition).toBe('refused');
    expect(outcome.adoption!.reason).toContain('trail checkpoint');
    expect(outcome.after.travel).toEqual(outcome.before); expect(outcome.after.adoptionRequired).toBe(true);
  } else {
    expect(outcome.after.travel.operation).toMatchObject({ status: 'interrupted', steps: 255, deadline: null });
    expect(outcome.after.travel.exploration!.trail).toHaveLength(256);
    expect(outcome.after.travel.exploration!.decision!.kind).toBe('capacity');
  }
  await info.attach('corridor-capacity-proof', { contentType: 'application/json', body: JSON.stringify(outcome) });
});
