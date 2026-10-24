import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { straightStair, stairSupport } from './assembly';
import { bodyBlocked, StairFixtureWalker } from './locomotion';
import { VisualInstance, VisualResources } from '../models/VisualInstance';
import { nativeMaterials } from '../models/native';
import { stairFixture, fixtureVolume } from './fixture';

describe('S1 stair assembly', () => {
  it('repeats the same geometry and anchors and keeps material replacement independent', () => {
    const stair = straightStair(), other = straightStair(); expect(stair).toEqual(other);
    expect(stair.run).toBeCloseTo(7.56); expect(stair.clearance.max[2] - stair.clearance.min[2]).toBeGreaterThan(3.2);
    const resources = new VisualResources('/test/manifest.json'), model = new VisualInstance(stair.model, resources);
    model.bindMaterials({ structure: nativeMaterials.native_stone, treads: nativeMaterials.native_wood, rails: nativeMaterials.native_bronze }); model.setVisualState('neutral');
    const before = resources.geometryCount, bounds = new THREE.Box3().setFromObject(model.root);
    expect(bounds.max.y).toBeGreaterThan(stair.rise + 1); expect(bounds.max.y).toBeLessThan(stair.rise + 1.2);
    expect(model.anchors.get('upperLanding')!.position.y).toBe(stair.rise);
    expect(stair.opening.min[1]).toBeLessThan(stair.rise); expect(stair.opening.max[1]).toBeGreaterThan(stair.rise);
    model.bindMaterials({ structure: nativeMaterials.native_wood, treads: nativeMaterials.native_stone, rails: nativeMaterials.native_bronze });
    expect(resources.geometryCount).toBe(before); model.dispose(); resources.dispose();
  });
  it('rejects a compressed/invalid flight and produces continuous monotone support', () => {
    expect(() => straightStair({ width: 0.6 })).toThrow(); expect(() => straightStair({ steps: 0 })).toThrow();
    const stair = straightStair(); let prior = 0;
    for (let i = 0; i <= 100; i++) { const value = stairSupport(stair, stair.run * i / 100); expect(value).toBeGreaterThanOrEqual(prior); prior = value; }
    expect(stairSupport(stair, -2)).toBe(0); expect(stairSupport(stair, stair.run + 2)).toBe(stair.rise);
  });
  it('joins risers to tread undersides and decks to landing edges without coplanar overlap', () => {
    const stair = straightStair(), parts = stair.model.payload.geometries.flight;
    for (let i = 0; i < stair.steps; i++) {
      const tread = parts.find(p => p.id === `tread-${i}`)!, riser = parts.find(p => p.id === `riser-${i}`)!;
      expect(riser.position[1] + riser.size![1] / 2).toBeCloseTo(tread.position[1] - tread.size![1] / 2, 8);
    }
    const decks = stairFixture(stair).filter(b => b.material !== 'wall').map(fixtureVolume);
    for (const id of ['lower-landing', 'upper-landing']) {
      const part = parts.find(p => p.id === id)!, top = part.position[1] + part.size![1] / 2;
      for (const deck of decks) {
        if (Math.abs(deck.max[1] - top) > 1e-8) continue;
        const overlapX = Math.min(deck.max[0], part.size![0] / 2) - Math.max(deck.min[0], -part.size![0] / 2);
        const overlapZ = Math.min(deck.max[2], part.position[2] + part.size![2] / 2) - Math.max(deck.min[2], part.position[2] - part.size![2] / 2);
        expect(overlapX > 1e-8 && overlapZ > 1e-8).toBe(false);
      }
    }
  });
});

describe('S2 vertical locomotion fixture', () => {
  it.each([30, 60, 144])('walks up/down at %i FPS, supports stopping/reversing, and never jumps between decks', fps => {
    const stair = straightStair(), walker = new StairFixtureWalker(stair); let maxRise = 0;
    for (let i = 0; i < fps * 4; i++) { const previous = walker.pose.y; walker.advance(1 / fps, 0, 3); maxRise = Math.max(maxRise, Math.abs(walker.pose.y - previous)); }
    expect(walker.pose.y).toBe(stair.rise); expect(maxRise).toBeLessThan(0.065);
    const stopped = { ...walker.pose }; for (let i = 0; i < fps; i++) walker.advance(1 / fps, 0, 0);
    expect(walker.pose).toEqual(stopped); expect(walker.cameraY).toBeCloseTo(stair.rise + walker.eyeHeight);
    for (let i = 0; i < fps * 4; i++) walker.advance(1 / fps, 0, -3);
    expect(walker.pose.y).toBe(0); expect(walker.pose.z).toBeLessThan(0);
  });
  it('uses vertical intervals so overhead walls do not collide with a body underneath', () => {
    const wall = { min: [-1, 4.5, -1] as [number, number, number], max: [1, 8, 1] as [number, number, number] };
    expect(bodyBlocked({ x: 0, y: 0, z: 0 }, [wall])).toBe(false);
    expect(bodyBlocked({ x: 0, y: 2, z: 0 }, [wall])).toBe(true);
    expect(bodyBlocked({ x: 3, y: 5, z: 0 }, [wall])).toBe(false);
  });
  it('sweeps through height-aware blockers without tunnelling and bounds suspended frame time', () => {
    const stair = straightStair(), walker = new StairFixtureWalker(stair, [{ min: [-2, 0, 0.2], max: [2, 6, 0.3] }]);
    for (let i = 0; i < 120; i++) walker.advance(1 / 30, 0, 4);
    expect(walker.pose.z).toBeLessThan(0.2);
    const free = new StairFixtureWalker(stair), start = free.pose.z; free.advance(10, 0, 4);
    expect(free.pose.z - start).toBeCloseTo(0.2);
  });
  it('walks the actual fixture without ceiling penetration and refuses insufficient headroom', () => {
    const stair = straightStair(), volumes = stairFixture(stair).map(fixtureVolume), walker = new StairFixtureWalker(stair, volumes);
    for (let i = 0; i < 240; i++) {
      walker.advance(1 / 60, 0, 3); expect(bodyBlocked(walker.pose, volumes)).toBe(false);
    }
    expect(walker.pose.y).toBe(stair.rise);
    const low = new StairFixtureWalker(stair, [{ min: [-2, 3, 0], max: [2, 3.2, stair.run] }]);
    for (let i = 0; i < 240; i++) low.advance(1 / 60, 0, 3);
    expect(low.pose.y).toBeLessThanOrEqual(0.3); expect(low.pose.z).toBeLessThan(1);
  });
});
