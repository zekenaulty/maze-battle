// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { executeCanonical } from '../../../persistence/canonical/transaction';
import { assertLaunchGrant } from '../../../persistence/canonical/agentica/launch';
import { reconcileAction } from '../../../persistence/canonical/agentica/actions';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { executeGameAction } from './actionExecution';
import { connectionsFixture } from './roomConnections.test-support';
import { mazeCapabilities } from './capabilities';
import { mazeManifestDigest } from './manifestDigest';
import { launchStart } from '../../../persistence/canonical/agentica/launch.wire';
import { launchStartFixture } from '../../../persistence/canonical/agentica/launch.test-support';

vi.mock('../../../persistence/canonical/transaction', async original => ({ ...await original<typeof import('../../../persistence/canonical/transaction')>(), executeCanonical: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/launch', () => ({ assertLaunchGrant: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture(args: Record<string, unknown>) {
  const f = await connectionsFixture(), identity = await f.reserve(args), capability = mazeCapabilities()[1];
  vi.mocked(assertLaunchGrant).mockResolvedValue({ capability, publication: f.publication } as Awaited<ReturnType<typeof assertLaunchGrant>>);
  vi.mocked(executeCanonical).mockImplementation(async (req, work) => await f.commit(req, work as never) as never);
  const submitHostCommand = vi.fn<CanonicalHostPort['submitHostCommand']>(async command => {
    if (command.kind !== 'fresh') throw Error('Expected fresh query command');
    expect(command.operation).toBe('agentica.action.resolve');
    return command.execute(f.request(command.operation, command.input), { signal: new AbortController().signal }) as never;
  });
  const port = { submitHostCommand } as unknown as CanonicalHostPort;
  return { ...f, identity, capability, submitHostCommand, resolve: () => executeGameAction(port, f.binding, identity) };
}

it('retains an exact source-bound query and replays after knowledge/custody changes without new acquisition', async () => {
  const f = await fixture({ scope: 'connections', spaceId: 'origin' }), before = structuredClone(f.memory.records);
  await f.resolve();
  const original = await reconcileAction(f.pages, f.identity);
  expect(original).toMatchObject({ status: 'completed', result: { disposition: 'applied', observation: { data: { scope: 'connections',
    coverage: 'indexed-exits', connections: [{ room: { spaceId: 'target' }, proof: { steps: 5 } }] } } } });
  expect(original!.result!.operation).toBeUndefined(); expect(original!.result!.completion).toBeUndefined();
  expect(f.memory.records).toEqual(before); expect(f.submitHostCommand).toHaveBeenCalledOnce();
  const writes = f.set.mock.calls.length; f.memory.records.clear(); f.head.owner = 'other'; f.head.epoch++; f.head.roots.knowledge = 'changed';
  f.get.mockClear(); vi.mocked(assertLaunchGrant).mockRejectedValue(Error('Grant withdrawn'));
  expect(await reconcileAction(f.pages, f.identity)).toEqual(original);
  expect(f.get.mock.calls.every(([area]) => area === 'execution')).toBe(true); expect(f.set).toHaveBeenCalledTimes(writes);
  original!.result!.observation!.data.connections = [];
  expect(await reconcileAction(f.pages, f.identity)).not.toEqual(original);
  const row = f.records.get(`${f.identity.storageKey}/result`)!;
  (row.value as unknown as { result: { summary: string } }).result.summary = 'changed';
  await expect(reconcileAction(f.pages, f.identity)).rejects.toThrow('source changed');
});

it.each([{ scope: 'connections', row: 1, column: 1 }, { scope: 'connections', cursor: '{' },
  { scope: 'connections', cursor: 'x'.repeat(1025) }])('retains malformed input refusal with no operation: %j', async args => {
  const f = await fixture(args), before = structuredClone(f.memory.records); await f.resolve();
  const original = await reconcileAction(f.pages, f.identity);
  expect(original!.result!.disposition).toBe('refused'); expect(original!.result!.operation).toBeUndefined();
  expect(f.memory.records).toEqual(before);
});

it('retains the opaque room-selection refusal without a movement or completion result', async () => {
  const f = await fixture({ scope: 'connections', spaceId: 'room-label-0' }); await f.resolve();
  const original = await reconcileAction(f.pages, f.identity);
  expect(original!.result!).toMatchObject({ disposition: 'refused', summary: 'Connections require an earned room.' });
  expect(original!.result!.observation!.data).toEqual({ scope: 'connections', state: 'refused', reason: 'not-known-room' });
  expect(original!.result!.operation).toBeUndefined(); expect(original!.result!.completion).toBeUndefined();
});

it('rejects an original pre-connections grant before any query/result retention', async () => {
  const f = await fixture({ scope: 'connections' }), before = structuredClone(f.records);
  f.capability.inputSchema.fields[0].allowedValues = f.capability.inputSchema.fields[0].allowedValues!.filter(s => s !== 'connections');
  f.memory.reads.length = 0;
  await expect(f.resolve()).rejects.toThrow('not granted');
  expect(f.records).toEqual(before); expect(f.memory.reads).toEqual([]);
});

it('changes only the current manifest; original pre-connections schema and digest remain exact', async () => {
  const old = mazeCapabilities(); old[1].inputSchema.fields[0].allowedValues = old[1].inputSchema.fields[0].allowedValues!.filter(s => s !== 'connections');
  old[1].description = 'Earned rooms/map/links/cells/frontiers/objects; quests by status/target; objective; prior decision.';
  old[3].description = 'Default: approach. Room: local survey, stop on discoveries/bounds. No loot.';
  const before = structuredClone(old);
  expect(await mazeManifestDigest(old)).toBe('sha256:af2b710a3615b0e12ca558ce8ab646b943e17e629c32ba8e9932bb8311c0b138');
  expect(launchStart({ ...launchStartFixture(), capabilities: old }).capabilities).toEqual(before);
  expect(old).toEqual(before); expect(await mazeManifestDigest(mazeCapabilities())).not.toBe(await mazeManifestDigest(old));
});
