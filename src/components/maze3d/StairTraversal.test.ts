import { expect, it } from 'vitest';
import { stageFixture } from './stage.test-support';
import { StageWalker } from './movement';
import { StairTraversal, type StairCrossing } from './StairTraversal';
import { addressKey, type StageConnector } from './scene';
import { WALK_SPEED } from './constants';
import { compileStageScene } from './scene';

async function fixture() {
  const { game } = await stageFixture(), scene = compileStageScene(game)!;
  const upper = scene.actor.source.at, lower = { level: 2, cell: { spaceId: 'entry', row: 4, column: 4 } };
  const connector: StageConnector = { binding: 'snapshot-1', upper: { x: 0, y: 0, z: 0 }, lower: { x: 0, y: -4.68, z: -9.36 },
    sight: { id: 'world/stairs/1', upper, lower, upperPoint: { row: 0, column: 0 }, lowerPoint: { row: 4, column: 4 },
      placement: { version: 'straight-stair-placement-v1', recipe: 'straight-stair-v1', upperFrame: [0, 0, 0], lowerFrame: [-12.8, -4.68, -22.16] },
      targetFrame: [-12.8, -4.68, -22.16], cells: [{ ...scene.actor.source, at: lower, chests: [], stairs: [] }] } };
  // This fixture intentionally exercises the v1 single-connector compatibility path.
  scene.connector = connector; scene.connectors = undefined; return { scene, connector, upper, lower };
}
it('does not snap on either approach, and bounds the input step independently of frame count', async () => {
  const { connector } = await fixture();
  for (const end of ['upper', 'lower'] as const) {
    const anchor = connector[end], sign = end === 'upper' ? 1 : -1, start = { x: .3, z: anchor.z + sign * .6 };
    const travel = new StairTraversal(connector, end, start), before = travel.pose;
    travel.advance(.05, { x: 0, z: -sign });
    expect(Math.hypot(travel.pose.x - before.x, travel.pose.z - before.z)).toBeLessThanOrEqual(WALK_SPEED * .05 + 1e-8);
    expect(before.z).toBeCloseTo(start.z); expect(before.x).toBe(start.x);
  }
});
it('accepts lateral approaches across the full supported landing at either end', async () => {
  const { scene, connector, lower } = await fixture();
  for (const end of ['upper', 'lower'] as const) {
    const at = end === 'upper' ? connector.sight.upper : lower, anchor = connector[end];
    const walker = new StageWalker({ ...scene, actor: { ...scene.actor, key: addressKey(at), source: { ...scene.actor.source, at },
      center: { x: anchor.x, z: anchor.z }, floorY: anchor.y } });
    walker.position = { x: anchor.x + .51, z: anchor.z + (end === 'upper' ? -.8 : .8) };
    expect(walker.advanceStairs(.05, end === 'upper' ? 1 : -1, 0, 0).handled).toBe(true);
    expect(walker.stairs).toBeDefined(); expect(Math.abs(walker.floorY - anchor.y)).toBeLessThan(.16);
  }
});
it('dispatches once, bounds delayed prediction and retains height/pose at the accepted floor change', async () => {
  const { scene, connector, lower } = await fixture(), walker = new StageWalker(scene);
  let crossing: StairCrossing | undefined;
  for (let i = 0; i < 200; i++) crossing ??= walker.advanceStairs(.05, 1, 0, 0).crossing;
  expect(crossing?.direction).toBe('down'); expect(walker.stairs!.progress).toBeLessThanOrEqual(.57);
  for (let i = 0; i < 50; i++) expect(walker.advanceStairs(.05, 1, 0, 0).crossing).toBeUndefined();
  const before = { ...walker.position, y: walker.floorY };
  walker.update({ ...scene, level: 2, connector: { ...connector, binding: 'snapshot-2' }, actor: { ...scene.actor,
    key: addressKey(lower), source: { ...scene.actor.source, at: lower }, center: { x: 0, z: -9.36 }, floorY: -4.68 } });
  expect(walker.settleStairs(crossing!)).toBe(true); expect({ ...walker.position, y: walker.floorY }).toEqual(before);
  for (let i = 0; i < 80 && walker.stairs; i++) walker.advanceStairs(.05, 1, 0, 0);
  expect(walker.floorY).toBeCloseTo(-4.68); expect(walker.stairs).toBeUndefined();
  let reverse: StairCrossing | undefined;
  for (let i = 0; i < 100; i++) reverse ??= walker.advanceStairs(.05, -1, 0, 0).crossing;
  expect(reverse?.direction).toBe('up'); expect(reverse?.binding).toBe('snapshot-2');
});
it('recovers to the committed endpoint after refusal, relocation, control loss or stale publication', async () => {
  for (const reason of ['refused', 'relocated', 'cancelled', 'stale']) {
    const { scene } = await fixture(), walker = new StageWalker(scene);
    let crossing: StairCrossing | undefined;
    for (let i = 0; i < 45; i++) crossing ??= walker.advanceStairs(.05, 1, 0, 0).crossing;
    if (reason === 'refused') expect(walker.settleStairs(crossing!)).toBe(false);
    else if (reason === 'cancelled') walker.cancelStairs();
    else walker.update({ ...scene, ...(reason === 'relocated' ? { connector: undefined } : { connector: { ...scene.connector!, binding: 'other-snapshot' } }),
      actor: { ...scene.actor, key: 'other-actor' } });
    expect(walker.stairs).toBeUndefined(); expect(walker.position).toEqual(scene.actor.center);
  }
});
it('never admits an unprepared or merely visible connector as normal planar movement', async () => {
  const { scene, connector } = await fixture();
  scene.connector = { ...connector, sight: { ...connector.sight, cells: [] } };
  const walker = new StageWalker(scene);
  for (let i = 0; i < 80; i++) expect(walker.advanceStairs(.05, 1, 0, 0).handled).toBe(false);
  expect(walker.stairs).toBeUndefined();
});
it('preserves the local flight while preparation republishes geometry and only travels with the ready binding', async () => {
  const { scene, connector, lower } = await fixture();
  scene.connector = { ...connector, sight: { ...connector.sight, geometryReady: true, travelReady: false, cells: [] } };
  const walker = new StageWalker(scene);
  for (let i = 0; i < 100; i++) expect(walker.advanceStairs(.05, 1, 0, 0).crossing).toBeUndefined();
  const flight = walker.stairs!, held = { ...walker.position, y: walker.floorY };
  expect(flight.progress).toBeCloseTo(.45); expect(flight.pending).toBeUndefined();
  expect(walker.scene.actor.source.at).toEqual(connector.sight.upper);
  for (const binding of ['preparation-2', 'preparation-3']) {
    walker.update({ ...scene, connector: { ...scene.connector!, binding } });
    expect(walker.stairs).toBe(flight); expect({ ...walker.position, y: walker.floorY }).toEqual(held);
    for (let i = 0; i < 10; i++) expect(walker.advanceStairs(.05, 1, 0, 0).crossing).toBeUndefined();
  }
  const ready = { ...scene.connector!, binding: 'prepared-ready', sight: { ...scene.connector!.sight, travelReady: true } };
  walker.update({ ...scene, connector: ready });
  let crossing: StairCrossing | undefined;
  for (let i = 0; i < 20 && !crossing; i++) crossing = walker.advanceStairs(.05, 1, 0, 0).crossing;
  expect(crossing).toMatchObject({ binding: 'prepared-ready', source: connector.sight.upper, target: lower, direction: 'down' });
  expect(walker.scene.actor.source.at).toEqual(connector.sight.upper);
  const predicted = { ...walker.position, y: walker.floorY };
  walker.update({ ...scene, connector: { ...ready, binding: 'accepted' }, actor: { ...scene.actor, key: addressKey(lower),
    source: { ...scene.actor.source, at: lower }, center: { x: connector.lower.x, z: connector.lower.z }, floorY: connector.lower.y } });
  expect(walker.settleStairs(crossing!)).toBe(true);
  expect({ ...walker.position, y: walker.floorY }).toEqual(predicted);
});

it('does not mutate a pending stair request when a newer binding publishes or a late result follows cancellation', async () => {
  const { scene, connector } = await fixture(), walker = new StageWalker(scene);
  let crossing: StairCrossing | undefined;
  for (let i = 0; i < 100 && !crossing; i++) crossing = walker.advanceStairs(.05, 1, 0, 0).crossing;
  walker.update({ ...scene, connector: { ...connector, binding: 'newer-view' } });
  expect(walker.stairs!.pending).toBe(crossing); expect(crossing!.binding).toBe('snapshot-1');
  walker.cancelStairs(); const landing = { ...walker.position };
  expect(walker.settleStairs(crossing!)).toBe(false); expect(walker.position).toEqual(landing);
  expect(walker.stairs).toBeUndefined(); expect(walker.scene.actor.source.at).toEqual(connector.sight.upper);
});

it('cancels a local flight if preparation changes its placement instead of merely its binding', async () => {
  const { scene, connector } = await fixture(), walker = new StageWalker(scene);
  for (let i = 0; i < 10; i++) walker.advanceStairs(.05, 1, 0, 0);
  expect(walker.stairs).toBeDefined();
  const changed = structuredClone(connector); changed.sight.placement.lowerFrame[0] += 3.2;
  walker.update({ ...scene, connector: changed });
  expect(walker.stairs).toBeUndefined(); expect(walker.position).toEqual(scene.actor.center);
});
