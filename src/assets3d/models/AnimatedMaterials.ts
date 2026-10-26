import * as THREE from 'three';
import type { ModelAnimation, VisualMaterial } from './contract';

export function modelAnimationSample(animation: ModelAnimation, elapsedMs: number) {
  const total = animation.timeline.reduce((sum, s) => sum + s.durationMs, 0);
  let time = Math.max(0, elapsedMs), step = 0;
  time = animation.loop ? time % total : Math.min(time, total);
  while (step < animation.timeline.length - 1 && time >= animation.timeline[step].durationMs) time -= animation.timeline[step++].durationMs;
  const next = step + 1 < animation.timeline.length ? step + 1 : animation.loop ? 0 : step;
  return { step, frame: animation.timeline[step].frame, nextFrame: animation.timeline[next].frame,
    blend: animation.interpolate ? Math.min(1, time / animation.timeline[step].durationMs) : 0 };
}

/** Shared resident keyframes. GPU interpolation changes uniforms, never reuploads a canvas each frame. */
export class AnimatedMaterials {
  private entries = new Map<string, { material: THREE.MeshStandardMaterial; textures: THREE.Texture[];
    definition: VisualMaterial; a: { value: THREE.Texture | null }; b: { value: THREE.Texture | null }; blend: { value: number } }>();
  private pending: Promise<void>[] = [];
  private disposed = false;
  private elapsedMs = 0;
  readonly warnings = new Set<string>();
  private baseUrl: string;
  constructor(baseUrl: string) { this.baseUrl = baseUrl; }
  material(definition: VisualMaterial) {
    const key = JSON.stringify(definition), cached = this.entries.get(key); if (cached) return cached.material;
    if (this.disposed) throw Error('Animated materials disposed');
    const material = new THREE.MeshStandardMaterial({ color: definition.fallbackColor, roughness: definition.roughness,
      side: definition.render.side === 'front' ? THREE.FrontSide : THREE.DoubleSide,
      alphaTest: definition.render.alphaMode === 'mask' ? definition.render.alphaCutoff ?? .5 : 0,
      transparent: definition.render.alphaMode === 'blend', depthWrite: definition.render.alphaMode !== 'blend',
      emissive: definition.emission?.color ?? '#000000', emissiveIntensity: definition.emission?.intensity ?? 0 });
    const entry = { material, textures: [] as THREE.Texture[], definition, a: { value: null as THREE.Texture | null },
      b: { value: null as THREE.Texture | null }, blend: { value: 0 } };
    this.entries.set(key, entry);
    material.onBeforeCompile = shader => {
      shader.uniforms.modelFrameA = entry.a; shader.uniforms.modelFrameB = entry.b; shader.uniforms.modelBlend = entry.blend;
      shader.fragmentShader = 'uniform sampler2D modelFrameA; uniform sampler2D modelFrameB; uniform float modelBlend;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace(
        'texture2D( map, vMapUv )', 'mix( texture2D( modelFrameA, vMapUv ), texture2D( modelFrameB, vMapUv ), modelBlend )'));
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', THREE.ShaderChunk.emissivemap_fragment.replace(
        'texture2D( emissiveMap, vEmissiveMapUv )', 'mix( texture2D( modelFrameA, vEmissiveMapUv ), texture2D( modelFrameB, vEmissiveMapUv ), modelBlend )'));
    };
    material.customProgramCacheKey = () => 'model-keyframe-blend-v1';
    this.pending.push(Promise.all(definition.animation!.frames.map(frame => new Promise<HTMLImageElement | undefined>(resolve => {
      const url = new URL(frame.texture.path, new URL(this.baseUrl, location.href)).href;
      new THREE.ImageLoader().load(url, image => resolve(image), undefined, () => resolve(undefined));
    }))).then(images => {
      if (this.disposed) return;
      if (images.some((image, i) => !image || image.naturalWidth !== definition.animation!.frames[i].texture.width
        || image.naturalHeight !== definition.animation!.frames[i].texture.height)) { this.warnings.add(`Animation unavailable: ${definition.id}`); return; }
      entry.textures = (images as HTMLImageElement[]).map(image => {
        const texture = new THREE.Texture(image); texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true; return texture;
      });
      material.map = entry.textures[definition.animation!.timeline[0].frame];
      if (definition.emission) material.emissiveMap = material.map;
      material.color.set('#ffffff'); material.needsUpdate = true; this.tick(this.elapsedMs);
    }));
    return material;
  }
  tick(elapsedMs: number) {
    this.elapsedMs = elapsedMs;
    for (const entry of this.entries.values()) if (entry.textures.length) {
      const sample = modelAnimationSample(entry.definition.animation!, elapsedMs);
      entry.a.value = entry.textures[sample.frame]; entry.b.value = entry.textures[sample.nextFrame]; entry.blend.value = sample.blend;
    }
  }
  async ready() { await Promise.all(this.pending); }
  get textureCount() { return [...this.entries.values()].reduce((sum, e) => sum + e.textures.length, 0); }
  get materialCount() { return this.entries.size; }
  dispose() { this.disposed = true; for (const e of this.entries.values()) { e.material.dispose(); for (const t of e.textures) t.dispose(); } this.entries.clear(); this.pending = []; }
}
