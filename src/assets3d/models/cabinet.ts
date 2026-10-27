import type { VisualAsset } from './contract';
/** The selected overlay doors meet the carcass front instead of floating ahead of it.
 * Meshes, UVs, scale and hinge angles stay intact; only the two bind translations change. */
export function fitCabinetDoors(source: VisualAsset): { asset: VisualAsset; offset: number } {
  const asset = structuredClone(source), parts = asset.payload.geometries.main;
  const sides = parts?.find(p => p.id === 'side-left-sides')?.mesh;
  const hinge = parts?.find(p => p.id === 'hinge-left'), door = parts?.find(p => p.id === 'door-left-sides')?.mesh;
  if (!sides || !hinge || !door) throw Error('Unsupported cabinet overlay layout');
  const front = Math.max(...sides.positions.map(p => p[2])), rear = hinge.position[2] + Math.min(...door.positions.map(p => p[2]));
  const offset = front - rear;
  if (Math.abs(offset) > .1) throw Error('Cabinet overlay gap exceeds the selected repair profile');
  for (const id of ['hinge-left', 'hinge-right']) { const joint = parts.find(p => p.id === id); if (!joint) throw Error('Cabinet hinge missing'); joint.position[2] += offset; }
  return { asset, offset };
}
