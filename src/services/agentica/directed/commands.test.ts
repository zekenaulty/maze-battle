import { describe, expect, it } from 'vitest';
import { directedCapabilities } from './capabilities';
import { parseDirectedAgenticaCommand, validateDirectedAgenticaBinding } from './commands';
import type { DirectedAgenticaBinding } from './contracts';
import type { AgenticaAction } from '../contracts';

const scope = '00000000-0000-4000-8000-000000000001';
const binding: DirectedAgenticaBinding = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scope, scopeId: scope,
  sessionEpoch: '1', perspectiveId: 'party', worldId: 'world', floorId: 'floor', objectiveId: 'objective',
  objective: 'Return to the designated observed cell.', runId: 'run', manifestHash: `sha256:${'a'.repeat(64)}`,
  control: { sessionId: 'owner', epoch: 1 }, destination: { spaceId: 'room', row: 1, column: 2 } };
const action: AgenticaAction = { actionId: 'action', runId: 'run', runnerRunId: 'runner', stepId: 'step',
  sessionId: scope, sessionEpoch: '1', capabilityId: 'maze.navigate', manifestHash: binding.manifestHash,
  expectedRevision: 7, deadlineAt: '2026-10-10T12:00:00Z', arguments: { topologyRevision: 2, ...binding.destination } };

describe('directed capability binding', () => {
  it('advertises one durable destination action and actor-only read capabilities', () => {
    const capabilities = directedCapabilities();
    expect(capabilities.map(value => value.id)).toEqual(['maze.observe', 'maze.room', 'maze.map', 'maze.inspect', 'maze.navigate']);
    expect(capabilities.filter(value => value.durableHandoff).map(value => value.id)).toEqual(['maze.navigate']);
    expect(parseDirectedAgenticaCommand(action, binding)).toEqual({ type: 'navigate',
      target: { kind: 'cell', address: binding.destination, arrival: 'occupy' } });
  });
  it.each(['runId', 'sessionId', 'sessionEpoch', 'manifestHash'] as const)('fences a changed %s', key => {
    expect(() => parseDirectedAgenticaCommand({ ...action, [key]: 'changed' }, binding)).toThrow();
  });
  it.each([
    { ...action.arguments, truth: true }, { topologyRevision: 2, row: 1, column: 2 },
    { ...action.arguments, column: -1 }, { ...action.arguments, row: 0.5 },
  ])('refuses unbound arguments', arguments_ => {
    expect(() => parseDirectedAgenticaCommand({ ...action, arguments: arguments_ }, binding)).toThrow();
  });
  it('does not let an arrival policy inject a new legacy objective or control scope', () => {
    expect(() => validateDirectedAgenticaBinding({ ...binding, arrivalPolicy: 'inspect', parentOperationId: 'operation' })).not.toThrow();
    expect(() => validateDirectedAgenticaBinding({ ...binding, sessionEpoch: '2' })).toThrow();
    expect(() => validateDirectedAgenticaBinding({ ...binding, destination: { ...binding.destination, seed: 77 } } as never)).toThrow();
  });
  it('exposes independent bounded room and map scopes', () => {
    expect(parseDirectedAgenticaCommand({ ...action, capabilityId: 'maze.room',
      arguments: { topologyRevision: 2, spaceId: 'room', offset: 32, limit: 32 } }, binding))
      .toEqual({ type: 'room', spaceId: 'room', offset: 32, limit: 32 });
    expect(parseDirectedAgenticaCommand({ ...action, capabilityId: 'maze.map',
      arguments: { topologyRevision: 2, spaceId: 'room', depth: 2, limit: 4 } }, binding))
      .toEqual({ type: 'map', spaceId: 'room', depth: 2, limit: 4 });
  });
  it.each([
    ['maze.room', { spaceId: 'room', offset: 0, limit: 33 }],
    ['maze.room', { spaceId: 'room', offset: -1, limit: 1 }],
    ['maze.map', { spaceId: 'room', depth: 4, limit: 12 }],
    ['maze.map', { spaceId: 'room', depth: 1, limit: 13 }],
    ['maze.map', { spaceId: 'room', depth: 1, limit: 2, cells: true }],
  ])('rejects oversized or mixed view arguments: %s', (capabilityId, args) => {
    expect(() => parseDirectedAgenticaCommand({ ...action, capabilityId: capabilityId as string,
      arguments: { topologyRevision: 2, ...(args as object) } }, binding)).toThrow();
  });
});
