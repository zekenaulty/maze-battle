// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { assertLaunchGrant } from '../../../persistence/canonical/agentica/launch';
import type { LaunchGrantContext } from '../../../persistence/canonical/agentica/launch.types';
import { protocolAction } from '../../../persistence/canonical/agentica/types.test-support';
import { actionGrant } from './actionContract';
import { mazeCapabilities } from './capabilities';

vi.mock('../../../persistence/canonical/agentica/launch', () => ({ assertLaunchGrant: vi.fn() }));
const binding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/publications/pub', id: 'pub' } };
beforeEach(() => vi.clearAllMocks());

it.each(['maze.observe', 'maze.inspect', 'maze.navigate', 'maze.explore'])('accepts only the declared effect contract for %s', async id => {
  const capability = mazeCapabilities().find(c => c.id === id)!;
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  const tx = {} as LaunchGrantContext, action = { ...protocolAction(), capabilityId: id };
  expect((await actionGrant(tx, binding, action)).capability).toEqual(capability);
  expect(assertLaunchGrant).toHaveBeenCalledWith(tx, binding.grant, action, binding.publication);
});

it.each(['read-only', 'query', 'no handoff', 'unknown writable', 'unknown query'])('rejects %s classification', async mode => {
  const capability = mazeCapabilities()[3];
  if (mode === 'read-only') capability.effect = 'readOnly';
  if (mode === 'query') capability.kind = 'query';
  if (mode === 'no handoff') delete capability.durableHandoff;
  if (mode.startsWith('unknown')) capability.id = 'maze.hidden';
  if (mode === 'unknown query') { capability.kind = 'query'; capability.effect = 'readOnly'; delete capability.durableHandoff; }
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  await expect(actionGrant({} as LaunchGrantContext, binding, { ...protocolAction(), capabilityId: capability.id })).rejects.toThrow('execution contract');
});

it('does not replace a retained grant which rejects the new capability', async () => {
  vi.mocked(assertLaunchGrant).mockRejectedValue(new Error('action capability is not granted'));
  await expect(actionGrant({} as LaunchGrantContext, binding, { ...protocolAction(), capabilityId: 'maze.explore' })).rejects.toThrow('not granted');
});

it('does not silently expand an approach-only grant into room exploration', async () => {
  const capability = mazeCapabilities()[3]; capability.inputSchema.fields.splice(1);
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  await expect(actionGrant({} as LaunchGrantContext, binding,
    { ...protocolAction(), capabilityId: 'maze.explore', arguments: { frontier: 'token', mode: 'room' } })).rejects.toThrow('room exploration was not granted');
  expect((await actionGrant({} as LaunchGrantContext, binding,
    { ...protocolAction(), capabilityId: 'maze.explore', arguments: { frontier: 'token' } })).capability).toEqual(capability);
});

it.each(['old scope', 'unbounded scope', 'missing scope', 'missing cursor', 'narrow cursor', 'required field'])
('refuses visible objects under %s authority', async mode => {
  const capability = mazeCapabilities()[1], fields = capability.inputSchema.fields;
  if (mode === 'old scope') fields[0].allowedValues = ['cell', 'room', 'map', 'frontiers'];
  if (mode === 'unbounded scope') delete fields[0].allowedValues;
  if (mode === 'missing scope') fields.shift();
  if (mode === 'missing cursor') capability.inputSchema.fields = fields.filter(f => f.name !== 'cursor');
  if (mode === 'narrow cursor') fields.find(f => f.name === 'cursor')!.allowedValues = ['different'];
  if (mode === 'required field') fields.find(f => f.name === 'level')!.required = true;
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  await expect(actionGrant({} as LaunchGrantContext, binding, { ...protocolAction(), capabilityId: 'maze.inspect',
    arguments: { scope: 'objects', cursor: 'page' } })).rejects.toThrow('visible object inspection was not granted');
});

it('accepts explicitly granted visible object inspection and paging', async () => {
  const capability = mazeCapabilities()[1];
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  for (const args of [{ scope: 'objects' }, { scope: 'objects', cursor: 'page' }])
    expect((await actionGrant({} as LaunchGrantContext, binding, { ...protocolAction(), capabilityId: 'maze.inspect',
      arguments: args })).capability).toEqual(capability);
});
