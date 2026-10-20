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

it.each(['target', 'cursor'] as const)('enforces the granted %s choices locally', async name => {
  const capability = mazeCapabilities()[1];
  capability.inputSchema.fields.find(field => field.name === name)!.allowedValues = ['permitted'];
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  const args = (value: string) => name === 'target' ? { scope: 'quest', target: value }
    : { scope: 'quests', status: 'active', cursor: value };
  await expect(actionGrant({} as LaunchGrantContext, binding, { ...protocolAction(), arguments: args('outside-grant') }))
    .rejects.toThrow('not granted');
  expect((await actionGrant({} as LaunchGrantContext, binding, { ...protocolAction(), arguments: args('permitted') })).capability)
    .toEqual(capability);
});

it('refuses an omitted cursor when the granted schema requires it', async () => {
  const capability = mazeCapabilities()[1];
  capability.inputSchema.fields.find(field => field.name === 'cursor')!.required = true;
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  await expect(actionGrant({} as LaunchGrantContext, binding,
    { ...protocolAction(), arguments: { scope: 'quests', status: 'active' } })).rejects.toThrow('not granted');
});
