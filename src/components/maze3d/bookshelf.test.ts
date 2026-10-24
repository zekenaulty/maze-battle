// @vitest-environment node
import { Box3, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AssetRegistry } from '../../assets3d/registry';
import { bookshelfMesh } from './bookshelf';
import { boxBounds, directionVector, type SceneBox } from './scene';

describe('directional bookshelf faces', () => {
  it.each(['north', 'east', 'south', 'west'] as const)('puts books only on the inward %s face with unchanged solid bounds', facing => {
    const registry = new AssetRegistry(), appearance = registry.resolve('bookshelf');
    vi.spyOn(registry, 'resolve').mockReturnValue(appearance);
    const planks = new MeshStandardMaterial(), books = new MeshStandardMaterial();
    const material = vi.fn(face => {
      if (face === appearance.faces[2]) return planks;
      if (face === appearance.faces[4]) return books;
      throw Error('Unexpected shelf surface');
    });
    const turned = facing === 'east' || facing === 'west';
    const box: SceneBox = { id: 'shelf', material: 'bookshelf', center: [4.8, 1.1, -3.2],
      size: turned ? [0.34, 2.2, 1.5] : [1.5, 2.2, 0.34], solid: true, facing };
    const mesh = bookshelfMesh(box, registry, { material });
    expect(mesh.material).toEqual([planks, planks, planks, planks, books, planks]);
    expect(material).toHaveBeenCalledTimes(6);
    const normal = new Vector3().fromBufferAttribute(mesh.geometry.getAttribute('normal'), 16).applyQuaternion(mesh.quaternion);
    expect(normal.x).toBeCloseTo(directionVector[facing].x);
    expect(normal.z).toBeCloseTo(directionVector[facing].z);
    const rendered = new Box3().setFromObject(mesh), collision = boxBounds(box);
    expect(rendered.min.x).toBeCloseTo(collision.minX); expect(rendered.max.x).toBeCloseTo(collision.maxX);
    expect(rendered.min.z).toBeCloseTo(collision.minZ); expect(rendered.max.z).toBeCloseTo(collision.maxZ);
    expect(rendered.min.y).toBeCloseTo(0); expect(rendered.max.y).toBeCloseTo(2.2);
    const uv = mesh.geometry.getAttribute('uv');
    expect(Array.from({ length: 4 }, (_, i) => [uv.getX(16 + i), uv.getY(16 + i)]))
      .toEqual([[0, 1], [1, 1], [0, 0], [1, 0]]);
    mesh.geometry.dispose(); planks.dispose(); books.dispose();
  });
});
