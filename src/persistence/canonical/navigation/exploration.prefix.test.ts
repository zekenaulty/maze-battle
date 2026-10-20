// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { commitExplorationCommand } from '../game/explorationCommand';
import type { CanonicalWork } from '../transaction';
import { json } from '../world/records';
import { resolveWorldStep } from '../world/residency';
import { advanceExploration } from './exploration';
import { localExplorationWindow } from './explorationPlan';
import { detourDirection, earnedDetour } from './explorationPlan.prefix.test-support';
import type { DestinationProgress } from './types';
import { createExplorationBinding, destinationProgress } from './validation';

vi.mock('../game/explorationCommand', () => ({ commitExplorationCommand: vi.fn() }));
vi.mock('../world/residency', () => ({ resolveWorldStep: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

async function fixture(stepLimit = 100) {
  const seeded = await earnedDetour(), { cells, source } = seeded;
  let f = seeded.f, moved = 0;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(2000);
  const binding = createExplorationBinding({ at: cells.at(-1)!.at, direction: 'east', source },
    { steps: stepLimit, replans: 2, durationMs: 10000 });
  let p: DestinationProgress = { schema: 1, operationId: 'trip', sourceAttemptId: 'original-admission', owner: 'owner', epoch: 1,
    binding, sequence: 11, steps: 11, replans: 2, startedAt: 1000, deadline: 11000, position: cells[0].at,
    route: [], status: 'running', reason: null, exploration: { phase: 'survey', target: cells.at(-1)!.at,
      window: (await localExplorationWindow(f.pages, f.checkpoint()))! } };
  const original = structuredClone(p);
  vi.mocked(resolveWorldStep).mockImplementation(async (_pages, from, direction) => {
    expect(from).toEqual(cells[moved].at); expect(direction).toBe(detourDirection(cells[moved], cells[moved + 1]));
    return { moved: true, crossed: false, position: cells[moved + 1].at };
  });
  vi.mocked(commitExplorationCommand).mockImplementation(async (tx, input, review) => {
    expect(input).toEqual({ kind: 'move', direction: detourDirection(cells[moved], cells[moved + 1]), triggerStairs: false });
    const next = { ...cells[++moved], edges: {} }; await review!(f.pages, [next]);
    await f.observe([next]); tx.setCheckpoint(f.checkpoint() as never);
    return json({ moved: true, outcome: 'applied', position: next.at });
  });
  return {
    cells, original, clock, progress: () => p,
    reload() { f = f.snapshot(); p = destinationProgress(JSON.parse(JSON.stringify(p))); },
    invalidate() { p.owner = 'prior-owner'; },
    async advance() {
      const tx = { pages: f.pages, head: { owner: 'owner', epoch: 1, checkpoint: f.checkpoint() },
        setCheckpoint: vi.fn() } as unknown as CanonicalWork;
      p = (await advanceExploration(tx, p)).progress;
      expect(destinationProgress(p)).toEqual(p);
      expect(p.binding).toEqual(original.binding); expect(p.exploration).toEqual(original.exploration);
      expect(p.startedAt).toBe(original.startedAt); expect(p.deadline).toBe(original.deadline);
      expect(p.sourceAttemptId).toBe(original.sourceAttemptId); expect(p.replans).toBe(2);
      expect(p.route.length).toBeLessThanOrEqual(16);
      return p;
    },
  };
}

it('executes 89 earned steps across refills/reloads without renewing the original grant or oscillating', async () => {
  const f = await fixture(), visited = [f.progress().position];
  for (let step = 1; step <= 89; step++) {
    const p = await f.advance();
    expect(p).toMatchObject({ status: 'running', reason: null, steps: 11 + step, sequence: 11 + step, position: f.cells[step].at });
    visited.push(p.position);
    if (step % 16 === 0) f.reload();
  }
  expect(new Set(visited.map(at => JSON.stringify(at))).size).toBe(90);
  expect(await f.advance()).toMatchObject({ status: 'blocked', reason: 'step-limit', steps: 100, route: [] });
  expect(commitExplorationCommand).toHaveBeenCalledTimes(89); expect(resolveWorldStep).toHaveBeenCalledTimes(89);
});

it('stops at the original remaining step allowance mid-detour after reload', async () => {
  const f = await fixture(30);
  for (let step = 1; step <= 19; step++) { expect((await f.advance()).steps).toBe(11 + step); if (step === 16) f.reload(); }
  expect(await f.advance()).toMatchObject({ status: 'blocked', reason: 'step-limit', steps: 30, position: f.cells[19].at });
  expect(commitExplorationCommand).toHaveBeenCalledTimes(19);
});

it('stops at the original deadline before a post-reload prefix refill', async () => {
  const f = await fixture();
  for (let i = 0; i < 16; i++) expect((await f.advance()).status).toBe('running');
  f.reload(); f.clock.mockReturnValue(11000);
  expect(await f.advance()).toMatchObject({ status: 'blocked', reason: 'time-limit', steps: 27, position: f.cells[16].at });
  expect(commitExplorationCommand).toHaveBeenCalledTimes(16);
});

it('does not use a reachable long prefix to bypass exhausted invalidation replans', async () => {
  const f = await fixture(); f.reload(); f.invalidate();
  expect(await f.advance()).toMatchObject({ status: 'blocked', reason: 'replan-limit', steps: 11, route: [] });
  expect(commitExplorationCommand).not.toHaveBeenCalled(); expect(resolveWorldStep).not.toHaveBeenCalled();
});
