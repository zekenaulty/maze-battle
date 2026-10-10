// @vitest-environment node
import { expect, it } from 'vitest';
import { addressKey } from '../domain/expedition/address';
import { StreamPlanner } from '../domain/expedition/streaming/planner';
import { StreamHarness } from '../domain/expedition/streaming/testSupport';
import { materializeTopologySpace } from '../domain/expedition/topology/projection';
import { validateStreamEvidence } from './streamEvidence';
import { validateStreamKnowledge } from './streamKnowledge';
import { validateStreamCheckpoint } from './streamValidation';

it('rejects reciprocal link deletion against geometry, without requiring unobserved neighbors in the page', () => {
  const world = new StreamHarness(0);
  const room = world.room(), page = room.knowledge!, geometry = materializeTopologySpace(room.space);
  expect(() => validateStreamEvidence(room, page, geometry)).not.toThrow();
  const at = page.cells[addressKey(world.checkpoint.position)];
  const partial = { ...page, cells: { [addressKey(at)]: at }, frontiers: {} };
  expect(() => validateStreamKnowledge(partial, 'entry', 0, room)).not.toThrow();
  expect(() => validateStreamEvidence(room, partial, geometry)).not.toThrow();
  for (const cell of Object.values(page.cells)) cell.links = [];
  expect(() => validateStreamEvidence(room, page, geometry)).toThrow(/links differ/);
});

it('rejects cleared metadata in either direction without silently earning another clear', () => {
  const world = new StreamHarness(0), room = world.room(), page = room.knowledge!;
  const geometry = materializeTopologySpace(room.space);
  page.cleared = true;
  expect(() => validateStreamEvidence(room, page, geometry)).toThrow(/cleared metadata/);
  // A local fully observed leaf is sufficient to audit the cleared equivalence.
  room.sockets = [];
  page.frontiers = {};
  page.cells = Object.fromEntries(geometry.cells.map(cell => {
    const known = { ...cell, spaceId: 'entry', observedAt: 0 };
    return [addressKey(known), known];
  }));
  expect(() => validateStreamEvidence(room, page, geometry)).not.toThrow();
  page.cleared = false;
  expect(() => validateStreamEvidence(room, page, geometry)).toThrow(/cleared metadata/);
});

it('checks command accounting independently of the individual counter bounds', () => {
  const world = new StreamHarness(0), header = world.topology.header();
  const checkpoint = { ...world.checkpoint, revision: 3, moves: 3 };
  expect(() => validateStreamCheckpoint(checkpoint, header)).not.toThrow();
  const expanded = { ...header, revision: 1, rooms: 2, nextSocket: 1 };
  expect(() => validateStreamCheckpoint({ ...checkpoint, topologyRevision: 1 }, expanded)).toThrow(/counters/);
  expect(() => validateStreamCheckpoint({ ...checkpoint, moves: 0, topologyRevision: 1, visitedSpaces: 3 }, expanded)).toThrow(/counters/);
});

it('host validation rejects an incomplete chest total even if the compiled domain finish admits it', async () => {
  const world = new StreamHarness(0), planner = new StreamPlanner();
  for (let step = 0; step < 2000 && world.checkpoint.phase !== 'complete'; step++) {
    const decision = planner.choose(world.checkpoint, world.room().knowledge!, { sessionId: 'test', epoch: 0 });
    expect(decision.command, decision.reason).toBeDefined();
    expect((await world.step(decision.command!)).applied).toBe(true);
  }
  expect(world.checkpoint.phase).toBe('complete');
  world.checkpoint.phase = 'exploring'; world.checkpoint.collectedChests--;
  const result = await world.step({ type: 'finish' });
  // Retain the regression when the domain adds its own guard; no domain edits here.
  if (result.applied) expect(() => validateStreamCheckpoint(result.checkpoint, world.topology.header())).toThrow(/completion/);
  else expect(result.checkpoint.phase).toBe('exploring');
});
