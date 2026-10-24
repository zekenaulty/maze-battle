// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { MaterialDefinition, TextureAnimation } from './manifest';
import { AnimationClock, animationDuration, animationSample, animationStepTime } from './animation';
import { ThreeAssetLibrary } from './threeAssets';
import { AssetRegistry } from './registry';

const animation = {
  loop: true, interpolate: false,
  frames: [0, 1].map(sourceIndex => ({ sourceIndex, texture: { path: `textures/test/frame-${sourceIndex}.png`, sha256: String(sourceIndex).repeat(64), width: 1, height: 1 }, provenance: {} })),
  timeline: [{ frame: 1, durationMs: 100 }, { frame: 0, durationMs: 50 }, { frame: 1, durationMs: 25 }],
} as TextureAnimation;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('texture playback', () => {
  it('preserves frame order, repeats, individual times and the loop boundary', () => {
    expect(animationDuration(animation)).toBe(175);
    expect([0, 99, 100, 149, 150, 174, 175, 275].map(t => animationSample(animation, t)))
      .toEqual([{ step: 0, frame: 1 }, { step: 0, frame: 1 }, { step: 1, frame: 0 }, { step: 1, frame: 0 },
        { step: 2, frame: 1 }, { step: 2, frame: 1 }, { step: 0, frame: 1 }, { step: 1, frame: 0 }]);
    expect(animationSample({ ...animation, loop: false }, 10000)).toEqual({ step: 2, frame: 1 });
    expect(animationStepTime(animation, 2)).toBe(150);
  });
  it('keeps elapsed time independent of rendering frequency, pause and playback speed', () => {
    const clock = new AnimationClock(); clock.advance(100); expect(clock.advance(1100)).toBe(1000);
    clock.playing = false; expect(clock.advance(3000)).toBe(1000);
    clock.playing = true; clock.speed = 0.25; expect(clock.advance(3400)).toBe(1100);
    clock.seek(50); expect(clock.advance(10000)).toBe(50); expect(clock.advance(10200)).toBe(100);
  });
  it('shares decoded frames and one GPU texture through repeated loops and emissive faces', async () => {
    vi.stubGlobal('location', { href: 'http://localhost/' });
    const loads = vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((url, onLoad) => {
      const image = { src: url, naturalWidth: 1, naturalHeight: 1 } as HTMLImageElement;
      onLoad?.(image); return image;
    });
    const library = new ThreeAssetLibrary();
    const definition = { id: 'test:animated', surface: 'tileable', roughness: 1, texture: animation.frames[1].texture, animation } as MaterialDefinition;
    const face = { ...new AssetRegistry().resolve('test').faces[0], material: definition };
    const material = library.material(face);
    const emissive = library.material({ ...face, emissive: { color: '#ffaa33', intensity: 0.4 } });
    await library.ready();
    const texture = material.map!; const initialVersion = texture.version;
    expect(emissive.map).toBe(texture); expect(emissive.emissiveMap).toBe(texture);
    expect(library.material(face)).toBe(material);
    for (let t = 0; t < 10000; t += 25) { library.tick(t); expect(material.map).toBe(texture); }
    expect(texture.version).toBeGreaterThan(initialVersion);
    expect(loads).toHaveBeenCalledTimes(2);
    const dispose = vi.spyOn(texture, 'dispose'); library.dispose();
    expect(dispose).toHaveBeenCalledTimes(1); expect(library.tick(100)).toBe(false);
  });
  it('settles an unavailable frame to a stable fallback instead of playing an incomplete loop', async () => {
    vi.stubGlobal('location', { href: 'http://localhost/' });
    vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((url, onLoad, _progress, onError) => {
      const image = { naturalWidth: 1, naturalHeight: 1 } as HTMLImageElement;
      if (url.includes('frame-0')) onError?.(new Error('missing')); else onLoad?.(image);
      return image;
    });
    const library = new ThreeAssetLibrary();
    const definition = { id: 'test:animated', surface: 'tileable', texture: animation.frames[1].texture, animation } as MaterialDefinition;
    const material = library.material({ ...new AssetRegistry().resolve('test').faces[0], material: definition });
    await library.ready(); expect(material.map).toBeNull();
    expect([...library.warnings]).toEqual(['Animation unavailable: test:animated']); expect(library.tick(100)).toBe(false);
    library.dispose();
  });
});
