// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { commitExplorationCommand } from '../game/explorationCommand';
import { earnedCell, knowledgeFixture } from '../knowledge/region.test-support';
import type { ObservedCell } from '../knowledge/types';
import type { CanonicalWork } from '../transaction';
import { json } from '../world/records';
import { resolveWorldStep } from '../world/residency';
import { advanceExploration } from './exploration';
import { createExplorationBinding, destinationProgress } from './validation';
import type { DestinationProgress } from './types';

vi.mock('../game/explorationCommand', () => ({ commitExplorationCommand: vi.fn() }));
vi.mock('../world/residency', () => ({ resolveWorldStep: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture(material: 'chest' | 'stairs' | 'none' = 'none') {
  const f = knowledgeFixture();
  const at = (column: number) => ({ level: 1, cell: { spaceId: 'room', row: 0, column } });
  function sight(actor: number): ObservedCell[] {
    const columns = Array.from({ length: actor + 8 }, (_, i) => i);
    columns.splice(columns.indexOf(actor), 1); columns.unshift(actor);
    return columns.map(column => {
      const c = earnedCell(0, column, 'room', 0, column); c.chests = [];
      c.edges.west = column ? at(column - 1) : null;
      if (column < actor + 7) c.edges.east = at(column + 1); else delete c.edges.east;
      if (column === 8 && material === 'chest') c.chests = [{ id: 'new-chest', opened: false }];
      if (column === 8 && material === 'stairs') c.stairs = ['down'];
      return c;
    });
  }
  await f.observe(sight(0));
  const initial = f.checkpoint();
  const binding = createExplorationBinding({ at: at(7), direction: 'east',
    source: { sequence: initial.knowledge!.sequence, id: initial.knowledge!.id, index: 7 } },
  { steps: 64, replans: 4, durationMs: null });
  const p: DestinationProgress = { schema: 1, operationId: 'trip', sourceAttemptId: 'admit', owner: 'owner', epoch: 1,
    binding, sequence: 0, steps: 0, replans: 0, startedAt: 1000, deadline: null, position: initial.position,
    route: Array.from({ length: 7 }, (_, i) => ({ direction: 'east', to: at(i + 1) })),
    status: 'running', reason: null, exploration: { phase: 'approach', target: at(7) } };
  vi.mocked(resolveWorldStep).mockImplementation(async (_pages, from) => ({ moved: true, crossed: false,
    position: at(from.cell.column + 1) }));
  vi.mocked(commitExplorationCommand).mockImplementation(async (tx, input, review) => {
    expect(input).toEqual({ kind: 'move', direction: 'east', triggerStairs: false });
    const cells = sight(f.checkpoint().position.cell.column + 1);
    await review!(f.pages, cells);
    await f.observe(cells); tx.setCheckpoint(f.checkpoint() as never);
    return json({ moved: true, outcome: 'applied', position: f.checkpoint().position });
  });
  const tx = () => ({ pages: f.pages, head: { owner: 'owner', epoch: 1, checkpoint: f.checkpoint() },
    setCheckpoint: vi.fn() } as unknown as CanonicalWork);
  return { f, p, at, tx };
}

it.each(['chest', 'stairs'] as const)('stops on new %s during approach with the committed observation source', async material => {
  const f = await fixture(material), original = structuredClone(f.p);
  const { progress: p, checkpoint } = await advanceExploration(f.tx(), f.p);
  expect(p).toMatchObject({ status: 'decision', reason: 'new-object', steps: 1, route: [],
    exploration: { phase: 'approach' }, position: f.at(1), notice: { at: f.at(8),
      source: { sequence: checkpoint.knowledge!.sequence, id: checkpoint.knowledge!.id, index: 8 } } });
  expect(p.binding).toEqual(original.binding); expect(p.startedAt).toBe(original.startedAt);
  expect(f.p).toEqual(original); expect(commitExplorationCommand).toHaveBeenCalledOnce();
  expect(destinationProgress(p)).toEqual(p);
});

it('keeps the original step and replan allowances across a local waypoint selection', async () => {
  const f = await fixture();
  f.p.sequence = f.p.steps = 63; f.p.replans = 4; f.p.route = [];
  f.p.exploration = { phase: 'cross-frontier', target: f.at(0) };
  const { progress: p } = await advanceExploration(f.tx(), f.p);
  expect(p).toMatchObject({ status: 'running', steps: 64, replans: 4, route: [], startedAt: 1000,
    exploration: { phase: 'survey', target: f.at(7) } });
  expect(p.binding).toEqual(f.p.binding);
  const terminal = await advanceExploration(f.tx(), p);
  expect(terminal.progress).toMatchObject({ status: 'blocked', reason: 'step-limit', steps: 64, replans: 4 });
  expect(commitExplorationCommand).toHaveBeenCalledOnce();
});

it('does not reset an exhausted replan allowance after owner invalidation', async () => {
  const f = await fixture(); f.p.owner = 'prior-owner'; f.p.sequence = 4; f.p.replans = 4;
  expect((await advanceExploration(f.tx(), f.p)).progress).toMatchObject({ status: 'blocked', reason: 'replan-limit', steps: 0, replans: 4 });
  expect(commitExplorationCommand).not.toHaveBeenCalled(); expect(resolveWorldStep).not.toHaveBeenCalled();
});

it('keeps the original deadline at a waypoint boundary', async () => {
  const f = await fixture(); f.p.binding.limits.durationMs = 1; f.p.startedAt = Date.now() - 10;
  f.p.deadline = f.p.startedAt + 1; f.p.route = []; f.p.exploration = { phase: 'cross-frontier', target: f.at(0) };
  expect((await advanceExploration(f.tx(), f.p)).progress).toMatchObject({ status: 'blocked', reason: 'time-limit', steps: 0,
    startedAt: f.p.startedAt, deadline: f.p.deadline });
  expect(commitExplorationCommand).not.toHaveBeenCalled(); expect(resolveWorldStep).not.toHaveBeenCalled();
});

it('never moves through a retained next vertex in another space', async () => {
  const f = await fixture(); f.p.route[0].to.cell.spaceId = 'other-room';
  const { progress: p } = await advanceExploration(f.tx(), f.p);
  expect(p.replans).toBe(1); expect(p.position.cell.spaceId).toBe('room');
  expect(vi.mocked(resolveWorldStep).mock.calls.every(([, position]) => position.cell.spaceId === 'room')).toBe(true);
  expect(p.route.every(step => step.to.cell.spaceId === 'room')).toBe(true);
});
