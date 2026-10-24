import { FACE_ORDER } from '../manifest.ts';
import type { Vec3 } from '../manifest';
import type { CuboidPart, VisualAsset, VisualMaterial } from './contract';

export const solidFaces = (slot: string): CuboidPart['faces'] => Object.fromEntries(FACE_ORDER.map(face => [face, { slot, rect: [0, 0, 1, 1] }]));
export function nativeBox(id: string, size: Vec3, position: Vec3, slot: string, parent?: string): CuboidPart {
  return { id, size, position, faces: solidFaces(slot), ...(parent ? { parent } : {}) };
}
export const nativeMaterials: Record<string, VisualMaterial> = {
  native_stone: { id: 'native_stone', label: 'Stone', layoutId: 'solid-v1', surface: 'bounded-face', fallbackColor: '#70787f', roughness: 0.95, render: { alphaMode: 'opaque', side: 'front' } },
  native_bronze: { id: 'native_bronze', label: 'Bronze', layoutId: 'solid-v1', surface: 'bounded-face', fallbackColor: '#ba8450', roughness: 0.45, render: { alphaMode: 'opaque', side: 'front' } },
  native_wood: { id: 'native_wood', label: 'Wood', layoutId: 'solid-v1', surface: 'bounded-face', fallbackColor: '#675044', roughness: 0.8, render: { alphaMode: 'opaque', side: 'front' } },
};
export function nativeLever(): VisualAsset {
  return {
    id: 'lever-wall-native', label: 'Maze lever · native', geometryRevision: 'native-lever-v1',
    source: { kind: 'native', note: 'Independently authored cuboids; no Minecraft geometry or UV dependency.' },
    slots: { mount: { layoutId: 'solid-v1' }, handle: { layoutId: 'solid-v1' } }, adapter: 'cuboids-v1',
    states: { off: { geometry: 'lever', poses: { handle: [-0.55, 0, 0] } }, on: { geometry: 'lever', poses: { handle: [0.55, 0, 0] } } },
    anchors: { mount: { position: [0, 0, -0.13] }, grip: { position: [0, 0.35, 0.35] } },
    payload: { geometries: { lever: [
      nativeBox('mount', [0.8, 0.9, 0.18], [0, 0, -0.13], 'mount'),
      nativeBox('axle', [0.4, 0.24, 0.3], [0, 0, 0.04], 'handle'),
      { id: 'handle', position: [0, 0, 0.15] },
      nativeBox('shaft', [0.11, 0.62, 0.11], [0, 0.25, 0], 'handle', 'handle'),
      nativeBox('grip', [0.32, 0.18, 0.18], [0, 0.57, 0], 'handle', 'handle'),
    ] } },
  };
}
