import { describe, expect, it, vi } from 'vitest';
import { beginDestinationStep, blockDestinationStep, completeDestinationStep, createDestinationOperation, resolveDestinationStep } from './destinationExecution';

const position = { spaceId: 'known-room', row: 0, column: 1 };
const ready = () => createDestinationOperation({ id: 'journey', target: { rememberedDoor: 'door-1' }, epoch: 2, now: 100,
  plan: { status: 'ready', route: [position], distance: 1, visits: 2 } });

describe('shared bounded destination execution', () => {
  it('keeps target semantics with the adapter and refuses stale step custody', () => {
    const operation = ready();
    for (const mismatch of [{ id: 'other' }, { epoch: 3 }, { sequence: 1 }]) {
      expect(beginDestinationStep(operation, { id: 'journey', epoch: 2, sequence: 0, now: 101, ...mismatch }).kind).toBe('refused');
    }
    expect(operation.nextStep).toBe(0);
    expect(operation.target).toEqual({ rememberedDoor: 'door-1' });
  });

  it('checks wall-time and step budgets before consulting a route adapter', () => {
    expect(beginDestinationStep(ready(), { id: 'journey', epoch: 2, sequence: 0, now: 120100 }).kind).toBe('stopped');
    const operation = ready(); operation.steps = 64;
    expect(beginDestinationStep(operation, { id: 'journey', epoch: 2, sequence: 0, now: 101 }).kind).toBe('stopped');
  });

  it('reuses a valid route without replanning and does not interact on arrival', () => {
    const operation = ready(), plan = vi.fn();
    const decision = resolveDestinationStep(operation, { arrived: false, destinationKnown: true, routeValid: true, plan });
    expect(decision.kind).toBe('move'); expect(plan).not.toHaveBeenCalled();
    expect(completeDestinationStep(decision.operation, true)).toMatchObject({ status: 'arrived', steps: 1, route: [], reason: 'Arrived. No interaction performed.' });
    expect(operation.steps).toBe(0); expect(operation.route).toHaveLength(1);
  });

  it('returns an independent remaining route after a completed step', () => {
    const operation = createDestinationOperation({ id: 'review-trip', target: { id: 'destination' }, epoch: 1, now: 0,
      plan: { status: 'ready', distance: 2, visits: 3, route: [
        { spaceId: 'W', row: 0, column: 1 }, { spaceId: 'W', row: 0, column: 2 },
      ] } });
    const original = structuredClone(operation);
    const completed = completeDestinationStep(operation, false);
    completed.route[0].column = 99;
    expect(operation).toEqual(original);
  });

  it('bounds local reconsideration and leaves collisions stopped at the same step', () => {
    const operation = ready(); operation.replans = 4;
    const plan = vi.fn();
    expect(resolveDestinationStep(operation, { arrived: false, destinationKnown: true, routeValid: false, plan }).operation.status).toBe('interrupted');
    expect(plan).not.toHaveBeenCalled();
    expect(blockDestinationStep(operation).status).toBe('interrupted');
    expect(blockDestinationStep(ready())).toMatchObject({ status: 'running', route: [], steps: 0 });
  });
});
