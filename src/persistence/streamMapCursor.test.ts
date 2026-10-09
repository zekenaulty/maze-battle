// @vitest-environment node
import { expect, it } from 'vitest';
import { decodeMapCursor, encodeMapCursor, validateMapView } from './streamMapCursor';

const view = { scopeId: '0510f113-4f97-4131-b3fe-462cd1739f99', revision: 123, topologyRevision: 7 };
it('round-trips only public identity/revisions and the last saved key', () => {
  const encoded = encodeMapCursor(view, 'socket-12:room');
  expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeMapCursor(encoded)).toEqual({ view, after: 'socket-12:room' });
  expect(JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))).toEqual([1, view.scopeId, 123, 7, 'socket-12:room']);
});
it.each(['', 'x'.repeat(2049), '{}', btoa('[2]'), btoa('[1,"scope:recipe",0,0,"entry"]')])('rejects malformed bounded cursor %s', token => {
  expect(() => decodeMapCursor(token)).toThrow('INVALID_REQUEST');
});
it.each([{ scopeId: '["spaces-v2","world","floor",1,12345]' }, { revision: -1 }, { topologyRevision: 124 }, { seed: 55 }])(
  'rejects private or inconsistent view %j', change => expect(() => validateMapView({ ...view, ...change })).toThrow('INVALID_REQUEST'));
