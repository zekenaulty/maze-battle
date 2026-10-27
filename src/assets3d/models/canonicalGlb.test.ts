// @vitest-environment node
import { expect, it } from 'vitest';
import { canonicalGlb } from './canonicalGlb';

function fixture(reverse: boolean) {
  const doc = { asset: { version: '2.0' }, buffers: [{ byteLength: 12 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }, { buffer: 0, byteOffset: 4, byteLength: 4 }, { buffer: 0, byteOffset: 8, byteLength: 4 }],
    accessors: [{ bufferView: 0 }], images: [{ bufferView: reverse ? 2 : 1 }, { bufferView: reverse ? 1 : 2 }] };
  const json = new TextEncoder().encode(JSON.stringify(doc)), size = Math.ceil(json.length / 4) * 4;
  const out = new Uint8Array(28 + size + 12), v = new DataView(out.buffer);
  [0x46546c67, 2, out.length, size, 0x4e4f534a].forEach((n, i) => v.setUint32(i * 4, n, true));
  out.fill(32, 20, 20 + size); out.set(json, 20); v.setUint32(20 + size, 12, true); v.setUint32(24 + size, 0x004e4942, true);
  out.set(reverse ? [1, 2, 3, 4, 9, 10, 11, 12, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 28 + size);
  return out.buffer;
}
it('canonicalizes asynchronous image order without changing geometry/image bytes or references', () => {
  const a = canonicalGlb(fixture(false)), b = canonicalGlb(fixture(true));
  expect(new Uint8Array(a)).toEqual(new Uint8Array(b));
  expect(new Uint8Array(canonicalGlb(a))).toEqual(new Uint8Array(a));
});
it('rejects corrupt headers and external/invalid buffer layouts', () => {
  expect(() => canonicalGlb(new ArrayBuffer(12))).toThrow('Unsupported portable GLB packing');
  const b = fixture(false); new DataView(b).setUint32(8, 0, true);
  expect(() => canonicalGlb(b)).toThrow('Unsupported portable GLB packing');
});
