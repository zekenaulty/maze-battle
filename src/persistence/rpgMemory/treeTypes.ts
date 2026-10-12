import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';

/** Prefixes are complete keys, not edge-relative fragments. */
export interface MemoryNode {
  id: string;
  prefix: string;
  children: Record<string, string>;
  value?: unknown;
  witness: string;
}

export type MemoryStore = {
  get(id: string): Promise<MemoryNode | undefined>;
  add(node: MemoryNode): Promise<unknown>;
};
export type MemoryBudget = { read(): void; write(): void };
export type MemoryPage = { entries: { key: string; value: unknown }[]; next?: string };

export function requireTree(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid or unavailable memory tree. Abort the host transaction.');
}

export const validId = (id: unknown): id is string => typeof id === 'string' && id.length >= 1 && id.length <= 128;
export const validKey = (key: unknown, empty = false): key is string => typeof key === 'string'
  && (empty || key.length > 0) && key.length <= 2048 && !/[^\x20-\x7e]/.test(key);

const record = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
};

/** JSON only, with no domain-specific interpretation or limits on the caller's payload. */
export function requireJson(value: unknown): void {
  const active = new Set<object>();
  const stack: { value: unknown; exit?: boolean }[] = [{ value }];
  while (stack.length) {
    const item = stack.pop()!, current = item.value;
    if (item.exit) { active.delete(current as object); continue; }
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue;
    if (typeof current === 'number') { requireTree(Number.isFinite(current)); continue; }
    requireTree(typeof current === 'object' && current !== null && !active.has(current));
    const array = Array.isArray(current);
    requireTree(array || record(current));
    const keys = Reflect.ownKeys(current);
    requireTree(keys.every(key => typeof key === 'string'));
    if (array) requireTree(keys.length === current.length + 1);
    active.add(current);
    stack.push({ value: current, exit: true });
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (array) requireTree(/^(0|[1-9][0-9]*)$/.test(key as string) && Number(key) < current.length);
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
      requireTree(descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
      stack.push({ value: descriptor.value });
    }
  }
}

/** Redundancy for accidental corruption, not authentication against a database owner. */
export const nodeWitness = ({ witness: _witness, ...metadata }: MemoryNode): string => canonicalJson(metadata);

export function validateNode(value: unknown, id: string): MemoryNode {
  requireTree(record(value));
  const hasValue = Object.hasOwn(value, 'value');
  const fields = hasValue ? 'children,id,prefix,value,witness' : 'children,id,prefix,witness';
  requireTree(Reflect.ownKeys(value).length === (hasValue ? 5 : 4) && Object.keys(value).sort().join(',') === fields);
  requireTree(Object.values(Object.getOwnPropertyDescriptors(value)).every(field => Object.hasOwn(field, 'value')));
  requireTree(validId(id) && value.id === id && validKey(value.prefix, true) && typeof value.witness === 'string');
  requireTree(record(value.children));
  const edges = Object.keys(value.children);
  requireTree(Reflect.ownKeys(value.children).length === edges.length && edges.length <= 95);
  requireTree(Object.values(Object.getOwnPropertyDescriptors(value.children)).every(field => Object.hasOwn(field, 'value')));
  const ids = Object.values(value.children);
  requireTree(edges.every(edge => edge.length === 1 && validKey(edge)));
  requireTree(ids.every(child => validId(child) && child !== id) && new Set(ids).size === ids.length);
  requireTree(hasValue ? value.prefix.length > 0 : edges.length >= 2);
  requireTree(value.prefix.length < 2048 || edges.length === 0);
  if (hasValue) requireJson(value.value);
  const node = value as unknown as MemoryNode;
  requireTree(node.witness === nodeWitness(node));
  return structuredClone(node);
}
