import type { Vec3 } from '../manifest';
import type { StairAssembly, Volume } from './assembly';

export interface StairFixtureBox { id: string; size: Vec3; center: Vec3; material: 'wall' | 'lower' | 'upper'; cutaway: boolean }
export function fixtureVolume(box: StairFixtureBox): Volume {
  return { min: box.center.map((v, i) => v - box.size[i] / 2) as Vec3, max: box.center.map((v, i) => v + box.size[i] / 2) as Vec3 };
}
/** Authored S2 fixture only; these rooms must never masquerade as undisclosed canonical rooms. */
export function stairFixture(stair: StairAssembly): StairFixtureBox[] {
  const boxes: StairFixtureBox[] = [], { width, rise, run, landing } = stair, holeHalf = width / 2 + 0.1;
  const box = (id: string, size: Vec3, center: Vec3, material: StairFixtureBox['material'], cutaway = false) => boxes.push({ id, size, center, material, cutaway });
  box('lower-back', [7, 0.18, 4.8 - landing], [0, -0.09, -(4.8 + landing) / 2], 'lower');
  box('lower-under-flight', [7, 0.18, run + 4.8], [0, -0.09, (run + 4.8) / 2], 'lower');
  box('upper-back', [7, 0.18, 4.7], [0, rise - 0.09, -2.45], 'upper', true);
  box('upper-front', [7, 0.18, 4.8 - landing], [0, rise - 0.09, run + (4.8 + landing) / 2], 'upper');
  for (const side of [-1, 1]) {
    box(`lower-landing-side-${side}`, [3.5 - width / 2, 0.18, landing], [side * (3.5 + width / 2) / 2, -0.09, -landing / 2], 'lower');
    box(`upper-landing-side-${side}`, [3.5 - width / 2, 0.18, landing], [side * (3.5 + width / 2) / 2, rise - 0.09, run + landing / 2], 'upper');
    box(`shaft-edge-${side}`, [3.5 - holeHalf, 0.18, run + 0.2], [side * (3.5 + holeHalf) / 2, rise - 0.09, run / 2], 'upper', true);
    box(`lower-wall-${side}`, [0.18, 4.5, run + 9.6], [side * 3.6, 2.25, run / 2], 'wall');
    box(`upper-wall-${side}`, [0.18, 4.5, run + 9.6], [side * 3.6, rise + 2.25, run / 2], 'wall', true);
  }
  box('lower-end-wall', [7, 4.5, 0.18], [0, 2.25, -4.9], 'wall');
  box('upper-end-wall', [7, 4.5, 0.18], [0, rise + 2.25, run + 4.9], 'wall');
  return boxes;
}
