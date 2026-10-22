// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { assertLaunchGrant } from '../../../persistence/canonical/agentica/launch';
import type { LaunchGrantContext } from '../../../persistence/canonical/agentica/launch.types';
import { protocolAction, protocolHead } from '../../../persistence/canonical/agentica/types.test-support';
import { actionGrant } from './actionContract';
import { mazeCapabilities } from './capabilities';

vi.mock('../../../persistence/canonical/agentica/launch', () => ({ assertLaunchGrant: vi.fn() }));
const binding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/publications/pub', id: 'pub' } };
const tx = {} as LaunchGrantContext;

it.each(['old scope', 'unbounded scope', 'missing scope', 'missing cursor', 'narrow cursor', 'narrow space', 'minimum', 'maximum', 'required', 'missing level'])
('refuses original %s authority before the connections adapter can run', async mode => {
  const capability = mazeCapabilities()[1], fields = capability.inputSchema.fields;
  if (mode === 'old scope') fields[0].allowedValues = fields[0].allowedValues!.filter(s => s !== 'connections');
  if (mode === 'unbounded scope') delete fields[0].allowedValues;
  if (mode === 'missing scope') fields.shift();
  if (mode === 'missing cursor') capability.inputSchema.fields = fields.filter(f => f.name !== 'cursor');
  if (mode === 'narrow cursor') fields.find(f => f.name === 'cursor')!.allowedValues = ['other'];
  if (mode === 'narrow space') fields.find(f => f.name === 'spaceId')!.allowedValues = ['other'];
  if (mode === 'minimum') fields.find(f => f.name === 'level')!.minimum = 2;
  if (mode === 'maximum') fields.find(f => f.name === 'level')!.maximum = 0;
  if (mode === 'required') fields.find(f => f.name === 'row')!.required = true;
  if (mode === 'missing level') capability.inputSchema.fields = fields.filter(f => f.name !== 'level');
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability, publication: { snapshot: { checkpoint: protocolHead().checkpoint } } } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  await expect(actionGrant(tx, binding, { ...protocolAction(), arguments: { scope: 'connections', level: 1, spaceId: 'origin', cursor: 'page' } }))
    .rejects.toThrow('not granted');
});

it('accepts only explicitly granted current or selected room queries; malformed inputs remain dispatcher refusals', async () => {
  const grant = { capability: mazeCapabilities()[1], publication: { snapshot: { checkpoint: protocolHead().checkpoint } } } as Awaited<ReturnType<typeof assertLaunchGrant>>;
  vi.mocked(assertLaunchGrant).mockResolvedValue(grant);
  for (const args of [{ scope: 'connections' }, { scope: 'connections', level: 1, spaceId: 'origin', cursor: 'page' }, { scope: 'connections', row: 1 }]) {
    const action = { ...protocolAction(), arguments: args };
    expect(await actionGrant(tx, binding, action)).toBe(grant);
    expect(assertLaunchGrant).toHaveBeenLastCalledWith(tx, binding.grant, action, binding.publication);
  }
  grant.capability.inputSchema.fields[0].allowedValues = ['links'];
  await expect(actionGrant(tx, binding, { ...protocolAction(), arguments: { scope: 'connections', row: 1 } })).rejects.toThrow('not granted');
});

it.each(['level', 'spaceId'] as const)('does not evade a narrowed %s field by omitting it', async name => {
  const capability = mazeCapabilities()[1], field = capability.inputSchema.fields.find(f => f.name === name)!;
  if (name === 'level') field.minimum = 2; else field.allowedValues = ['another-room'];
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability, publication: { snapshot: { checkpoint: protocolHead().checkpoint } } } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  await expect(actionGrant(tx, binding, { ...protocolAction(), arguments: { scope: 'connections' } })).rejects.toThrow('not granted');
});
