import { FACE_ORDER } from './manifest.ts';
import type { Appearance, BlockFace, ModelDefinition, UvFace, UvPart, Vec3 } from './manifest.ts';

/** Explicit mapping for the supplied single-chest atlas; not a six-square cube unwrap.
 * Layout cross-check: Mineways TileMaker gNormalChest115 at e2bd929 (top/front/side, 180-degree flips).
 * Dimensions and hinge are authored for this renderer. No reference texture bytes are copied.
 */
export function createChestModel(atlasSize = 1024): ModelDefinition {
  const uv = (x: number, y: number, width: number, height: number, rotation: UvFace['rotation'] = 180): UvFace => {
    const inset = 0.5 / atlasSize;
    return { rect: [x / 64 + inset, 1 - (y + height) / 64 + inset,
      (x + width) / 64 - inset, 1 - y / 64 - inset], rotation };
  };
  const all = (face: UvFace) => Object.fromEntries(FACE_ORDER.map(f => [f, face])) as Record<BlockFace, UvFace>;
  const bodyFaces = {
    right: uv(0, 33, 14, 10), left: uv(28, 33, 14, 10),
    top: uv(28, 19, 14, 14), bottom: uv(14, 19, 14, 14),
    front: uv(42, 33, 14, 10), back: uv(14, 33, 14, 10),
  };
  const innerWood = uv(29, 20, 12, 12);
  const rim = all(uv(42, 33, 14, 1));
  const parts: UvPart[] = [
    { name: 'body', size: [14 / 16, 10 / 16, 14 / 16], position: [0, 5 / 16, 0], faces: bodyFaces, omitFaces: ['top'] },
    { name: 'interior', size: [12 / 16, 9 / 16, 12 / 16], position: [0, 5.5 / 16, 0], faces: all(innerWood), omitFaces: ['top'] },
  ];
  for (const [name, size, position] of [
    ['rim_front', [14 / 16, 1 / 16, 1 / 16], [0, 9.5 / 16, 6.5 / 16]],
    ['rim_back', [14 / 16, 1 / 16, 1 / 16], [0, 9.5 / 16, -6.5 / 16]],
    ['rim_right', [1 / 16, 1 / 16, 12 / 16], [6.5 / 16, 9.5 / 16, 0]],
    ['rim_left', [1 / 16, 1 / 16, 12 / 16], [-6.5 / 16, 9.5 / 16, 0]],
  ] as Array<[string, Vec3, Vec3]>) parts.push({
    name, size, position, faces: rim,
    // Only the bridge across the wall thickness is visible. Vertical cap faces would
    // coincide with the outer body and interior walls and flicker during camera motion.
    omitFaces: ['right', 'left', 'bottom', 'front', 'back'],
  });
  const hingeY = 10 / 16 + 0.001; // Avoid coincident lid underside and body rim surfaces.
  parts.push({
    name: 'lid', size: [14 / 16, 4 / 16, 14 / 16], position: [0, hingeY + 2 / 16, 0], pivot: [0, hingeY, -7 / 16],
    faces: { right: uv(0, 15, 14, 4), left: uv(28, 15, 14, 4), top: uv(28, 0, 14, 14), bottom: uv(14, 0, 14, 14),
      front: uv(42, 15, 14, 4), back: uv(14, 15, 14, 4) },
  }, {
    name: 'lock', parent: 'lid', size: [2 / 16, 4 / 16, 1 / 16], position: [0, hingeY, 7.5 / 16],
    faces: { right: uv(1, 1, 1, 4), left: uv(4, 1, 1, 4), top: uv(2, 0, 2, 1), bottom: uv(4, 0, 2, 1),
      front: uv(5, 1, 2, 4), back: uv(2, 1, 2, 4) },
  });
  return { kind: 'uv-boxes', atlasSize: [atlasSize, atlasSize], parts };
}
export const CHEST_STATES: Record<string, Appearance> = {
  closed: { poses: { lid: { rotation: [0, 0, 0] } } },
  open: { poses: { lid: { rotation: [-Math.PI * 0.55, 0, 0] } } },
};
