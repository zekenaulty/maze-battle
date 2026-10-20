// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { actionGrant } from '../../../services/agentica/game/actionContract';
import { mazeCapabilities } from '../../../services/agentica/game/capabilities';
import { assertLaunchGrant } from './launch';
import type { LaunchGrantContext } from './launch.types';
import { protocolAction } from './types.test-support';

vi.mock('./launch', () => ({ assertLaunchGrant: vi.fn() }));
const binding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/pub', id: 'pub' } };

it.each(['old', 'unbounded-choice', 'required', 'write', 'handoff', 'explicit'] as const)('requires explicit query authority (%s)', async kind => {
  const capability = mazeCapabilities()[1];
  if (kind === 'old') capability.inputSchema.fields[0].allowedValues = ['room', 'objects', 'objective'];
  if (kind === 'unbounded-choice') delete capability.inputSchema.fields[0].allowedValues;
  if (kind === 'required') capability.inputSchema.fields[1].required = true;
  if (kind === 'write') capability.effect = 'writesLocalState';
  if (kind === 'handoff') capability.durableHandoff = true;
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  const query = actionGrant({} as LaunchGrantContext, binding, { ...protocolAction(), arguments: { scope: 'decision' } });
  if (kind === 'explicit') expect((await query).capability).toEqual(capability);
  else await expect(query).rejects.toThrow();
});
