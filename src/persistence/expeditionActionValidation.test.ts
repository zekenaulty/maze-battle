import { describe, expect, it } from 'vitest';
import { durableFixture, durableOutcome, durableRequest } from './expeditionAction.testSupport';
import { expeditionActionSignature, validateActionOutcome, validateActionReceipt, validateActionSession } from './expeditionActionValidation';
import type { DurableExpeditionSession } from './expeditionActionTypes';

describe('durable action validation', () => {
  it('matches the actionSession identity and ignores command property insertion order', () => {
    const request = durableRequest();
    expect(expeditionActionSignature(request)).toBe(JSON.stringify(['owner-a', 0, 0, 'move:east']));
    expect(expeditionActionSignature({ ...request, command: { direction: 'east', type: 'move' } })).toBe(expeditionActionSignature(request));
  });

  it.each([
    { actionId: '' }, { actionId: 'x'.repeat(129) }, { sessionId: 'x'.repeat(129) }, { version: 2 },
    { epoch: -1 }, { epoch: Number.MAX_SAFE_INTEGER + 1 }, { expectedRevision: NaN },
    { command: { type: 'move', direction: 'up' } }, { command: { type: 'collect', target: 'hidden' } }, { hidden: true },
  ])('rejects invalid requests %j', patch => {
    expect(() => expeditionActionSignature(Object.assign(durableRequest(), patch))).toThrow();
  });

  it('derives local move, collect and finish effects without changing the inputs', () => {
    let record = durableFixture();
    for (const [index, command] of ([{ type: 'move', direction: 'east' }, { type: 'collect' },
      { type: 'move', direction: 'west' }, { type: 'finish' }] as const).entries()) {
      const request = durableRequest({ actionId: `action-${index}`, expectedRevision: index, command });
      const outcome = durableOutcome(record, request);
      const before = structuredClone({ record, outcome });
      const effect = validateActionOutcome(record, request, outcome)!;
      expect(effect.openedChestIds).toEqual(command.type === 'collect' ? ['chest-a'] : []);
      expect(effect.moves).toBe(command.type === 'move' ? 1 : 0);
      validateActionReceipt({ version: 1, request, signature: expeditionActionSignature(request), result: outcome.result, effect }, record.plan);
      expect({ record, outcome }).toEqual(before);
      record = { plan: record.plan, checkpoint: outcome.checkpoint };
    }
  });

  it('accepts a refusal only with an unchanged checkpoint', () => {
    const record = durableFixture();
    const request = durableRequest({ command: { type: 'collect' } });
    const outcome = durableOutcome(record, request);
    expect(validateActionOutcome(record, request, outcome)).toBeUndefined();
    const changed = structuredClone(outcome);
    changed.checkpoint.moves++;
    expect(() => validateActionOutcome(record, request, changed)).toThrow('refused action changed checkpoint');
  });

  it.each([
    ['wrong action', (o: ReturnType<typeof durableOutcome>) => { o.result.actionId = 'other'; }],
    ['wrong before revision', o => { o.result.beforeRevision++; }],
    ['wrong after revision', o => { o.result.afterRevision++; }],
    ['unresolved completion', o => { o.result.disposition = 'unresolved'; }],
    ['nonprimitive disposition', o => { Object.assign(o.result, { disposition: new String('applied') }); }],
    ['foreign world', o => { o.checkpoint.worldId = 'other'; }],
    ['wrong move count', o => { o.checkpoint.moves++; }],
    ['home drift', o => { o.checkpoint.home.row++; }],
    ['oversized reason', o => { o.result.reason = 'x'.repeat(2049); }],
    ['foreign observation', o => { o.result.observation!.worldId = 'other'; }],
    ['private observation data', o => { Object.assign(o.result.observation!, { privatePlan: {} }); }],
    ['private position data', o => { Object.assign(o.result.observation!.position, { secret: true }); }],
    ['duplicate observed cells', o => { o.result.observation!.visibleCells.push(o.result.observation!.visibleCells[0]); }],
    ['oversized observed cells', o => { o.result.observation!.visibleCells = new Array(513); }],
    ['unobserved result data', o => { o.result.observation!.visibleCells[0].observedAt = 0; }],
  ] satisfies [string, (outcome: ReturnType<typeof durableOutcome>) => void][])('rejects %s', (_label, change) => {
    const record = durableFixture();
    const request = durableRequest();
    const outcome = durableOutcome(record, request);
    change(outcome);
    expect(() => validateActionOutcome(record, request, outcome)).toThrow();
  });

  it('rejects receipt corruption and invalid control limits', () => {
    const record = durableFixture();
    const request = durableRequest();
    const outcome = durableOutcome(record, request);
    const receipt = { version: 1, request, signature: 'tampered', result: outcome.result,
      effect: validateActionOutcome(record, request, outcome) };
    expect(() => validateActionReceipt(receipt, record.plan)).toThrow('signature corrupt');
    receipt.signature = expeditionActionSignature(request);
    receipt.effect!.to = { ...receipt.effect!.to, column: 2 };
    expect(() => validateActionReceipt(receipt, record.plan)).toThrow('move effect mismatch');
    const session: DurableExpeditionSession = { version: 1, worldId: record.plan.recipe.worldId, floorId: 'floor-1',
      scopeId: record.plan.scopeId, sessionId: 'owner', epoch: 0, maxActions: 2, receiptCount: 1, pendingActionId: 'pending' };
    validateActionSession(session, record);
    for (const patch of [{ maxActions: 0 }, { maxActions: 4097 }, { receiptCount: 3 }, { epoch: -1 }, { worldId: 'other' }]) {
      expect(() => validateActionSession({ ...session, ...patch }, record)).toThrow();
    }
  });
});
