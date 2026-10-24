import { BoxGeometry, Mesh } from 'three';
import type { AssetRegistry } from '../../assets3d/registry';
import type { ThreeAssetLibrary } from '../../assets3d/threeAssets';
import type { SceneBox } from './scene';

/** Local +Z is the book face; world-space dimensions remain the collision bounds. */
export function bookshelfMesh(box: SceneBox, registry: AssetRegistry, library: Pick<ThreeAssetLibrary, 'material'>) {
  const appearance = registry.resolve('bookshelf'), planks = appearance.faces[2], front = appearance.faces[4];
  const facing = box.facing ?? 'south', turned = facing === 'east' || facing === 'west';
  const geometry = new BoxGeometry(...(turned ? [box.size[2], box.size[1], box.size[0]] as const : box.size));
  const materials = [planks, planks, planks, planks, front, planks].map(face => library.material(face));
  const mesh = new Mesh(geometry, materials);
  mesh.name = box.id; mesh.position.set(...box.center);
  mesh.rotation.y = { north: Math.PI, east: Math.PI / 2, south: 0, west: -Math.PI / 2 }[facing];
  return mesh;
}
