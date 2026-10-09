import { describe, expect, it } from 'vitest';
import { boundedJson, validateActionKey } from './agenticaValidation';
import { canonicalJson } from '../services/agentica/sdk/agentica-host.mjs';

describe('bounded Agentica protocol validation', () => {
  it('uses the pinned SDK canonical form', () => {
    const value = { z: [1, null, true], a: { unicode: '\u2713' } };
    expect(boundedJson(value)).toBe(canonicalJson(value));
  });
  it.each([undefined, NaN, Infinity, new Map(), { value: undefined }, { callback: () => 0 }])('rejects non-JSON values', value => {
    expect(() => boundedJson(value)).toThrow();
  });
  it('bounds cumulative text, keys, depth, collection work and UTF-8 bytes', () => {
    for (const value of [{ a: 'x'.repeat(50), b: 'y'.repeat(50) }, { ['k'.repeat(101)]: 0 }, '\u2713'.repeat(34)]) {
      expect(() => boundedJson(value, 100)).toThrow();
    }
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => boundedJson(cyclic)).toThrow();
    expect(() => boundedJson(Array.from({ length: 1025 }, () => 0))).toThrow();
    expect(() => boundedJson(Array.from({ length: 20 }, () => Array.from({ length: 1000 }, () => null)))).toThrow();
  });
  it('requires exact canonical SDK compound keys, not alternate encodings', () => {
    expect(validateActionKey('["session","0","run","action"]')).toEqual(['session', '0', 'run', 'action']);
    for (const key of ['["session", "0","run","action"]', 'null', '["session","run"]', '["session",0,"run","action"]']) {
      expect(() => validateActionKey(key)).toThrow();
    }
  });
});
