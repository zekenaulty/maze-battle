import { BoxGeometry } from 'three';
import type { SceneBox } from './scene';
import { alignBoxUVs } from './boxUVs';

/** Upper floors own the slab's top; lower ceilings own its underside. No coplanar duplicate faces. */
export function stageBoxGeometry(box: SceneBox, tileable: boolean) {
  const geometry = new BoxGeometry(...box.size);
  if (tileable) alignBoxUVs(geometry, box.center);
  if (box.deck) {
    const groups = geometry.groups.filter((_, i) => box.deck === 'floor' ? i !== 3 : i === 3);
    const indices = groups.flatMap(g => [...geometry.index!.array].slice(g.start, g.start + g.count));
    geometry.setIndex(indices); geometry.clearGroups();
  }
  return geometry;
}
