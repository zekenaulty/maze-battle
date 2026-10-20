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
it.each([{ scope: 'quests', status: 'active' }, { scope: 'quests', status: 'claimed', cursor: 'cursor' },
  { scope: 'quest', target: 'selector' }])('accepts only explicitly granted quest arguments %j', async args => {
  const capability = mazeCapabilities()[1];
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  expect((await actionGrant({} as LaunchGrantContext, binding, { ...protocolAction(), arguments: args })).capability).toEqual(capability);
});
it.each(['old-scope', 'status-field', 'status-choice', 'cursor-field', 'detail-field'])('refuses ungranted %s', async changed => {
  const capability = mazeCapabilities()[1], fields = capability.inputSchema.fields;
  const args = changed === 'detail-field' ? { scope: 'quest', target: 'selector' } : { scope: 'quests', status: 'claimed', cursor: 'cursor' };
  if (changed === 'old-scope') fields[0].allowedValues = ['room', 'map', 'cell', 'frontiers'];
  if (changed === 'status-field' || changed === 'detail-field' || changed === 'cursor-field') {
    const field = changed === 'status-field' ? 'status' : changed === 'detail-field' ? 'target' : 'cursor';
    capability.inputSchema.fields = fields.filter(f => f.name !== field);
  }
  if (changed === 'status-choice') fields.find(f => f.name === 'status')!.allowedValues = ['active'];
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  await expect(actionGrant({} as LaunchGrantContext, binding, { ...protocolAction(), arguments: args })).rejects.toThrow('not granted');
});
