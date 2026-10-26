import type { BlockFace, Vec3 } from '../manifest';
import type { CuboidPart } from './contract';

const faces: Record<string, BlockFace> = { east: 'right', west: 'left', up: 'top', down: 'bottom', south: 'front', north: 'back' };
const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const radians = (n: number) => n * Math.PI / 180;
export interface ResolvedMinecraftModel { elements: any[]; textures: Record<string, string> }

/** Bounded import adapter. No blockstate evaluation, resource downloads or runtime source resolution. */
export function resolveMinecraftModel(resource: string, models: Record<string, any>, abstractRoot = false, active = new Set<string>()): ResolvedMinecraftModel {
  if (active.has(resource) || active.size >= 32) throw new Error(`Cyclic/deep model parent: ${resource}`);
  if (!models[resource]) {
    if (abstractRoot && resource === 'minecraft:block/block') return { elements: [], textures: {} };
    throw new Error(`Missing concrete model: ${resource}`);
  }
  active.add(resource);
  const source = models[resource];
  const parent = source.parent ? resolveMinecraftModel(canonicalResource(source.parent), models, abstractRoot, active) : { elements: [], textures: {} };
  active.delete(resource);
  const elements = source.elements ?? parent.elements;
  if (!Array.isArray(elements) || elements.length > 512) throw new Error(`Invalid elements: ${resource}`);
  return { elements, textures: { ...parent.textures, ...source.textures } };
}
export function canonicalResource(value: string) {
  if (typeof value !== 'string' || !/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(value) || value.split(/[/:]/).some(v => v === '.' || v === '..')) throw new Error(`Invalid resource ${value}`);
  return value.includes(':') ? value : `minecraft:${value}`;
}
export function resolveTexture(variable: string, textures: Record<string, string>) {
  let value = variable; const seen = new Set<string>();
  while (value?.startsWith('#')) {
    if (seen.has(value) || seen.size >= 32) throw new Error(`Cyclic texture variable ${variable}`);
    seen.add(value); value = textures[value.slice(1)];
  }
  if (!value) throw new Error(`Missing texture variable ${variable}`);
  return canonicalResource(value);
}
function defaultUV(face: string, from: Vec3, to: Vec3): number[] {
  const [x0, y0, z0] = from, [x1, y1, z1] = to;
  return ({ down: [x0, 16 - z1, x1, 16 - z0], up: [x0, z0, x1, z1],
    north: [16 - x1, 16 - y1, 16 - x0, 16 - y0], south: [x0, 16 - y1, x1, 16 - y0],
    west: [z0, 16 - y1, z1, 16 - y0], east: [16 - z1, 16 - y1, 16 - z0, 16 - y0] } as Record<string, number[]>)[face];
}
export function minecraftParts(model: ResolvedMinecraftModel, slots: Record<string, string>, options: { prefix: string; parent?: string; origin?: Vec3; offset?: Vec3; allowPlanes?: boolean }): CuboidPart[] {
  const origin = options.origin ?? [8, 8, 8], offset = options.offset ?? [0, 0, 0];
  const point = (v: Vec3): Vec3 => v.map((n, i) => (n - origin[i]) / 16 + offset[i]) as Vec3;
  return model.elements.map((element, i) => {
    if (!vec(element.from) || !vec(element.to) || !element.faces) throw new Error(`Invalid cuboid element ${i}`);
    const size = element.to.map((v: number, axis: number) => (v - element.from[axis]) / 16) as Vec3;
    const zeros = size.map((v, axis) => v === 0 ? axis : -1).filter(axis => axis >= 0);
    if (size.some(v => v < 0 || v > 8) || zeros.length && (!options.allowPlanes || zeros.length !== 1)) throw new Error(`Unsupported zero/negative/oversized element ${i}`);
    const part: CuboidPart = { id: `${options.prefix}-${i}`, parent: options.parent,
      size, position: point(element.from.map((v: number, axis: number) => (v + element.to[axis]) / 2) as Vec3), faces: {} };
    if (zeros.length) part.planeAxis = (['x', 'y', 'z'] as const)[zeros[0]];
    for (const [direction, mapping] of Object.entries(element.faces) as Array<[string, any]>) {
      const face = faces[direction]; if (!face) throw new Error(`Unsupported face ${direction}`);
      if (zeros.length && ![['right', 'left'], ['top', 'bottom'], ['front', 'back']][zeros[0]].includes(face)) throw new Error(`Unsupported edge face on plane ${i}`);
      const texture = resolveTexture(mapping.texture, model.textures), slot = slots[texture];
      if (!slot) throw new Error(`Unbound texture ${texture}`);
      const uv = mapping.uv ?? defaultUV(direction, element.from, element.to), rotation = mapping.rotation ?? 0;
      if (!Array.isArray(uv) || uv.length !== 4 || !uv.every(Number.isFinite) || ![0, 90, 180, 270].includes(rotation)) throw new Error(`Invalid face UV ${i}/${direction}`);
      // Source UV16 is top-left. Keep signed spans so deliberate mirrored faces survive.
      part.faces![face] = { slot, rect: [uv[0] / 16, 1 - uv[3] / 16, uv[2] / 16, 1 - uv[1] / 16], rotation };
    }
    if (element.rotation) {
      const r = element.rotation;
      if (!vec(r.origin) || !['x', 'y', 'z'].includes(r.axis) || !Number.isFinite(r.angle) || Math.abs(r.angle) > 45) throw new Error(`Unsupported element rotation ${i}`);
      const axis = ['x', 'y', 'z'].indexOf(r.axis); part.pivot = point(r.origin); part.rotation = [0, 0, 0]; part.rotation[axis] = radians(r.angle);
      if (r.rescale) { const scale = 1 / Math.cos(radians(r.angle)); part.scale = [scale, scale, scale]; part.scale[axis] = 1; }
    }
    return part;
  });
}
