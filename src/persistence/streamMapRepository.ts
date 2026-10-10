import type { StreamKnowledgePage } from '../domain/expedition/streaming/types';
import { validateStreamKnowledge } from './streamKnowledge';
import { natural, object, only } from './streamValidation';
import { validId } from './topology/validation';
import { decodeMapCursor, encodeMapCursor, sameMapView, validateMapView } from './streamMapCursor';
import { readMap } from './streamMapRead';
import { STREAM_MAP_PAGE_LIMIT, StreamMapError, type StreamMapListing, type StreamMapListOptions,
  type StreamMapReadOptions, type StreamMapPage, type StreamMapSummary, type StreamMapView } from './streamMapTypes';

export * from './streamMapTypes';

function knowledgeAt(value: StreamKnowledgePage, id: string, revision: number) {
  try {
    validateStreamKnowledge(value, id, revision);
    if (!Object.keys(value.cells).length) throw new Error();
  } catch { throw new StreamMapError('CORRUPT_RECORD'); }
  return value;
}
function summarize(page: StreamKnowledgePage): StreamMapSummary {
  return { spaceId: page.spaceId, pageRevision: page.revision, knownCells: Object.keys(page.cells).length,
    knownOpenings: Object.keys(page.openings).length, knownFrontiers: Object.keys(page.frontiers).length,
    knownChests: Object.keys(page.chests).length, openedChests: Object.values(page.chests).filter(chest => chest.opened).length,
    cleared: page.cleared };
}
function bounded<T>(result: T): T {
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 131_072) throw new StreamMapError('CORRUPT_RECORD');
  return result;
}

/** Saved discoveries only, lexicographic keyset order; at most 12 pages plus one lookahead. */
export async function listDiscoveredSpaces(slot: string, options: StreamMapListOptions = {}): Promise<StreamMapListing> {
  if (!object(options) || !only(options, 'cursor,limit,expectedView')) throw new StreamMapError('INVALID_REQUEST');
  const input = structuredClone(options) as StreamMapListOptions;
  const limit = input.limit === undefined ? STREAM_MAP_PAGE_LIMIT : input.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > STREAM_MAP_PAGE_LIMIT) throw new StreamMapError('INVALID_REQUEST');
  const cursor = input.cursor === undefined ? undefined : decodeMapCursor(input.cursor);
  if (input.expectedView !== undefined) validateMapView(input.expectedView);
  if (cursor && input.expectedView && !sameMapView(cursor.view, input.expectedView)) throw new StreamMapError('STALE_VIEW');
  const expected: StreamMapView | undefined = cursor?.view ?? input.expectedView;
  return readMap(slot, expected, async (tx, { view }) => {
    // Array keys sort after string keys: upper excludes every other slot without a sentinel string.
    const range = IDBKeyRange.bound(cursor ? [slot, cursor.after] : [slot], [slot, []], true, true);
    let record = await tx.objectStore('streamKnowledge').openCursor(range);
    const summaries: StreamMapSummary[] = [];
    while (record) {
      const key = record.primaryKey;
      if (!Array.isArray(key) || key.length !== 2 || key[0] !== slot || typeof key[1] !== 'string') throw new StreamMapError('CORRUPT_RECORD');
      const page = knowledgeAt(record.value, key[1], view.revision);
      if (summaries.length === limit) return bounded({ view, summaries, nextCursor: encodeMapCursor(view, summaries.at(-1)!.spaceId) });
      summaries.push(summarize(page));
      record = await record.continue();
    }
    if (!cursor && !summaries.length) throw new StreamMapError('CORRUPT_RECORD');
    return bounded({ view, summaries });
  });
}

/** Reads one saved page at the caller's view. No historical reconstruction or observation refresh. */
export async function readDiscoveredSpace(slot: string, spaceId: string, options: StreamMapReadOptions): Promise<StreamMapPage | undefined> {
  try { validId(spaceId); } catch { throw new StreamMapError('INVALID_REQUEST'); }
  if (!object(options) || !only(options, 'expectedView,expectedPageRevision') || options.expectedView === undefined
    || (options.expectedPageRevision !== undefined && !natural(options.expectedPageRevision))) throw new StreamMapError('INVALID_REQUEST');
  const expected = structuredClone(options);
  return readMap(slot, expected.expectedView, async (tx, { view, current, home }) => {
    const records = await tx.objectStore('streamKnowledge').getAll([slot, spaceId], 1);
    if (!records.length) {
      if (expected.expectedPageRevision !== undefined || spaceId === current || spaceId === home) throw new StreamMapError('CORRUPT_RECORD');
      return undefined;
    }
    const knowledge = knowledgeAt(records[0], spaceId, view.revision);
    if (expected.expectedPageRevision !== undefined && knowledge.revision !== expected.expectedPageRevision) throw new StreamMapError('CORRUPT_RECORD');
    return bounded({ view, pageRevision: knowledge.revision, knowledge });
  });
}
