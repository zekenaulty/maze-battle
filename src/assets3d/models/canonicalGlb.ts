interface BufferView { buffer: number; byteOffset?: number; byteLength: number; [key: string]: unknown }
interface Document {
  asset: { version: string }; buffers: { byteLength: number; uri?: string }[]; bufferViews: BufferView[];
  images?: { bufferView?: number }[];
  accessors?: { bufferView?: number; sparse?: { indices: { bufferView: number }; values: { bufferView: number } } }[];
}
const padded = (n: number) => Math.ceil(n / 4) * 4;
/** Three's image encoders finish asynchronously. Pack by logical image order,
 * preserving every byte and remapping standard accessor/image buffer references.
 * Deliberately supports one embedded JSON/BIN GLB, not arbitrary external glTF. */
export function canonicalGlb(input: ArrayBuffer): ArrayBuffer {
  const view = new DataView(input), source = new Uint8Array(input);
  const check = (ok: unknown) => { if (!ok) throw Error('Unsupported portable GLB packing'); };
  check(input.byteLength >= 28 && input.byteLength <= 64 * 1024 * 1024);
  check(view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2 && view.getUint32(8, true) === input.byteLength);
  const jsonLength = view.getUint32(12, true), binHeader = 20 + jsonLength;
  check(view.getUint32(16, true) === 0x4e4f534a && binHeader + 8 <= input.byteLength && jsonLength % 4 === 0);
  const binLength = view.getUint32(binHeader, true);
  check(view.getUint32(binHeader + 4, true) === 0x004e4942 && binHeader + 8 + binLength === input.byteLength);
  const doc = JSON.parse(new TextDecoder().decode(source.subarray(20, binHeader))) as Document;
  check(doc.asset?.version === '2.0' && doc.buffers?.length === 1 && !doc.buffers[0].uri && doc.bufferViews.length < 100000);
  const images = new Set<number>();
  for (const image of doc.images ?? []) {
    check(Number.isSafeInteger(image.bufferView) && image.bufferView! >= 0 && image.bufferView! < doc.bufferViews.length);
    images.add(image.bufferView!);
  }
  const order = [...doc.bufferViews.keys()].filter(i => !images.has(i)).concat([...images]);
  const remap = new Map(order.map((old, index) => [old, index])), chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews = order.map(i => {
    const b = doc.bufferViews[i], start = b.byteOffset ?? 0;
    check(b.buffer === 0 && Number.isSafeInteger(start) && Number.isSafeInteger(b.byteLength)
      && start >= 0 && b.byteLength >= 0 && start + b.byteLength <= binLength);
    chunks.push(source.subarray(binHeader + 8 + start, binHeader + 8 + start + b.byteLength));
    const out = { ...b, byteOffset: offset }; offset += padded(b.byteLength); return out;
  });
  const reference = (row: { bufferView?: number }) => {
    if (row.bufferView !== undefined) { check(remap.has(row.bufferView)); row.bufferView = remap.get(row.bufferView)!; }
  };
  for (const row of doc.images ?? []) reference(row);
  for (const row of doc.accessors ?? []) { reference(row); if (row.sparse) { reference(row.sparse.indices); reference(row.sparse.values); } }
  doc.bufferViews = bufferViews; doc.buffers[0].byteLength = offset;
  const json = new TextEncoder().encode(JSON.stringify(doc)), jsonSize = padded(json.length);
  const result = new Uint8Array(28 + jsonSize + offset), header = new DataView(result.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, result.length, true);
  header.setUint32(12, jsonSize, true); header.setUint32(16, 0x4e4f534a, true);
  result.fill(0x20, 20, 20 + jsonSize); result.set(json, 20);
  header.setUint32(20 + jsonSize, offset, true); header.setUint32(24 + jsonSize, 0x004e4942, true);
  chunks.forEach((bytes, i) => result.set(bytes, 28 + jsonSize + bufferViews[i].byteOffset!));
  return result.buffer;
}
