// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sameAddress } from '../../../domain/expedition/address';
import type { StreamDestination } from '../../../domain/expedition/streaming/directed/types';
import { StreamPlanner } from '../../../domain/expedition/streaming/planner';
import { StreamHarness } from '../../../domain/expedition/streaming/testSupport';
import { prepareDirectedStreamStep, settleDirectedStreamMove, startDirectedStreamTravel } from './adapter';
import { loadDirectedStreamKnowledge } from './knowledge';
import { DirectedTestHost, discoveredWorld, travel } from './testSupport';

describe('streamed known destination on generated observations', () => {
  it.each([1, 55, 20261008])('travels through three discovered rooms to an unloaded chest without interaction (seed %s)', async seed => {
    const { world, target } = await discoveredWorld(seed);
    const host = new DirectedTestHost(world);
    const before = structuredClone(world.checkpoint);
    expect(host.cache.stats().loads).toBe(0);
    const started = await startDirectedStreamTravel(host.frame(), { id: 'to-known-chest', target }, host.read, () => 0);
    expect(started.state.operation.status, started.state.operation.reason).toBe('running');
    expect(started.diagnostics.cells).toBeLessThanOrEqual(512);
    expect(started.diagnostics.pages).toBeGreaterThanOrEqual(5);
    expect(started.diagnostics.geometryCells).toBe(0);
    expect(host.cache.stats().loads).toBe(0);
    const finished = await travel(host, started.state);
    expect(finished.operation.status, finished.operation.reason).toBe('arrived');
    expect(world.checkpoint.position).toEqual(target.address);
    expect(host.roomLoads).toContain(target.address.spaceId);
    expect(new Set(host.movements.flatMap(move => [move.from.spaceId, move.to.spaceId])).size).toBeGreaterThanOrEqual(5);
    expect(new Set(host.movements.flatMap(move => [move.from.spaceId, move.to.spaceId])
      .filter(id => world.topology.space(id)!.spec.kind === 'room')).size).toBe(3);
    expect(host.movements.every(move => move.request.command.type === 'move')).toBe(true);
    expect(finished.operation.steps).toBe(host.movements.length);
    expect(finished.operation.steps).toBeLessThanOrEqual(64);
    expect(world.checkpoint.topologyRevision).toBe(before.topologyRevision);
    expect(world.checkpoint.collectedChests).toBe(before.collectedChests);
    expect(world.checkpoint.visitedSpaces).toBe(before.visitedSpaces);
    expect(world.checkpoint.phase).toBe('exploring');
    if (target.kind !== 'chest') throw new Error('Expected chest fixture');
    expect(world.pages.get(target.address.spaceId)!.chests[target.chestId].opened).toBe(false);
  });

  it('stops at the aggregate bound on a larger genuinely explored world without loading geometry', async () => {
    const world = new StreamHarness(55, 2);
    const explorer = new StreamPlanner();
    for (let i = 0; i < 8000; i++) {
      const decision = explorer.choose(world.checkpoint, world.pages.get(world.checkpoint.position.spaceId)!, { sessionId: 'prelude', epoch: 0 });
      if (!decision.command) throw new Error(decision.reason);
      if (decision.command.type === 'finish') break;
      expect((await world.step(decision.command)).applied).toBe(true);
    }
    expect([...world.pages.values()].reduce((sum, page) => sum + Object.keys(page.cells).length, 0)).toBeGreaterThan(512);
    const host = new DirectedTestHost(world);
    const loaded = await loadDirectedStreamKnowledge(host.frame(),
      { kind: 'cell', address: { spaceId: 'not-observed', row: 0, column: 0 }, arrival: 'occupy' }, host.read);
    expect(loaded.plan).toEqual({ status: 'unavailable', reason: 'Known-map budget exceeded.' });
    expect(loaded.diagnostics.cells).toBeLessThanOrEqual(512);
    expect(loaded.diagnostics.reads).toBeLessThan(world.pages.size);
    expect(host.cache.stats().loads).toBe(0);
    expect(host.movements).toEqual([]);
  });

  it('approaches an observed doorway without crossing; explicit crossing uses that final edge', async () => {
    const { world } = await discoveredWorld(1, false);
    const host = new DirectedTestHost(world);
    const port = Object.values(world.pages.get('entry')!.openings).find(port => port.destination)!;
    const approach: StreamDestination = { kind: 'doorway', openingId: port.id,
      address: { spaceId: port.spaceId, row: port.row, column: port.column }, arrival: 'approach' };
    const started = await startDirectedStreamTravel(host.frame(), { id: 'approach', target: approach }, host.read, () => 0);
    const approached = await travel(host, started.state);
    expect(approached.operation.status).toBe('arrived');
    expect(world.checkpoint.position).toEqual(approach.address);
    expect(host.roomLoads).toEqual([]);
    const cross: StreamDestination = { ...approach, arrival: 'cross', destination: port.destination! };
    const crossing = await startDirectedStreamTravel(host.frame(), { id: 'cross', target: cross }, host.read, () => 0);
    expect(crossing.state.operation.route).toEqual([port.destination]);
    const crossed = await travel(host, crossing.state);
    expect(crossed.operation.status).toBe('arrived');
    expect(crossed.operation.steps).toBe(1);
    expect(world.checkpoint.position).toEqual(port.destination);
    expect(host.movements.at(-1)?.kind).toBe('crossing');
  });

  it('has identical actor routes and execution until the hidden remote obstruction is attempted', async () => {
    const a = await discoveredWorld(55), b = await discoveredWorld(55);
    const clear = new DirectedTestHost(a.world), obstructed = new DirectedTestHost(b.world);
    const loaded = await loadDirectedStreamKnowledge(clear.frame(), a.target, clear.read);
    if (loaded.plan.status !== 'ready') throw new Error(loaded.plan.reason);
    const route = loaded.plan.route;
    const index = route.findIndex((to, i) => i > 4 && to.spaceId !== route[i - 1].spaceId);
    expect(index).toBeGreaterThan(4);
    obstructed.hiddenCollision = { from: route[index - 1], to: route[index] };
    let left = (await startDirectedStreamTravel(clear.frame(), { id: 'same-intention', target: a.target }, clear.read, () => 0)).state;
    let right = (await startDirectedStreamTravel(obstructed.frame(), { id: 'same-intention', target: b.target }, obstructed.read, () => 0)).state;
    expect(left).toEqual(right);
    for (let i = 0; i <= index; i++) {
      const step = { operationId: left.operation.id, sequence: left.operation.nextStep, actionId: `hidden-${i}` };
      const l = await prepareDirectedStreamStep(left, clear.frame(), step, clear.read, () => 100);
      const r = await prepareDirectedStreamStep(right, obstructed.frame(), step, obstructed.read, () => 100);
      expect(l).toEqual(r);
      if (l.kind !== 'move' || r.kind !== 'move') throw new Error('Expected matching next moves');
      const le = await clear.execute(l.state.pending!), re = await obstructed.execute(r.state.pending!);
      left = settleDirectedStreamMove(l.state, le.result, le.collision);
      right = settleDirectedStreamMove(r.state, re.result, re.collision);
      if (i < index) expect(left).toEqual(right);
    }
    expect(right.operation.steps).toBe(left.operation.steps - 1);
    expect(right.blocked).toHaveLength(1);
    expect(right.blocked[0].from).toEqual(obstructed.hiddenCollision.from);
    expect(right.operation.route).toEqual([]);
    const stopped = await travel(obstructed, right);
    expect(stopped.operation.status).toBe('interrupted');
    expect(stopped.operation.reason).toBe('No known route.');
    expect(stopped.operation.replans).toBe(1);
    expect(obstructed.movements.filter(move => sameAddress(move.from, obstructed.hiddenCollision!.from)
      && sameAddress(move.to, obstructed.hiddenCollision!.to))).toHaveLength(1);
  });
});
