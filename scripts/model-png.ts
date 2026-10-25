import { inflateSync } from 'node:zlib';

export interface PngPixels { width: number; height: number; rgba: Buffer }
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const table = Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
export function pngCrc(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = table[(value ^ byte) & 255] ^ value >>> 8;
  return (value ^ 0xffffffff) >>> 0;
}
function check(ok: unknown, detail: string): asserts ok { if (!ok) throw Error(`Unsupported/invalid PNG: ${detail}`); }
function paeth(a: number, b: number, c: number) {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
/** Bounded local decoder for non-interlaced, 8-bit authoring PNGs; never changes source artwork. */
export function decodeModelPng(bytes: Buffer): PngPixels {
  check(bytes.length > 32 && bytes.length <= 16 * 1024 ** 2 && bytes.subarray(0, 8).equals(signature), 'signature/size');
  let width = 0, height = 0, color = -1, ended = false, dataEnded = false;
  let palette: Buffer | undefined, transparency: Buffer | undefined;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    check(offset + 12 <= bytes.length, 'truncated chunk');
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    check(end <= bytes.length, 'truncated chunk body');
    const type = bytes.toString('ascii', offset + 4, offset + 8), body = bytes.subarray(offset + 8, end - 4);
    check(pngCrc(bytes.subarray(offset + 4, end - 4)) === bytes.readUInt32BE(end - 4), `CRC ${type}`);
    check(width > 0 || type === 'IHDR', 'missing first IHDR');
    if (type === 'IHDR') {
      check(offset === 8 && length === 13, 'duplicate/header length');
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); color = body[9];
      check(width > 0 && height > 0 && width <= 4096 && height <= 4096 && body[8] === 8 &&
        [0, 2, 3, 4, 6].includes(color) && body[10] === 0 && body[11] === 0 && body[12] === 0, '8-bit non-interlaced canvas required');
    } else if (type === 'PLTE') {
      check(!palette && compressed.length === 0 && length > 0 && length <= 768 && length % 3 === 0, 'palette'); palette = body;
    } else if (type === 'tRNS') {
      check(!transparency && compressed.length === 0 && [0, 2, 3].includes(color), 'transparency'); transparency = body;
    } else if (type === 'IDAT') {
      check(!dataEnded && (color !== 3 || palette), 'non-contiguous data or missing palette'); compressed.push(body);
    } else if (type === 'IEND') {
      check(length === 0 && end === bytes.length && compressed.length > 0, 'incomplete image/end'); ended = true;
    } else {
      check((bytes[offset + 4] & 32) !== 0, `unknown critical chunk ${type}`);
      if (compressed.length) dataEnded = true;
    }
    offset = end;
  }
  check(ended, 'missing IEND');
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color], stride = width * channels;
  const expected = (stride + 1) * height;
  const inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
  check(inflated.length === expected, 'decoded byte length');
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (stride + 1)]; check(filter <= 4, 'row filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= channels ? raw[i - channels] : 0, b = y ? raw[i - stride] : 0;
      const c = y && x >= channels ? raw[i - stride - channels] : 0;
      raw[i] = inflated[y * (stride + 1) + x + 1] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c));
    }
  }
  if (transparency) check(color === 0 ? transparency.length === 2 : color === 2 ? transparency.length === 6 : transparency.length <= palette!.length / 3, 'transparency length');
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const i = pixel * channels, out = pixel * 4;
    if (color === 3) {
      const index = raw[i]; check(index * 3 + 2 < palette!.length, 'palette index');
      rgba[out] = palette![index * 3]; rgba[out + 1] = palette![index * 3 + 1]; rgba[out + 2] = palette![index * 3 + 2]; rgba[out + 3] = transparency?.[index] ?? 255;
    } else {
      rgba[out] = raw[i]; rgba[out + 1] = color === 0 || color === 4 ? raw[i] : raw[i + 1]; rgba[out + 2] = color === 0 || color === 4 ? raw[i] : raw[i + 2];
      rgba[out + 3] = color === 4 ? raw[i + 1] : color === 6 ? raw[i + 3] : 255;
      if (transparency && (color === 0 ? raw[i] === transparency.readUInt16BE(0)
        : raw[i] === transparency.readUInt16BE(0) && raw[i + 1] === transparency.readUInt16BE(2) && raw[i + 2] === transparency.readUInt16BE(4))) rgba[out + 3] = 0;
    }
  }
  return { width, height, rgba };
}
export function alphaPlane(image: PngPixels) {
  const alpha = Buffer.alloc(image.width * image.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.rgba[i * 4 + 3];
  return alpha;
}
export function verifySourceAlpha(source: PngPixels, selected: PngPixels) {
  for (let y = 0; y < selected.height; y++) for (let x = 0; x < selected.width; x++) {
    const original = (Math.floor(y * source.height / selected.height) * source.width + Math.floor(x * source.width / selected.width)) * 4;
    check(selected.rgba[(y * selected.width + x) * 4 + 3] === source.rgba[original + 3], `source alpha differs at ${x},${y}`);
  }
}
/** Exact rectangle in decoded pixels, including RGB underneath transparent pixels. */
export function cropPixels(image: PngPixels, rectangle: { X: number; Y: number; Width: number; Height: number }): PngPixels {
  const { X, Y, Width, Height } = rectangle;
  check([X, Y, Width, Height].every(Number.isSafeInteger) && X >= 0 && Y >= 0 && Width > 0 && Height > 0 && X + Width <= image.width && Y + Height <= image.height, 'crop bounds');
  const rgba = Buffer.alloc(Width * Height * 4);
  for (let row = 0; row < Height; row++) image.rgba.copy(rgba, row * Width * 4, ((Y + row) * image.width + X) * 4, ((Y + row) * image.width + X + Width) * 4);
  return { width: Width, height: Height, rgba };
}
