import {
  nodeWitness, requireJson, requireTree, validId, validKey, validateNode,
  type MemoryBudget, type MemoryNode, type MemoryPage, type MemoryStore,
} from './treeTypes';

export type { MemoryBudget, MemoryNode, MemoryPage, MemoryStore } from './treeTypes';

type Parent = { node: MemoryNode; edge: string };

/**
 * Transaction-local, copy-on-write radix map. Await operations sequentially; discard
 * the instance and abort the host transaction on failure. add must reject existing
 * IDs, and makeId must produce fresh IDs. The host publishes the root atomically
 * with the adds. Stored subtrees are validated lazily along the paths actually read.
 */
export class MemoryTree {
  private readonly store: MemoryStore;
  private root: string | null;
  private readonly budget: MemoryBudget;
  private readonly makeId: () => string;
  private readonly pending = new Map<string, MemoryNode>();
  private readonly knownIds = new Set<string>();
  private busy = false;
  private failed = false;

  constructor(store: MemoryStore, root: string | null, budget: MemoryBudget, makeId: () => string = () => crypto.randomUUID()) {
    requireTree(root === null || validId(root));
    this.store = store;
    this.root = root;
    this.budget = budget;
    this.makeId = makeId;
    if (root !== null) this.knownIds.add(root);
  }

  private async operation<T>(work: () => Promise<T>): Promise<T> {
    requireTree(!this.busy && !this.failed);
    this.busy = true;
    try { return await work(); }
    catch (error) { this.failed = true; throw error; }
    finally { this.busy = false; }
  }

  private async read(id: string, path: Set<string>, parent?: Parent, staged?: Map<string, MemoryNode>): Promise<MemoryNode> {
    requireTree(validId(id) && !path.has(id));
    let node = staged?.get(id) ?? this.pending.get(id);
    if (!node) {
      this.budget.read();
      node = validateNode(await this.store.get(id), id);
    }
    if (parent) requireTree(node.prefix.startsWith(parent.node.prefix + parent.edge));
    this.knownIds.add(id);
    for (const child of Object.values(node.children)) {
      requireTree(!path.has(child));
      this.knownIds.add(child);
    }
    return node;
  }

  async get(key: string): Promise<unknown | undefined> {
    requireTree(validKey(key));
    return this.operation(async () => {
      const path = new Set<string>();
      let id = this.root, parent: Parent | undefined;
      while (id !== null) {
        const node = await this.read(id, path, parent);
        path.add(id);
        if (!key.startsWith(node.prefix)) return undefined;
        if (key === node.prefix) return structuredClone(node.value);
        const edge = key[node.prefix.length];
        parent = { node, edge };
        id = node.children[edge] ?? null;
      }
      return undefined;
    });
  }

  async set(key: string, value: unknown): Promise<void> {
    requireTree(validKey(key));
    requireJson(value);
    const copy = structuredClone(value);
    return this.operation(() => this.change(key, copy, false));
  }

  async delete(key: string): Promise<void> {
    requireTree(validKey(key));
    return this.operation(() => this.change(key, undefined, true));
  }

  private async change(key: string, value: unknown, remove: boolean): Promise<void> {
    const staged = new Map<string, MemoryNode>(), retired = new Set<string>();
    const path = new Set<string>(), parents: Parent[] = [];
    const create = (prefix: string, children: Record<string, string>, entry?: unknown): string => {
      const id = this.makeId();
      requireTree(validId(id) && !this.knownIds.has(id));
      this.knownIds.add(id);
      const node: MemoryNode = { id, prefix, children, ...(entry === undefined ? {} : { value: entry }), witness: '' };
      node.witness = nodeWitness(node);
      staged.set(id, node);
      return id;
    };
    const rebuild = async (node: MemoryNode, children: Record<string, string>, entry?: unknown): Promise<string | null> => {
      retired.add(node.id);
      const edges = Object.keys(children);
      if (entry === undefined && edges.length === 0) return null;
      if (entry === undefined && edges.length === 1) {
        const edge = edges[0], id = children[edge];
        await this.read(id, path, { node, edge }, staged);
        return id;
      }
      return create(node.prefix, children, entry);
    };

    let id = this.root, replacement: string | null;
    if (id === null) {
      if (remove) return;
      replacement = create(key, {}, value);
    } else {
      for (;;) {
        const node = await this.read(id, path, parents.at(-1));
        path.add(id);
        if (!key.startsWith(node.prefix)) {
          if (remove) return;
          let common = 0;
          while (common < key.length && common < node.prefix.length && key[common] === node.prefix[common]) common++;
          const children: Record<string, string> = { [node.prefix[common]]: node.id };
          if (common < key.length) children[key[common]] = create(key, {}, value);
          replacement = create(key.slice(0, common), children, common === key.length ? value : undefined);
        } else if (key === node.prefix) {
          if (remove && !Object.hasOwn(node, 'value')) return;
          replacement = await rebuild(node, node.children, remove ? undefined : value);
        } else {
          const edge = key[node.prefix.length], child = node.children[edge];
          if (child !== undefined) { parents.push({ node, edge }); id = child; continue; }
          if (remove) return;
          replacement = await rebuild(node, { ...node.children, [edge]: create(key, {}, value) }, node.value);
        }
        path.delete(node.id);
        break;
      }
    }
    while (parents.length) {
      const { node, edge } = parents.pop()!, children = { ...node.children };
      if (replacement === null) delete children[edge];
      else children[edge] = replacement;
      replacement = await rebuild(node, children, node.value);
      path.delete(node.id);
    }
    for (const old of retired) {
      if (this.pending.delete(old)) this.knownIds.delete(old);
    }
    for (const [newId, node] of staged) this.pending.set(newId, node);
    this.root = replacement;
  }

  async scan(prefix: string, after: string | undefined, limit: number): Promise<MemoryPage> {
    requireTree(validKey(prefix, true) && (after === undefined || validKey(after)));
    requireTree(Number.isInteger(limit) && limit >= 1 && limit <= 64);
    return this.operation(async () => {
      const entries: MemoryPage['entries'] = [], path = new Set<string>();
      // DEL is above every permitted character, including the final printable '~'.
      const upper = prefix + '\x7f';
      const intersects = (lower: string) => lower < upper && lower + '\x7f' > prefix
        && (after === undefined || lower + '\x7f' > after);
      const visit = async (id: string, parent?: Parent): Promise<void> => {
        if (parent && !intersects(parent.node.prefix + parent.edge)) return;
        const node = await this.read(id, path, parent);
        if (!intersects(node.prefix)) return;
        path.add(id);
        if (Object.hasOwn(node, 'value') && node.prefix.startsWith(prefix) && (after === undefined || node.prefix > after)) {
          entries.push({ key: node.prefix, value: structuredClone(node.value) });
        }
        for (const edge of Object.keys(node.children).sort()) {
          if (entries.length > limit) break;
          await visit(node.children[edge], { node, edge });
        }
        path.delete(id);
      };
      if (this.root !== null && (after === undefined || after < upper)) await visit(this.root);
      const more = entries.length > limit;
      if (more) entries.pop();
      return { entries, ...(more ? { next: entries.at(-1)!.key } : {}) };
    });
  }

  async flush(): Promise<string | null> {
    return this.operation(async () => {
      if (this.root !== null && !this.pending.has(this.root)) await this.read(this.root, new Set());
      const stack = this.root === null ? [] : [{ id: this.root, exit: false }];
      const seen = new Set<string>();
      while (stack.length) {
        const { id, exit } = stack.pop()!, node = this.pending.get(id);
        if (!node) continue;
        if (exit) {
          this.budget.write();
          await this.store.add(structuredClone(node));
        } else {
          requireTree(!seen.has(id));
          seen.add(id);
          stack.push({ id, exit: true });
          for (const child of Object.values(node.children)) stack.push({ id: child, exit: false });
        }
      }
      this.pending.clear();
      return this.root;
    });
  }
}
