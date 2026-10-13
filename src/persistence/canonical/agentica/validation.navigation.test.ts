// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { navigationRecordRef } from '../navigation/host';
import type { CanonicalRecord } from '../types';

const row = (): CanonicalRecord => ({ generation: 'generation', gameId: 'game', id: 'result', area: 'execution',
  key: 'agentica/actions/action/result', revision: 8, indexes: [], value: { exact: { nested: 'original' } } });

describe('witnessed navigation record references', () => {
  it('binds the complete record and source identity, not only the payload or record ID', () => {
    const record = row(), ref = navigationRecordRef(record, 'attempt');
    expect(ref).toEqual({ key: record.key, recordId: record.id, revision: 8, sourceAttemptId: 'attempt', recordWitness: canonicalJson(record) });
    record.value = { changed: true };
    expect(ref.recordWitness).not.toBe(navigationRecordRef(record, 'attempt').recordWitness);
  });
  it('validates canonical record scope and source identity', () => {
    expect(() => navigationRecordRef({ ...row(), area: 'world' }, 'attempt')).toThrow('scope');
    expect(() => navigationRecordRef({ ...row(), revision: -1 }, 'attempt')).toThrow('scope');
    expect(() => navigationRecordRef(row(), '../attempt')).toThrow('source attempt');
  });
  it('bounds the full escaped witness even when the raw record fits canonical storage', () => {
    expect(() => navigationRecordRef({ ...row(), value: 'x'.repeat(13000) }, 'attempt')).toThrow('12288 bytes');
    expect(() => navigationRecordRef({ ...row(), value: '"'.repeat(4000) }, 'attempt')).toThrow('12288 bytes');
  });
});
