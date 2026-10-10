import type { StreamMapListing, StreamMapPage, StreamMapView } from '../../persistence/streamMapRepository';
import { addressKey } from '../../domain/expedition/address';

export const publicScope = '0510f113-4f97-4131-b3fe-462cd1739f99';
export const mapView = (revision = 10): StreamMapView => ({ scopeId: publicScope, revision, topologyRevision: 2 });
export function listing(prefix = 'room', revision = 10, nextCursor?: string): StreamMapListing {
  return { view: mapView(revision), nextCursor, summaries: Array.from({ length: 12 }, (_, index) => ({ spaceId: `${prefix}-${index}`,
    pageRevision: revision, knownCells: 2, knownOpenings: 1, knownFrontiers: 1, knownChests: 1, openedChests: 0, cleared: false })) };
}
export function savedPage(spaceId = 'current', revision = 10): StreamMapPage {
  const a = { spaceId, row: 0, column: 0 }, b = { spaceId, row: 0, column: 1 };
  return { view: mapView(revision), pageRevision: revision, knowledge: { version: 1, spaceId, revision, cleared: false, completedExits: [],
    cells: { [addressKey(a)]: { ...a, links: ['east'], observedAt: 3 }, [addressKey(b)]: { ...b, links: ['west', 'east'], observedAt: 4 } },
    chests: { loot: { ...b, id: 'loot', opened: false, observedAt: 4 } },
    openings: { door: { ...a, id: 'door', direction: 'west', observedAt: 3 } },
    frontiers: { pending: { ...b, id: 'pending', direction: 'south', observedAt: 4 } },
  } };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
