import * as THREE from 'three';
import type { ResolvedBlock, ResolvedFace } from './registry';
import { PACK_URL } from './registry';
import type { SurfaceMaterial, TextureAnimation } from './manifest';
import { animationSample } from './animation';

/** One owner per renderer; texture/material lifetimes do not follow camera movement. */
export class ThreeAssetLibrary {
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private textures = new Map<string, THREE.Texture>();
  private pending: Promise<void>[] = [];
  private loads = new Map<string, Promise<THREE.Texture | undefined>>();
  private images = new Map<string, Promise<HTMLImageElement | undefined>>();
  private animations: Array<{ texture: THREE.Texture; animation: TextureAnimation; images: HTMLImageElement[]; frame: number }> = [];
  private disposed = false;
  private changed: () => void;
  private baseUrl: string;
  readonly warnings = new Set<string>();
  constructor(changed: () => void = () => {}, baseUrl = PACK_URL) { this.changed = changed; this.baseUrl = baseUrl; }

  material(face: ResolvedFace, repeat: [number, number] = [1, 1], debug = false) {
    const definition = face.material;
    // Bounded functional faces and UV islands must never be repeated like masonry.
    const tiling = definition?.surface === 'tileable' ? repeat : [1, 1];
    const key = JSON.stringify([definition?.id, definition?.texture.sha256, definition?.texture.path, this.baseUrl,
      definition?.roughness, face.fallbackColor, definition?.surface, definition?.render, tiling, face.emissive, debug]);
    const cached = this.materials.get(key); if (cached) return cached;
    const material = new THREE.MeshStandardMaterial({ color: face.fallbackColor, roughness: definition?.roughness ?? 1,
      side: definition?.render?.side === 'front' ? THREE.FrontSide : THREE.DoubleSide,
      transparent: definition?.render?.alphaMode === 'blend',
      alphaTest: definition?.render?.alphaMode === 'mask' ? definition.render.alphaCutoff ?? 0.5 : 0,
      depthWrite: definition?.render?.alphaMode !== 'blend',
      emissive: face.emissive?.color ?? '#000000', emissiveIntensity: face.emissive?.intensity ?? 0 });
    this.materials.set(key, material);
    if (debug) { material.map = this.debugTexture(); material.color.set('#ffffff'); return material; }
    if (!definition) return material;
    const url = new URL(definition.texture.path, new URL(this.baseUrl, location.href)).href;
    const textureKey = JSON.stringify([url, tiling]);
    const use = (texture: THREE.Texture) => {
      if (this.disposed) return;
      material.map = texture; material.color.set('#ffffff');
      if (face.emissive) material.emissiveMap = texture;
      material.needsUpdate = true; this.changed();
    };
    const existing = this.loads.get(textureKey);
    if (existing) {
      this.pending.push(existing.then(texture => { if (texture) use(texture); }));
    } else {
      const loading = definition.animation ? this.loadAnimation(definition, tiling as [number, number], textureKey) : new Promise<THREE.Texture | undefined>(resolve => {
        const texture = new THREE.TextureLoader().load(url, loaded => {
          if (this.disposed) loaded.dispose();
          resolve(this.disposed ? undefined : loaded);
        }, undefined, () => { if (!this.disposed) { this.warnings.add(`Texture unavailable: ${definition.id}`); this.changed(); } resolve(undefined); });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = definition.surface === 'tileable' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        if (definition.surface === 'uv-atlas') { texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter; }
        texture.repeat.set(tiling[0], tiling[1]); texture.anisotropy = 4;
        this.textures.set(textureKey, texture);
      });
      this.loads.set(textureKey, loading);
      this.pending.push(loading.then(texture => { if (texture) use(texture); }));
    }
    return material;
  }
  private loadAnimation(definition: SurfaceMaterial, tiling: [number, number], key: string) {
    const animation = definition.animation!;
    const loaded = animation.frames.map(frame => {
      const url = new URL(frame.texture.path, new URL(this.baseUrl, location.href)).href;
      let image = this.images.get(url);
      if (!image) {
        image = new Promise<HTMLImageElement | undefined>(resolve => {
          new THREE.ImageLoader().load(url, value => resolve(this.disposed ? undefined : value), undefined, () => resolve(undefined));
        }); this.images.set(url, image);
      }
      return image;
    });
    return Promise.all(loaded).then(images => {
      if (this.disposed) return undefined;
      if (images.some((image, i) => !image || image.naturalWidth !== animation.frames[i].texture.width || image.naturalHeight !== animation.frames[i].texture.height)) {
        this.warnings.add(`Animation unavailable: ${definition.id}`); this.changed(); return undefined;
      }
      const frames = images as HTMLImageElement[];
      const frame = animation.timeline[0].frame;
      // One GPU texture per tiling, with decoded source images shared across materials/faces.
      const texture = new THREE.Texture(frames[frame]); texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = definition.surface === 'tileable' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.repeat.set(...tiling); texture.anisotropy = 4; texture.needsUpdate = true;
      this.textures.set(key, texture); this.animations.push({ texture, animation, images: frames, frame });
      return texture;
    });
  }
  /** Advance existing maps, including emissive maps, without allocating textures or materials. */
  tick(elapsedMs: number) {
    if (this.disposed) return false;
    let changed = false;
    for (const item of this.animations) {
      const frame = animationSample(item.animation, elapsedMs).frame;
      if (frame === item.frame) continue;
      item.frame = frame; item.texture.image = item.images[frame]; item.texture.needsUpdate = true; changed = true;
    }
    return changed;
  }
  blockMaterials(block: ResolvedBlock, debug = false) { return block.faces.map(face => this.material(face, [1, 1], debug)); }
  private debugTexture() {
    const old = this.textures.get('debug'); if (old) return old;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#bb7781' : '#d5dce6'; ctx.fillRect(x * 64, y * 64, 64, 64);
      ctx.strokeStyle = '#263243'; ctx.strokeRect(x * 64, y * 64, 64, 64);
    }
    ctx.fillStyle = '#101725'; ctx.font = 'bold 23px sans-serif'; ctx.fillText('TOP / V ↑', 62, 28);
    ctx.fillText('U →', 100, 138); ctx.font = '16px sans-serif'; ctx.fillText('0,0', 8, 244); ctx.fillText('1,0', 220, 244);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.set('debug', texture); return texture;
  }
  async ready() { await Promise.all(this.pending); }
  dispose() {
    this.disposed = true;
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.materials.clear(); this.textures.clear(); this.images.clear(); this.loads.clear(); this.pending = []; this.animations = [];
  }
}

export function blockGeometry(block: ResolvedBlock, library: ThreeAssetLibrary, debug = false): THREE.Group {
  const group = new THREE.Group();
  if (block.model.kind === 'cube') group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), library.blockMaterials(block, debug)));
  else {
    const parts = block.model.parts;
    const joints = new Map<string, THREE.Group>();
    for (const part of parts) {
      const geometry = new THREE.BoxGeometry(...part.size);
      const uv = geometry.getAttribute('uv');
      block.faces.forEach((face, index) => {
        const mapping = part.faces[face.face]; const [u0, v0, u1, v1] = mapping.rect;
        for (let corner = 0; corner < 4; corner++) {
          const i = index * 4 + corner; let u = uv.getX(i), v = uv.getY(i);
          for (let turn = 0; turn < (mapping.rotation ?? 0) / 90; turn++) [u, v] = [1 - v, u];
          uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
        }
      });
      if (part.omitFaces) {
        const visible = geometry.groups.filter(g => !part.omitFaces!.includes(block.faces[g.materialIndex!].face));
        geometry.clearGroups(); for (const g of visible) geometry.addGroup(g.start, g.count, g.materialIndex);
      }
      const pivot = part.pivot ?? part.position;
      const joint = new THREE.Group(); joint.name = part.name; joint.userData.assetJoint = true;
      const parent = part.parent ? parts.find(p => p.name === part.parent)! : undefined;
      const parentPivot = parent?.pivot ?? parent?.position ?? [0, 0, 0];
      joint.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]);
      const mesh = new THREE.Mesh(geometry, library.blockMaterials(block, debug));
      mesh.position.set(part.position[0] - pivot[0], part.position[1] - pivot[1], part.position[2] - pivot[2]);
      joint.add(mesh); joints.set(part.name, joint);
    }
    for (const part of parts) (part.parent ? joints.get(part.parent)! : group).add(joints.get(part.name)!);
  }
  applyBlockAppearance(group, block, library, debug);
  return group;
}
/** Pose existing joints and replace material references; never rebuild geometry for an open/closed state. */
export function applyBlockAppearance(group: THREE.Group, block: ResolvedBlock, library: ThreeAssetLibrary, debug = false) {
  const materials = library.blockMaterials(block, debug);
  group.traverse(child => {
    if (child instanceof THREE.Mesh) child.material = materials;
    if (child.userData.assetJoint) child.rotation.set(...(block.poses[child.name]?.rotation ?? [0, 0, 0]));
  });
}
export function disposeGeometry(group: THREE.Object3D) {
  group.traverse(child => { if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) child.geometry.dispose(); });
}
