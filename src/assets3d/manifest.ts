/** Runtime-only contract. TileLab is an authoring input, never a game dependency. */
export const FACE_ORDER = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;
export type BlockFace = typeof FACE_ORDER[number];
export type FaceMaterials = Record<BlockFace, string>;
export type Vec3 = [number, number, number];
export interface Review { status: 'preview' | 'approved'; reviewer: string; note: string }
export interface TextureAsset { path: string; sha256: string; width: number; height: number }
export interface Provenance {
  run: string; block: string; image: string; imageSha256: string; blockMapSha256: string;
  selectedVariant: 'raw_edit' | 'repaired_seam' | 'entity_atlas_native' | 'entity_atlas_raw';
  reports: Array<{ path: string; sha256: string; model?: string; requestId?: string;
    timeUTC?: string; sourceSha256?: string; sourceFile?: string; rightsStatus?: string }>;
  isAlt: boolean;
}
export interface MaterialDefinition {
  id: string; label: string; surface: 'tileable' | 'bounded-face' | 'uv-atlas';
  texture: TextureAsset; fallbackColor: string; roughness: number;
  review: Review; provenance: Provenance;
  animation?: TextureAnimation;
  render?: { alphaMode: 'opaque' | 'mask' | 'blend'; alphaCutoff?: number; side: 'front' | 'double' };
}
export type SurfaceMaterial = Pick<MaterialDefinition, 'id' | 'label' | 'surface' | 'texture' | 'fallbackColor' | 'roughness' | 'animation' | 'render'>;
export interface TextureAnimation {
  loop: boolean; interpolate: false;
  frames: Array<{ sourceIndex: number; texture: TextureAsset; provenance: Provenance }>;
  timeline: Array<{ frame: number; durationMs: number }>;
}
export interface Emission {
  faces: BlockFace[]; color: string; intensity: number;
  light?: { color: string; intensity: number; distance: number };
}
export interface Appearance { faces?: Partial<FaceMaterials>; emission?: Emission; poses?: Record<string, { rotation: Vec3 }> }
export interface BlockDefinition {
  id: string; label: string; model: string; faces: FaceMaterials;
  states: Record<string, Appearance>; variants: Record<string, Appearance>;
  review: Review; source: { run: string; block: string; blockMapSha256: string };
  alternateOf?: { block: string; name: string };
}
export interface UvFace { rect: [number, number, number, number]; rotation?: 0 | 90 | 180 | 270 }
export interface UvPart {
  name: string; size: Vec3; position: Vec3; faces: Record<BlockFace, UvFace>;
  parent?: string; pivot?: Vec3; omitFaces?: BlockFace[];
}
export type ModelDefinition = { kind: 'cube' } | {
  kind: 'uv-boxes'; atlasSize: [number, number];
  parts: UvPart[];
};
export interface AssetPack {
  schemaVersion: 1; id: string; version: string; revision: string;
  faceOrder: typeof FACE_ORDER; materials: Record<string, MaterialDefinition>;
  blocks: Record<string, BlockDefinition>; models: Record<string, ModelDefinition>;
}
export function isAssetId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_:.\-]*$/.test(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value);
}
export function isSafeAssetPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.split('/').every(segment =>
    /^[a-zA-Z0-9_][a-zA-Z0-9_.\-]*$/.test(segment));
}
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const color = (v: unknown) => typeof v === 'string' && /^#[a-fA-F0-9]{6}$/.test(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid asset pack: ${message}`);
}
function record(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function review(value: any) {
  check(record(value) && ['preview', 'approved'].includes(value.status) &&
    typeof value.reviewer === 'string' && value.reviewer.length > 0 &&
    typeof value.note === 'string', 'review metadata');
}
function texture(t: any, id: string) {
  check(record(t) && isSafeAssetPath(t.path) && t.path.startsWith('textures/') &&
    t.path.endsWith('.png') && hash(t.sha256) && Number.isInteger(t.width) && t.width > 0 &&
    Number.isInteger(t.height) && t.height > 0 && t.width <= 8192 && t.height <= 8192, `texture ${id}`);
}
function provenance(p: any, t: TextureAsset, id: string) {
  check(record(p) && isAssetId(p.run) && isAssetId(p.block) && isSafeAssetPath(p.image) &&
    hash(p.imageSha256) && p.imageSha256 === t.sha256 && hash(p.blockMapSha256) &&
    ['raw_edit', 'repaired_seam', 'entity_atlas_native', 'entity_atlas_raw'].includes(p.selectedVariant) &&
    typeof p.isAlt === 'boolean' && Array.isArray(p.reports), `provenance ${id}`);
  for (const r of p.reports) check(record(r) && isSafeAssetPath(r.path) && hash(r.sha256), `report ${id}`);
}
/** Fail early on unsupported geometry, malformed UVs, escaping paths and dangling bindings. */
export function validateAssetPack(value: unknown): asserts value is AssetPack {
  check(record(value) && value.schemaVersion === 1 && isAssetId(value.id) &&
    typeof value.version === 'string' && hash(value.revision), 'identity/version');
  check(JSON.stringify(value.faceOrder) === JSON.stringify(FACE_ORDER), 'six-face order');
  check(record(value.materials) && record(value.blocks) && record(value.models), 'registries');
  for (const [id, m] of Object.entries(value.materials) as Array<[string, any]>) {
    check(isAssetId(id) && record(m) && m.id === id && typeof m.label === 'string', 'material identity');
    check(['tileable', 'bounded-face', 'uv-atlas'].includes(m.surface), `surface ${id}`);
    const t = m.texture;
    texture(t, id);
    check(color(m.fallbackColor) && finite(m.roughness) && m.roughness >= 0 && m.roughness <= 1, `properties ${id}`);
    review(m.review);
    provenance(m.provenance, t, id);
    if (m.render !== undefined) check(record(m.render) && ['opaque', 'mask', 'blend'].includes(m.render.alphaMode) &&
      ['front', 'double'].includes(m.render.side) && (m.render.alphaCutoff === undefined ||
      finite(m.render.alphaCutoff) && m.render.alphaCutoff >= 0 && m.render.alphaCutoff <= 1), `render policy ${id}`);
    if (m.animation !== undefined) {
      const a = m.animation;
      check(record(a) && typeof a.loop === 'boolean' && a.interpolate === false && Array.isArray(a.frames) &&
        a.frames.length > 0 && a.frames.length <= 256 && Array.isArray(a.timeline) && a.timeline.length > 0 && a.timeline.length <= 4096, `animation ${id}`);
      const indices = new Set<number>();
      for (const f of a.frames) {
        check(record(f) && Number.isInteger(f.sourceIndex) && f.sourceIndex >= 0 && !indices.has(f.sourceIndex), `animation frame ${id}`);
        indices.add(f.sourceIndex); texture(f.texture, id); provenance(f.provenance, f.texture, id);
        check(f.texture.width === t.width && f.texture.height === t.height, `animation dimensions ${id}`);
      }
      // Allows a selected 32-frame 2048² sequence; decoded RGBA is at most 512 MiB per material.
      check(a.frames.length * t.width * t.height <= 128 * 1024 * 1024, `animation decode budget ${id}`);
      for (const s of a.timeline) check(record(s) && Number.isInteger(s.frame) && s.frame >= 0 && s.frame < a.frames.length &&
        finite(s.durationMs) && s.durationMs > 0 && s.durationMs <= 600000, `animation timeline ${id}`);
      check(a.frames[a.timeline[0].frame].texture.sha256 === t.sha256, `animation poster ${id}`);
    }
  }
  for (const [id, model] of Object.entries(value.models) as Array<[string, any]>) {
    check(isAssetId(id) && record(model), 'model identity');
    if (model.kind === 'cube') continue;
    check(model.kind === 'uv-boxes' && Array.isArray(model.atlasSize) && model.atlasSize.length === 2 &&
      model.atlasSize.every(n => Number.isInteger(n) && n > 0 && n <= 8192), `UV atlas size ${id}`);
    check(Array.isArray(model.parts) && model.parts.length > 0, `UV parts ${id}`);
    const names = new Set<string>();
    for (const part of model.parts) {
      check(record(part) && isAssetId(part.name) && !names.has(part.name) && Array.isArray(part.size) && part.size.length === 3 &&
        part.size.every(n => finite(n) && n > 0) && Array.isArray(part.position) &&
        part.position.length === 3 && part.position.every(finite) && record(part.faces), `UV part ${id}`);
      names.add(part.name);
      if (part.pivot !== undefined) check(Array.isArray(part.pivot) && part.pivot.length === 3 && part.pivot.every(finite), `UV pivot ${id}`);
      if (part.omitFaces !== undefined) check(Array.isArray(part.omitFaces) && part.omitFaces.length < 6 &&
        new Set(part.omitFaces).size === part.omitFaces.length && part.omitFaces.every((f: BlockFace) => FACE_ORDER.includes(f)), `UV omitted faces ${id}`);
      for (const f of FACE_ORDER) {
        const uv = part.faces[f];
        check(record(uv) && Array.isArray(uv.rect) && uv.rect.length === 4 &&
          uv.rect.every(n => finite(n) && n >= 0 && n <= 1) &&
          uv.rect[0] < uv.rect[2] && uv.rect[1] < uv.rect[3] &&
          [undefined, 0, 90, 180, 270].includes(uv.rotation), `UV rect ${id}.${f}`);
      }
    }
    const parents = new Map<string, string | undefined>(model.parts.map((p: UvPart) => [p.name, p.parent]));
    for (const part of model.parts) {
      let parent = part.parent; const ancestors = new Set([part.name]);
      while (parent !== undefined) {
        check(typeof parent === 'string' && names.has(parent) && !ancestors.has(parent), `UV parent hierarchy ${id}`);
        ancestors.add(parent); parent = parents.get(parent);
      }
    }
  }
  const faces = (v: any, partial: boolean) => {
    check(record(v) && (partial || FACE_ORDER.every(f => typeof v[f] === 'string')), 'face bindings');
    for (const [f, id] of Object.entries(v)) check(FACE_ORDER.includes(f as BlockFace) &&
      typeof id === 'string' && Object.hasOwn(value.materials, id), `unknown material ${String(id)}`);
  };
  const appearances = (v: any, model: ModelDefinition) => {
    check(record(v), 'appearance registry');
    for (const [id, a] of Object.entries(v) as Array<[string, any]>) {
      check(isAssetId(id) && record(a), 'appearance identity');
      if (a.faces) faces(a.faces, true);
      if (a.poses !== undefined) {
        check(record(a.poses) && model.kind === 'uv-boxes', 'part poses');
        for (const [name, pose] of Object.entries(a.poses) as Array<[string, any]>) check(
          model.parts.some(p => p.name === name) && record(pose) && Array.isArray(pose.rotation) &&
          pose.rotation.length === 3 && pose.rotation.every(finite), `unknown/invalid part pose ${name}`);
      }
      if (a.emission) {
        const e = a.emission;
        check(Array.isArray(e.faces) && e.faces.every((f: BlockFace) => FACE_ORDER.includes(f)) &&
          color(e.color) && finite(e.intensity) && e.intensity >= 0, 'emission');
        if (e.light) check(color(e.light.color) && finite(e.light.intensity) && e.light.intensity >= 0 &&
          finite(e.light.distance) && e.light.distance > 0, 'scene light');
      }
    }
  };
  const alternateOwners = new Set<string>();
  for (const [id, b] of Object.entries(value.blocks) as Array<[string, any]>) {
    check(isAssetId(id) && record(b) && b.id === id && typeof b.label === 'string' &&
      Object.hasOwn(value.models, b.model), `block ${id}`);
    faces(b.faces, false); appearances(b.states, value.models[b.model]); appearances(b.variants, value.models[b.model]); review(b.review);
    check(record(b.source) && isAssetId(b.source.run) && isAssetId(b.source.block) &&
      hash(b.source.blockMapSha256), `block source ${id}`);
    if (b.alternateOf) {
      check(record(b.alternateOf) && Object.hasOwn(value.blocks, b.alternateOf.block) &&
        b.alternateOf.block !== id && isAssetId(b.alternateOf.name), `alternate base ${id}`);
      const owner = `${b.alternateOf.block}/${b.alternateOf.name}`;
      check(!alternateOwners.has(owner), `alternate ownership ${owner}`); alternateOwners.add(owner);
      const binding = value.blocks[b.alternateOf.block].variants?.[b.alternateOf.name];
      check(binding && FACE_ORDER.every(f => binding.faces?.[f] === b.faces[f]), `alternate binding ${id}`);
    }
    const model = value.models[b.model];
    const boundMaterials = [...Object.values(b.faces), ...Object.values(b.states).flatMap((a: any) => Object.values(a.faces ?? {})),
      ...Object.values(b.variants).flatMap((a: any) => Object.values(a.faces ?? {}))] as string[];
    if (model.kind === 'uv-boxes') for (const material of boundMaterials) {
      const t = value.materials[material];
      check(t.surface === 'uv-atlas' && t.texture.width === model.atlasSize[0] &&
        t.texture.height === model.atlasSize[1], `atlas/model compatibility ${id}`);
    }
  }
}
