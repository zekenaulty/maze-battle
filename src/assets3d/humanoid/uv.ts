// UV mapping and dimensions adapted from skinview3d (MIT), pinned at 84906e983a2cf325f33f515b9a71c871f799054b.
// See THIRD_PARTY_NOTICES/skinview3d-LICENSE.txt. Atlas coordinates remain in the original 64-unit layout.
import * as THREE from 'three';
export type HumanoidPart = 'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
export const PARTS: HumanoidPart[] = ['head', 'torso', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
export const UV_ORIGINS: Record<HumanoidPart, [[number, number], [number, number]]> = {
  head: [[0, 0], [32, 0]], torso: [[16, 16], [16, 32]], rightArm: [[40, 16], [40, 32]],
  leftArm: [[32, 48], [48, 48]], rightLeg: [[0, 16], [0, 32]], leftLeg: [[16, 48], [0, 48]],
};
export function partSize(part: HumanoidPart, slim: boolean): [number, number, number] {
  return part === 'head' ? [8, 8, 8] : part === 'torso' ? [8, 12, 4] : [part.endsWith('Arm') && slim ? 3 : 4, 12, 4];
}
export function skinUVs(box: THREE.BoxGeometry, u: number, v: number, w: number, h: number, d: number) {
  const face = (x1: number, y1: number, x2: number, y2: number) => [
    [x1 / 64, 1 - y2 / 64], [x2 / 64, 1 - y2 / 64], [x2 / 64, 1 - y1 / 64], [x1 / 64, 1 - y1 / 64],
  ];
  const top = face(u + d, v, u + w + d, v + d), bottom = face(u + w + d, v, u + w * 2 + d, v + d);
  const left = face(u, v + d, u + d, v + d + h), front = face(u + d, v + d, u + w + d, v + d + h);
  const right = face(u + w + d, v + d, u + w + d * 2, v + h + d), back = face(u + w + d * 2, v + d, u + w * 2 + d * 2, v + h + d);
  (box.attributes.uv as THREE.BufferAttribute).set(new Float32Array([right, left, top, bottom, front, back].flatMap((f, i) =>
    (i === 3 ? [f[0], f[1], f[3], f[2]] : [f[3], f[2], f[0], f[1]]).flat())));
}
