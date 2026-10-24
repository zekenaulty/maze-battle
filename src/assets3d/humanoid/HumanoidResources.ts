import * as THREE from 'three';
import { SKIN_CATALOG_URL, validateSkinDimensions } from './contract';
import type { SkinCatalog } from './contract';
import { partSize, skinUVs, UV_ORIGINS } from './uv';
import type { HumanoidPart } from './uv';

/** One owner per scene. Bounded catalog textures and classic/slim geometry are shared by appearances. */
export class HumanoidResources {
  private geometries = new Map<string, THREE.BoxGeometry>();
  private textures = new Map<string, THREE.Texture>();
  private loads = new Map<string, Promise<THREE.Texture>>();
  private disposed = false;
  readonly catalog: SkinCatalog;
  constructor(catalog: SkinCatalog) { this.catalog = catalog; }
  geometry(part: HumanoidPart, outer: boolean, slim: boolean) {
    if (this.disposed) throw new Error('Humanoid resources disposed');
    const key = `${part}/${outer}/${slim}`; const old = this.geometries.get(key); if (old) return old;
    const size = partSize(part, slim), expansion = outer ? part === 'head' ? 1 : 0.5 : 0;
    const box = new THREE.BoxGeometry(size[0] + expansion, size[1] + expansion, size[2] + expansion);
    skinUVs(box, ...UV_ORIGINS[part][outer ? 1 : 0], ...size); this.geometries.set(key, box); return box;
  }
  texture(id: string): Promise<THREE.Texture> {
    if (this.disposed) return Promise.reject(new Error('Humanoid resources disposed'));
    const asset = this.catalog.skins.find(s => s.id === id); if (!asset) return Promise.reject(new Error(`Unknown skin asset: ${id}`));
    const cached = this.loads.get(id); if (cached) return cached;
    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      const texture = new THREE.TextureLoader().load(new URL(asset.texture.path, new URL(SKIN_CATALOG_URL, location.href)).href, loaded => {
        if (this.disposed) { reject(new Error('Humanoid resources disposed')); return; }
        try {
          validateSkinDimensions(loaded.image.naturalWidth, loaded.image.naturalHeight);
          if (loaded.image.naturalWidth !== asset.texture.width || loaded.image.naturalHeight !== asset.texture.height) throw new Error('Skin dimensions differ from manifest');
          resolve(loaded);
        } catch (error) { reject(error); }
      }, undefined, () => reject(new Error(`Skin image unavailable: ${asset.label}`)));
      texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false; texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      this.textures.set(id, texture);
    });
    this.loads.set(id, promise); return promise;
  }
  dispose() {
    this.disposed = true; for (const geometry of this.geometries.values()) geometry.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.geometries.clear(); this.textures.clear(); this.loads.clear();
  }
}
