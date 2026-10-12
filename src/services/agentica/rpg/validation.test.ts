import { describe, expect, it } from 'vitest';
import type { AgenticaAction } from '../contracts';
import { rpgCapabilities } from './capabilities';
import type { RpgAgenticaBinding } from './contracts';
import { parseRpgAction, validateRpgBinding } from './validation';

const scopeId = 'b4d32e63-9aae-4f93-9434-7723385a95d7';
const binding: RpgAgenticaBinding = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scopeId, scopeId,
  sessionEpoch: '3', perspectiveId: 'party', gameId: 'rpg-save', floor: 2, objectiveId: 'reach-exit',
  objective: 'Reach the remembered exit', runId: 'service-run', manifestHash: `sha256:${'a'.repeat(64)}`,
  control: { owner: 'private-save-owner', epoch: 3, revision: 10 }, completionTarget: { floor: 2, row: 0, column: 2 },
  travelLimits: { steps: 64, replans: 4, durationMs: 120000 } };
const action: AgenticaAction = { actionId: 'attempt', runId: binding.runId, runnerRunId: 'runner', stepId: 'step',
  sessionId: scopeId, sessionEpoch: '3', capabilityId: 'maze.observe', manifestHash: binding.manifestHash,
  arguments: {}, expectedRevision: 10, deadlineAt: '2026-10-11T00:00:00Z' };
const parse = (capabilityId: string, args: Record<string, unknown>) => parseRpgAction({ ...action, capabilityId, arguments: args }, binding);

describe('RPG binding custody', () => {
  it('accepts actual save custody, custom objectives, optional parent and nullable travel limits', () => {
    expect(() => validateRpgBinding(binding)).not.toThrow();
    expect(() => validateRpgBinding({ ...binding, parentOperationId: 'parent', travelLimits: { steps: null, replans: 0, durationMs: null } })).not.toThrow();
    expect(() => validateRpgBinding({ ...binding, sessionEpoch: '1', control: { owner: 'owner', epoch: 1, revision: 0 } })).not.toThrow();
  });
  it.each(Object.keys(binding))('requires binding field %s', key => {
    const value = { ...binding }; Reflect.deleteProperty(value, key);
    expect(() => validateRpgBinding(value)).toThrow();
  });
  it.each([
    null, [], { protocolVersion: 2 }, { hostId: 'another' }, { perspectiveId: 'omniscient' },
    { scopeId: 'not-a-uuid', sessionId: 'not-a-uuid' }, { sessionId: 'private-save-owner' }, { sessionEpoch: '03' },
    { gameId: '' }, { runId: ' ' }, { objectiveId: 'bad\nidentity' }, { objective: '' }, { objective: ' ' },
    { objective: 'x'.repeat(4001) }, { parentOperationId: '' }, { parentOperationId: undefined },
    { manifestHash: 'a'.repeat(64) }, { manifestHash: `sha256:${'A'.repeat(64)}` },
    { floor: 0 }, { floor: 1.5 }, { floor: Infinity }, { floor: Number.MAX_SAFE_INTEGER + 1 },
    { control: { owner: 'owner', epoch: 0, revision: 10 } }, { control: { owner: '', epoch: 3, revision: 10 } },
    { control: { owner: 'owner', epoch: 3, revision: -1 } }, { control: { owner: 'owner', epoch: 3 } },
    { control: { owner: 'owner', epoch: 3, revision: 10, sessionId: 'legacy' } },
    { completionTarget: { floor: 1, row: 0, column: 0 } }, { completionTarget: { floor: 2, row: -1, column: 0 } },
    { completionTarget: { floor: 2, row: 0, column: 0, state: {} } },
    { travelLimits: { steps: -1, replans: 4, durationMs: 100 } }, { travelLimits: { steps: 1, replans: 1 } },
    { travelLimits: { steps: 1, replans: 1, durationMs: 1, unlimited: true } },
    { worldId: 'legacy' }, { floorId: 'legacy' }, { gameState: {} },
  ])('rejects malformed or privileged binding %j', change => {
    expect(() => validateRpgBinding(change === null || Array.isArray(change) ? change : { ...binding, ...change })).toThrow();
  });
  it('rejects prototypes, symbol keys, nonenumerable fields and accessors without invoking them', () => {
    let invoked = false;
    for (const value of [Object.assign(Object.create(binding), binding), { ...binding, [Symbol('secret')]: true },
      Object.defineProperty({ ...binding }, 'gameState', { value: {} }),
      Object.defineProperty({ ...binding }, 'control', { enumerable: true, get() { invoked = true; return binding.control; } })]) {
      expect(() => validateRpgBinding(value)).toThrow();
    }
    expect(invoked).toBe(false);
  });
});

describe('RPG SDK envelope and capability surface', () => {
  it('requires explicit exploration binding and source-scoped frontier arguments', () => {
    const args = { row: 2, column: 3, direction: 'east', sourceId: 'earned-source' };
    expect(() => parse('maze.explore', args)).toThrow();
    expect(() => parse('maze.frontiers', { limit: 12 })).toThrow();
    const bound = { ...binding, mode: 'exploration' as const };
    expect(parseRpgAction({ ...action, capabilityId: 'maze.explore', arguments: args }, bound)).toEqual({ type: 'explore',
      frontier: { anchor: { floor: 2, row: 2, column: 3 }, direction: 'east', sourceId: 'earned-source' } });
    expect(parseRpgAction({ ...action, capabilityId: 'maze.frontiers', arguments: { limit: 12 } }, bound)).toEqual({ type: 'frontiers', limit: 12 });
    expect(parseRpgAction({ ...action, capabilityId: 'maze.explore', arguments: { ...args, continuation: 'corridor-v1' } }, bound))
      .toMatchObject({ type: 'explore', continuation: 'corridor-v1' });
    for (const change of [{ direction: 'up' }, { row: -1 }, { sourceId: '' }, { autoLoot: true }, { floor: 1 },
      { continuation: undefined }, { continuation: 'auto' }, { continuation: null }])
      expect(() => parseRpgAction({ ...action, capabilityId: 'maze.explore', arguments: { ...args, ...change } }, bound)).toThrow();
    const caps = rpgCapabilities(true);
    expect(caps.slice(0, 5)).toEqual(rpgCapabilities());
    expect(caps.at(-1)).toMatchObject({ id: 'maze.explore', kind: 'action', durableHandoff: true });
    expect(caps.at(-2)).toMatchObject({ id: 'maze.frontiers', kind: 'query' });
    expect(() => validateRpgBinding({ ...bound, mode: 'auto' })).toThrow();
  });
  it('maps all five commands, fixing floor to the binding without restricting navigation to completion', () => {
    expect(parse('maze.observe', {})).toEqual({ type: 'observe' });
    for (const type of ['navigate', 'inspect']) expect(parse(`maze.${type}`, { row: 20, column: 30 }))
      .toEqual({ type, target: { floor: 2, row: 20, column: 30 } });
    expect(parse('maze.room', { roomId: 'earned-room', limit: 32, snapshotId: 'head', after: 'cursor' }))
      .toEqual({ type: 'room', roomId: 'earned-room', limit: 32, snapshotId: 'head', after: 'cursor' });
    expect(parse('maze.map', { limit: 12 })).toEqual({ type: 'map', limit: 12 });
  });
  it('leaves deadline expiry and expected-revision conflicts to admission after attempt reconciliation', () => {
    expect(parseRpgAction({ ...action, deadlineAt: '2000-01-01T00:00:00Z', expectedRevision: 0 }, binding)).toEqual({ type: 'observe' });
  });
  it.each(Object.keys(action))('requires envelope field %s', key => {
    const value = { ...action }; Reflect.deleteProperty(value, key);
    expect(() => parseRpgAction(value, binding)).toThrow();
  });
  it.each([
    { actionId: '' }, { runnerRunId: ' ' }, { stepId: 'x'.repeat(129) }, { runId: 'other' }, { sessionId: 'other' },
    { sessionEpoch: '4' }, { manifestHash: `sha256:${'b'.repeat(64)}` }, { expectedRevision: -1 },
    { expectedRevision: NaN }, { expectedRevision: 0.5 }, { deadlineAt: 'invalid' }, { deadlineAt: 123 },
    { arguments: null }, { arguments: [] }, { arguments: { topologyRevision: 10 } }, { gameState: {} },
  ])('rejects malformed envelopes %j', change => {
    expect(() => parseRpgAction({ ...action, ...change } as AgenticaAction, binding)).toThrow();
  });
  it.each([
    ['maze.move', { direction: 'east' }], ['maze.finish', {}], ['maze.observe', { owner: 'owner' }],
    ['maze.navigate', { row: 0, column: 0, floor: 1 }], ['maze.inspect', { row: 0, column: 0, gameState: {} }],
    ['maze.navigate', { row: -1, column: 0 }], ['maze.inspect', { row: 0.5, column: 0 }],
    ['maze.navigate', { row: 0, column: Number.MAX_SAFE_INTEGER }], ['maze.navigate', { row: 0 }],
    ['maze.room', { roomId: 'room', limit: 33 }], ['maze.room', { roomId: '', limit: 1 }],
    ['maze.room', { roomId: 'room', limit: 1, offset: 0 }], ['maze.map', { limit: 13 }],
    ['maze.map', { limit: 0 }], ['maze.map', { limit: 1.5 }], ['maze.map', { limit: 1, roomId: 'room' }],
    ['maze.map', { limit: 1, after: 'cursor' }], ['maze.map', { limit: 1, snapshotId: 'head', after: '' }],
    ['maze.map', { limit: 1, snapshotId: 'head', after: 'x'.repeat(2049) }],
    ['maze.room', { roomId: 'room', limit: 1, snapshotId: 'head', after: 'bad\ncursor' }],
  ] as const)('rejects invalid %s arguments %j', (capability, args) => {
    expect(() => parse(capability, args)).toThrow();
  });
  it('does not spread unknown or hidden argument properties into a command', () => {
    const args = Object.defineProperty({ limit: 1 }, 'gameState', { value: {} });
    expect(() => parse('maze.map', args)).toThrow();
    expect(() => parse('maze.observe', { [Symbol('secret')]: true })).toThrow();
    expect(() => parseRpgAction(Object.assign(Object.create(action), action), binding)).toThrow();
  });
  it('declares matching bounded schemas and only navigate as a durable effect', () => {
    const caps = rpgCapabilities();
    expect(caps.map(cap => cap.id)).toEqual(['maze.observe', 'maze.navigate', 'maze.inspect', 'maze.room', 'maze.map']);
    expect(caps.every(cap => cap.inputSchema.allowAdditionalProperties === false)).toBe(true);
    expect(caps[0].inputSchema.fields).toEqual([]);
    expect(caps[1]).toMatchObject({ kind: 'action', effect: 'writesLocalState', durableHandoff: true });
    for (const cap of caps.filter(cap => cap.id !== 'maze.navigate')) {
      expect(cap).toMatchObject({ kind: 'query', effect: 'readOnly' }); expect(cap.durableHandoff).toBeUndefined();
    }
    expect(caps[3].inputSchema.fields.find(field => field.name === 'limit')).toMatchObject({ minimum: 1, maximum: 32, required: true });
    expect(caps[4].inputSchema.fields.find(field => field.name === 'limit')).toMatchObject({ minimum: 1, maximum: 12, required: true });
    expect(caps[1].inputSchema.fields.map(field => field.name)).toEqual(['row', 'column']);
    caps[1].inputSchema.fields[0].name = 'mutated';
    expect(caps[2].inputSchema.fields[0].name).toBe('row');
    expect(rpgCapabilities()[1].inputSchema.fields[0].name).toBe('row');
  });
});
