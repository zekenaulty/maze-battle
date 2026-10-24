import { isAssetId, isSafeAssetPath } from '../manifest.ts';

/** Visual configuration only. Actor identity, equipment and movement belong to game systems. */
export interface HumanoidAppearance {
  id: string; model: 'classic' | 'slim'; skinAssetId: string; scale: number; outerLayerVisible: boolean;
  attachments?: string[];
}
export interface SkinAsset {
  id: string; label: string; layout: 'minecraft-64x64'; model: HumanoidAppearance['model'];
  texture: { path: string; sha256: string; width: number; height: number };
  provenance: { run: string; sourceId: string; image: string; imageSha256: string; reportSha256: string;
    rawSheetSha256: string; kind: 'generated' | 'source'; status: 'preview' };
}
export interface SkinCatalog { schemaVersion: 1; revision: string; skins: SkinAsset[] }
export const HUMANOID_HEIGHT = 2.7; // 1.8 of the showroom's 1.5-unit blocks; feet at local y=0.
export function validateSkinDimensions(width: number, height: number) {
  if (width !== height || ![64, 128, 256, 512, 1024, 2048].includes(width))
    throw new Error(`Incompatible skin ${width}×${height}: expected a standard 64×64 UV atlas at 1×–32× resolution. Packed face sheets and legacy 64×32 skins require a producer-prepared atlas.`);
}
export function validateAppearance(a: HumanoidAppearance) {
  if (!a || !isAssetId(a.id) || !isAssetId(a.skinAssetId) || !['classic', 'slim'].includes(a.model) ||
    !Number.isFinite(a.scale) || a.scale <= 0 || a.scale > 10 || typeof a.outerLayerVisible !== 'boolean' ||
    (a.attachments !== undefined && (!Array.isArray(a.attachments) || !a.attachments.every(isAssetId)))) throw new Error('Invalid humanoid appearance');
}
export function validateSkinCatalog(value: unknown): asserts value is SkinCatalog {
  const c = value as SkinCatalog;
  const hash = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
  if (!c || c.schemaVersion !== 1 || !hash(c.revision) || !Array.isArray(c.skins) || c.skins.length > 32) throw new Error('Invalid skin catalog');
  const ids = new Set<string>();
  for (const s of c.skins) {
    if (!s || !isAssetId(s.id) || ids.has(s.id) || typeof s.label !== 'string' || s.layout !== 'minecraft-64x64' ||
      !['classic', 'slim'].includes(s.model) || !s.texture || !isSafeAssetPath(s.texture.path) || !s.texture.path.startsWith('textures/') ||
      !s.texture.path.endsWith('.png') || !hash(s.texture.sha256)) throw new Error('Invalid skin asset/layout');
    ids.add(s.id); validateSkinDimensions(s.texture.width, s.texture.height);
    const p = s.provenance;
    if (!p || !isAssetId(p.run) || !isAssetId(p.sourceId) || !isSafeAssetPath(p.image) || p.imageSha256 !== s.texture.sha256 ||
      !hash(p.reportSha256) || !hash(p.rawSheetSha256) || !['source', 'generated'].includes(p.kind) || p.status !== 'preview') throw new Error('Invalid skin provenance');
  }
}
export const SKIN_CATALOG_URL = `${import.meta.env?.BASE_URL ?? '/'}assets/character-skins/local/manifest.json`;
export async function loadSkinCatalog(signal?: AbortSignal): Promise<SkinCatalog> {
  const response = await fetch(SKIN_CATALOG_URL, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('Local character skins unavailable. Run assets:import-skin.');
  const catalog: unknown = await response.json(); validateSkinCatalog(catalog); return catalog;
}
