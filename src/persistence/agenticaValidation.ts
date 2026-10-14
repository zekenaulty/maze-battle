import { canonicalJson } from '../services/agentica/sdk/agentica-host.mjs';
import { object } from './streamValidation';

export function agenticaCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Agentica persistence: ${message}`);
}

/** Reject non-JSON values and bound work before invoking the SDK canonicalizer. */
export function boundedJson(value: unknown, maxBytes = 80_000): string {
  let nodes = 0, characters = 0;
  const count = (text: string) => {
    characters += text.length;
    agenticaCheck(characters <= maxBytes, 'string budget exceeded');
  };
  const visit = (item: unknown, depth: number) => {
    agenticaCheck(++nodes <= 12_000 && depth <= 16, 'JSON work limit exceeded');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') { count(item); return; }
    if (typeof item === 'number') { agenticaCheck(Number.isFinite(item), 'nonfinite JSON number'); return; }
    agenticaCheck(Array.isArray(item) || object(item), 'non-JSON value');
    agenticaCheck(Object.keys(item).length <= 1024, 'JSON collection limit exceeded');
    if (!Array.isArray(item)) for (const key of Object.keys(item)) count(key);
    for (const child of Object.values(item)) visit(child, depth + 1);
  };
  visit(value, 0);
  const text = canonicalJson(value);
  agenticaCheck(new TextEncoder().encode(text).byteLength <= maxBytes, 'serialized record limit exceeded');
  return text;
}

export function validateActionKey(key: string): [string, string, string, string] {
  agenticaCheck(typeof key === 'string' && key.length <= 1024, 'invalid action key');
  const parts = JSON.parse(key);
  agenticaCheck(Array.isArray(parts) && parts.length === 4 && parts.every(value => typeof value === 'string'
    && value.length > 0 && value.length <= 128) && canonicalJson(parts) === key, 'invalid action key');
  return parts as [string, string, string, string];
}
