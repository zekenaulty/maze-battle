import type { BlockFace, SurfaceMaterial, TextureAsset, Vec3 } from '../manifest';
import { FACE_ORDER, isAssetId, isSafeAssetPath } from '../manifest.ts';

/** Renderer-facing interoperability, not actor state or a universal authoring format. */
export interface VisualAsset {
  id: string; label: string; geometryRevision: string;
  source: { kind: 'native' | 'minecraft-elements' | 'tilelab-construction'; note: string; files?: Array<{ path: string; sha256: string }> };
  slots: Record<string, { layoutId: string }>;
  states: Record<string, { geometry: string; poses?: Record<string, Vec3> }>;
  anchors?: Record<string, { position: Vec3; rotation?: Vec3; normal?: Vec3; up?: Vec3 }>;
  placement?: { bounds: { min: Vec3; max: Vec3 }; clearances: Array<{ id: string; min: Vec3; max: Vec3 }> };
  adapter: 'cuboids-v1' | 'surface-parts-v1';
  payload: { geometries: Record<string, CuboidPart[]> };
}
export interface CuboidPart {
  id: string; parent?: string;
  /** All transforms are in the parent's local frame. Rotation is the bind pose, in radians. */
  position: Vec3; pivot?: Vec3; rotation?: Vec3; scale?: Vec3;
  size?: Vec3;
  /** An exact plane has one zero dimension; only its two opposing authored faces exist. */
  planeAxis?: 'x' | 'y' | 'z';
  mesh?: { positions: Vec3[]; normals: Vec3[]; uvs: Array<[number, number]>; indices: number[]; slot: string };
  faces?: Partial<Record<BlockFace, { slot: string; rect: [number, number, number, number]; rotation?: 0 | 90 | 180 | 270 }>>;
}
export interface ModelAnimation {
  loop: boolean; interpolate: boolean;
  frames: Array<{ sourceIndex: number; texture: TextureAsset }>;
  timeline: Array<{ frame: number; durationMs: number }>;
}
export interface VisualMaterial extends Omit<SurfaceMaterial, 'texture' | 'render' | 'animation'> {
  layoutId: string; texture?: TextureAsset; render: NonNullable<SurfaceMaterial['render']>;
  animation?: ModelAnimation; emission?: { color: string; intensity: number };
}
export interface ModelPack {
  schema: 'maze-visual-model-pack-v1'; revision: string;
  assets: Record<string, VisualAsset>; materials: Record<string, VisualMaterial>;
  bindings: Record<string, Record<string, string>>;
  provenance: { source: string; review: string; warnings: string[] };
}
export const MODEL_PACK_URL = `${import.meta.env?.BASE_URL ?? '/'}assets/model-packs/interactables/manifest.json`;
export const LIGHTING_PACK_URL = `${import.meta.env?.BASE_URL ?? '/'}assets/model-packs/lighting/manifest.json`;

export function validateVisualAsset(asset: VisualAsset) {
  const check = (ok: unknown, message: string) => { if (!ok) throw new Error(`Invalid visual model ${asset?.id}: ${message}`); };
  const vector = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  check(['cuboids-v1', 'surface-parts-v1'].includes(asset?.adapter) && isAssetId(asset.id) && typeof asset.geometryRevision === 'string' &&
    asset.geometryRevision.length > 0 && asset.geometryRevision.length < 512 && asset.slots && Object.keys(asset.slots).length > 0 && Object.keys(asset.slots).length <= 64, 'adapter/identity/slots');
  for (const [slot, definition] of Object.entries(asset.slots)) check(isAssetId(slot) && typeof definition.layoutId === 'string' && definition.layoutId.length > 0 && definition.layoutId.length < 768, 'slot identity');
  check(asset.states && Object.keys(asset.states).length > 0 && Object.keys(asset.states).length <= 32 &&
    asset.payload?.geometries && Object.keys(asset.payload.geometries).length <= 32, 'states/geometries');
  let meshVertices = 0;
  for (const parts of Object.values(asset.payload.geometries)) {
    check(Array.isArray(parts) && parts.length > 0 && parts.length <= 512, 'part budget');
    const ids = new Map(parts.map(p => [p.id, p]));
    check(ids.size === parts.length, 'duplicate part');
    for (const part of parts) {
      check(isAssetId(part.id) && vector(part.position) && (!part.pivot || vector(part.pivot)) && (!part.rotation || vector(part.rotation)) &&
        (!part.scale || vector(part.scale) && part.scale.every(v => v > 0)), 'transform');
      if (part.mesh) {
        const m = part.mesh;
        check(asset.adapter === 'surface-parts-v1' && !part.size && !part.faces && !part.planeAxis && Object.hasOwn(asset.slots, m.slot)
          && Array.isArray(m.positions) && m.positions.length >= 3 && m.positions.length <= 8192
          && m.normals?.length === m.positions.length && m.uvs?.length === m.positions.length && Array.isArray(m.indices)
          && m.indices.length >= 3 && m.indices.length <= 24576 && m.indices.length % 3 === 0, 'mesh shape/budget');
        check(m.positions.every(vector) && m.normals.every(n => vector(n) && Math.abs(Math.hypot(...n) - 1) < .001)
          && m.uvs.every(uv => Array.isArray(uv) && uv.length === 2 && uv.every(n => Number.isFinite(n) && Math.abs(n) < 1024))
          && m.indices.every(i => Number.isInteger(i) && i >= 0 && i < m.positions.length), 'mesh data');
        meshVertices += m.positions.length; check(meshVertices <= 65536, 'total mesh vertex budget');
      } else if (part.size) {
        const axis = part.planeAxis === undefined ? -1 : ['x', 'y', 'z'].indexOf(part.planeAxis);
        check(vector(part.size) && (part.planeAxis === undefined ? part.size.every(v => v > 0)
          : asset.adapter === 'surface-parts-v1' && axis >= 0 && part.size.every((v, i) => i === axis ? v === 0 : v > 0)), 'box/plane size');
        if (axis >= 0) check(Object.keys(part.faces ?? {}).length > 0 && Object.keys(part.faces!).every(face =>
          [['right', 'left'], ['top', 'bottom'], ['front', 'back']][axis].includes(face)), 'plane faces');
        for (const [name, face] of Object.entries(part.faces ?? {})) check(FACE_ORDER.includes(name as BlockFace) && face && Object.hasOwn(asset.slots, face.slot) &&
          face.rect.length === 4 && face.rect.every(v => Number.isFinite(v) && v >= 0 && v <= 1) && [undefined, 0, 90, 180, 270].includes(face.rotation), 'face/UV/slot');
      } else check(part.planeAxis === undefined, 'plane requires size');
      const seen = new Set([part.id]); let parent = part.parent;
      while (parent) { check(ids.has(parent) && !seen.has(parent), 'parent cycle/missing parent'); seen.add(parent); parent = ids.get(parent)?.parent; }
    }
  }
  for (const state of Object.values(asset.states)) {
    const parts = asset.payload.geometries[state.geometry]; check(parts, 'missing state geometry');
    for (const [id, pose] of Object.entries(state.poses ?? {})) check(parts?.some(p => p.id === id) && vector(pose), 'state pose');
  }
  for (const anchor of Object.values(asset.anchors ?? {})) {
    check(vector(anchor.position) && (!anchor.rotation || vector(anchor.rotation)), 'anchor transform');
    if (anchor.normal || anchor.up) check(vector(anchor.normal) && vector(anchor.up) && Math.abs(Math.hypot(...anchor.normal!) - 1) < .001
      && Math.abs(Math.hypot(...anchor.up!) - 1) < .001 && Math.abs(anchor.normal!.reduce((sum, n, i) => sum + n * anchor.up![i], 0)) < .001, 'anchor basis');
  }
  if (asset.placement) {
    const bounds = (b: { min: Vec3; max: Vec3 }) => vector(b?.min) && vector(b.max) && b.min.every((n, i) => n <= b.max[i]);
    check(bounds(asset.placement.bounds) && Array.isArray(asset.placement.clearances) && asset.placement.clearances.length <= 32
      && asset.placement.clearances.every(c => isAssetId(c.id) && bounds(c)), 'placement bounds/clearance');
  }
}

export function validateModelPack(pack: ModelPack) {
  if (pack?.schema !== 'maze-visual-model-pack-v1' || !pack.assets || !pack.materials || !pack.bindings ||
    Object.keys(pack.assets).length > 64 || Object.keys(pack.materials).length > 128) throw new Error('Invalid visual model pack');
  let animatedPixels = 0;
  const validTexture = (t: TextureAsset) => t && isSafeAssetPath(t.path) && t.path.startsWith('textures/') && t.path.endsWith('.png')
    && /^[a-f0-9]{64}$/.test(t.sha256) && [t.width, t.height].every(v => Number.isInteger(v) && v > 0 && v <= 4096);
  for (const [id, material] of Object.entries(pack.materials)) {
    if (!isAssetId(id) || material.id !== id || !/^#[0-9a-f]{6}$/i.test(material.fallbackColor) ||
      !Number.isFinite(material.roughness) || material.roughness < 0 || material.roughness > 1 ||
      !['opaque', 'mask', 'blend'].includes(material.render?.alphaMode) || !['front', 'double'].includes(material.render?.side) ||
      typeof material.layoutId !== 'string') throw new Error(`Invalid visual material ${id}`);
    const texture = material.texture;
    if (texture && (!isSafeAssetPath(texture.path) || !texture.path.startsWith('textures/') ||
      !/^[a-f0-9]{64}$/.test(texture.sha256) || ![texture.width, texture.height].every(v => Number.isInteger(v) && v > 0 && v <= 4096))) throw new Error(`Invalid visual texture ${id}`);
    if (material.render.alphaCutoff !== undefined && (!Number.isFinite(material.render.alphaCutoff) || material.render.alphaCutoff < 0 || material.render.alphaCutoff > 1)) throw new Error(`Invalid visual alpha cutoff ${id}`);
    if (material.emission && (!/^#[0-9a-f]{6}$/i.test(material.emission.color) || !Number.isFinite(material.emission.intensity)
      || material.emission.intensity < 0 || material.emission.intensity > 4)) throw new Error(`Invalid visual emission ${id}`);
    if (material.animation) {
      const a = material.animation;
      if (!texture || typeof a.loop !== 'boolean' || typeof a.interpolate !== 'boolean' || !Array.isArray(a.frames) || !a.frames.length || a.frames.length > 32
        || !Array.isArray(a.timeline) || !a.timeline.length || a.timeline.length > 4096) throw new Error(`Invalid model animation ${id}`);
      const indices = new Set<number>();
      for (const f of a.frames) {
        if (!Number.isInteger(f.sourceIndex) || f.sourceIndex < 0 || indices.has(f.sourceIndex) || !validTexture(f.texture)
          || f.texture.width !== texture.width || f.texture.height !== texture.height) throw new Error(`Invalid model animation frame ${id}`);
        indices.add(f.sourceIndex); animatedPixels += f.texture.width * f.texture.height;
      }
      if (animatedPixels > 32 * 1024 * 1024) throw new Error('Model animation resident pixel budget exceeded');
      for (const s of a.timeline) if (!Number.isInteger(s.frame) || s.frame < 0 || s.frame >= a.frames.length
        || !Number.isFinite(s.durationMs) || s.durationMs <= 0 || s.durationMs > 600000) throw new Error(`Invalid model animation timeline ${id}`);
      if (a.frames[a.timeline[0].frame].texture.sha256 !== texture.sha256) throw new Error(`Model animation poster differs ${id}`);
    }
  }
  for (const [id, asset] of Object.entries(pack.assets)) {
    validateVisualAsset(asset); if (id !== asset.id) throw new Error('Visual asset identity mismatch');
    for (const [slot, definition] of Object.entries(asset.slots)) {
      const binding = pack.bindings[id]?.[slot], material = binding && pack.materials[binding];
      if (!material || material.layoutId !== definition.layoutId) throw new Error(`Incompatible visual binding ${id}/${slot}`);
    }
  }
}
