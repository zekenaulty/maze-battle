// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { jsonBytes } from '../validation';
import { MAX_RECORD_BYTES } from '../types';
import type { ObservationHeader } from './types';
import { observationFixture } from './observation.test-support';
import { observationDigest, readObservationIntegrity, retainObservationIntegrity, MAX_OBSERVATION_PROOF_BYTES } from './observation.integrity';

describe('immutable observation integrity manifest', () => {
  it('commits every complete record synchronously and reads only one proof', async () => {
    const f = await observationFixture(), digest = (row: unknown) => `sha256:${createHash('sha256').update(canonicalJson(row)).digest('hex')}`;
    expect(f.proof.value).toEqual({ schema: 1, recordId: f.parent.id, revision: 7,
      headerDigest: digest(f.parent), chunkDigests: f.chunks.map(digest) });
    expect(await readObservationIntegrity(f.pages, f.parent)).toEqual(f.chunks.map(observationDigest));
    expect(f.reads).toEqual([f.proof.key]); expect(f.writes).toEqual([]);
    await expect(retainObservationIntegrity(f.pages, f.parent, f.chunks)).rejects.toThrow('already exists');
  });

  it.each(['missing', 'gameId', 'generation', 'area', 'key', 'revision', 'indexes', 'extra-envelope',
    'schema', 'recordId', 'proof-revision', 'headerDigest', 'chunkDigests', 'short-digests', 'extra-field', 'oversize'] as const)
  ('refuses malformed/foreign manifest %s', async kind => {
    const f = await observationFixture(), proof = f.records.get(f.proof.key)!;
    const value = proof.value as Record<string, unknown>;
    if (kind === 'missing') f.records.delete(f.proof.key);
    else if (['gameId', 'generation', 'area', 'key'].includes(kind)) Object.assign(proof, { [kind]: 'foreign' });
    else if (kind === 'revision') proof.revision++;
    else if (kind === 'indexes') proof.indexes = ['extra'];
    else if (kind === 'extra-envelope') Object.assign(proof, { hidden: true });
    else if (kind === 'schema') value.schema = 2;
    else if (kind === 'recordId') value.recordId = 'replaced';
    else if (kind === 'proof-revision') value.revision = 8;
    else if (kind === 'headerDigest') value.headerDigest = `sha256:${'0'.repeat(64)}`;
    else if (kind === 'chunkDigests') value.chunkDigests = ['bad', 'bad', 'bad'];
    else if (kind === 'short-digests') value.chunkDigests = [];
    else if (kind === 'extra-field') value.hidden = true;
    else value.padding = 'x'.repeat(1024);
    await expect(readObservationIntegrity(f.pages, f.parent)).rejects.toThrow(); expect(f.writes).toEqual([]);
  });

  it('covers maximal identifiers, revision, eight chunks and the actual record envelope', async () => {
    const f = await observationFixture(113), long = 'x'.repeat(128);
    for (const row of [f.parent, ...f.chunks]) Object.assign(row, { gameId: long, generation: long, id: long, revision: Number.MAX_SAFE_INTEGER });
    // IDs must remain unique even at their maximum length.
    f.chunks.forEach((row, i) => row.id = `${i}${long.slice(1)}`);
    Object.assign(f.parent.value as unknown as ObservationHeader,
      { owner: long, epoch: Number.MAX_SAFE_INTEGER, revision: Number.MAX_SAFE_INTEGER, chunks: f.chunks.map(c => c.id) });
    f.records.delete(f.proof.key);
    const proof = await retainObservationIntegrity(f.pages, f.parent, f.chunks);
    expect(jsonBytes(proof.value, MAX_OBSERVATION_PROOF_BYTES)).toBeLessThanOrEqual(1024);
    Object.assign(proof, { generation: long, gameId: long, id: long, revision: Number.MAX_SAFE_INTEGER });
    expect(jsonBytes(proof)).toBeLessThan(MAX_RECORD_BYTES);
  });

  it.each(['coverage', 'reciprocity', 'missing-chunk', 'chunk-order'] as const)('will not mint a proof for invalid %s', async kind => {
    const f = await observationFixture(); f.records.delete(f.proof.key);
    if (kind === 'coverage') (f.parent.value as unknown as ObservationHeader).actor = { level: 1, cell: { spaceId: 'absent', row: 0, column: 0 } };
    if (kind === 'reciprocity') (f.chunks[0].value as unknown as { cells: typeof f.cells }).cells[0].edges.east = f.cells[1].at;
    if (kind === 'missing-chunk') f.chunks.pop();
    if (kind === 'chunk-order') f.chunks.reverse();
    await expect(retainObservationIntegrity(f.pages, f.parent, f.chunks)).rejects.toThrow(); expect(f.writes).toEqual([]);
  });
});
