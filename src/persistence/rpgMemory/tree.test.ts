import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import { MemoryTree, type MemoryNode } from './tree';

function fixture() {
  const nodes = new Map<string, MemoryNode>(), reads: string[] = [], writes: string[] = [];
  let serial = 0, readCharges = 0, writeCharges = 0;
  const caps = { reads: Infinity, writes: Infinity, failAdd: Infinity };
  const budget = {
    read() { if (++readCharges > caps.reads) throw new Error('read budget'); },
    write() { if (++writeCharges > caps.writes) throw new Error('write budget'); },
  };
  const store = {
    async get(id: string) {
      expect(readCharges).toBeGreaterThan(reads.length);
      reads.push(id);
      return structuredClone(nodes.get(id));
    },
    async add(node: MemoryNode) {
      expect(writeCharges).toBeGreaterThan(writes.length);
      if (writes.length >= caps.failAdd) throw new Error('add failure');
      if (nodes.has(node.id)) throw new Error('duplicate ID');
      for (const child of Object.values(node.children)) expect(nodes.has(child)).toBe(true);
      writes.push(node.id);
      nodes.set(node.id, structuredClone(node));
    },
  };
  const makeId = () => `node-${++serial}`;
  const tree = (root: string | null = null) => new MemoryTree(store, root, budget, makeId);
  const reset = () => { reads.length = 0; writes.length = 0; readCharges = 0; writeCharges = 0; };
  return { nodes, reads, writes, caps, budget, store, makeId, tree, reset, charges: () => ({ readCharges, writeCharges }) };
}

function sealed(node: Omit<MemoryNode, 'witness'>): MemoryNode {
  return { ...node, witness: canonicalJson(node) };
}

async function all(tree: MemoryTree, prefix = '', limit = 64) {
  const entries: { key: string; value: unknown }[] = [];
  let after: string | undefined;
  do {
    const page = await tree.scan(prefix, after, limit);
    entries.push(...page.entries);
    if (page.next !== undefined) {
      expect(page.next).toBe(page.entries.at(-1)?.key);
      expect(page.entries).toHaveLength(limit);
      if (after !== undefined) expect(page.next > after).toBe(true);
    }
    after = page.next;
  } while (after !== undefined);
  return entries;
}

function expected(map: Map<string, unknown>, prefix = '', after?: string, limit = Infinity) {
  return [...map].filter(([key]) => key.startsWith(prefix) && (after === undefined || key > after))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, limit).map(([key, value]) => ({ key, value }));
}

describe('persistent compressed memory radix map', () => {
  it('starts empty and does not write for reads, missing deletes, or empty flushes', async () => {
    const f = fixture(), tree = f.tree();
    expect(await tree.get('absent')).toBeUndefined();
    await tree.delete('absent');
    expect(await tree.scan('', undefined, 64)).toEqual({ entries: [] });
    expect(await tree.flush()).toBeNull();
    expect(f.charges()).toEqual({ readCharges: 0, writeCharges: 0 });
  });

  it('splits full prefixes, stores prefix keys, and compresses branches on deletion', async () => {
    const f = fixture(), tree = f.tree(), reference = new Map<string, unknown>();
    const keys = ['room/12/member/a', 'room/12/member/b', 'room/12', 'room', 'route', 'a', 'room/123', 'room/12/member'];
    for (const [index, key] of keys.entries()) {
      await tree.set(key, { index }); reference.set(key, { index });
      expect(await all(tree, '', 2)).toEqual(expected(reference));
    }
    await tree.set('room/12', null); reference.set('room/12', null);
    expect(await tree.get('roo')).toBeUndefined();
    expect(await tree.get('room/12/unknown')).toBeUndefined();
    expect(await tree.get('room/12')).toBeNull();
    const originalRoot = await tree.flush(), original = new Map(reference);
    const before = structuredClone([...f.nodes]);
    for (const key of ['room', 'room/12/member', 'room/12/member/b', 'room/123', 'a', 'route', 'room/12']) {
      await tree.delete(key); reference.delete(key);
      expect(await all(tree, '', 1)).toEqual(expected(reference));
    }
    const lastRoot = await tree.flush();
    expect(f.nodes.get(lastRoot!)).toMatchObject({ prefix: 'room/12/member/a', children: {}, value: { index: 0 } });
    for (const [id, node] of before) expect(f.nodes.get(id)).toEqual(node);
    expect(await all(f.tree(originalRoot))).toEqual(expected(original));
    await tree.delete('room/12/member/a');
    expect(await tree.flush()).toBeNull();
    expect(await f.tree(lastRoot).get('room/12/member/a')).toEqual({ index: 0 });
  });

  it('retains values when pruning descendants and leaves roots unchanged for missing deletes', async () => {
    const f = fixture(), tree = f.tree();
    await tree.set('a', false); await tree.set('ab', 0); await tree.set('abc', '');
    await tree.delete('abc');
    const root = await tree.flush();
    for (const missing of ['aa', 'abcd', 'z']) await tree.delete(missing);
    expect(await tree.flush()).toBe(root);
    expect(await all(tree)).toEqual([{ key: 'a', value: false }, { key: 'ab', value: 0 }]);
    await tree.delete('a');
    const compressed = await tree.flush();
    expect(f.nodes.get(compressed!)).toMatchObject({ prefix: 'ab', value: 0, children: {} });
  });

  it('flushes only live pending nodes in child-first order, never committed or superseded nodes', async () => {
    const f = fixture(), tree = f.tree();
    for (let index = 0; index < 100; index++) await tree.set('room/a', index);
    await tree.set('room/b', true); await tree.delete('room/b');
    expect(f.writes).toHaveLength(0);
    const root = await tree.flush();
    expect(f.writes).toEqual([root]);
    expect(f.nodes.size).toBe(1);
    const count = f.writes.length;
    expect(await tree.flush()).toBe(root);
    expect(f.writes).toHaveLength(count);
    await tree.set('room/b', []);
    await tree.flush();
    expect(f.writes).toHaveLength(count + 2);
    expect(new Set(f.writes).size).toBe(f.writes.length);
    for (const node of f.nodes.values()) {
      const { witness, ...metadata } = node;
      expect(witness).toBe(canonicalJson(metadata));
      expect(Object.hasOwn(node, 'value') || Object.keys(node.children).length >= 2).toBe(true);
    }
  });

  it('uses UUIDs by default and accepts all printable ASCII key characters', async () => {
    const f = fixture(), tree = new MemoryTree(f.store, null, f.budget);
    for (let code = 32; code <= 126; code++) await tree.set(String.fromCharCode(code), code);
    await tree.set('~'.repeat(2048), { ['__proto__']: ['opaque', null] });
    const root = await tree.flush();
    expect(root).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
    expect(await all(tree)).toHaveLength(96);
    expect(await tree.get('~'.repeat(2048))).toEqual({ ['__proto__']: ['opaque', null] });
  });

  it('copies input before asynchronous reads and isolates get/scan results and stored objects', async () => {
    const f = fixture(), base = f.tree();
    await base.set('a', { list: [1] });
    const root = await base.flush();
    const tree = new MemoryTree({ ...f.store, async get(id) { return f.nodes.get(id); } }, root, f.budget, f.makeId);
    const input = { list: [2], nested: { name: 'original' } };
    const pending = tree.set('ab', input);
    input.list.push(9); input.nested.name = 'changed';
    await pending;
    (f.nodes.get(root!)!.value as { list: number[] }).list.push(99);
    const copy = await tree.get('ab') as typeof input;
    copy.list.push(10); copy.nested.name = 'mutated';
    const page = await tree.scan('', undefined, 10);
    (page.entries[0].value as { list: number[] }).list.push(30);
    expect(await tree.get('a')).toEqual({ list: [1] });
    expect(await tree.get('ab')).toEqual({ list: [2], nested: { name: 'original' } });
  });

  it.each([1, 2, 3, 64])('paginates exact lexicographic prefix ranges at limit %s', async limit => {
    const f = fixture(), tree = f.tree(), reference = new Map<string, unknown>();
    for (const key of [' ', 'a', 'a ', 'a!', 'a!0', 'a0', 'aA', 'aa', 'ab', 'b', 'b0', 'z', '~', '~~']) {
      reference.set(key, key); await tree.set(key, key);
    }
    const root = await tree.flush();
    for (const prefix of ['', 'a', 'a!', 'a!0', 'a!00', 'c', '~']) {
      expect(await all(f.tree(root), prefix, limit)).toEqual(expected(reference, prefix));
      for (const after of [undefined, ' ', 'a', 'a!0', 'a!1', 'aaa', 'b', 'z', '~~~']) {
        const values = expected(reference, prefix, after), page = await f.tree(root).scan(prefix, after, limit);
        expect(page).toEqual({ entries: values.slice(0, limit), ...(values.length > limit ? { next: values[limit - 1].key } : {}) });
      }
    }
  });

  it('seeks thousands of keys with bounded reads, including late cursors and absent room prefixes', async () => {
    const f = fixture(), writer = f.tree();
    for (let room = 0; room < 256; room++) {
      for (let member = 0; member < 16; member++) {
        await writer.set(`room/${room.toString().padStart(4, '0')}/member/${member.toString().padStart(2, '0')}`, member);
      }
    }
    const root = await writer.flush();
    const target = 'room/0230/member/';
    for (const key of [target + '13', target + '99', 'room/0999/member/13']) {
      f.reset();
      expect(await f.tree(root).get(key)).toBe(key === target + '13' ? 13 : undefined);
      expect(f.reads.length).toBeLessThanOrEqual(9);
    }
    for (const [prefix, after] of [[target, undefined], [target, target + '12'], ['', target + '12'], ['room/0230/mem', target + '12'], ['room/0999/', undefined]] as const) {
      f.reset();
      const page = await f.tree(root).scan(prefix, after, 1);
      expect(page.entries).toHaveLength(prefix === 'room/0999/' ? 0 : 1);
      expect(f.reads.length).toBeLessThanOrEqual(12);
      if (prefix === target) {
        const leafReads = f.reads.map(id => f.nodes.get(id)!).filter(node => !Object.keys(node.children).length);
        expect(leafReads.filter(node => after === undefined || node.prefix > after)).toHaveLength(2);
        expect(leafReads.length).toBeLessThanOrEqual(after === undefined ? 2 : 3);
        expect(leafReads.every(node => node.prefix.startsWith(target))).toBe(true);
      }
    }
    f.reset();
    const edit = f.tree(root);
    await edit.set(target + '13', 'updated');
    expect(f.reads.length).toBeLessThanOrEqual(9);
    await edit.flush();
    expect(f.writes.length).toBeLessThanOrEqual(9);
    f.reset();
    const prune = f.tree(root);
    await prune.delete(target + '13');
    expect(f.reads.length).toBeLessThanOrEqual(10);
    await prune.flush();
    expect(f.writes.length).toBeLessThanOrEqual(8);
  });

  it('prunes hidden regions without opening them, and only looks ahead inside the prefix range', async () => {
    const f = fixture(), writer = f.tree();
    for (const key of ['hidden/a', 'hidden/b', 'room/a/0', 'room/a/1', 'room/b/0', 'room/b/1', 'secret/a']) await writer.set(key, key);
    const root = await writer.flush();
    for (const [id, node] of f.nodes) if (node.prefix.startsWith('hidden') || node.prefix.startsWith('secret') || node.prefix.startsWith('room/b')) f.nodes.delete(id);
    f.reset();
    expect(await f.tree(root).scan('room/a/', undefined, 1)).toEqual({ entries: [{ key: 'room/a/0', value: 'room/a/0' }], next: 'room/a/0' });
    expect(await f.tree(root).scan('room/a/', 'room/a/0', 1)).toEqual({ entries: [{ key: 'room/a/1', value: 'room/a/1' }] });
    expect(f.reads.every(id => f.nodes.has(id))).toBe(true);
    await expect(f.tree(root).scan('room/b/', undefined, 1)).rejects.toThrow();
  });

  it('preserves independently flushed source roots with padded cell, membership and room-count keys', async () => {
    const f = fixture(), floor = 'f'.repeat(14), room = '0061'.repeat(128);
    const prefix = `r${floor}${room}|`, countKey = `m${floor}${room}`;
    const source = f.tree(), reference = new Map<string, unknown>();
    for (let index = 0; index < 20; index++) {
      const row = index.toString(16).padStart(14, '0'), column = '0'.repeat(14);
      const key = `c${floor}${row}${column}`, address = { floor, row, column };
      const value = { kind: 'cell', payload: { address, observation: [index] } };
      await source.set(key, value); reference.set(key, value);
      await source.set(prefix + row + column, { kind: 'member', address });
      reference.set(prefix + row + column, { kind: 'member', address });
    }
    await source.set(countKey, { kind: 'room', count: 20 }); reference.set(countKey, { kind: 'room', count: 20 });
    const original = await source.flush(), next = f.tree(original);
    for (const key of [...reference.keys()].filter(key => key.startsWith(prefix)).slice(0, 10)) await next.delete(key);
    await next.set(countKey, { kind: 'room', count: 10 });
    const updated = await next.flush();
    expect(await all(f.tree(original), '', 7)).toEqual(expected(reference));
    expect(await all(f.tree(updated), prefix, 3)).toHaveLength(10);
    expect(await f.tree(updated).get(countKey)).toEqual({ kind: 'room', count: 10 });
    expect(await all(f.tree(updated), 'c', 3)).toEqual(expected(reference, 'c'));
  });

  it('handles the maximum key-depth without recursive synchronous tree walks', async () => {
    const f = fixture(), tree = f.tree();
    for (let length = 2048; length >= 1; length--) await tree.set('a'.repeat(length), length);
    const root = await tree.flush();
    expect(f.writes).toHaveLength(2048);
    expect(await f.tree(root).get('a'.repeat(2048))).toBe(2048);
    expect(await f.tree(root).scan('', 'a'.repeat(2047), 1)).toEqual({ entries: [{ key: 'a'.repeat(2048), value: 2048 }] });
    const edit = f.tree(root);
    await edit.delete('a'.repeat(2048));
    expect(await edit.get('a'.repeat(2048))).toBeUndefined();
    await edit.flush();
    expect(await f.tree(root).get('a'.repeat(2048))).toBe(2048);
  });

  it.each([1, 37, 9127])('matches a reference map across deterministic random mutations (seed %s)', async seed => {
    let state = seed;
    const random = (bound: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % bound; };
    const f = fixture(), reference = new Map<string, unknown>(), snapshots: { root: string | null; entries: ReturnType<typeof expected> }[] = [];
    let tree = f.tree();
    const keys = Array.from({ length: 160 }, (_, index) => index % 9 === 0 ? 'a'.repeat(index % 24 + 1) : `room/${index % 13}/member/${index}`);
    for (let step = 0; step < 800; step++) {
      const key = keys[random(keys.length)], choice = random(5);
      if (choice < 3) {
        const value = { step, nested: [null, random(1000), key] };
        await tree.set(key, value); reference.set(key, value);
      } else if (choice === 3) { await tree.delete(key); reference.delete(key); }
      else expect(await tree.get(key)).toEqual(reference.get(key));
      if (step % 23 === 0) {
        const prefix = ['room/1/', 'room/12', 'a', '', 'missing/'][random(5)], after = random(2) ? keys[random(keys.length)] : undefined;
        const limit = random(8) + 1, values = expected(reference, prefix, after), page = await tree.scan(prefix, after, limit);
        expect(page).toEqual({ entries: values.slice(0, limit), ...(values.length > limit ? { next: values[limit - 1].key } : {}) });
      }
      if (step % 100 === 0) {
        const root = await tree.flush(); snapshots.push({ root, entries: expected(reference) });
        tree = f.tree(root);
        expect(await all(tree, '', 7)).toEqual(expected(reference));
      }
    }
    expect(await all(tree, '', 3)).toEqual(expected(reference));
    for (const snapshot of snapshots) expect(await all(f.tree(snapshot.root), '', 11)).toEqual(snapshot.entries);
  });
});

describe('memory tree validation and host abort boundaries', () => {
  it.each(['', 'a\n', '\x00', '\x1f', '\x7f', '\u00e9', 'a'.repeat(2049), undefined, 123])('rejects invalid keys without store effects: %j', async key => {
    const f = fixture(), tree = f.tree();
    await expect(tree.get(key as string)).rejects.toThrow();
    await expect(tree.set(key as string, null)).rejects.toThrow();
    await expect(tree.delete(key as string)).rejects.toThrow();
    if (key !== '') await expect(tree.scan(key as string, undefined, 1)).rejects.toThrow();
    if (key !== undefined) await expect(tree.scan('', key as string, 1)).rejects.toThrow();
    expect(f.charges()).toEqual({ readCharges: 0, writeCharges: 0 });
  });

  it.each([0, -1, 65, 1.5, NaN, Infinity, '1', undefined])('rejects invalid page limits: %j', async limit => {
    await expect(fixture().tree().scan('', undefined, limit as number)).rejects.toThrow();
  });

  it.each(['', 'i'.repeat(129), undefined, 2])('rejects invalid root and generated IDs: %j', async id => {
    const f = fixture();
    expect(() => new MemoryTree(f.store, id as string, f.budget)).toThrow();
    await expect(new MemoryTree(f.store, null, f.budget, () => id as string).set('a', 1)).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
  });

  it('accepts 1 and 128 character IDs and rejects a reused generated ID', async () => {
    for (const id of ['x', 'x'.repeat(128)]) {
      const f = fixture(), tree = new MemoryTree(f.store, null, f.budget, () => id);
      await tree.set('a', 1);
      expect(await tree.flush()).toBe(id);
      await expect(tree.set('b', 2)).rejects.toThrow();
      expect(await f.tree(id).get('a')).toBe(1);
    }
  });

  it('rejects non-JSON values, sparse arrays and cycles before touching storage', async () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    const extraArray = [1]; Object.assign(extraArray, { extra: 2 });
    const values = [undefined, NaN, Infinity, -Infinity, 1n, () => 1, Symbol('x'), new Date(), new Map(), new Set(),
      cycle, [undefined], { x: undefined }, Array(2), extraArray, { [Symbol('x')]: 1 }, { get x() { return 1; } }];
    const f = fixture(), tree = f.tree();
    for (const value of values) await expect(tree.set('a', value)).rejects.toThrow();
    expect(f.charges()).toEqual({ readCharges: 0, writeCharges: 0 });
    const shared = { good: true };
    await tree.set('a', [shared, shared]);
    expect(await tree.get('a')).toEqual([{ good: true }, { good: true }]);
  });

  it.each(['get', 'set', 'delete', 'scan'] as const)('fails closed for missing nodes during %s', async method => {
    const f = fixture();
    const root = sealed({ id: 'root', prefix: '', children: { a: 'absent', b: 'other' } });
    f.nodes.set(root.id, root);
    const tree = f.tree(root.id);
    const work = method === 'scan' ? tree.scan('a', undefined, 1) : method === 'set' ? tree.set('a', 1) : tree[method]('a');
    await expect(work).rejects.toThrow();
    await expect(f.tree('missing-root').get('a')).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
  });

  it('validates an unchanged root on flush without enumerating its committed descendants', async () => {
    const f = fixture(), writer = f.tree();
    await expect(f.tree('missing').flush()).rejects.toThrow();
    await writer.set('a', 1); await writer.set('b', 2);
    const root = await writer.flush();
    f.reset();
    expect(await f.tree(root).flush()).toBe(root);
    expect(f.reads).toEqual([root]);
    expect(f.writes).toHaveLength(0);
    f.nodes.get(root!)!.witness = 'corrupted';
    await expect(f.tree(root).flush()).rejects.toThrow();
  });

  it('rejects altered metadata, values, witnesses and a single changed child pointer', async () => {
    const f = fixture(), writer = f.tree();
    await writer.set('a', { count: 1 }); await writer.set('b', { count: 2 });
    const root = await writer.flush(), original = structuredClone(f.nodes.get(root!)!);
    f.nodes.set('replacement', sealed({ id: 'replacement', prefix: 'a', children: {}, value: 999 }));
    for (const patch of [{ prefix: 'a' }, { id: 'wrong' }, { witness: 'wrong' }, { value: 1 }, { extra: true },
      { children: { ...original.children, a: 'replacement' } }]) {
      f.nodes.set(root!, { ...original, ...patch });
      await expect(f.tree(root).get('b')).rejects.toThrow();
    }
    f.nodes.set(root!, original);
    const leaf = f.nodes.get(original.children.a)!;
    (leaf.value as { count: number }).count++;
    await expect(f.tree(root).get('a')).rejects.toThrow();
  });

  it.each(['get', 'set', 'delete', 'scan'] as const)('rejects a re-witnessed wrong-prefix child during %s', async method => {
    const f = fixture();
    f.nodes.set('root', sealed({ id: 'root', prefix: '', children: { a: 'wrong', b: 'other' } }));
    f.nodes.set('wrong', sealed({ id: 'wrong', prefix: 'c', children: {}, value: 1 }));
    const tree = f.tree('root');
    const work = method === 'scan' ? tree.scan('a', undefined, 1) : method === 'set' ? tree.set('a', 2) : tree[method]('a');
    await expect(work).rejects.toThrow();
  });

  it('rejects self pointers, ancestor cycles, duplicate pointers and uncompressed valueless nodes', async () => {
    const f = fixture();
    const invalid = [
      sealed({ id: 'root', prefix: '', children: { a: 'root', b: 'b' } }),
      sealed({ id: 'root', prefix: '', children: { a: 'same', b: 'same' } }),
      sealed({ id: 'root', prefix: '', children: { a: 'a' } }),
      sealed({ id: 'root', prefix: 'a', children: {} }),
    ];
    for (const root of invalid) {
      f.nodes.set('root', root);
      await expect(f.tree('root').get('abc')).rejects.toThrow();
    }
    f.nodes.set('root', sealed({ id: 'root', prefix: '', children: { a: 'a', z: 'z' } }));
    f.nodes.set('a', sealed({ id: 'a', prefix: 'a', children: { b: 'root', c: 'c' } }));
    await expect(f.tree('root').scan('ab', undefined, 1)).rejects.toThrow();
    await expect(f.tree('root').delete('ab')).rejects.toThrow();
  });

  it('validates the remaining child before deletion compresses its parent', async () => {
    const f = fixture();
    f.nodes.set('root', sealed({ id: 'root', prefix: '', children: { a: 'a', b: 'b' } }));
    f.nodes.set('a', sealed({ id: 'a', prefix: 'a', children: {}, value: 1 }));
    f.nodes.set('b', sealed({ id: 'b', prefix: 'wrong', children: {}, value: 2 }));
    await expect(f.tree('root').delete('a')).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
  });

  it('rejects malformed stored shapes even with fresh canonical witnesses', async () => {
    const f = fixture();
    const leaf = { id: 'root', prefix: 'a', children: {}, value: 1 };
    const invalid: unknown[] = [null, [], {},
      { ...leaf, prefix: '' }, { ...leaf, prefix: '\u00e9' }, { ...leaf, prefix: 'a'.repeat(2049) },
      { ...leaf, id: 'different' }, { ...leaf, children: [] }, { ...leaf, children: null },
      { ...leaf, children: { aa: 'other' } }, { ...leaf, children: { '\n': 'other' } },
      { ...leaf, children: { a: '' } }, { ...leaf, children: { a: 'x'.repeat(129) } },
      { ...leaf, children: { a: 1 } }, { ...leaf, children: { a: 'root' } },
      { ...leaf, prefix: 'a'.repeat(2048), children: { a: 'other' } },
      { ...leaf, value: new Date() }, { ...leaf, value: NaN }, { ...leaf, unexpected: true },
    ];
    for (const bad of invalid) {
      const stored = bad === null ? null : { ...(bad as object), witness: canonicalJson(bad) };
      f.nodes.set('root', stored as MemoryNode);
      await expect(f.tree('root').get('a')).rejects.toThrow();
    }
  });

  it('charges before reads and permanently fails the instance when the host budget throws', async () => {
    const f = fixture(), writer = f.tree();
    await writer.set('a', 1); await writer.set('ab', 2);
    const root = await writer.flush();
    f.reset(); f.caps.reads = 1;
    const tree = f.tree(root);
    await expect(tree.set('ab', 3)).rejects.toThrow('read budget');
    expect(f.reads).toHaveLength(1);
    expect(f.charges().readCharges).toBe(2);
    expect(f.writes).toHaveLength(0);
    await expect(tree.flush()).rejects.toThrow();
    f.caps.reads = Infinity;
    expect(await f.tree(root).get('ab')).toBe(2);
  });

  it('does not touch the store when the first read or write charge fails', async () => {
    const f = fixture();
    f.caps.reads = 0;
    await expect(f.tree('unread').get('a')).rejects.toThrow('read budget');
    expect(f.reads).toHaveLength(0);
    const tree = f.tree(); await tree.set('a', 1);
    f.caps.writes = 0;
    await expect(tree.flush()).rejects.toThrow('write budget');
    expect(f.writes).toHaveLength(0);
    expect(f.nodes.size).toBe(0);
  });

  it.each(['budget', 'store'] as const)('does not publish a root after partial flush %s failure; host abort discards adds', async failure => {
    const f = fixture(), original = f.tree();
    await original.set('a', 'original');
    const root = await original.flush(), before = structuredClone([...f.nodes]);
    f.reset();
    const tree = f.tree(root);
    await tree.set('b', 2); await tree.set('c', 3);
    if (failure === 'budget') f.caps.writes = 1;
    else f.caps.failAdd = 1;
    await expect(tree.flush()).rejects.toThrow(failure === 'budget' ? 'write budget' : 'add failure');
    expect(f.writes).toHaveLength(1);
    expect(f.nodes.size).toBe(before.length + 1);
    await expect(tree.flush()).rejects.toThrow();
    expect(f.writes).toHaveLength(1);
    expect(await all(f.tree(root))).toEqual([{ key: 'a', value: 'original' }]);
    // This rollback belongs to the host transaction, not to the immutable tree.
    f.nodes.clear(); for (const [id, node] of before) f.nodes.set(id, node);
    f.caps.writes = Infinity; f.caps.failAdd = Infinity;
    expect(await all(f.tree(root))).toEqual([{ key: 'a', value: 'original' }]);
  });

  it('rejects concurrent mutation rather than silently losing an update', async () => {
    const f = fixture(), writer = f.tree();
    await writer.set('a', 1); const root = await writer.flush();
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const tree = new MemoryTree({ ...f.store, async get(id) { await wait; return f.store.get(id); } }, root, f.budget, f.makeId);
    const first = tree.set('ab', 2);
    await expect(tree.set('ac', 3)).rejects.toThrow();
    release(); await first;
    expect(await tree.get('ab')).toBe(2);
    expect(await tree.get('ac')).toBeUndefined();
  });
});
