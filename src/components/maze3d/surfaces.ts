import { BoxGeometry } from 'three';
import type { SceneBox } from './scene';
import { alignBoxUVs } from './boxUVs';

/** Standalone prop fallback; the masonry union owns shared structural faces. */
export function stageBoxGeometry(box: SceneBox, tileable: boolean) {
  const geometry = new BoxGeometry(...box.size);
  if (tileable) alignBoxUVs(geometry, box.center, box.textureOrigin);
  return geometry;
}
