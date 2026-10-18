// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { mazeCapabilities } from '../../../services/agentica/game/capabilities';
import { createDestinationBinding, createFrontierBinding } from '../navigation/validation';
import { loadDestination } from '../navigation/records';
import type { CanonicalOperation, CanonicalRecord } from '../types';
import { readAction } from './actions';
import { loadActiveLaunch } from './launch.read';
import { loadRunGrant } from './run-grant.read';
import { loadOperationBinding } from './operation.binding';
import type { OperationRead } from './operation.types';
import { prepareAction } from './validation';
import { protocolAction, protocolResult } from './types.test-support';

vi.mock('./actions', () => ({ readAction: vi.fn() }));
vi.mock('./launch.read', () => ({ loadActiveLaunch: vi.fn() }));
vi.mock('./run-grant.read', () => ({ loadRunGrant: vi.fn() }));
vi.mock('../navigation/records', () => ({ loadDestination: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture(explore = true) {
  const binding = { grant: { key: 'agentica/grants/grant', id: 'grant' }, publication: { key: 'agentica/publications/pub', id: 'pub' } };
  const selection = { at: { level: 1, cell: { spaceId: 'room', row: 3, column: 4 } },
    direction: 'north' as const, source: { id: 'sight', sequence: 1, index: 2 } };
  const token = { schema: 1, publication: binding.publication, selection };
  const action = { ...protocolAction(), capabilityId: explore ? 'maze.explore' : 'maze.navigate',
    arguments: explore ? { frontier: JSON.stringify(token) } : { level: selection.at.level, ...selection.at.cell } };
  const identity = await prepareAction(action), result = { ...protocolResult(action), operation: { operationId: 'travel', summary: 'Approach' } };
  const original = { original: { effect: 'writesLocalState', publication: binding.publication,
    sourceRequest: { operation: 'agentica.action.reserve', input: { action: identity.storageKey, ...binding } } },
    result, resultReference: { key: `${identity.storageKey}/result`, id: 'result' } };
  const start = { capabilities: mazeCapabilities() }, certified = { record: { ref: binding.grant }, launch: { binding: { start } }, start,
    started: { runId: action.runId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch, manifestHash: action.manifestHash } };
  const operation = { id: 'travel', ackPolicy: 'verified-host', admissionAttemptId: 'admit',
    binding: explore ? createFrontierBinding(selection) : createDestinationBinding(selection.at) };
  const resultRecord = { value: { proof: 'navigation', sourceAttemptId: 'admit', sourceRequest: { operation: 'operation.admit' } } };
  vi.mocked(readAction).mockResolvedValue(original as unknown as Awaited<ReturnType<typeof readAction>>);
  vi.mocked(loadRunGrant).mockResolvedValue(certified as unknown as Awaited<ReturnType<typeof loadRunGrant>>);
  vi.mocked(loadActiveLaunch).mockResolvedValue(null);
  vi.mocked(loadDestination).mockResolvedValue({ sequence: 2 } as Awaited<ReturnType<typeof loadDestination>>);
  const pages = { liveOperation: vi.fn(async () => operation as unknown as CanonicalOperation),
    get: vi.fn(async () => resultRecord as unknown as CanonicalRecord) } as unknown as OperationRead;
  const load = () => loadOperationBinding(pages, identity, binding);
  return { action, identity, token, selection, binding, original, certified, operation, resultRecord, pages, load };
}

it('replays the exact explore selection without requiring it to remain a current frontier', async () => {
  const f = await fixture(), bound = await f.load();
  expect(bound.operation.binding).toEqual(createFrontierBinding(f.selection));
  expect(loadDestination).toHaveBeenCalledOnce();
  expect(f.pages.get).toHaveBeenCalledWith('execution', f.original.resultReference.key);
});

it('preserves exact known-destination replay for retained navigate roots', async () => {
  const f = await fixture(false); f.certified.start.capabilities.splice(3);
  expect((await f.load()).operation.binding).toEqual(createDestinationBinding(f.selection.at));
});

it.each(['direction', 'source id', 'source sequence', 'source index', 'anchor', 'kind', 'publication id', 'publication key', 'token schema', 'token extra'])
('rejects a changed original frontier %s', async damage => {
  const f = await fixture();
  if (damage === 'direction') Object.assign(f.selection, { direction: 'east' });
  if (damage === 'source id') f.selection.source.id = 'other-sight';
  if (damage === 'source sequence') f.selection.source.sequence++;
  if (damage === 'source index') f.selection.source.index++;
  if (damage === 'anchor') f.selection.at.cell.column++;
  if (['direction', 'source id', 'source sequence', 'source index', 'anchor'].includes(damage)) f.operation.binding = createFrontierBinding(f.selection);
  if (damage === 'kind') f.operation.binding = createDestinationBinding(f.selection.at);
  let identity = f.identity;
  if (damage.startsWith('publication') || damage.startsWith('token')) {
    const token = structuredClone(f.token);
    if (damage === 'publication id') token.publication.id = 'other';
    if (damage === 'publication key') token.publication.key = 'agentica/publications/other';
    if (damage === 'token schema') token.schema = 2;
    if (damage === 'token extra') Object.assign(token, { route: [] });
    identity = await prepareAction({ ...f.action, arguments: { frontier: JSON.stringify(token) } });
  }
  await expect(loadOperationBinding(f.pages, identity, f.binding)).rejects.toThrow();
  expect(loadDestination).not.toHaveBeenCalled();
});

it('does not allow explore merely because the original root granted navigate', async () => {
  const f = await fixture(); f.certified.start.capabilities.splice(3);
  await expect(f.load()).rejects.toThrow('launch binding');
});

it.each(['capability kind', 'capability effect', 'handoff', 'result source', 'result proof', 'ack policy'])('rejects changed %s', async damage => {
  const f = await fixture(), cap = f.certified.start.capabilities[3];
  if (damage === 'capability kind') cap.kind = 'query';
  if (damage === 'capability effect') cap.effect = 'readOnly';
  if (damage === 'handoff') delete cap.durableHandoff;
  if (damage === 'result source') f.resultRecord.value.sourceAttemptId = 'foreign';
  if (damage === 'result proof') f.resultRecord.value.proof = 'standalone';
  if (damage === 'ack policy') f.operation.ackPolicy = 'local';
  await expect(f.load()).rejects.toThrow();
});

it('cannot reinterpret an original navigate action as frontier authority', async () => {
  const f = await fixture(false); f.operation.binding = createFrontierBinding(f.selection);
  await expect(f.load()).rejects.toThrow('target differs');
});
