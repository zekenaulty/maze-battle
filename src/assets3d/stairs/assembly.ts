import type { Vec3 } from '../manifest';
import type { VisualAsset } from '../models/contract';
import { nativeBox } from '../models/native';

export interface Volume { min: Vec3; max: Vec3 }
export interface StairAssembly {
  recipe: 'straight-stair-v1'; revision: string; model: VisualAsset;
  width: number; rise: number; run: number; landing: number; steps: number; rails: boolean;
  anchors: { lower: Vec3; upper: Vec3 };
  opening: Volume; clearance: Volume;
}
export function straightStair(options: { width?: number; rise?: number; tread?: number; steps?: number; landing?: number; rails?: boolean } = {}): StairAssembly {
  const { width = 1.8, rise = 4.68, tread = 0.42, steps = 18, landing = 1.8, rails = false } = options;
  if (![width, rise, tread, landing].every(v => Number.isFinite(v) && v > 0) || !Number.isInteger(steps) || steps < 4 || steps > 64 ||
    width < 1.2 || width > 4 || rise > 12 || tread < 0.2 || tread > 1 || landing < 1.2 || typeof rails !== 'boolean') throw new Error('Unsupported straight stair dimensions');
  const run = tread * steps, riser = rise / steps, cap = Math.min(0.12, riser * 0.45), railHeight = 1.05;
  const parts = [nativeBox('lower-landing', [width, 0.18, landing], [0, -0.09, -landing / 2], 'structure'),
    nativeBox('upper-landing', [width, 0.18, landing], [0, rise - 0.09, run + landing / 2], 'structure')];
  for (let i = 0; i < steps; i++) {
    parts.push(nativeBox(`tread-${i}`, [width, cap, tread], [0, (i + 1) * riser - cap / 2, (i + 0.5) * tread], 'treads'));
    parts.push(nativeBox(`riser-${i}`, [width, riser - cap, 0.08], [0, i * riser + (riser - cap) / 2, i * tread + 0.04], 'structure'));
  }
  if (rails) for (const side of [-1, 1]) {
    parts.push({ ...nativeBox(`rail-${side}`, [0.1, 0.1, Math.hypot(run, rise)], [side * (width / 2 + 0.04), rise / 2 + railHeight, run / 2], 'rails'),
      rotation: [-Math.atan2(rise, run), 0, 0] });
    for (const i of [0, Math.floor(steps / 2), steps]) parts.push(nativeBox(`post-${side}-${i}`, [0.09, railHeight, 0.09],
      [side * (width / 2 + 0.04), rise * i / steps + railHeight / 2, run * i / steps], 'rails'));
  }
  const revision = `straight-stair-v1/${width}/${rise}/${tread}/${steps}/${landing}/rails-${rails ? 'on' : 'off'}`;
  const model: VisualAsset = { id: 'stairs-straight', label: 'Straight stair assembly', geometryRevision: revision,
    source: { kind: 'native', note: 'Maze Battle authored, parameterized treads/risers/landings. No external model or generated art.' },
    adapter: 'cuboids-v1', slots: { structure: { layoutId: 'solid-v1' }, treads: { layoutId: 'solid-v1' },
      ...(rails ? { rails: { layoutId: 'solid-v1' } } : {}) },
    states: { neutral: { geometry: 'flight' } }, payload: { geometries: { flight: parts } },
    anchors: { lowerLanding: { position: [0, 0, -landing / 2], rotation: [0, 0, 0] },
      upperLanding: { position: [0, rise, run + landing / 2], rotation: [0, Math.PI, 0] } } };
  return { recipe: 'straight-stair-v1', revision, model, width, rise, run, landing, steps, rails,
    anchors: { lower: [0, 0, -landing / 2], upper: [0, rise, run + landing / 2] },
    opening: { min: [-width / 2 - 0.1, rise - 0.18, -0.1], max: [width / 2 + 0.1, rise + 0.18, run + 0.1] },
    clearance: { min: [-width / 2 - 0.2, 0, -landing], max: [width / 2 + 0.2, rise + 2.7, run + landing] } };
}

/** Smooth walking proxy under the visible treads; independent from camera frame counts. */
export function stairSupport(stair: Pick<StairAssembly, 'rise' | 'run'>, z: number) {
  return Math.max(0, Math.min(1, z / stair.run)) * stair.rise;
}
