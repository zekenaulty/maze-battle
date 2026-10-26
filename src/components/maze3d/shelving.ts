import type { SceneBox } from './scene';
export const SHELVING_PACK_URL = `${import.meta.env?.BASE_URL ?? '/'}assets/model-packs/shelving/manifest.json`;
/** Exported dimensions are world units already. Mount offsets belong to the consumer. */
export const SHELVING = {
  'low-bookcase': { assetId: 'shelving-bookcase-oak-ae93700898a4', width: 1.5, height: 1.1, depth: .34, mount: 0, label: 'Low oak bookcase' },
  library: { assetId: 'shelving-bookcase-spruce-9d81cdf6d35b', width: 2.4, height: 2.7, depth: .448, mount: 0, label: 'Tall library bookcase' },
  cabinet: { assetId: 'shelving-cabinet-dark-oak-665ccb231f4e', width: 1.76, height: 1.76, depth: .64, mount: 0, label: 'Dark oak cabinet' },
  'bracket-shelf': { assetId: 'shelving-wall-shelf-oak-8a4006093940', width: 1.92, height: .8, depth: .48, mount: 1.35, label: 'Bracket shelf' },
  'wall-case': { assetId: 'shelving-bookcase-spruce-fc5fb80f4c68', width: 1.44, height: 1.12, depth: .448, mount: 1.35, label: 'Wall bookcase' },
} as const;
export type ShelvingKind = keyof typeof SHELVING;
export const SHELVING_KINDS = Object.keys(SHELVING) as ShelvingKind[];
export const shelfYaw = { north: Math.PI, east: Math.PI / 2, south: 0, west: -Math.PI / 2 } as const;
const inward = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] } as const;
export function placeShelving(source: SceneBox, kind: ShelvingKind): SceneBox {
  const profile = SHELVING[kind], facing = source.facing ?? 'south', [nx, nz] = inward[facing], turned = !!nx;
  const oldDepth = source.size[turned ? 0 : 2], foot = source.center[1] - source.size[1] / 2;
  return { ...source, furnishing: kind, center: [source.center[0] + nx * (profile.depth - oldDepth) / 2,
    foot + profile.mount + profile.height / 2, source.center[2] + nz * (profile.depth - oldDepth) / 2],
    size: turned ? [profile.depth, profile.height, profile.width] : [profile.width, profile.height, profile.depth] };
}
function overlap(a: SceneBox, b: SceneBox) {
  return a.center.every((v, i) => Math.abs(v - b.center[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6);
}
/** Retain seeded furnishing identities. Larger variants fall back to the low case if a corner/chest conflicts. */
export function fitShelving(boxes: SceneBox[]): SceneBox[] {
  const obstacles = boxes.filter(b => b.material !== 'bookshelf' && !b.deck), placed: SceneBox[] = [], replacements = new Map<string, SceneBox>();
  for (const source of boxes.filter(b => b.material === 'bookshelf').sort((a, b) => a.id.localeCompare(b.id))) {
    const preferred = source.furnishing ?? 'low-bookcase';
    for (const kind of [...new Set([preferred, 'low-bookcase' as const])]) {
      const candidate = placeShelving(source, kind);
      if ([...obstacles, ...placed].some(b => overlap(candidate, b))) continue;
      replacements.set(source.id, candidate); placed.push(candidate); break;
    }
  }
  return boxes.flatMap(box => box.material !== 'bookshelf' ? [box] : replacements.has(box.id) ? [replacements.get(box.id)!] : []);
}
