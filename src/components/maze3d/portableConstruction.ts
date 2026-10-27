import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ConstructionResources, constructionBounds } from './constructionVisual';
import { PACK_URL } from '../../assets3d/registry';
import { TIMBER_PACK_URL } from './StageTimbers';
import { SHELVING_PACK_URL } from './shelving';
import { canonicalGlb } from '../../assets3d/models/canonicalGlb';

export interface PortableConstruction {
  bytes: ArrayBuffer; sha256: string; cacheKey: string; bounds: ReturnType<typeof constructionBounds>;
  meshes: number; vertices: number; textures: number;
}
const hash = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  .map(b => b.toString(16).padStart(2, '0')).join('');
const textHash = (value: unknown) => hash(new TextEncoder().encode(JSON.stringify(value)).buffer);

/** Complete static authoring root only. Materials/images are embedded; no custom runtime shader.
 * Refuse missing/animated inputs rather than silently baking an unintended first frame. */
export async function bakePortableConstruction(source: THREE.Object3D, resources: ConstructionResources): Promise<PortableConstruction> {
  await resources.ready();
  const root = source.clone(true); root.updateMatrixWorld(true);
  const definitions = [
    ...Object.values(resources.registry.pack!.materials).map(m => ({ material: m, base: PACK_URL, package: 'masonry' })),
    ...Object.values(resources.timberPack.materials).map(m => ({ material: m, base: TIMBER_PACK_URL, package: 'timber' })),
    ...Object.values(resources.shelvingPack.materials).map(m => ({ material: m, base: SHELVING_PACK_URL, package: 'shelving' })),
  ];
  const sourceFor = (texture: THREE.Texture) => {
    if (!(texture.image instanceof HTMLImageElement)) throw Error('Portable texture needs a loaded source image');
    const url = texture.image.src;
    const found = definitions.find(d => d.material.texture && new URL(d.material.texture.path, new URL(d.base, location.href)).href === url);
    if (!found?.material.texture) throw Error('Portable texture lacks selected-source provenance');
    if (found.material.animation) throw Error('Animated materials require an explicit static-frame policy');
    return { package: found.package, materialId: found.material.id, source: found.material.texture };
  };
  const textures = new Set<THREE.Texture>(); let meshes = 0, vertices = 0;
  const geometryHashes = new Map<THREE.BufferGeometry, Promise<string>>();
  const graph: Promise<unknown>[] = [];
  const path = (node: THREE.Object3D): string => node === root ? node.name : path(node.parent!) + '/' + node.name;
  root.traverse(node => {
    if (node.userData.visualPart) { node.userData.sourcePartId = node.userData.visualPart.id; delete node.userData.visualPart; }
    graph.push(Promise.resolve({ path: path(node), matrix: node.matrixWorld.toArray(), metadata: node.userData }));
    if (!(node instanceof THREE.Mesh)) return;
    meshes++; const p = node.geometry.getAttribute('position'), n = node.geometry.getAttribute('normal'), uv = node.geometry.getAttribute('uv');
    if (!p || !n || !uv || p.count !== n.count || p.count !== uv.count) throw Error('Portable geometry needs positions, normals and UVs');
    vertices += p.count;
    for (const attribute of [p, n, uv]) for (const value of attribute.array) if (!Number.isFinite(value)) throw Error('Portable geometry has nonfinite attributes');
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) throw Error('Unsupported portable material');
      if (material.normalMap || material.roughnessMap || material.metalnessMap || material.aoMap || material.lightMap || material.alphaMap)
        throw Error('Additional portable material maps need explicit qualification');
      if (material.map) {
        if (!material.map.image || material.map instanceof THREE.CompressedTexture) throw Error('Portable texture is unavailable or compressed');
        textures.add(material.map);
      }
    }
    let digest = geometryHashes.get(node.geometry);
    if (!digest) {
      const attributes = [...Object.entries(node.geometry.attributes).sort(([a], [b]) => a.localeCompare(b)),
        ...(node.geometry.index ? [['index', node.geometry.index] as const] : [])];
      digest = Promise.all(attributes.map(async ([name, attribute]) => ({ name, itemSize: attribute.itemSize,
        hash: await hash(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength).slice().buffer) })))
        .then(result => textHash({ attributes: result, groups: node.geometry.groups }));
      geometryHashes.set(node.geometry, digest);
    }
    const materials = (Array.isArray(node.material) ? node.material : [node.material]) as THREE.MeshStandardMaterial[];
    // Validate synchronously before scheduling digest continuations. A rejected input
    // must produce one caught diagnostic, without orphaned asynchronous rejections.
    const materialInputs = materials.map(m => ({ color: m.color.toArray(), roughness: m.roughness, metalness: m.metalness,
        side: m.side, opacity: m.opacity, alphaTest: m.alphaTest, transparent: m.transparent,
        emissive: m.emissive.toArray(), emissiveIntensity: m.emissiveIntensity,
        map: m.map && { source: sourceFor(m.map), repeat: m.map.repeat.toArray(), offset: m.map.offset.toArray(),
          center: m.map.center.toArray(), rotation: m.map.rotation, wrapS: m.map.wrapS, wrapT: m.map.wrapT, flipY: m.map.flipY } }));
    graph.push(digest.then(geometry => ({ path: path(node), matrix: node.matrixWorld.toArray(), geometry, materials: materialInputs })));
  });
  if (meshes < 1 || meshes > 4096 || vertices > 1_000_000) throw Error('Portable assembly budget exceeded');
  const textureSources = [...textures].map(sourceFor).sort((a, b) => (a.package + a.materialId).localeCompare(b.package + b.materialId));
  const metadata = structuredClone(root.userData); delete metadata.portable;
  const bounds = constructionBounds(root);
  const input = { adapter: 'construction-portable-v1', recipe: root.userData.recipe, frame: root.userData.frame,
    profile: root.userData.profile, sourceRevisions: { masonry: resources.registry.pack!.revision,
      timber: resources.timberPack.revision, shelving: resources.shelvingPack.revision }, textureSources,
    resolvedGeometry: await textHash(await Promise.all(graph)), bounds, metadata };
  const cacheKey = await textHash(input);
  root.userData.portable = { ...input, cacheKey, state: root.userData.staticState ?? 'complete-static',
    unsupported: ['gameplay', 'cabinet-animation', 'animated-materials', 'custom-runtime-shaders'] };
  const raw = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, animations: [], maxTextureSize: 4096 });
  if (!(raw instanceof ArrayBuffer) || raw.byteLength > 64 * 1024 * 1024) throw Error('Portable binary budget exceeded');
  const bytes = canonicalGlb(raw);
  return { bytes, sha256: await hash(bytes), cacheKey, bounds: constructionBounds(root), meshes, vertices, textures: textures.size };
}

/** Standard consumer, independent of the procedural geometry builder. */
export async function reimportPortableConstruction(bytes: ArrayBuffer) {
  if (bytes.byteLength > 64 * 1024 * 1024) throw Error('Portable binary budget exceeded');
  return (await new GLTFLoader().parseAsync(bytes, '')).scene;
}
export function disposePortableConstruction(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(node => { if (node instanceof THREE.Mesh) {
    geometries.add(node.geometry);
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(m); if (m instanceof THREE.MeshStandardMaterial && m.map) textures.add(m.map);
    }
  } });
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); root.removeFromParent();
}
