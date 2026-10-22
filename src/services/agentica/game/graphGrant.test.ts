// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { assertLaunchGrant } from '../../../persistence/canonical/agentica/launch';
import type { LaunchGrantContext } from '../../../persistence/canonical/agentica/launch.types';
import { protocolAction } from '../../../persistence/canonical/agentica/types.test-support';
import { mazeCapabilities } from './capabilities';
import { actionGrant } from './actionContract';
import { assertGraphGrant } from './graphGrant';

vi.mock('../../../persistence/canonical/agentica/launch', () => ({ assertLaunchGrant: vi.fn() }));

it.each(['old scope', 'unbounded scope', 'missing scope', 'missing cursor', 'narrow cursor', 'narrow space', 'level', 'required'])
('does not expand %s authority into connection inspection', mode => {
  const cap = mazeCapabilities()[1], fields = cap.inputSchema.fields;
  const args = { scope: 'links', cursor: 'page', level: 1, spaceId: 'known' };
  if (mode === 'old scope') fields[0].allowedValues = ['map', 'room'];
  if (mode === 'unbounded scope') delete fields[0].allowedValues;
  if (mode === 'missing scope') fields.shift();
  if (mode === 'missing cursor') cap.inputSchema.fields = fields.filter(f => f.name !== 'cursor');
  if (mode === 'narrow cursor') fields.find(f => f.name === 'cursor')!.allowedValues = ['different'];
  if (mode === 'narrow space') fields.find(f => f.name === 'spaceId')!.allowedValues = ['elsewhere'];
  if (mode === 'level') fields.find(f => f.name === 'level')!.minimum = 2;
  if (mode === 'required') fields.find(f => f.name === 'row')!.required = true;
  expect(() => assertGraphGrant(cap, args)).toThrow('not granted');
});

it('checks the original launch before accepting a current or distant connection scope', async () => {
  const capability = mazeCapabilities()[1];
  const grant = { capability } as Awaited<ReturnType<typeof assertLaunchGrant>>;
  vi.mocked(assertLaunchGrant).mockResolvedValue(grant);
  const binding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/publications/pub', id: 'pub' } };
  for (const args of [{ scope: 'map' }, { scope: 'map', level: 1, cursor: 'page' },
    { scope: 'links' }, { scope: 'links', level: 1, spaceId: 'known', cursor: 'page' }]) {
    const action = { ...protocolAction(), capabilityId: 'maze.inspect', arguments: args };
    expect(await actionGrant({} as LaunchGrantContext, binding, action)).toBe(grant);
    expect(assertLaunchGrant).toHaveBeenLastCalledWith({}, binding.grant, action, binding.publication);
  }
  capability.inputSchema.fields[0].allowedValues = ['room'];
  for (const scope of ['map', 'links']) await expect(actionGrant({} as LaunchGrantContext, binding,
    { ...protocolAction(), capabilityId: 'maze.inspect', arguments: { scope } })).rejects.toThrow('not granted');
});
