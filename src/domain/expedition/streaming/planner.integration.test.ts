// @vitest-environment node
import { expect, it } from 'vitest';
import { opposite } from '../../maze/movement';
import { sameAddress } from '../address';
import { expandTopology } from '../topology/generation';
import { MemoryTopology } from '../topology/memoryTopology';
import { materializeTopologySpace } from '../topology/projection';
import type { ExpansionSocket } from '../topology/types';
import { StreamPlanner } from './planner';
import { applyStreamCommand, initializeStream } from './transition';
import type { StreamCheckpoint, StreamCommand, StreamKnowledgePage, StreamRoom } from './types';

// The reference host owns generated topology and durable pages. The planner receives
// only cloned checkpoints/current observed pages, never this host or its load function.
function host(seed: number, level = 1) {
  const topology = new MemoryTopology({ version: 'spaces-v2', worldId: 'planner-integration', floorId: 'one', seed, level });
  const pages = new Map<string, StreamKnowledgePage>();
  const sockets = new Map<string, Map<string, ExpansionSocket>>();
  const rememberSocket = (socket: ExpansionSocket) => {
    let room = sockets.get(socket.source.spaceId);
    if (!room) { room = new Map(); sockets.set(socket.source.spaceId, room); }
    room.set(socket.id, structuredClone(socket));
  };
  for (let index = 0; index < topology.header().socketCount; index++) rememberSocket(topology.socket(index)!);
  const loadRoom = async (id: string): Promise<StreamRoom> => ({
    space: topology.space(id)!, connections: topology.connections(id), sockets: [...(sockets.get(id)?.values() ?? [])],
    knowledge: structuredClone(pages.get(id)),
  });
  let checkpoint: StreamCheckpoint;
  const save = (transition: ReturnType<typeof initializeStream>) => {
    checkpoint = structuredClone(transition.checkpoint);
    for (const page of transition.pages) pages.set(page.spaceId, structuredClone(page));
  };
  return {
    topology, pages,
    get checkpoint() { return structuredClone(checkpoint); },
    get page() { return structuredClone(pages.get(checkpoint.position.spaceId)!); },
    async initialize() {
      const header = topology.header();
      save(initializeStream(header, await loadRoom(header.start.spaceId), materializeTopologySpace));
    },
    async execute(command: StreamCommand) {
      const transition = await applyStreamCommand({ header: topology.header(), checkpoint: structuredClone(checkpoint),
        current: await loadRoom(checkpoint.position.spaceId), loadRoom, geometry: materializeTopologySpace,
        prepareNext: async () => {
          const proposal = expandTopology(topology, topology.header().revision, `prepare-${checkpoint.revision}`);
          if (proposal.status !== 'ready') throw new Error(`Unexpected expansion ${proposal.status}`);
          expect(topology.commit(proposal.delta).status).toBe('applied');
          for (const socket of proposal.delta.sockets) rememberSocket(socket);
          if (proposal.delta.resolved) rememberSocket(proposal.delta.resolved);
          return topology.header();
        },
      }, command);
      expect(transition.applied, `${command.type}: ${transition.reason}`).toBe(true);
      save(transition);
      return transition;
    },
  };
}

it.each([{ seed: 1, pending: false }, { seed: 55, pending: true }, { seed: 20261008, pending: true }])(
  'explores, prepares, collects and returns through real v2 commands with reloads (seed $seed)', async ({ seed, pending }) => {
  const world = host(seed, 2);
  await world.initialize();
  let planner = new StreamPlanner();
  let epoch = 0;
  let reusedSteps = 0;
  let crossings = 0;
  let preparations = 0;
  let pendingPreparations = 0;
  for (let step = 0; step < 8000 && world.checkpoint.phase !== 'complete'; step++) {
    if (step > 0 && step % 47 === 0) {
      reusedSteps += planner.diagnostics.work.reusedSteps;
      planner = new StreamPlanner();
      epoch++;
    }
    const before = world.checkpoint;
    const decision = planner.choose(before, world.page, { sessionId: 'observed-runtime', epoch });
    expect(decision.command, `revision ${before.revision}: ${decision.reason}`).toBeDefined();
    const transition = await world.execute(decision.command!);
    const after = world.checkpoint;
    expect(planner.diagnostics.cache.cells).toBeLessThanOrEqual(512);
    expect(planner.diagnostics.cache.ports).toBeLessThanOrEqual(4);
    expect(planner.diagnostics.cache.pages).toBe(1);
    expect(planner.diagnostics.cache.batchSteps).toBeLessThanOrEqual(128);
    expect(planner.diagnostics.lastWork.expandedCells).toBeLessThanOrEqual(8 * 512);
    if (decision.command!.type === 'prepare') {
      preparations++;
      expect(after.position).toEqual(before.position);
      expect(after.moves).toBe(before.moves);
      expect(after.revision).toBe(before.revision + 1);
      if (world.page.frontiers[decision.command!.frontierId]) {
        pendingPreparations++;
        expect(after.topologyRevision).toBe(before.topologyRevision + 1);
      }
    }
    if (before.position.spaceId !== after.position.spaceId) {
      crossings++;
      expect(transition.pages).toHaveLength(2);
      const source = transition.pages.find(page => page.spaceId === before.position.spaceId)!;
      const target = world.page;
      expect(Object.values(source.openings).some(port => sameAddress(port, before.position)
        && port.destination && sameAddress(port.destination, after.position))).toBe(true);
      expect(Object.values(target.openings).some(port => sameAddress(port, after.position)
        && port.destination && sameAddress(port.destination, before.position))).toBe(true);
    }
  }
  reusedSteps += planner.diagnostics.work.reusedSteps;
  const checkpoint = world.checkpoint;
  const header = world.topology.header();
  expect(checkpoint.phase).toBe('complete');
  expect(checkpoint.position).toEqual(checkpoint.home);
  expect(checkpoint.visitedSpaces).toBe(header.rooms * 2 - 1);
  expect(checkpoint.clearedSpaces).toBe(checkpoint.visitedSpaces);
  expect(checkpoint.collectedChests).toBe(header.rooms - 1);
  expect(preparations).toBeGreaterThan(0);
  expect(pendingPreparations > 0).toBe(pending);
  expect(crossings).toBe(2 * (checkpoint.visitedSpaces - 1));
  expect(reusedSteps).toBeGreaterThan(20);
});

it('revisits an unfinished child after a manual early return and planner reload', async () => {
  const world = host(55);
  await world.initialize();
  const planner = new StreamPlanner();
  for (let step = 0; step < 500; step++) {
    const before = world.checkpoint;
    const decision = planner.choose(before, world.page, { sessionId: 'original', epoch: 0 });
    expect(decision.command, decision.reason).toBeDefined();
    await world.execute(decision.command!);
    if (before.position.spaceId === world.checkpoint.position.spaceId) continue;
    expect(world.page.cleared).toBe(false);
    if (decision.command!.type !== 'move') throw new Error('Crossing was not a move');
    const direction = decision.command!.direction;
    await world.execute({ type: 'move', direction: opposite(direction) });
    expect(world.checkpoint.position).toEqual(before.position);
    expect(world.page.completedExits).toEqual([]);
    const reloaded = new StreamPlanner();
    expect(reloaded.choose(world.checkpoint, world.page, { sessionId: 'replacement', epoch: 1 }).command)
      .toEqual({ type: 'move', direction });
    return;
  }
  throw new Error('No child crossing within the bounded fixture.');
});
