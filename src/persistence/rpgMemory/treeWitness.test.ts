import { expect, it } from 'vitest';
import { MemoryTree, type MemoryNode } from './tree';

function fixture() {
  const nodes = new Map<string, MemoryNode>();
  let reads = 0;
  const store = { get: async (id: string) => structuredClone(nodes.get(id)),
    add: async (node: MemoryNode) => { nodes.set(node.id, structuredClone(node)); } };
  const budget = { read: () => { reads++; }, write: () => {} };
  return { nodes, tree: (root: string | null = null) => new MemoryTree(store, root, budget),
    reads: () => reads, reset: () => { reads = 0; } };
}

it('pins exactly a prefix through splits, compression, staged writes and reload', async () => {
  const f = fixture(), tree = f.tree();
  expect(await tree.witness('room/1/')).toBeNull();
  await tree.set('room/1/a', 1);
  const original = await tree.witness('room/1/');
  expect(original).not.toBeNull();
  expect(await tree.witness('room/1/a')).toBe(original);
  expect(await tree.witness('room/1/absent')).toBeNull();
  for (const key of ['room/1', 'room/10/a', 'room/2/a', 'room', 'index/room/1/a']) {
    await tree.set(key, 2);
    expect(await tree.witness('room/1/')).toBe(original);
  }
  const root = await tree.flush();
  expect(await f.tree(root).witness('room/1/')).toBe(original);
  expect(await f.tree(root).witness('')).toBe(root);
  for (const key of ['room/1', 'room/10/a', 'room/2/a', 'room', 'index/room/1/a']) {
    await tree.delete(key);
    expect(await tree.witness('room/1/')).toBe(original);
  }
  await tree.set('room/1/b', 2);
  const expanded = await tree.witness('room/1/');
  expect(expanded).not.toBe(original);
  await tree.set('room/1/a', 1);
  expect(await tree.witness('room/1/')).not.toBe(expanded);
  await tree.delete('room/1/b');
  const reduced = await tree.witness('room/1/');
  expect(reduced).not.toBe(original);
  expect(await f.tree(await tree.flush()).witness('room/1/')).toBe(reduced);
  expect(await f.tree(root).witness('room/1/')).toBe(original);
  await tree.delete('room/1/a');
  expect(await tree.witness('room/1/')).toBeNull();
});

it('reads only the prefix path, not descendants, with thousands of matching records', async () => {
  const f = fixture(), tree = f.tree();
  for (let i = 0; i < 4096; i++) await tree.set(`record/floor/1/space/${i}`, i);
  await tree.set('index/floor/1/space/0', 0);
  const root = await tree.flush(), reader = f.tree(root);
  reader.scan = async () => { throw Error('No enumeration'); };
  f.reset();
  const witness = await reader.witness('record/floor/1/space/');
  expect(f.reads()).toBeLessThanOrEqual(2);
  const subtree = f.nodes.get(witness!)!;
  expect(subtree.prefix).toBe('record/floor/1/space/');
  expect(Object.keys(subtree.children)).toHaveLength(10);
  f.reset();
  expect(await reader.witness('record/floor/2/space/')).toBeNull();
  expect(f.reads()).toBeLessThanOrEqual(2);
  f.nodes.delete(witness!);
  await expect(f.tree(root).witness('record/floor/1/space/')).rejects.toThrow();
});

it('charges the host budget and rejects malformed witness paths', async () => {
  const f = fixture(), tree = f.tree();
  await tree.set('a/b', 1); const root = await tree.flush();
  const limited = new MemoryTree({ get: async id => f.nodes.get(id), add: async () => {} }, root,
    { read: () => { throw Error('read budget'); }, write: () => {} });
  await expect(limited.witness('a/')).rejects.toThrow('read budget');
  await expect(tree.witness('a\n')).rejects.toThrow();
});
