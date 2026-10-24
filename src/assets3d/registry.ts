import { FACE_ORDER, validateAssetPack } from './manifest';
import type { Appearance, AssetPack, BlockFace, Emission, MaterialDefinition, ModelDefinition } from './manifest';

export interface ResolvedFace {
  face: BlockFace; material?: MaterialDefinition; fallbackColor: string; emissive?: { color: string; intensity: number };
}
export interface ResolvedBlock {
  id: string; model: ModelDefinition; faces: ResolvedFace[]; emission?: Emission; warnings: string[];
  poses: NonNullable<Appearance['poses']>;
}
export class AssetRegistry {
  readonly pack?: AssetPack;
  constructor(pack?: unknown) {
    if (pack !== undefined) { validateAssetPack(pack); this.pack = pack; }
  }
  resolve(id: string, options: { state?: string; variant?: string } = {}): ResolvedBlock {
    const block = this.pack && Object.hasOwn(this.pack.blocks, id) ? this.pack.blocks[id] : undefined;
    const warnings: string[] = [];
    if (!block) warnings.push(`Missing block: ${id}`);
    const variant = options.variant && block && Object.hasOwn(block.variants, options.variant) ? block.variants[options.variant] : undefined;
    const state = options.state && block && Object.hasOwn(block.states, options.state) ? block.states[options.state] : undefined;
    if (options.variant && !variant) warnings.push(`Missing variant: ${options.variant}`);
    if (options.state && !state) warnings.push(`Missing state: ${options.state}`);
    const emission = state?.emission ?? variant?.emission;
    return {
      id, model: block ? this.pack!.models[block.model] : { kind: 'cube' }, emission, warnings,
      poses: { ...variant?.poses, ...state?.poses },
      faces: FACE_ORDER.map(face => {
        const materialId = state?.faces?.[face] ?? variant?.faces?.[face] ?? block?.faces[face];
        const material = materialId ? this.pack?.materials[materialId] : undefined;
        return { face, material, fallbackColor: material?.fallbackColor ?? '#687386',
          emissive: emission?.faces.includes(face) ? { color: emission.color, intensity: emission.intensity } : undefined };
      }),
    };
  }
}

export const PACK_URL = `${import.meta.env.BASE_URL}assets/material-packs/dungeon-occult-01/manifest.json`;
export async function loadAssetRegistry(signal?: AbortSignal): Promise<AssetRegistry> {
  const response = await fetch(PACK_URL, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`Material pack unavailable (${response.status}). Run assets:import locally.`);
  return new AssetRegistry(await response.json());
}
