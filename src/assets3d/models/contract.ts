import type { BlockFace, SurfaceMaterial, TextureAsset, Vec3 } from '../manifest';
import { FACE_ORDER, isAssetId, isSafeAssetPath } from '../manifest.ts';

/** Renderer-facing interoperability, not actor state or a universal authoring format. */
export interface VisualAsset {
  id: string; label: string; geometryRevision: string;
  source: { kind: 'native' | 'minecraft-elements'; note: string; files?: Array<{ path: string; sha256: string }> };
  slots: Record<string, { layoutId: string }>;
  states: Record<string, { geometry: string; poses?: Record<string, Vec3> }>;
  anchors?: Record<string, { position: Vec3; rotation?: Vec3 }>;
  adapter: 'cuboids-v1';
  payload: { geometries: Record<string, CuboidPart[]> };
}
export interface CuboidPart {
  id: string; parent?: string;
  /** All transforms are in the parent's local frame. Rotation is the bind pose, in radians. */
  position: Vec3; pivot?: Vec3; rotation?: Vec3; scale?: Vec3;
  size?: Vec3;
  faces?: Partial<Record<BlockFace, { slot: string; rect: [number, number, number, number]; rotation?: 0 | 90 | 180 | 270 }>>;
}
export interface VisualMaterial extends Omit<SurfaceMaterial, 'texture' | 'render'> { layoutId: string; texture?: TextureAsset; render: NonNullable<SurfaceMaterial['render']> }
export interface ModelPack {
  schema: 'maze-visual-model-pack-v1'; revision: string;
  assets: Record<string, VisualAsset>; materials: Record<string, VisualMaterial>;
  bindings: Record<string, Record<string, string>>;
  provenance: { source: string; review: string; warnings: string[] };
}
export const MODEL_PACK_URL = `${import.meta.env?.BASE_URL ?? '/'}assets/model-packs/interactables/manifest.json`;

export function validateVisualAsset(asset: VisualAsset) {
  const check = (ok: unknown, message: string) => { if (!ok) throw new Error(`Invalid visual model ${asset?.id}: ${message}`); };
  const vector = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  check(asset?.adapter === 'cuboids-v1' && isAssetId(asset.id) && typeof asset.geometryRevision === 'string' &&
    asset.geometryRevision.length > 0 && asset.geometryRevision.length < 512 && asset.slots && Object.keys(asset.slots).length > 0 && Object.keys(asset.slots).length <= 64, 'adapter/identity/slots');
  for (const [slot, definition] of Object.entries(asset.slots)) check(isAssetId(slot) && typeof definition.layoutId === 'string' && definition.layoutId.length > 0 && definition.layoutId.length < 768, 'slot identity');
  check(asset.states && Object.keys(asset.states).length > 0 && Object.keys(asset.states).length <= 32 &&
    asset.payload?.geometries && Object.keys(asset.payload.geometries).length <= 32, 'states/geometries');
  for (const parts of Object.values(asset.payload.geometries)) {
    check(Array.isArray(parts) && parts.length > 0 && parts.length <= 512, 'part budget');
    const ids = new Map(parts.map(p => [p.id, p]));
    check(ids.size === parts.length, 'duplicate part');
    for (const part of parts) {
      check(isAssetId(part.id) && vector(part.position) && (!part.pivot || vector(part.pivot)) && (!part.rotation || vector(part.rotation)) &&
        (!part.scale || vector(part.scale) && part.scale.every(v => v > 0)), 'transform');
      if (part.size) {
        check(vector(part.size) && part.size.every(v => v > 0), 'box size');
        for (const [name, face] of Object.entries(part.faces ?? {})) check(FACE_ORDER.includes(name as BlockFace) && face && Object.hasOwn(asset.slots, face.slot) &&
          face.rect.length === 4 && face.rect.every(v => Number.isFinite(v) && v >= 0 && v <= 1) && [undefined, 0, 90, 180, 270].includes(face.rotation), 'face/UV/slot');
      }
      const seen = new Set([part.id]); let parent = part.parent;
      while (parent) { check(ids.has(parent) && !seen.has(parent), 'parent cycle/missing parent'); seen.add(parent); parent = ids.get(parent)?.parent; }
    }
  }
  for (const state of Object.values(asset.states)) {
    const parts = asset.payload.geometries[state.geometry]; check(parts, 'missing state geometry');
    for (const [id, pose] of Object.entries(state.poses ?? {})) check(parts?.some(p => p.id === id) && vector(pose), 'state pose');
  }
  for (const anchor of Object.values(asset.anchors ?? {})) check(vector(anchor.position) && (!anchor.rotation || vector(anchor.rotation)), 'anchor transform');
}

export function validateModelPack(pack: ModelPack) {
  if (pack?.schema !== 'maze-visual-model-pack-v1' || !pack.assets || !pack.materials || !pack.bindings ||
    Object.keys(pack.assets).length > 64 || Object.keys(pack.materials).length > 128) throw new Error('Invalid visual model pack');
  for (const [id, material] of Object.entries(pack.materials)) {
    if (!isAssetId(id) || material.id !== id || !/^#[0-9a-f]{6}$/i.test(material.fallbackColor) ||
      !Number.isFinite(material.roughness) || material.roughness < 0 || material.roughness > 1 ||
      !['opaque', 'mask', 'blend'].includes(material.render?.alphaMode) || !['front', 'double'].includes(material.render?.side) ||
      typeof material.layoutId !== 'string') throw new Error(`Invalid visual material ${id}`);
    const texture = material.texture;
    if (texture && (!isSafeAssetPath(texture.path) || !texture.path.startsWith('textures/') ||
      !/^[a-f0-9]{64}$/.test(texture.sha256) || ![texture.width, texture.height].every(v => Number.isInteger(v) && v > 0 && v <= 4096))) throw new Error(`Invalid visual texture ${id}`);
    if (material.render.alphaCutoff !== undefined && (!Number.isFinite(material.render.alphaCutoff) || material.render.alphaCutoff < 0 || material.render.alphaCutoff > 1)) throw new Error(`Invalid visual alpha cutoff ${id}`);
  }
  for (const [id, asset] of Object.entries(pack.assets)) {
    validateVisualAsset(asset); if (id !== asset.id) throw new Error('Visual asset identity mismatch');
    for (const [slot, definition] of Object.entries(asset.slots)) {
      const binding = pack.bindings[id]?.[slot], material = binding && pack.materials[binding];
      if (!material || material.layoutId !== definition.layoutId) throw new Error(`Incompatible visual binding ${id}/${slot}`);
    }
  }
}
