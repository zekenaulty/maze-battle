import { describe, expect, it, vi } from 'vitest';
import { address, identity } from '../../../domain/agentic/knowledge/fixtures.test-support';
import type { RpgObservation } from '../../../domain/agentic/knowledge/types';
import type { Direction } from '../../../domain/types';
import { ancestorIndex, observationLineage, observationReader } from '../../../persistence/observationNodes';
import type { RpgObservationNode } from '../../../persistence/observationTypes';
import { memoryBudget } from '../../../persistence/rpgMemory/budget';
import { deriveRpgMemory } from '../../../persistence/rpgMemory/derive';
import { cellMemoryKey, memberMemoryKey, membersMemoryPrefix, roomMemoryKey, roomsMemoryPrefix } from '../../../persistence/rpgMemory/keys';
import type { MemoryQuery } from '../../../persistence/rpgMemory/query';
import { MemoryTree, type MemoryNode } from '../../../persistence/rpgMemory/tree';
import { memoryWitnesses } from '../../../persistence/rpgMemory/witnesses';
import type { RpgContextCommand } from './contracts';
import { rpgContext, rpgObservation } from './views';

const scopeId = 'b4d32e63-9aae-4f93-9434-7723385a95d7';
function grid(floor = 1, revision = 1): RpgObservation {
  return { status: 'observed', version: 1, gameId: 'wire-rpg', ...identity(revision), actor: address(0, floor),
    policy: { kind: 'rpg-linked-bfs-v1', radius: 16 }, cells: Array.from({ length: 35 }, (_, index) => {
      const row = Math.floor(index / 7), column = index % 7, position = address(column, floor, row);
      const exits: [Direction, boolean][] = [['north', row > 0], ['east', column < 6], ['south', row < 4], ['west', column > 0]];
      return { address: position, roomIds: ['hall', `room-${index.toString().padStart(2, '0')}`],
        chests: index === 34 ? [{ id: 'earned-chest', position, opened: false }] : [], stairs: [],
        links: exits.filter(([, open]) => open).map(([d]) => d), blocked: exits.filter(([, open]) => !open).map(([d]) => d) };
    }) };
}
function recent(): RpgObservation {
  const old = grid();
  return { ...old, ...identity(2), policy: { kind: 'rpg-linked-bfs-v1', radius: 0 },
    cells: [{ ...old.cells[0], links: [] }] };
}

// In-memory storage only; receipts, derivation, radix paging and fact ancestry are the production code.
async function archive(receipts = [grid(), recent()]) {
  const nodes = new Map<string, MemoryNode>(), sources = new Map<string, RpgObservationNode>();
  const store = { async get(id: string) { return structuredClone(nodes.get(id)); },
    async add(node: MemoryNode) { nodes.set(node.id, structuredClone(node)); } };
  const reader = observationReader({ async get(id) { return sources.get(id); } }, receipts[0].gameId);
  const writer = new MemoryTree(store, null, memoryBudget({ maxReads: 65536, maxWrites: 65536 }));
  let count = 0;
  const snapshots: { head: RpgObservationNode; root: string | null }[] = [];
  for (const observation of receipts) {
    const metadata = { id: observation.id, gameId: observation.gameId, depth: snapshots.length + 1,
      ancestors: await ancestorIndex(reader, snapshots.at(-1)?.head) };
    sources.set(observation.id, { ...metadata, version: 1, observation, lineage: observationLineage(metadata) });
    const head = await reader.read(observation.id);
    count = await deriveRpgMemory(writer, reader, head, count);
    snapshots.push({ head, root: await writer.flush() });
  }
  const open = (index = snapshots.length - 1, maxReads = 4096) => {
    const { head, root } = snapshots[index], budget = memoryBudget({ maxReads });
    const witnessReader = observationReader({ async get(id) { budget.read(); return structuredClone(sources.get(id)); } }, head.gameId);
    const tree = new MemoryTree({ get: store.get, async add() { throw new Error('Unexpected view write'); } }, root, budget);
    const cell = vi.fn(memoryWitnesses(witnessReader, head)), get = vi.spyOn(tree, 'get'), scan = vi.spyOn(tree, 'scan');
    const query: MemoryQuery = { head, tree, cell };
    return { query, get, scan, cell, budget };
  };
  return { open, nodes };
}
function noSecrets(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(/"(?:owner|control|gameState|seed|recipe|monsters|stats|policy|lineage|ancestors)"|controller/);
}

describe('current-head RPG observations', () => {
  it('caps current receipt cells at 32, keeps the actor and reports truncation without memory reads', async () => {
    const memory = (await archive()).open(0), before = structuredClone(memory.query.head);
    const view = await rpgObservation(memory.query, 7, scopeId);
    expect(view).toMatchObject({ revision: 7, observedAt: identity(1).observedAt, facts: [], data: {
      kind: 'local', scopeId, perspectiveId: 'party', gameId: 'wire-rpg', floor: 1, actor: address(0),
      sourceHead: { id: 'observation-1', observedAt: identity(1).observedAt, revision: { epoch: 1, revision: 1 } },
      observedCellCount: 35, truncated: true } });
    expect(view.data.cells).toHaveLength(32);
    expect(view.data.cells).toEqual(expect.arrayContaining([expect.objectContaining({ address: address(0) })]));
    expect(memory.get).not.toHaveBeenCalled(); expect(memory.scan).not.toHaveBeenCalled(); expect(memory.cell).not.toHaveBeenCalled();
    expect(memory.query.head).toEqual(before); noSecrets(view);
  });
  it('does not merge historical cells or cropped edges into current observation, and does not refresh timestamps', async () => {
    const memory = (await archive()).open(), view = await rpgObservation(memory.query, 3, scopeId);
    expect(view.data.cells).toEqual([{ address: address(0), roomIds: ['hall', 'room-00'], chests: [], stairs: [], links: [], blocked: ['north', 'west'] }]);
    expect(view.data.truncated).toBe(false); expect(view.observedAt).toBe(identity(2).observedAt);
    expect(JSON.stringify(view)).not.toContain('earned-chest');
    expect(memory.get).not.toHaveBeenCalled(); noSecrets(view);
  });
  it('operation mode never enumerates interiors, and all returned structures are owned', async () => {
    const memory = (await archive()).open(0), receipt = memory.query.head.observation;
    const guarded = new Proxy(receipt, { get(target, property) {
      if (property === 'cells') throw new Error('Operation enumerated cells');
      return Reflect.get(target, property);
    } });
    const operation = await rpgObservation({ ...memory.query, head: { ...memory.query.head, observation: guarded } }, 4, scopeId, 'operation');
    expect(Object.keys(operation.data).sort()).toEqual(['actor', 'floor', 'gameId', 'kind', 'perspectiveId', 'scopeId', 'sourceHead']);
    expect(JSON.stringify(operation)).not.toMatch(/"(?:cells|chests|rooms|edges|links|blocked|roomIds)"/); noSecrets(operation);
    const first = await rpgObservation(memory.query, 4, scopeId), second = await rpgObservation(memory.query, 4, scopeId);
    expect(first.observationId).not.toBe(second.observationId);
    (first.data.cells as { roomIds: string[] }[])[0].roomIds.push('injected');
    expect(JSON.stringify(second)).not.toContain('injected'); expect(receipt.cells[0].roomIds).not.toContain('injected');
  });
  it.each([[-1, scopeId, 'local'], [1, 'private-owner', 'local'], [1, scopeId, 'all']])('rejects invalid observation scope %j', async (revision, scope, mode) => {
    await expect(rpgObservation((await archive()).open().query, revision as number, scope as string, mode as 'local')).rejects.toThrow();
  });
});

describe('snapshot-bound RPG context', () => {
  it('pages one remembered room without duplicates, changing timestamps or writing storage', async () => {
    const f = await archive(), memory = f.open(), before = structuredClone([...f.nodes]);
    const first = await rpgContext(memory.query, { type: 'room', roomId: 'hall', limit: 32 });
    expect(first).toMatchObject({ kind: 'room', status: 'ready', rememberedCellCount: 35, snapshotId: 'observation-2', truncated: true });
    if (first.kind !== 'room' || first.status !== 'ready') throw new Error('Missing room page');
    expect(first.cells).toHaveLength(32); expect(first.next).toBe(memberMemoryKey(address(3, 1, 4), 'hall'));
    const second = await rpgContext(memory.query, { type: 'room', roomId: 'hall', limit: 32, snapshotId: first.snapshotId, after: first.next });
    if (second.kind !== 'room' || second.status !== 'ready') throw new Error('Missing continuation page');
    expect(second.cells).toHaveLength(3); expect(second.truncated).toBe(false); expect(second.next).toBeUndefined();
    expect(new Set([...first.cells, ...second.cells].map(cell => cellMemoryKey(cell.address))).size).toBe(35);
    expect(second.cells[2]).toMatchObject({ chests: [{ id: 'earned-chest', opened: false }], source: {
      id: 'observation-1', observedAt: identity(1).observedAt, revision: { epoch: 1, revision: 1 } } });
    expect(memory.cell).toHaveBeenCalledTimes(35);
    expect(memory.scan.mock.calls).toEqual([[membersMemoryPrefix(1, 'hall'), undefined, 32], [membersMemoryPrefix(1, 'hall'), first.next, 32]]);
    expect([...f.nodes]).toEqual(before); expect(memory.budget.stats().writes).toBe(0); noSecrets(first); noSecrets(second);
  });
  it('pages at most 12 summaries on the current floor without reading or exposing interiors', async () => {
    const memory = (await archive([grid(), grid(2, 2)])).open();
    const first = await rpgContext(memory.query, { type: 'map', limit: 12 });
    if (first.kind !== 'map') throw new Error('Missing room summaries');
    expect(first.rooms).toHaveLength(12); expect(first).toMatchObject({ floor: 2, snapshotId: 'observation-2', truncated: true });
    expect(first.rooms[0]).toEqual({ id: 'hall', rememberedCellCount: 35 });
    const second = await rpgContext(memory.query, { type: 'map', limit: 12, snapshotId: first.snapshotId, after: first.next });
    if (second.kind !== 'map') throw new Error('Missing second summary page');
    const third = await rpgContext(memory.query, { type: 'map', limit: 12, snapshotId: second.snapshotId, after: second.next });
    if (third.kind !== 'map') throw new Error('Missing third summary page');
    expect(third.rooms).toHaveLength(12); expect(third.truncated).toBe(false);
    expect(new Set([...first.rooms, ...second.rooms, ...third.rooms].map(room => room.id)).size).toBe(36);
    expect(memory.cell).not.toHaveBeenCalled();
    expect(memory.get.mock.calls.map(([key]) => key)).toEqual([first.next, second.next]);
    expect(memory.scan.mock.calls.every(([prefix, , limit]) => prefix === roomsMemoryPrefix(2) && limit === 12)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/"(?:cells|row|column|chests|links|edges)"/); noSecrets(first);
  });
  it('inspects exactly one validated remembered cell with per-fact provenance, without refresh', async () => {
    const memory = (await archive()).open();
    const old = await rpgContext(memory.query, { type: 'inspect', target: address(6, 1, 4) });
    expect(old).toMatchObject({ status: 'ready', sourceHead: { id: 'observation-2' }, cell: {
      source: { id: 'observation-1', observedAt: identity(1).observedAt }, chests: [{ opened: false }] } });
    expect(memory.get.mock.calls).toEqual([[cellMemoryKey(address(6, 1, 4))]]); expect(memory.cell).toHaveBeenCalledTimes(1);
    expect(memory.scan).not.toHaveBeenCalled();
    const cropped = await rpgContext(memory.query, { type: 'inspect', target: address(0) });
    if (cropped.kind !== 'inspect' || cropped.status !== 'ready') throw new Error('Missing remembered cell');
    expect(cropped.cell.source.id).toBe('observation-2');
    expect(cropped.cell.edges.find(edge => edge.direction === 'east')?.source.id).toBe('observation-1');
    noSecrets(old); noSecrets(cropped);
  });
  it('returns unknown for unearned cells and rooms, without enumerating topology', async () => {
    const memory = (await archive()).open();
    expect(await rpgContext(memory.query, { type: 'inspect', target: address(999) })).toMatchObject({ status: 'unknown', reason: 'target_unknown' });
    expect(await rpgContext(memory.query, { type: 'room', roomId: 'unearned', limit: 32 }))
      .toMatchObject({ status: 'unknown', reason: 'room_unknown', cells: [], truncated: false });
    expect(memory.get.mock.calls).toEqual([[cellMemoryKey(address(999))], [roomMemoryKey(1, 'unearned')]]);
    expect(memory.scan).not.toHaveBeenCalled();
  });
  it.each([
    { type: 'room', roomId: 'hall', limit: 33 }, { type: 'map', limit: 13 },
    { type: 'map', limit: 1, after: roomMemoryKey(1, 'hall') },
    { type: 'map', limit: 1, snapshotId: 'observation-1' },
    { type: 'map', limit: 1, snapshotId: 'observation-2', after: roomMemoryKey(2, 'hall') },
    { type: 'room', roomId: 'hall', limit: 1, snapshotId: 'observation-2', after: memberMemoryKey(address(0), 'room-00') },
    { type: 'inspect', target: address(0, 2) }, { type: 'inspect', target: { ...address(0), stats: true } },
    { type: 'map', limit: 1, gameState: {} },
  ])('rejects illegal scope/limits/cursors before reads: %j', async command => {
    const memory = (await archive()).open();
    await expect(rpgContext(memory.query, command as RpgContextCommand)).rejects.toThrow();
    expect(memory.get).not.toHaveBeenCalled(); expect(memory.scan).not.toHaveBeenCalled(); expect(memory.cell).not.toHaveBeenCalled();
  });
  it('rejects unknown or malformed cursor keys even when their prefixes match', async () => {
    const memory = (await archive()).open();
    for (const command of [
      { type: 'room', roomId: 'hall', limit: 1, after: memberMemoryKey(address(99), 'hall') },
      { type: 'map', limit: 1, after: roomMemoryKey(1, 'unearned') },
      { type: 'map', limit: 1, after: roomsMemoryPrefix(1) },
    ]) await expect(rpgContext(memory.query, { ...command, snapshotId: 'observation-2' } as RpgContextCommand)).rejects.toThrow();
    expect(memory.scan).not.toHaveBeenCalled();
  });
  it('rejects corrupt facts and out-of-snapshot sources instead of returning a partial view', async () => {
    const f = await archive(), latest = f.open(), older = f.open(0), key = cellMemoryKey(address(0));
    const future = await latest.query.tree.get(key);
    older.get.mockResolvedValueOnce(future);
    await expect(rpgContext(older.query, { type: 'inspect', target: address(0) })).rejects.toThrow('Invalid or unavailable');
    const value = structuredClone(future) as { fact: { roomIds: string[] } };
    value.fact.roomIds.push('hidden-room'); latest.get.mockResolvedValueOnce(value);
    await expect(rpgContext(latest.query, { type: 'inspect', target: address(0) })).rejects.toThrow('Invalid or unavailable');
    const missing = f.open(), get = MemoryTree.prototype.get.bind(missing.query.tree);
    missing.get.mockImplementation(async requested => requested === key ? undefined : get(requested));
    await expect(rpgContext(missing.query, { type: 'room', roomId: 'hall', limit: 1 })).rejects.toThrow('missing room evidence');
  });
  it('propagates read budget failure and owns commands before asynchronous reads', async () => {
    const f = await archive();
    await expect(rpgContext(f.open(undefined, 1).query, { type: 'room', roomId: 'hall', limit: 32 })).rejects.toThrow('budget exhausted');
    const command: RpgContextCommand = { type: 'room', roomId: 'hall', limit: 2 }, memory = f.open();
    const pending = rpgContext(memory.query, command); command.roomId = 'unearned'; command.limit = 99;
    expect(await pending).toMatchObject({ roomId: 'hall', cells: expect.any(Array) });
    expect(memory.cell).toHaveBeenCalledTimes(2);
  });
});
