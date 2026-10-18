import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { jsonBytes } from '../validation';
import { createInteractionBinding, interactionBinding, interactionProgress } from './validation';
import { interactionDisposition, type InteractionProgress } from './types';

const at = { level: 1, cell: { spaceId: 'entry', row: 1, column: 1 } };
const fixture = (): InteractionProgress => ({ schema: 1, operationId: 'open', sourceAttemptId: 'admit', owner: 'owner', epoch: 1,
  binding: createInteractionBinding({ kind: 'open-chest', chestId: 'chest' }, at), sequence: 0, status: 'pending', reason: null, result: null });
const outcome = (status: 'applied' | 'unchanged' = 'applied'): InteractionProgress => ({ ...fixture(), sequence: 1, status,
  result: { kind: 'open-chest', outcome: status, chestId: 'chest', lootIds: status === 'applied' ? ['a', 'b'] : [] } });

describe('one-shot shared content operation', () => {
  it('freezes a command and position without adding navigation authority', () => {
    const position = structuredClone(at), command = { kind: 'open-chest' as const, chestId: 'chest' };
    const binding = createInteractionBinding(command, position);
    command.chestId = 'other'; position.cell.row = 4;
    expect(binding).toEqual(fixture().binding);
    expect(() => interactionBinding({ ...binding, route: [] })).toThrow();
    expect(() => interactionBinding({ ...binding, command: { kind: 'open-chest', chestId: 'chest', acceptQuest: true } })).toThrow();
    expect(() => interactionBinding({ ...binding, kind: 'known-destination' })).toThrow();
  });
  it.each([{ schema: 2 }, { sequence: -1 }, { sequence: 2 }, { status: 'running' }, { status: 'applied' },
    { result: {} }, { reason: 'position-changed' }, { epoch: 0 }, { steps: 1 }])('rejects invalid pending progress %j', patch => {
    expect(() => interactionProgress({ ...fixture(), ...patch })).toThrow();
  });
  it.each([{ status: 'pending' }, { status: 'completed' }, { reason: 'arrived' }, { result: null }, { sequence: 0 }])(
    'rejects inconsistent applied progress %j', patch => expect(() => interactionProgress({ ...outcome(), ...patch })).toThrow());
  it.each([{ chestId: 'other' }, { kind: 'claim-quest' }, { outcome: 'unchanged' }, { lootIds: [] },
    { lootIds: ['a'] }, { lootIds: ['a', 'a'] }, { lootIds: ['a', 'b', 'c', 'd', 'e'] }, { hiddenWorld: {} }])(
    'rejects a forged content result %j', patch => {
      const p = outcome(); expect(() => interactionProgress({ ...p, result: { ...p.result, ...patch } })).toThrow();
    });
  it('consumes unchanged attempts and settles to a decision, never objective completion', () => {
    expect(interactionProgress(fixture())).toEqual(fixture());
    for (const p of [outcome(), outcome('unchanged')]) {
      expect(interactionProgress(p)).toEqual(p);
      expect(interactionDisposition(p)).toBe('decision');
    }
    expect(interactionDisposition(fixture())).toBeNull();
    const blocked = { ...fixture(), sequence: 1, status: 'blocked', reason: 'position-changed' };
    expect(interactionDisposition(interactionProgress(blocked))).toBe('blocked');
    expect(() => interactionProgress({ ...blocked, result: outcome().result })).toThrow();
    expect(() => interactionProgress({ ...blocked, reason: null })).toThrow();
  });
  it.each(['accept-quest', 'claim-quest'] as const)('pins the exact %s result independently of chest loot', kind => {
    const command = kind === 'accept-quest' ? { kind, contractId: 'contract' } : { kind, questId: 'contract' };
    const p = { ...outcome(), binding: createInteractionBinding(command, at), result: { kind, outcome: 'applied', questId: 'contract' } };
    expect(interactionProgress(p)).toEqual(p);
    expect(() => interactionProgress({ ...p, result: { ...p.result, questId: 'other' } })).toThrow();
    expect(() => interactionProgress({ ...p, result: { ...p.result, lootIds: [] } })).toThrow();
    expect(() => interactionProgress({ ...p, status: 'blocked', reason: 'unavailable', result: null })).toThrow();
  });
  it('keeps maximal identity and effect witnesses inside the existing receipt bounds', () => {
    const p = outcome(); p.operationId = 'o'.repeat(128); p.sourceAttemptId = 'a'.repeat(128); p.owner = 'u'.repeat(128);
    p.binding = createInteractionBinding({ kind: 'open-chest', chestId: 'c'.repeat(128) }, { ...at, cell: { ...at.cell, spaceId: 's'.repeat(128) } });
    p.result = { kind: 'open-chest', outcome: 'applied', chestId: 'c'.repeat(128), lootIds: Array.from({ length: 4 }, (_, n) => `${n}`.repeat(128)) };
    interactionProgress(p);
    const row = { id: 'r'.repeat(128), revision: 1, gameId: 'g'.repeat(128), generation: 'v'.repeat(128), area: 'execution',
      key: `interaction/command/${p.operationId}`, indexes: [], value: p };
    expect(jsonBytes({ recordId: row.id, recordWitness: canonicalJson(row), outcome: p.result }, 16384)).toBeLessThan(16384);
  });
});
