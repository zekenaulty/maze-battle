// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { earnedCell } from '../../../persistence/canonical/knowledge/region.test-support';
import { observationKey } from '../../../persistence/canonical/knowledge/keys';
import { chestArgs, chestToken, MAX_CHEST_TOKEN_BYTES, resolveChestSelection } from './chestSelection';
import { perceptionFixture } from './observation.test-support';

const publication = { key: 'agentica/publications/one', id: 'publication' };
const source = { sequence: 1, id: 'sight', index: 0 };
const envelope = { schema: 1, publication, source, chestIndex: 0 };
const currentSource = (f: Awaited<ReturnType<typeof perceptionFixture>>, index = 0) => {
  const { sequence, id } = f.knowledge.checkpoint().knowledge!; return { sequence, id, index };
};

describe('publication-scoped chest selection wire', () => {
  it('round-trips exact public references without chest IDs, coordinates, storage or authority', () => {
    const token = chestToken(publication, source, 0), result = chestArgs({ target: token }, publication);
    expect(JSON.parse(token)).toEqual(envelope); expect(result).toEqual({ publication, source, chestIndex: 0 });
    expect(chestToken({ id: publication.id, key: publication.key }, { index: 0, id: source.id, sequence: 1 }, 0)).toBe(token);
    result.source.index = 1; result.publication.id = 'mutated'; expect(source.index).toBe(0); expect(publication.id).toBe('publication');
  });
  it.each([null, {}, { target: null }, { target: 1 }, { target: '' }, { target: 'not-json' },
    { target: JSON.stringify(envelope), extra: true }])('rejects nonexact arguments %j', args => {
    expect(() => chestArgs(args, publication)).toThrow();
  });
  it.each([{ schema: 2 }, { extra: true }, { publication: { ...publication, extra: true } },
    { source: { ...source, extra: true } }, { source: { ...source, sequence: 0 } }, { source: { ...source, index: 113 } },
    { source: { ...source, index: -1 } }, { chestIndex: -1 }, { chestIndex: 0.5 }, { chestIndex: Number.MAX_SAFE_INTEGER + 1 }])(
    'rejects malformed token fields %j', mutation => {
      expect(() => chestArgs({ target: JSON.stringify({ ...envelope, ...mutation }) }, publication)).toThrow();
    });
  it.each([{ ...publication, id: 'replaced' }, { ...publication, key: 'agentica/publications/other' }])(
    'rejects another publication %j', other => {
      expect(() => chestArgs({ target: chestToken(publication, source, 0) }, other)).toThrow('publication');
    });
  it('bounds actual token bytes, including whitespace and multibyte text, without increasing capacity', () => {
    const long = 'x'.repeat(128), ref = { key: `agentica/publications/${long}`, id: long };
    const token = chestToken(ref, { sequence: Number.MAX_SAFE_INTEGER, id: long, index: 112 }, 0);
    expect(new TextEncoder().encode(token).byteLength).toBeLessThanOrEqual(MAX_CHEST_TOKEN_BYTES);
    const padded = token.padEnd(MAX_CHEST_TOKEN_BYTES, ' ');
    expect(chestArgs({ target: padded }, ref).publication).toEqual(ref);
    expect(() => chestArgs({ target: padded + ' ' }, ref)).toThrow('oversized');
    const wide = JSON.stringify({ ...envelope, source: { ...source, id: '\u00e9'.repeat(500) } });
    expect(wide.length).toBeLessThan(MAX_CHEST_TOKEN_BYTES);
    expect(() => chestArgs({ target: wide }, publication)).toThrow('oversized');
    expect(() => chestToken({ key: 'agentica/' + '"'.repeat(375), id: long }, { ...source, id: long }, 0)).toThrow();
  });
});

describe('exact current-sight chest resolution', () => {
  it('resolves through the real publication and observation validators using knowledge-only bounded reads', async () => {
    const f = await perceptionFixture(), chosen = chestArgs({ target: chestToken(f.ref, currentSource(f), 0) }, f.ref);
    const before = structuredClone(f.knowledge.records), writes = f.knowledge.writes.length;
    const get = vi.spyOn(f.pages, 'get'), saved = vi.spyOn(f.pages, 'savedSnapshot'), scan = vi.spyOn(f.pages, 'scan');
    expect(await resolveChestSelection(f.pages, f.snapshot, f.ref, chosen)).toEqual({
      command: { kind: 'open-chest', chestId: 'chest' }, position: earnedCell().at,
    });
    expect(get.mock.calls.map(([area]) => area)).toEqual(['knowledge', 'knowledge', 'knowledge']); expect(saved).toHaveBeenCalledTimes(1);
    expect(scan).not.toHaveBeenCalled(); expect(f.knowledge.records).toEqual(before); expect(f.knowledge.writes).toHaveLength(writes);
  });
  it('refuses an older remembered source even if the unchanged chest is visible again', async () => {
    const f = await perceptionFixture(), oldSource = currentSource(f);
    await f.knowledge.observe([earnedCell()]); f.republish();
    await expect(resolveChestSelection(f.pages, f.snapshot, f.ref, { publication: f.ref, source: oldSource, chestIndex: 0 })).rejects.toThrow('source');
    expect(await resolveChestSelection(f.pages, f.snapshot, f.ref,
      { publication: f.ref, source: currentSource(f), chestIndex: 0 })).not.toBeNull();
  });
  it.each(['foreign-id', 'future-sequence', 'cell-index', 'chest-index', 'extra-field', 'foreign-publication'])(
    'refuses tampered selection: %s', async kind => {
      const f = await perceptionFixture(), chosen = { publication: { ...f.ref }, source: currentSource(f), chestIndex: 0 };
      if (kind === 'foreign-id') chosen.source.id = 'foreign';
      if (kind === 'future-sequence') chosen.source.sequence++;
      if (kind === 'cell-index') chosen.source.index = 1;
      if (kind === 'chest-index') chosen.chestIndex = 1;
      if (kind === 'extra-field') Object.assign(chosen, { chestId: 'injected' });
      if (kind === 'foreign-publication') chosen.publication.id = 'foreign';
      await expect(resolveChestSelection(f.pages, f.snapshot, f.ref, chosen)).rejects.toThrow();
    });
  it.each(['opened', 'other-tile', 'town', 'old-actor-sight'])('returns null for valid but ineligible %s', async kind => {
    const actor = earnedCell(), other = earnedCell(-4, -2, 'room', 1, 0);
    if (kind === 'opened') actor.chests[0].opened = true;
    const f = await perceptionFixture([actor, other]);
    if (kind === 'town') { f.snapshot.checkpoint.mode = 'town'; f.publication.snapshot.checkpoint.mode = 'town'; }
    if (kind === 'old-actor-sight') {
      const position = { level: other.at.level, cell: { ...other.at.cell } };
      f.snapshot.checkpoint.position = position; f.publication.snapshot.checkpoint.position = structuredClone(position);
    }
    const index = kind === 'other-tile' ? 1 : 0;
    expect(await resolveChestSelection(f.pages, f.snapshot, f.ref,
      { publication: f.ref, source: currentSource(f, index), chestIndex: 0 })).toBeNull();
  });
  it('refuses a stale publication after movement rather than resolving against old sight', async () => {
    const f = await perceptionFixture(), original = { publication: { ...f.ref }, source: currentSource(f), chestIndex: 0 };
    await f.knowledge.observe([earnedCell(-4, -2, 'room', 1, 0)]); f.republish();
    await expect(resolveChestSelection(f.pages, f.snapshot, original.publication, original)).rejects.toThrow('reference');
    await expect(resolveChestSelection(f.pages, f.snapshot, f.ref, original)).rejects.toThrow('publication');
  });
  it('refuses a current head whose state no longer matches the pinned publication', async () => {
    const f = await perceptionFixture(), chosen = { publication: f.ref, source: currentSource(f), chestIndex: 0 };
    const moved = structuredClone(f.snapshot);
    moved.checkpoint.position = { level: 1, cell: { spaceId: 'room', row: 1, column: 0 } };
    await expect(resolveChestSelection(f.pages, moved, f.ref, chosen)).rejects.toThrow('snapshot');
    await expect(resolveChestSelection(f.pages, { ...f.snapshot, roots: { ...f.snapshot.roots, world: 'changed' } }, f.ref, chosen))
      .rejects.toThrow('snapshot');
  });
  it.each(['observation', 'chunk'])('rejects replaced immutable %s evidence', async kind => {
    const f = await perceptionFixture(), chosen = { publication: f.ref, source: currentSource(f), chestIndex: 0 };
    const key = observationKey(chosen.source.sequence) + (kind === 'chunk' ? '/0' : '');
    f.knowledge.records.get(key)!.id = 'replaced';
    await expect(resolveChestSelection(f.pages, f.snapshot, f.ref, chosen)).rejects.toThrow('replaced');
  });
  it('captures selection, snapshot and publication before yielding to storage', async () => {
    const f = await perceptionFixture(), chosen = { publication: { ...f.ref }, source: currentSource(f), chestIndex: 0 };
    const work = resolveChestSelection(f.pages, f.snapshot, f.ref, chosen);
    chosen.chestIndex = 10; chosen.source.id = 'changed'; f.ref.id = 'changed'; f.snapshot.checkpoint.mode = 'town';
    expect(await work).toMatchObject({ command: { kind: 'open-chest', chestId: 'chest' } });
  });
  it('does not traverse memory or history to resolve a current selection', async () => {
    const f = await perceptionFixture();
    for (let i = 0; i < 64; i++) await f.knowledge.observe([earnedCell(i, i, `unrelated-${i}`)]);
    await f.knowledge.observe([earnedCell()]); f.republish(); f.knowledge.reads.length = 0;
    expect(await resolveChestSelection(f.pages, f.snapshot, f.ref,
      { publication: f.ref, source: currentSource(f), chestIndex: 0 })).not.toBeNull();
    const key = observationKey(currentSource(f).sequence);
    expect(f.knowledge.reads).toEqual([key, `${key}/integrity`, `${key}/0`]);
  });
});
