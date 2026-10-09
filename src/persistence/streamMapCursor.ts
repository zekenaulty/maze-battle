import { natural, object, only } from './streamValidation';
import { validId, validPublicScopeId } from './topology/validation';
import { StreamMapError, type StreamMapView } from './streamMapTypes';

export function validateMapView(value: StreamMapView) {
  try {
    if (!object(value) || !only(value, 'scopeId,revision,topologyRevision') || !natural(value.revision)
      || !natural(value.topologyRevision) || value.topologyRevision > value.revision) throw new Error();
    validPublicScopeId(value.scopeId);
  } catch { throw new StreamMapError('INVALID_REQUEST'); }
}
export function sameMapView(a: StreamMapView, b: StreamMapView) {
  return a.scopeId === b.scopeId && a.revision === b.revision && a.topologyRevision === b.topologyRevision;
}

/** A pagination token, not an authorization token. Contains no slot, recipe or internal scope. */
export function encodeMapCursor(view: StreamMapView, after: string) {
  validateMapView(view); validId(after);
  const bytes = new TextEncoder().encode(JSON.stringify([1, view.scopeId, view.revision, view.topologyRevision, after]));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeMapCursor(cursor: string): { view: StreamMapView; after: string } {
  try {
    if (typeof cursor !== 'string' || cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const binary = atob(cursor.replace(/-/g, '+').replace(/_/g, '/'));
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
    if (!Array.isArray(value) || value.length !== 5 || value[0] !== 1) throw new Error();
    const view = { scopeId: value[1], revision: value[2], topologyRevision: value[3] };
    validateMapView(view); validId(value[4]);
    return { view, after: value[4] };
  } catch { throw new StreamMapError('INVALID_REQUEST'); }
}
