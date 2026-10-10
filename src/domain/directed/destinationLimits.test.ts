// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { beginDestinationStep, completeDestinationStep, createDestinationOperation, resolveDestinationStep } from './destinationExecution';
import { DEFAULT_DESTINATION_LIMITS, destinationDeadline, destinationExpired, snapshotDestinationLimits } from './destinationLimits';
import { validateDestinationBudget } from './destinationBudgetValidation';

const unlimited = { steps: null, replans: null, durationMs: null };
const route = Array.from({ length: 80 }, (_, column) => ({ spaceId: 'known', row: 0, column: column + 1 }));
const input = { id: 'one-intention', target: route.at(-1), epoch: 2, now: 100,
  plan: { status: 'ready' as const, route, distance: route.length, visits: route.length + 1 } };

describe('durable configurable destination budgets', () => {
  it('uses the old defaults without configuration and admits larger explicitly configured paths', () => {
    expect(createDestinationOperation(input).status).toBe('interrupted');
    const limits = { steps: 80, replans: 8, durationMs: 600000 };
    const operation = createDestinationOperation({ ...input, limits });
    limits.steps = 0;
    expect(operation).toMatchObject({ status: 'running', deadline: 600100, limits: { steps: 80 } });
    expect(() => validateDestinationBudget(operation)).not.toThrow();
  });

  it.each([unlimited, { steps: 80, replans: 8, durationMs: 600000 }])(
    'travels beyond 64 moves and 120 seconds under one identity with %j', limits => {
      let operation = createDestinationOperation({ ...input, limits });
      for (let step = 0; step < 80; step++) {
        const begin = beginDestinationStep(operation, { id: input.id, epoch: 2, sequence: step, now: 200000 + step });
        expect(begin.kind).toBe('ready');
        if (begin.kind !== 'ready') throw new Error('Expected admitted movement');
        operation = completeDestinationStep(begin.operation, step === 79);
        validateDestinationBudget(operation);
      }
      expect(operation).toMatchObject({ id: input.id, steps: 80, nextStep: 80, status: 'arrived',
        reason: 'Arrived. No interaction performed.' });
      expect(JSON.parse(JSON.stringify(operation))).toEqual(operation);
    });

  it('charges replanning cumulatively rather than restoring a per-step allowance', () => {
    let operation = createDestinationOperation({ ...input, limits: { ...unlimited, replans: 6 } });
    const plan = vi.fn(() => input.plan);
    for (let i = 0; i < 6; i++) {
      operation = resolveDestinationStep(operation, { arrived: false, destinationKnown: true, routeValid: false, plan }).operation;
      expect(operation.replans).toBe(i + 1);
    }
    expect(resolveDestinationStep(operation, { arrived: false, destinationKnown: true, routeValid: false, plan }).operation.status).toBe('interrupted');
    expect(plan).toHaveBeenCalledTimes(6);
  });

  it('unlimited replanning still counts and finite remaining steps still bind', () => {
    const operation = createDestinationOperation({ ...input, limits: { ...unlimited, steps: 80 } });
    operation.replans = 100; operation.steps = 1; operation.route = [];
    const result = resolveDestinationStep(operation, { arrived: false, destinationKnown: true, routeValid: false, plan: () => input.plan });
    expect(result.operation).toMatchObject({ replans: 101, status: 'interrupted', reason: 'Destination exceeds remaining travel step budget.' });
  });

  it('unlimited never bypasses epoch, sequence, cancellation or invalid clocks', () => {
    const operation = createDestinationOperation({ ...input, limits: unlimited });
    const step = { id: input.id, epoch: 2, sequence: 0, now: 500000 };
    expect(beginDestinationStep(operation, { ...step, epoch: 3 }).kind).toBe('refused');
    expect(beginDestinationStep(operation, { ...step, sequence: 1 }).kind).toBe('refused');
    expect(beginDestinationStep({ ...operation, status: 'cancelled' }, step).kind).toBe('refused');
    expect(beginDestinationStep(operation, { ...step, now: NaN }).kind).toBe('stopped');
    expect(beginDestinationStep({ ...operation, nextStep: Number.MAX_SAFE_INTEGER }, { ...step, sequence: Number.MAX_SAFE_INTEGER }).kind).toBe('refused');
  });

  it('reads legacy snapshots as bounded without rewriting them or inferring unlimited', () => {
    const operation = createDestinationOperation({ ...input, plan: { ...input.plan, route: route.slice(0, 2), distance: 2 } });
    delete operation.limits;
    const original = JSON.stringify(operation);
    validateDestinationBudget(operation);
    expect(JSON.stringify(operation)).toBe(original);
    expect(destinationExpired(operation, 120100)).toBe(true);
    expect(() => validateDestinationBudget({ ...operation, deadline: null })).toThrow();
    expect(() => validateDestinationBudget({ ...operation, steps: 65, route: [] })).toThrow();
  });

  it('retains structural bounds and rejects corrupt budget snapshots', () => {
    const operation = createDestinationOperation({ ...input, limits: unlimited });
    for (const patch of [{ steps: -1 }, { replans: Infinity }, { nextStep: 1.5 }, { deadline: 120100 },
      { route: Array(513).fill(route[0]) }, { limits: null }, { limits: { ...unlimited, extra: 1 } }]) {
      expect(() => validateDestinationBudget({ ...operation, ...patch } as unknown as typeof operation)).toThrow();
    }
    expect(() => destinationDeadline(Number.MAX_SAFE_INTEGER, DEFAULT_DESTINATION_LIMITS)).toThrow();
    expect(destinationDeadline(Number.MAX_SAFE_INTEGER, unlimited)).toBeNull();
    expect(() => snapshotDestinationLimits({ steps: undefined, replans: 4, durationMs: 120000 })).toThrow();
  });
});
