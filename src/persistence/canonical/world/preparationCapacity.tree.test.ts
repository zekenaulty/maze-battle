// @vitest-environment node
import { expect, it } from 'vitest';
import { MemoryTree, type MemoryNode } from '../../rpgMemory/tree';
import { storedBytes } from '../accounting';
import { preparationBucketNodes, preparationTreeBytes } from './preparationCapacity.bytes';

const identity = 'x'.repeat(128), value = '00000000-0000-4000-8000-000000000000';
function store() {
  const all = new Map<string, MemoryNode>(), flushed: MemoryNode[] = [];
  let made = 0;
  const tree = (root: string | null) => new MemoryTree({ get: async id => all.get(id),
    add: async node => { all.set(node.id, node); flushed.push(node); } }, root,
  { read() {}, write() {} }, () => { made++; return crypto.randomUUID(); });
  const bytes = (nodes: MemoryNode[]) => nodes.reduce((sum, node) => sum + storedBytes('nodes', [identity, node.id],
    { generation: identity, gameId: identity, node }), 0);
  return { tree, flushed, bytes, made: () => made };
}

it('counts only reachable pending paths, including repeated mutations and deletion', async () => {
  const f = store(), tree = f.tree(null);
  for (let i = 0; i < 100; i++) await tree.set(`record/dungeon/16/ports/socket-${i}:room`, value);
  await tree.flush(); f.flushed.length = 0;
  const before = f.made();
  for (let i = 0; i < 100; i++) await tree.set('record/dungeon/16/ports/socket-15:room', value);
  await tree.set('record/dungeon/16/ports/socket-15:passage', value);
  await tree.delete('record/dungeon/16/ports/socket-15:passage');
  await tree.flush();
  expect(f.flushed.length).toBeLessThan(10);
  expect(f.made() - before).toBeGreaterThan(100 * f.flushed.length);
  expect(f.bytes(f.flushed)).toBeLessThan(preparationTreeBytes(2,
    [{ count: 2, length: 64, variablePositions: 2, localBranches: 3 }]));
});

it.each([-100, -10, -1, 0, 9, 99])('bounds a five-by-five dirty neighborhood across coordinate %s', async center => {
  const f = store(), first = f.tree(null), rooms = 100, maximum = 22 * (rooms + 1);
  const prefix = 'record/dungeon/16/bucket/';
  const keys = new Set<string>();
  // Numerous unchanged, differently signed keys retain their real branch edges during a flush.
  for (let row = -20; row <= 20; row++) for (let col = -10; col <= 10; col++) keys.add(`${row},${col}`);
  for (let row = center - 2; row <= center + 2; row++)
    for (let col = center - 2; col <= center + 2; col++) keys.add(`${row},${col}`);
  expect(keys.size).toBeLessThanOrEqual(12 * rooms - 8);
  for (const key of keys) await first.set(prefix + key, value);
  const root = await first.flush(); f.flushed.length = 0;
  const second = f.tree(root);
  for (let row = center - 2; row <= center + 2; row++)
    for (let col = center - 2; col <= center + 2; col++) await second.set(prefix + `${row},${col}`, value);
  await second.flush();
  const digits = String(Math.ceil(maximum / 16)).length;
  expect(f.bytes(f.flushed)).toBeLessThanOrEqual(preparationBucketNodes(prefix.length + 2 * (digits + 1) + 1, digits, rooms));
});
